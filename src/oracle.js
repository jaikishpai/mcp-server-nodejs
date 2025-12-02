import oracledb from 'oracledb';
import { logger } from './logger.js';

let pool = null;

/**
 * Initialize Oracle connection pool
 * Alias for initPool (for backward compatibility)
 * @param {Object} config - Oracle connection configuration
 * @returns {Promise<void>}
 */
export async function initializePool(config) {
  return initPool(config);
}

/**
 * Initialize Oracle connection pool
 * @param {Object} config - Oracle connection configuration
 * @returns {Promise<void>}
 */
export async function initPool(config) {
  try {
    // Set Oracle Client library path (for Docker)
    if (process.env.ORACLE_CLIENT_PATH) {
      oracledb.initOracleClient({ libDir: process.env.ORACLE_CLIENT_PATH });
    }

    pool = await oracledb.createPool({
      user: config.user,
      password: config.password,
      connectString: config.connectionString,
      poolMin: parseInt(process.env.ORACLE_POOL_MIN || '2'),
      poolMax: parseInt(process.env.ORACLE_POOL_MAX || '10'),
      poolIncrement: parseInt(process.env.ORACLE_POOL_INCREMENT || '1'),
      poolTimeout: parseInt(process.env.ORACLE_POOL_TIMEOUT || '60'),
      queueTimeout: parseInt(process.env.ORACLE_QUEUE_TIMEOUT || '60000'),
      stmtCacheSize: 30,
      enableStatistics: true
    });

    logger.info('Oracle connection pool initialized successfully', {
      poolMin: pool.poolMin,
      poolMax: pool.poolMax
    });
  } catch (error) {
    logger.error('Failed to initialize Oracle connection pool', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Get a connection from the pool
 * @returns {Promise<oracledb.Connection>}
 */
export async function getConnection() {
  if (!pool) {
    throw new Error('Oracle pool not initialized. Call initializePool() first.');
  }

  try {
    const connection = await pool.getConnection();
    return connection;
  } catch (error) {
    logger.error('Failed to get connection from pool', { error: error.message });
    throw error;
  }
}

/**
 * Execute a SQL query and return results as JSON-friendly objects
 * @param {string} sql - SQL query to execute
 * @param {Object} binds - Query bind parameters
 * @param {Object} options - Query options (outFormat, maxRows, etc.)
 * @returns {Promise<Object>} Query results
 */
export async function executeQuery(sql, binds = {}, options = {}) {
  let connection;
  
  try {
    connection = await getConnection();
    
    // Default options
    const queryOptions = {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      maxRows: options.maxRows || 1000,
      ...options
    };

    logger.debug('Executing query', { sql: sql.substring(0, 200), binds });

    const result = await connection.execute(sql, binds, queryOptions);

    // Convert result to JSON-friendly format
    const rows = result.rows || [];
    
    // Handle CLOB/BLOB by converting to string
    const processedRows = rows.map(row => {
      const processed = {};
      for (const [key, value] of Object.entries(row)) {
        if (value && typeof value === 'object') {
          // Handle CLOB/BLOB
          if (value.constructor && value.constructor.name === 'Lob') {
            processed[key] = '[CLOB/BLOB]';
          } else {
            processed[key] = value;
          }
        } else {
          processed[key] = value;
        }
      }
      return processed;
    });

    return {
      rows: processedRows,
      rowCount: result.rowsAffected || processedRows.length,
      meta: {
        columnNames: result.metaData?.map(col => col.name) || [],
        columnCount: result.metaData?.length || 0
      }
    };
  } catch (error) {
    logger.error('Query execution failed', { 
      error: error.message, 
      sql: sql.substring(0, 200),
      errorCode: error.errorNum,
      stack: error.stack 
    });
    throw error;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        logger.warn('Error closing connection', { error: closeError.message });
      }
    }
  }
}

/**
 * Execute a SQL query that returns a single value
 * @param {string} sql - SQL query to execute
 * @param {Object} binds - Query bind parameters
 * @returns {Promise<any>} Single value result
 */
export async function executeQuerySingle(sql, binds = {}) {
  const result = await executeQuery(sql, binds, { maxRows: 1 });
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Close the connection pool
 * @returns {Promise<void>}
 */
export async function closePool() {
  if (pool) {
    try {
      await pool.close(10); // Wait up to 10 seconds
      logger.info('Oracle connection pool closed successfully');
      pool = null;
    } catch (error) {
      logger.error('Error closing Oracle pool', { error: error.message });
      throw error;
    }
  }
}

/**
 * Get pool statistics
 * @returns {Object} Pool statistics
 */
export function getPoolStats() {
  if (!pool) {
    return null;
  }

  return {
    connectionsOpen: pool.connectionsOpen,
    connectionsInUse: pool.connectionsInUse,
    poolMin: pool.poolMin,
    poolMax: pool.poolMax
  };
}

/**
 * Check if the pool is ready to accept connections
 * @returns {Promise<boolean>} True if pool is ready
 */
export async function isPoolReady() {
  if (!pool) {
    return false;
  }

  try {
    // Try to get a connection to verify pool is working
    const connection = await pool.getConnection();
    await connection.close();
    return true;
  } catch (error) {
    logger.warn('Pool readiness check failed', { error: error.message });
    return false;
  }
}

/**
 * Run a query (wrapper for executeQuery with better naming)
 * @param {string} sql - SQL query
 * @param {Object} binds - Bind parameters
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Query results
 */
export async function runQuery(sql, binds = {}, options = {}) {
  return executeQuery(sql, binds, options);
}

export default {
  initPool,
  initializePool, // Alias for backward compatibility
  getConnection,
  executeQuery,
  executeQuerySingle,
  runQuery,
  closePool,
  getPoolStats,
  isPoolReady
};

