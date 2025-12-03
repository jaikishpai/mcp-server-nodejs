import { logger } from './logger.js';
import { mcpApiKeyAuth } from './auth.js';

/**
 * HTTP Transport wrapper for MCP Server
 * 
 * The MCP SDK primarily supports STDIO transport. This module implements
 * an HTTP transport by manually routing JSON-RPC requests to the appropriate
 * MCP Server request handlers.
 * 
 * The MCP protocol over HTTP uses JSON-RPC 2.0 format:
 * - Request: { jsonrpc: "2.0", id: <number>, method: <string>, params: <object> }
 * - Response: { jsonrpc: "2.0", id: <number>, result: <object> } or { error: <object> }
 */
export function createMcpHttpHandler(mcpServer) {
  // Store handlers for routing
  const handlers = new Map();
  
  // Wrap the server's setRequestHandler to capture handlers
  // We don't call the original SDK method since we're using HTTP transport
  // The SDK's setRequestHandler is designed for STDIO transport
  if (mcpServer.setRequestHandler) {
    const originalSetHandler = mcpServer.setRequestHandler.bind(mcpServer);
    mcpServer.setRequestHandler = (method, handler) => {
      logger.debug('Storing MCP handler', { method });
      handlers.set(method, handler);
      logger.debug('Handler stored', { method, totalHandlers: handlers.size });
      // Don't call originalSetHandler - we handle HTTP transport ourselves
      // return originalSetHandler(method, handler);
    };
  } else {
    // Fallback: create our own setRequestHandler if SDK doesn't have it
    mcpServer.setRequestHandler = (method, handler) => {
      logger.debug('Storing MCP handler (fallback)', { method });
      handlers.set(method, handler);
      logger.debug('Handler stored (fallback)', { method, totalHandlers: handlers.size });
    };
  }

  /**
   * Express route handler for /mcp endpoint
   * Handles MCP protocol messages over HTTP
   */
  return async (req, res, next) => {
    logger.debug('MCP handler function called', {
      path: req.path,
      method: req.method,
      handlersCount: handlers.size
    });

    // Validate content-type
    const contentType = req.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      logger.warn('Invalid content-type', { contentType });
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request: Content-Type must be application/json'
        }
      });
    }

    // Validate request body
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request: Request body must be a JSON object'
        }
      });
    }

    // Validate JSON-RPC version
    if (req.body.jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request: jsonrpc must be "2.0"'
        }
      });
    }

    const requestId = req.body.id;
    const method = req.body.method;
    const params = req.body.params || {};

    // Check if this is a notification (no id or id is null)
    // JSON-RPC 2.0 notifications don't have an id and don't require a response
    const isNotification = requestId === undefined || requestId === null;

    logger.debug('MCP HTTP request received', {
      method,
      requestId,
      isNotification,
      hasParams: Object.keys(params).length > 0
    });

    try {
      // Set timeout for request handling (30 seconds default)
      const timeout = parseInt(process.env.MCP_REQUEST_TIMEOUT || '30000');
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeout);
      });

      // Route to appropriate handler
      let response;
      
      logger.debug('Routing MCP request', { method, isNotification });
      
      if (method === 'tools/list') {
        const handler = handlers.get('tools/list');
        if (handler) {
          response = await Promise.race([handler(), timeoutPromise]);
        } else {
          logger.error('tools/list handler not found in handlers map', {
            allHandlers: Array.from(handlers.keys())
          });
          throw new Error('tools/list handler not registered');
        }
      } else if (method === 'tools/call') {
        const handler = handlers.get('tools/call');
        if (handler) {
          // MCP tools/call expects { name, arguments } in params
          response = await Promise.race([handler({ params }), timeoutPromise]);
        } else {
          logger.error('tools/call handler not found in handlers map', {
            allHandlers: Array.from(handlers.keys())
          });
          throw new Error('tools/call handler not registered');
        }
      } else if (method === 'initialize') {
        // Handle initialize request (MCP protocol)
        response = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'mcp-oracle-server',
            version: '1.0.0'
          }
        };
      } else if (method === 'notifications/initialized') {
        // Handle initialized notification (no response needed)
        // This is sent by the client after receiving the initialize response
        logger.info('Client initialized notification received');
        // Notifications don't require a response, just return 200 with no body
        return res.status(200).end();
      } else if (method && method.startsWith('notifications/')) {
        // Handle other notifications gracefully
        logger.debug('Notification received', { method });
        // Notifications don't require a response
        return res.status(200).end();
      } else {
        throw new Error(`Unsupported method: ${method}`);
      }

      // Only send response if this is a request (not a notification)
      if (!isNotification) {
        // Send JSON-RPC response
        res.status(200).json({
          jsonrpc: '2.0',
          id: requestId,
          result: response
        });

        logger.debug('MCP HTTP request completed', {
          method,
          requestId,
          hasResult: !!response
        });
      } else {
        // This shouldn't happen (notification should have been handled above),
        // but handle it gracefully just in case
        logger.warn('Response generated for notification, but notification should have been handled', { method });
        res.status(200).end();
      }

    } catch (error) {
      logger.error('MCP HTTP request error', {
        method,
        requestId,
        error: error.message,
        stack: error.stack
      });

      // Handle timeout specifically
      if (error.message === 'Request timeout') {
        return res.status(504).json({
          jsonrpc: '2.0',
          id: requestId,
          error: {
            code: -32000,
            message: 'Request timeout',
            data: { timeout: parseInt(process.env.MCP_REQUEST_TIMEOUT || '30000') }
          }
        });
      }

      // Handle other errors
      res.status(500).json({
        jsonrpc: '2.0',
        id: requestId,
        error: {
          code: -32603,
          message: 'Internal error',
          data: {
            message: error.message
          }
        }
      });
    }
  };
}

/**
 * Register MCP HTTP endpoint on Express app
 * @param {Express} app - Express application instance
 * @param {Server} mcpServer - MCP Server instance
 */
export function registerMcpEndpoint(app, mcpServer) {
  try {
    const handler = createMcpHttpHandler(mcpServer);

    // Apply API key authentication middleware
    app.post('/mcp', mcpApiKeyAuth, handler);

    logger.info('MCP HTTP endpoint registered at /mcp', {
      authenticated: !!process.env.MCP_API_KEY
    });
  } catch (error) {
    logger.error('Failed to register MCP endpoint', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Note on streaming support:
 * 
 * The MCP SDK's streaming capabilities are primarily designed for STDIO.
 * For HTTP transport, we implement a request-response pattern.
 * 
 * If streaming is required in the future, we could:
 * 1. Use Server-Sent Events (SSE) for server-to-client streaming
 * 2. Use WebSockets for bidirectional streaming
 * 3. Implement chunked transfer encoding for large responses
 * 
 * Currently, all responses are sent as complete JSON objects.
 * Large result sets should be paginated using maxRows parameter.
 */

export default {
  createMcpHttpHandler,
  registerMcpEndpoint
};
