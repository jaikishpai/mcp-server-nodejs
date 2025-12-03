import { logger } from './logger.js';

/**
 * API Key authentication middleware for MCP endpoint
 * Supports multiple authentication header formats:
 * - x-mcp-api-key header (preferred for MCP)
 * - x-api-key header (alternative/common format)
 * - Authorization: Bearer <key> (standard HTTP auth)
 * 
 * If MCP_API_KEY is not set, allows requests in development mode but logs a warning
 */
export function mcpApiKeyAuth(req, res, next) {
  const apiKey = process.env.MCP_API_KEY;
  const isProduction = process.env.NODE_ENV === 'production';

  // In production, API key is required
  if (!apiKey) {
    if (isProduction) {
      logger.error('MCP_API_KEY not set in production - rejecting request', {
        path: req.path,
        ip: req.ip
      });
      return res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Server configuration error: API key not configured'
        }
      });
    }
    // Development mode: allow but warn
    logger.warn('MCP_API_KEY not set - allowing unauthenticated requests (development mode only)', {
      path: req.path,
      ip: req.ip
    });
    return next();
  }

  // Check for API key in headers (try multiple header formats)
  const providedKey = req.headers['x-mcp-api-key'] || 
                     req.headers['x-api-key'] ||
                     (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') 
                       ? req.headers.authorization.substring(7) 
                       : null);

  if (!providedKey) {
    logger.warn('MCP request missing API key', {
      path: req.path,
      ip: req.ip,
      headers: Object.keys(req.headers)
    });
    return res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Unauthorized: Missing API key. Provide x-mcp-api-key, x-api-key header, or Authorization: Bearer <key>'
      }
    });
  }

  if (providedKey !== apiKey) {
    logger.warn('MCP request with invalid API key', {
      path: req.path,
      ip: req.ip
    });
    return res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Unauthorized: Invalid API key'
      }
    });
  }

  // API key is valid
  logger.debug('MCP request authenticated', { ip: req.ip });
  next();
}

/**
 * Optional JWT authentication stub (for future implementation)
 * Currently not used but provided as a placeholder
 */
export function jwtAuth(req, res, next) {
  // TODO: Implement JWT validation if needed
  // This is a placeholder for future JWT-based authentication
  logger.debug('JWT auth stub called (not implemented)');
  next();
}

export default {
  mcpApiKeyAuth,
  jwtAuth
};

