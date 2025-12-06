import { executeQuery } from '../oracle.js';
import { logger } from '../logger.js';

/**
 * Server-side field mapping: business-level field names to Oracle column names
 * This mapping is NEVER exposed to the AI - it's internal to the server
 */
const FIELD_TO_COLUMN_MAP = {
  firstName: 'EXT_FIRST_NAME',
  lastName: 'EXT_LAST_NAME',
  dob: 'EXT_DATE_OF_BIRTH',
  gender: 'EXT_SEX',
  city: 'EXT_CITY',
  state: 'EXT_STATE',
  phone: ['EXT_CELL_PHONE_CALL', 'EXT_HOME_PHONE'], // Array means search both columns
  email: ['EXT_PERSONAL_EMAIL', 'EXT_WORK_EMAIL'] // Array means search both columns
};

/**
 * Canonical table reference - always use this
 */
const CANONICAL_SCHEMA = 'PS_MCPUSER';
const CANONICAL_TABLE = 'PATIENT_MASTER';

/**
 * Normalize schema.table input to separate schema and tableName
 * @param {string} input - Input string (may be "schema.table" or just "table")
 * @returns {Object} { schema: string, tableName: string }
 */
function normalizeTableName(input) {
  if (!input || typeof input !== 'string') {
    return { schema: CANONICAL_SCHEMA, tableName: CANONICAL_TABLE };
  }
  
  const trimmed = input.trim().toUpperCase();
  const dotIndex = trimmed.indexOf('.');
  
  if (dotIndex === -1) {
    // No schema prefix, use canonical schema
    return { schema: CANONICAL_SCHEMA, tableName: trimmed || CANONICAL_TABLE };
  }
  
  // Has schema prefix, split it
  const schema = trimmed.substring(0, dotIndex);
  const tableName = trimmed.substring(dotIndex + 1);
  
  return {
    schema: schema || CANONICAL_SCHEMA,
    tableName: tableName || CANONICAL_TABLE
  };
}

/**
 * Build SQL WHERE clause conditions from filters
 * @param {Object} filters - Filter object with business-level field names
 * @param {Object} binds - Bind parameters object (modified in place)
 * @returns {string} SQL WHERE clause (without WHERE keyword) or empty string
 */
function buildWhereClause(filters, binds) {
  const conditions = [];

  for (const [fieldName, fieldValue] of Object.entries(filters)) {
    if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
      continue; // Skip empty filters
    }

    const columnMapping = FIELD_TO_COLUMN_MAP[fieldName];
    if (!columnMapping) {
      logger.warn('Unknown filter field ignored', { fieldName, fieldValue });
      continue;
    }

    // Handle array mappings (e.g., phone, email search multiple columns)
    if (Array.isArray(columnMapping)) {
      const orConditions = [];
      for (let idx = 0; idx < columnMapping.length; idx++) {
        const column = columnMapping[idx];
        const bindName = `${fieldName}_${idx}`;
        binds[bindName] = `%${String(fieldValue)}%`;
        orConditions.push(`UPPER(${column}) LIKE UPPER(:${bindName})`);
      }
      if (orConditions.length > 0) {
        conditions.push(`(${orConditions.join(' OR ')})`);
      }
    } else {
      // Single column mapping
      const bindName = fieldName;
      
      // Special handling for date of birth - use Oracle TO_DATE function
      if (fieldName === 'dob') {
        binds[bindName] = String(fieldValue);
        conditions.push(`${columnMapping} = TO_DATE(:${bindName}, 'YYYY-MM-DD')`);
      }
      // Exact match fields (gender, state)
      else if (fieldName === 'gender' || fieldName === 'state') {
        binds[bindName] = String(fieldValue).toUpperCase();
        conditions.push(`${columnMapping} = :${bindName}`);
      }
      // Text fields - use LIKE for partial matching
      else {
        binds[bindName] = `%${String(fieldValue)}%`;
        conditions.push(`UPPER(${columnMapping}) LIKE UPPER(:${bindName})`);
      }
    }
  }

  return conditions.length > 0 ? conditions.join(' AND ') : '';
}

