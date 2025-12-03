import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from './logger.js';
import { getPoolStats, isPoolReady } from './oracle.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow for API responses
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
// TODO: For future - restrict CORS_ORIGIN in production
// Currently allows all origins for easier deployment/testing
// To restrict in future: use process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? false : '*')
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*', // TODO: Restrict to specific domains in production
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-mcp-api-key', 'x-api-key']
};
app.use(cors(corsOptions));

// Body parser with size limits (10MB default)
const maxRequestSize = process.env.MAX_REQUEST_SIZE || '10mb';
app.use(express.json({ limit: maxRequestSize }));
app.use(express.urlencoded({ extended: true, limit: maxRequestSize }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info('HTTP Request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

/**
 * Health check endpoint
 * Returns basic service status
 */
app.get('/health', async (req, res) => {
  try {
    const poolStats = getPoolStats();
    
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'mcp-oracle-server',
      version: '1.0.0',
      oracle: poolStats ? {
        connected: true,
        connectionsOpen: poolStats.connectionsOpen,
        connectionsInUse: poolStats.connectionsInUse,
        poolMin: poolStats.poolMin,
        poolMax: poolStats.poolMax
      } : {
        connected: false,
        message: 'Pool not initialized'
      }
    };

    res.status(200).json(health);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Readiness check endpoint
 * Verifies that the service is ready to accept requests (DB pool is ready)
 */
app.get('/ready', async (req, res) => {
  try {
    const ready = await isPoolReady();
    
    if (ready) {
      const poolStats = getPoolStats();
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        oracle: {
          poolReady: true,
          connectionsOpen: poolStats?.connectionsOpen || 0,
          connectionsInUse: poolStats?.connectionsInUse || 0
        }
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        message: 'Oracle connection pool is not ready'
      });
    }
  } catch (error) {
    logger.error('Readiness check failed', { error: error.message });
    res.status(503).json({
      status: 'not ready',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Metrics endpoint (Prometheus format)
 * Returns basic metrics for monitoring
 */
app.get('/metrics', async (req, res) => {
  try {
    const poolStats = getPoolStats();
    const uptime = process.uptime();
    
    // Prometheus-formatted metrics
    const metrics = [
      '# HELP mcp_oracle_uptime_seconds Server uptime in seconds',
      '# TYPE mcp_oracle_uptime_seconds gauge',
      `mcp_oracle_uptime_seconds ${uptime}`,
      '',
      '# HELP mcp_oracle_pool_connections_open Current number of open connections',
      '# TYPE mcp_oracle_pool_connections_open gauge',
      `mcp_oracle_pool_connections_open ${poolStats?.connectionsOpen || 0}`,
      '',
      '# HELP mcp_oracle_pool_connections_in_use Current number of connections in use',
      '# TYPE mcp_oracle_pool_connections_in_use gauge',
      `mcp_oracle_pool_connections_in_use ${poolStats?.connectionsInUse || 0}`,
      '',
      '# HELP mcp_oracle_pool_min Minimum pool size',
      '# TYPE mcp_oracle_pool_min gauge',
      `mcp_oracle_pool_min ${poolStats?.poolMin || 0}`,
      '',
      '# HELP mcp_oracle_pool_max Maximum pool size',
      '# TYPE mcp_oracle_pool_max gauge',
      `mcp_oracle_pool_max ${poolStats?.poolMax || 0}`
    ].join('\n');

    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.status(200).send(metrics);
  } catch (error) {
    logger.error('Metrics endpoint failed', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Telnyx webhook handler
 * Receives webhook events from Telnyx and can trigger MCP tool calls
 * 
 * This endpoint logs the webhook payload and can be extended to:
 * - Validate webhook signatures
 * - Trigger MCP tools based on events
 * - Store events for processing
 */
app.post('/webhook/telnyx', async (req, res) => {
  try {
    const payload = req.body;
    const headers = req.headers;

    const eventType = payload.event_type || payload.type || 'unknown';
    
    logger.info('Telnyx webhook received', {
      eventType,
      payload: JSON.stringify(payload),
      headers: {
        'x-telnyx-signature': headers['x-telnyx-signature'],
        'x-telnyx-timestamp': headers['x-telnyx-timestamp'],
        'x-telnyx-event-id': headers['x-telnyx-event-id']
      }
    });

    // TODO: Implement webhook signature validation
    // TODO: Implement event processing logic
    // Example: If event is message.received, could trigger an MCP tool call
    
    // Placeholder: Log and acknowledge
    res.status(200).json({
      status: 'received',
      message: 'Webhook logged successfully',
      eventType,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Telnyx webhook error', { error: error.message, stack: error.stack });
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
  // Get registered routes for debugging
  const routes = [];
  app._router?.stack?.forEach((middleware) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    }
  });

  res.json({
    service: 'mcp-oracle-server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      ready: '/ready',
      metrics: '/metrics',
      mcp: '/mcp',
      telnyxWebhook: '/webhook/telnyx'
    },
    registeredRoutes: routes
  });
});

/**
 * 404 handler - registered later in server.js after all routes
 * This ensures specific routes are registered before the catch-all 404 handler
 */
let _404HandlerRegistered = false;

export function register404Handler() {
  if (_404HandlerRegistered) {
    return;
  }
  
  app.use((req, res) => {
    logger.debug('404 handler triggered', {
      method: req.method,
      path: req.path
    });
    res.status(404).json({
      status: 'error',
      message: 'Endpoint not found',
      path: req.path
    });
  });
  
  _404HandlerRegistered = true;
}

/**
 * Error handler
 */
app.use((err, req, res, next) => {
  logger.error('Express error handler', { error: err.message, stack: err.stack });
  res.status(500).json({
    status: 'error',
    message: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

/**
 * Start the web server
 * @returns {Promise<http.Server>} HTTP server instance
 */
export function startWebServer() {
  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      logger.info(`Web server started on port ${PORT}`, {
        port: PORT,
        endpoints: ['/health', '/ready', '/metrics', '/mcp', '/webhook/telnyx']
      });
      resolve(server);
    });
  });
}

/**
 * Get the Express app instance (for attaching MCP transport)
 * @returns {Express} Express application
 */
export function getApp() {
  return app;
}

// If this file is run directly, start the web server
if (import.meta.url === `file://${process.argv[1]}`) {
  startWebServer();
}

export default app;

