import { executeQuery } from '../oracle.js';
import { logger } from '../logger.js';
import { validateBindVariableName } from '../util/validators.js';

/**
 * MCP Tool: Execute a SQL query
 * @param {Object} args - Tool arguments
 * @param {string} args.sql - SQL query to execute
 * @param {Object} args.binds - Optional bind parameters (as JSON string or object)
 * @param {number} args.maxRows - Maximum number of rows to return (default: 1000)
 * @returns {Promise<Object>} Query results
 */
export async function runQuery(args) {
  try {
    const { sql, binds = {}, maxRows = 1000, approved = false } = args;

    // REJECT arbitrary SQL - require approved flag
    if (!approved) {
      throw new Error(
        "runQuery requires approved=true. " +
        "Use getSemanticMappings() + getSchema() + prepareTemplate() first."
      );
    }

    if (!sql || typeof sql !== 'string') {
      throw new Error('SQL query is required and must be a string');
    }

    // Parse binds if provided as string
    let parsedBinds = binds;
    if (typeof binds === 'string') {
      try {
        parsedBinds = JSON.parse(binds);
      } catch (e) {
        logger.warn('Failed to parse binds JSON, using as-is', { binds });
        parsedBinds = {};
      }
    }

    // Validate bind variable names (only allow safe characters)
    if (parsedBinds && typeof parsedBinds === 'object' && !Array.isArray(parsedBinds)) {
      for (const [key, value] of Object.entries(parsedBinds)) {
        try {
          validateBindVariableName(key);
        } catch (err) {
          throw new Error(`Invalid bind variable name: ${key}. ${err.message}`);
        }
      }
    }

    // Validate maxRows
    const maxRowsNum = parseInt(maxRows);
    if (isNaN(maxRowsNum) || maxRowsNum < 1) {
      throw new Error('maxRows must be a positive integer');
    }

    logger.info('Executing SQL query via MCP tool', { 
      sqlLength: sql.length,
      hasBinds: Object.keys(parsedBinds).length > 0,
      maxRows: maxRowsNum,
      approved: true
    });

    // Pass approved flag to executeQuery
    const result = await executeQuery(sql, parsedBinds, { maxRows: maxRowsNum, approved: true });

    return {
      success: true,
      data: {
        rows: result.rows,
        rowCount: result.rowCount,
        columnNames: result.meta.columnNames,
        columnCount: result.meta.columnCount
      }
    };
  } catch (error) {
    logger.error('runQuery tool error', { error: error.message, stack: error.stack });
    return {
      success: false,
      error: {
        message: error.message,
        code: error.errorNum || 'UNKNOWN',
        sqlState: error.sqlState || null
      }
    };
  }
}

export const runQuerySchema = {
  name: 'runQuery',
  description: `Executes a SQL query against the Oracle database.

CRITICAL SECURITY REQUIREMENT:
This tool REQUIRES approved=true. It will REJECT arbitrary SQL queries.

You must NOT call this tool until you have completed ALL of the following steps:

1. Call getSemanticMappings() to determine the correct table for the user's request.
   - For all patient-related queries, the correct table is PATIENT_MASTER.

2. Call getSchema(tableName) to retrieve the exact list of valid column names.

3. Use SQL templates from getSemanticMappings() mcp_sql_templates, or construct SQL ONLY using:
   - The table name returned by getSemanticMappings()
   - The column names returned by getSchema()

STRICT RULES:
- Do NOT guess column names.
- Do NOT guess table names.
- Do NOT use DESCRIBE (invalid in Oracle).
- Do NOT query ALL_CONSTRAINTS, ALL_TABLES, or similar views for schema discovery.
- If getSchema() returns an error, STOP — do not execute SQL.
- approved=true MUST be set, otherwise the query will be rejected.

This tool must be called ONLY after the above rules are satisfied.`,
  inputSchema: {
    type: 'object',
    properties: {
      sql: {
        type: 'string',
        description: 'SQL query to execute (SELECT, INSERT, UPDATE, DELETE, etc.)'
      },
      binds: {
        type: 'object',
        description: 'Optional bind parameters as key-value pairs (e.g., {"id": 123, "name": "test"})',
        default: {}
      },
      maxRows: {
        type: 'number',
        description: 'Maximum number of rows to return (default: 1000)',
        default: 1000
      },
      approved: {
        type: 'boolean',
        description: 'MUST be true. Indicates that SQL was generated using semantic mappings and schema validation.',
        default: false
      }
    },
    required: ['sql', 'approved']
  }
};