/**
 * MCP Tool: Search patients using business-level filters
 * @param {Object} args - Tool arguments
 * @param {string} args.firstName - Optional first name filter (partial match)
 * @param {string} args.lastName - Optional last name filter (partial match)
 * @param {string} args.phone - Optional phone filter (searches cell and home phone, partial match)
 * @param {string} args.dob - Optional date of birth filter (exact match, format: YYYY-MM-DD)
 * @param {string} args.gender - Optional gender filter (exact match: M, F, or O)
 * @param {string} args.city - Optional city filter (partial match)
 * @param {string} args.state - Optional state filter (exact match)
 * @param {string} args.email - Optional email filter (searches personal and work email, partial match)
 * @returns {Promise<Object>} Search results
 */
export async function searchPatients(args) {
  try {
    const {
      firstName,
      lastName,
      phone,
      dob,
      gender,
      city,
      state,
      email
    } = args || {};

    // Build filters object (only include provided values)
    const filters = {};
    if (firstName !== undefined && firstName !== null && firstName !== '') {
      filters.firstName = firstName;
    }
    if (lastName !== undefined && lastName !== null && lastName !== '') {
      filters.lastName = lastName;
    }
    if (phone !== undefined && phone !== null && phone !== '') {
      filters.phone = phone;
    }
    if (dob !== undefined && dob !== null && dob !== '') {
      filters.dob = dob;
    }
    if (gender !== undefined && gender !== null && gender !== '') {
      filters.gender = gender;
    }
    if (city !== undefined && city !== null && city !== '') {
      filters.city = city;
    }
    if (state !== undefined && state !== null && state !== '') {
      filters.state = state;
    }
    if (email !== undefined && email !== null && email !== '') {
      filters.email = email;
    }

    // Always use canonical table
    const { schema, tableName } = normalizeTableName(`${CANONICAL_SCHEMA}.${CANONICAL_TABLE}`);
    const qualifiedTableName = `${schema}.${tableName}`;

    // Build SQL query with safe parameterized binds
    const binds = {};
    const whereClause = buildWhereClause(filters, binds);

    // Construct SQL with conditional WHERE clause
    const sql = `
      SELECT *
      FROM ${qualifiedTableName}
      ${whereClause ? `WHERE ${whereClause}` : ''}
      FETCH FIRST 25 ROWS ONLY
    `;

    logger.info('Searching patients via MCP tool', {
      filters: Object.keys(filters),
      qualifiedTable: qualifiedTableName,
      bindCount: Object.keys(binds).length
    });

    const result = await executeQuery(sql, binds, { maxRows: 25 });

    return {
      success: true,
      data: {
        patients: result.rows,
        count: result.rowCount,
        filters: Object.keys(filters),
        table: qualifiedTableName
      }
    };
  } catch (error) {
    logger.error('searchPatients tool error', {
      error: error.message,
      stack: error.stack
    });
    return {
      success: false,
      error: {
        message: error.message,
        code: error.errorNum || 'UNKNOWN'
      }
    };
  }
}

export const searchPatientsSchema = {
  name: 'searchPatients',
  description: 'Search for patients using flexible filters. This tool handles all SQL construction internally - you only need to provide business-level filter criteria.',
  inputSchema: {
    type: 'object',
    properties: {
      firstName: {
        type: 'string',
        description: 'Optional first name filter (partial match, case-insensitive)'
      },
      lastName: {
        type: 'string',
        description: 'Optional last name filter (partial match, case-insensitive)'
      },
      phone: {
        type: 'string',
        description: 'Optional phone number filter (searches both cell and home phone, partial match, case-insensitive)'
      },
      dob: {
        type: 'string',
        description: 'Optional date of birth filter (exact match, format: YYYY-MM-DD)'
      },
      gender: {
        type: 'string',
        enum: ['M', 'F', 'O'],
        description: 'Optional gender filter (exact match: M for Male, F for Female, O for Other)'
      },
      city: {
        type: 'string',
        description: 'Optional city filter (partial match, case-insensitive)'
      },
      state: {
        type: 'string',
        description: 'Optional state filter (exact match, case-insensitive)'
      },
      email: {
        type: 'string',
        description: 'Optional email filter (searches both personal and work email, partial match, case-insensitive)'
      }
    }
  }
};

