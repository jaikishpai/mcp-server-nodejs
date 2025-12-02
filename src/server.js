import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { initPool, closePool } from './oracle.js';
import { logger } from './logger.js';
import { startWebServer, getApp, register404Handler } from './web.js';
import { registerMcpEndpoint } from './mcpTransport.js';

// Import tools
import { runQuery, runQuerySchema } from './tools/runQuery.js';
import { listTables, listTablesSchema } from './tools/listTables.js';
import { getSchema, getSchemaSchema } from './tools/getSchema.js';
import { nl2sql, nl2sqlSchema } from './tools/nl2sql.js';

import dotenv from 'dotenv';
import http from 'http';

// Load environment variables
dotenv.config();

let httpServer = null;

/**
 * Initialize and start the MCP HTTP server
 */
async function main() {
  try {
    // Validate required environment variables
    const requiredEnvVars = ['ORACLE_USER', 'ORACLE_PASS', 'ORACLE_CONN'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      logger.warn(`Missing Oracle environment variables: ${missingVars.join(', ')}`);
      logger.warn('Server will start but Oracle-dependent endpoints will not work');
      logger.warn('Set ORACLE_USER, ORACLE_PASS, and ORACLE_CONN to enable database features');
    } else {
      // Initialize Oracle connection pool
      logger.info('Initializing Oracle connection pool...');
      try {
        await initPool({
          user: process.env.ORACLE_USER,
          password: process.env.ORACLE_PASS,
          connectionString: process.env.ORACLE_CONN
        });
      } catch (error) {
        logger.error('Failed to initialize Oracle pool, continuing without database', {
          error: error.message
        });
        logger.warn('Server will start but database features will be unavailable');
      }
    }

    // Create MCP server
    const mcpServer = new Server(
      {
        name: 'mcp-oracle-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize Express app first (before registering handlers)
    const app = getApp();

    // Register MCP endpoint (this wraps setRequestHandler)
    // This must be called before startWebServer() to ensure route is registered
    try {
      registerMcpEndpoint(app, mcpServer);
    } catch (error) {
      logger.error('Failed to register MCP endpoint', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }

    // Register tools - handlers are stored by mcpTransport wrapper
    // Note: We need to access the wrapped setRequestHandler
    mcpServer.setRequestHandler('tools/list', async () => {
      return {
        tools: [
          runQuerySchema,
          listTablesSchema,
          getSchemaSchema,
          nl2sqlSchema
        ]
      };
    });

    mcpServer.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params || {};

      logger.info('MCP tool called', { tool: name, args: Object.keys(args || {}) });

      try {
        let result;

        switch (name) {
          case 'runQuery':
            result = await runQuery(args);
            break;
          case 'listTables':
            result = await listTables(args);
            break;
          case 'getSchema':
            result = await getSchema(args);
            break;
          case 'nl2sql':
            result = await nl2sql(args);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Tool execution error', { tool: name, error: error.message, stack: error.stack });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  message: error.message,
                  code: 'TOOL_EXECUTION_ERROR'
                }
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    });

    // Register 404 handler AFTER all routes are registered
    register404Handler();
    
    // Start HTTP server
    const PORT = process.env.PORT || 3000;
    httpServer = await startWebServer();

    // Log startup summary
    logger.info('MCP Oracle Server started successfully', {
      name: 'mcp-oracle-server',
      version: '1.0.0',
      port: PORT,
      transport: 'HTTP',
      endpoints: {
        mcp: '/mcp',
        health: '/health',
        ready: '/ready',
        metrics: '/metrics',
        webhook: '/webhook/telnyx'
      },
      tools: ['runQuery', 'listTables', 'getSchema', 'nl2sql'],
      authEnabled: !!process.env.MCP_API_KEY,
      oraclePool: {
        min: parseInt(process.env.ORACLE_POOL_MIN || '2'),
        max: parseInt(process.env.ORACLE_POOL_MAX || '10')
      }
    });

    // Handle graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      // Stop accepting new connections
      if (httpServer) {
        httpServer.close(() => {
          logger.info('HTTP server closed');
        });
      }

      // Close Oracle pool
      try {
        await closePool();
      } catch (error) {
        logger.error('Error closing pool during shutdown', { error: error.message });
      }

      // Give time for in-flight requests to complete
      setTimeout(() => {
        logger.info('Shutdown complete');
        process.exit(0);
      }, 5000);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      shutdown('unhandledRejection');
    });

  } catch (error) {
    logger.error('Failed to start MCP server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  logger.error('Unhandled error in main', { error: error.message, stack: error.stack });
  process.exit(1);
});
