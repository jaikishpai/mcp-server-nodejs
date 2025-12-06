import { executeQuery } from '../oracle.js';
import { logger } from '../logger.js';

/**
 * MCP Tool: Get schema information for a table
 * @param {Object} args - Tool arguments
 * @param {string} args.tableName - Name of the table
 * @param {string} args.schema - Optional schema name (default: current user)
 * @returns {Promise<Object>} Table schema information
 */
export async function getSchema(args) {
  try {
    let { tableName, schema } = args;

    if (!tableName || typeof tableName !== 'string') {
      throw new Error('tableName is required and must be a string');
    }

    // If tableName contains a dot, split it into schema and tableName
    const normalizedTableName = tableName.trim().toUpperCase();
    const dotIndex = normalizedTableName.indexOf('.');
    
    if (dotIndex !== -1) {
      // Split schema.tableName
      const extractedSchema = normalizedTableName.substring(0, dotIndex);
      const extractedTableName = normalizedTableName.substring(dotIndex + 1);
      
      // Use extracted values, but schema parameter takes precedence if explicitly provided
      if (!schema) {
        schema = extractedSchema;
      }
      tableName = extractedTableName;
      
      logger.debug('Split schema.tableName', { 
        original: args.tableName,
        extractedSchema,
        extractedTableName,
        finalSchema: schema,
        finalTableName: tableName
      });
    } else {
      // No dot, just normalize
      tableName = normalizedTableName;
    }

    // Query to get column information
    let sql;
    let binds = {};

    if (schema) {
      sql = `
        SELECT 
          column_name,
          data_type,
          data_length,
          data_precision,
          data_scale,
          nullable,
          data_default,
          column_id
        FROM all_tab_columns
        WHERE owner = UPPER(:schema) AND table_name = UPPER(:tableName)
        ORDER BY column_id
      `;
      binds = { schema, tableName };
    } else {
      sql = `
        SELECT 
          column_name,
          data_type,
          data_length,
          data_precision,
          data_scale,
          nullable,
          data_default,
          column_id
        FROM user_tab_columns
        WHERE table_name = UPPER(:tableName)
        ORDER BY column_id
      `;
      binds = { tableName };
    }

    // Query to get primary key information
    let pkSql;
    let pkBinds = {};

    if (schema) {
      pkSql = `
        SELECT 
          column_name,
          acc.constraint_name
        FROM all_cons_columns acc
        JOIN all_constraints ac ON acc.constraint_name = ac.constraint_name
          AND acc.owner = ac.owner
        WHERE ac.constraint_type = 'P'
          AND acc.owner = UPPER(:schema)
          AND acc.table_name = UPPER(:tableName)
        ORDER BY acc.position
      `;
      pkBinds = { schema, tableName };
    } else {
      pkSql = `
        SELECT 
          column_name,
          ucc.constraint_name
        FROM user_cons_columns ucc
        JOIN user_constraints uc ON ucc.constraint_name = uc.constraint_name
        WHERE uc.constraint_type = 'P'
          AND ucc.table_name = UPPER(:tableName)
        ORDER BY ucc.position
      `;
      pkBinds = { tableName };
    }

    logger.info('Getting schema via MCP tool', { tableName, schema: schema || 'current user' });

    const [columnsResult, pkResult] = await Promise.all([
      executeQuery(sql, binds, { maxRows: 1000 }),
      executeQuery(pkSql, pkBinds, { maxRows: 100 })
    ]);

    // Create a set of primary key column names
    const pkColumns = new Set(pkResult.rows.map(row => row.COLUMN_NAME));

    // Enhance columns with primary key information
    const enhancedColumns = columnsResult.rows.map(col => ({
      name: col.COLUMN_NAME,
      type: col.DATA_TYPE,
      length: col.DATA_LENGTH,
      precision: col.DATA_PRECISION,
      scale: col.DATA_SCALE,
      nullable: col.NULLABLE === 'Y',
      default: col.DATA_DEFAULT,
      primaryKey: pkColumns.has(col.COLUMN_NAME),
      position: col.COLUMN_ID
    }));

    return {
      success: true,
      data: {
        tableName: tableName, // Already normalized, no schema prefix
        schema: schema ? schema.toUpperCase() : 'current user',
        columns: enhancedColumns,
        columnCount: enhancedColumns.length,
        primaryKeys: pkResult.rows.map(row => row.COLUMN_NAME),
        primaryKeyCount: pkResult.rowCount
      }
    };
  } catch (error) {
    logger.error('getSchema tool error', { error: error.message, stack: error.stack });
    return {
      success: false,
      error: {
        message: error.message,
        code: error.errorNum || 'UNKNOWN'
      }
    };
  }
}

export const getSchemaSchema = {
  name: 'getSchema',
  description: 'Get detailed schema information for a table including column names, types, nullable status, and primary keys.',
  inputSchema: {
    type: 'object',
    properties: {
      tableName: {
        type: 'string',
        description: 'Name of the table to get schema for. Can be "TABLE_NAME" or "SCHEMA.TABLE_NAME". If schema prefix is provided, it will be used unless schema parameter is explicitly set.'
      },
      schema: {
        type: 'string',
        description: 'Optional schema/owner name. If not provided, uses current user schema.'
      }
    },
    required: ['tableName']
  }
};

