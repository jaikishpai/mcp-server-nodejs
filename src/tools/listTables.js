import { executeQuery } from '../oracle.js';
import { logger } from '../logger.js';

/**
 * MCP Tool: List all user tables in the database
 * @param {Object} args - Tool arguments
 * @param {string} args.schema - Optional schema name (default: current user)
 * @returns {Promise<Object>} List of tables
 */
export async function listTables(args) {
  try {
    const { schema } = args;

    // Query to get all user tables
    let sql;
    let binds = {};

    if (schema) {
      sql = `
        SELECT 
          table_name,
          tablespace_name,
          num_rows,
          last_analyzed
        FROM all_tables
        WHERE owner = UPPER(:schema)
        ORDER BY table_name
      `;
      binds = { schema };
    } else {
      sql = `
        SELECT 
          table_name,
          tablespace_name,
          num_rows,
          last_analyzed
        FROM user_tables
        ORDER BY table_name
      `;
    }

    logger.info('Listing tables via MCP tool', { schema: schema || 'current user' });

    const result = await executeQuery(sql, binds, { maxRows: 10000 });

    // Extract only table names (no schema prefix)
    const tableNames = result.rows.map(row => row.TABLE_NAME);

    return {
      success: true,
      data: {
        tables: tableNames, // Return only table names, not full objects
        count: result.rowCount,
        schema: schema ? schema.toUpperCase() : 'current user'
      }
    };
  } catch (error) {
    logger.error('listTables tool error', { error: error.message, stack: error.stack });
    return {
      success: false,
      error: {
        message: error.message,
        code: error.errorNum || 'UNKNOWN'
      }
    };
  }
}

export const listTablesSchema = {
  name: 'listTables',
  description: 'List all tables in the database. Optionally filter by schema name.',
  inputSchema: {
    type: 'object',
    properties: {
      schema: {
        type: 'string',
        description: 'Optional schema/owner name. If not provided, returns tables for current user.'
      }
    }
  }
};

