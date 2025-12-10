import { executeQuery } from '../oracle.js';
import { logger } from '../logger.js';
import { getSemanticMappings } from './getSemanticMappings.js';
import { validateIdentifier } from '../util/validators.js';
import { fillTemplate } from '../util/templateEngine.js';

/**
 * ============================================================
 * FRIENDLY FIELD MAPPINGS (Business → Oracle Columns)
 * These fields will appear in inputSchema and be preferred.
 * ============================================================
 */
const FRIENDLY_MAP = {
  firstName: "EXT_FIRST_NAME",
  middleName: "EXT_MIDDLE_NAME",
  lastName: "EXT_LAST_NAME",
  dob: "EXT_DATE_OF_BIRTH",
  gender: "EXT_SEX",
  mrn: "MEDICAL_RECORD_NUM",
  ssn: "SSN",

  address: ["EXT_ADDRESS1", "EXT_ADDRESS2", "EXT_ADDRESS3", "EXT_ADDRESS4"],
  city: "EXT_CITY",
  state: "EXT_STATE",
  zip: "EXT_ZIP_CODE",
  country: "EXT_COUNTRY",

  email: ["EXT_PERSONAL_EMAIL", "EXT_WORK_EMAIL"],
  phone: ["EXT_CELL_PHONE_CALL", "EXT_HOME_PHONE", "EXT_WORK_PHONE"],

  category: "EXT_CATEGORY",

  visitCount: "VISIT_COUNT",
  lastVisitDate: "LAST_VISIT_DATE",
  apptDate: "APPT_DATE",
  followupDate: "FOLLOWUP_DATE",

  balanceDue: "DUE_PATIENT",
  familyBalanceDue: "FAMILY_DUE_AMT",

  notes: "EXT_NOTES"
};

/**
 * ============================================================
 * Date Validators
 * ============================================================
 */
function isValidDateYYYYMMDD(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * ============================================================
 * Build WHERE clause using ONLY friendly mappings
 * NO column guessing - all columns must be in FRIENDLY_MAP
 * ============================================================
 */
function buildFilterExpressions(filters, binds) {
  const conditions = [];

  for (const [friendlyField, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === "") continue;

    const mapped = FRIENDLY_MAP[friendlyField];

    // REJECT any field not in friendly map
    if (!mapped) {
      logger.warn("Ignoring unknown field - not in friendly mappings", { field: friendlyField });
      continue;
    }

    /**
     * Handle array mappings (multiple columns for one field)
     */
    if (Array.isArray(mapped)) {
      const orList = [];
      mapped.forEach((col, i) => {
        const bind = `${friendlyField}_${i}`;
        binds[bind] = `%${value}%`;
        orList.push(`UPPER(${col}) LIKE UPPER(:${bind})`);
      });
      conditions.push(`(${orList.join(" OR ")})`);
    } else {
      /**
     * Handle single column mapping
     */
      const col = mapped;
      const bind = friendlyField;

      // Date handling
      if (friendlyField === 'dob' || friendlyField === 'lastVisitDate' || 
          friendlyField === 'apptDate' || friendlyField === 'followupDate') {
        if (!isValidDateYYYYMMDD(value)) {
          logger.warn("Invalid date format for friendly field", { field: friendlyField, value });
          continue;
        }
        binds[bind] = value;
        conditions.push(`${col} = TO_DATE(:${bind}, 'YYYY-MM-DD')`);
      } else {
        // String search (LIKE)
        binds[bind] = `%${value}%`;
        conditions.push(`UPPER(${col}) LIKE UPPER(:${bind})`);
      }
    }
  }

  return conditions.join(" AND ");
}

/**
 * ============================================================
 * MCP TOOL: searchPatients
 * Deterministic workflow using semantic mappings
 * ============================================================
 */
export async function searchPatients(args = {}) {
  try {
    // Step 1: Get semantic mappings for PATIENT_MASTER
    const mappingsResult = await getSemanticMappings({ tableName: 'PATIENT_MASTER' });
    
    if (!mappingsResult.success || !mappingsResult.data) {
      return {
        success: false,
        error: {
          message: "Unable to map fields to known schema. Missing semantic mapping for PATIENT_MASTER.",
          fieldsReceived: Object.keys(args),
          code: 'MAPPING_NOT_FOUND'
        }
      };
    }

    const mapping = mappingsResult.data.mapping;
    
    // Step 2: Validate schema and table from semantic mappings
    const schemaName = mapping.schema ? validateIdentifier(mapping.schema) : null;
    const tableName = validateIdentifier(mapping.tableName);
    
    // Build fully qualified table name
    const qualifiedTable = schemaName ? `${schemaName}.${tableName}` : tableName;

    // Step 3: Filter out empty values
    const filters = Object.fromEntries(
      Object.entries(args).filter(([_, v]) => v !== null && v !== undefined && v !== "")
    );

    if (Object.keys(filters).length === 0) {
      // No filters - use select_all template if available
      const templates = mapping.mcp_sql_templates || {};
      if (templates.select_all) {
        const { sql, binds } = fillTemplate(templates.select_all, {});
        const result = await executeQuery(sql, binds, { maxRows: 25, approved: true });
        
        return {
          success: true,
          data: {
            patients: result.rows,
            count: result.rowCount,
            filters: [],
            table: qualifiedTable
          }
        };
      } else {
        // Fallback: simple SELECT with limit
        const sql = `SELECT * FROM ${qualifiedTable} FETCH FIRST 25 ROWS ONLY`;
        const result = await executeQuery(sql, {}, { maxRows: 25, approved: true });
        
        return {
          success: true,
          data: {
            patients: result.rows,
            count: result.rowCount,
            filters: [],
            table: qualifiedTable
          }
        };
      }
    }

    // Step 4: Build WHERE clause using ONLY friendly mappings
    const binds = {};
    const whereClause = buildFilterExpressions(filters, binds);

    if (!whereClause) {
      // No valid filters after processing
      return {
        success: false,
        error: {
          message: "No valid filter fields found. All fields must be in friendly mappings.",
          fieldsReceived: Object.keys(filters),
          code: 'NO_VALID_FILTERS'
        }
      };
    }

    // Step 5: Build SQL using validated table name (never from LLM)
    const sql = `
      SELECT *
      FROM ${qualifiedTable}
      WHERE ${whereClause}
      FETCH FIRST 25 ROWS ONLY
    `;

    logger.info("Executing deterministic patient search", {
      filters: Object.keys(filters),
      whereClause,
      bindCount: Object.keys(binds).length,
      table: qualifiedTable
    });

    // Step 6: Execute with approved flag
    const result = await executeQuery(sql, binds, { maxRows: 25, approved: true });

    return {
      success: true,
      data: {
        patients: result.rows,
        count: result.rowCount,
        filters: Object.keys(filters),
        table: qualifiedTable
      }
    };
  } catch (error) {
    logger.error("searchPatients error", {
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

/**
 * ============================================================
 * TOOL SCHEMA — Updated & Expanded
 * ============================================================
 */
export const searchPatientsSchema = {
  name: "searchPatients",
  description:
    "Deterministic patient search using semantic mappings. Only uses validated friendly field mappings - no column guessing. Requires semantic mapping for PATIENT_MASTER table.",
  inputSchema: {
    type: "object",
    properties: {
      firstName: { type: "string" },
      middleName: { type: "string" },
      lastName: { type: "string" },

      dob: {
        type: "string",
        description: "Date of birth (YYYY-MM-DD)"
      },

      gender: {
        type: "string",
        enum: ["M", "F", "O"]
      },

      mrn: { type: "string" },
      ssn: { type: "string" },

      phone: { type: "string" },
      email: { type: "string" },

      address: { type: "string" },

      city: { type: "string" },
      state: { type: "string" },
      zip: { type: "string" },
      country: { type: "string" },

      category: { type: "string" },

      notes: { type: "string" },

      visitCount: { type: "string" },

      lastVisitDate: {
        type: "string",
        description: "YYYY-MM-DD"
      },

      apptDate: {
        type: "string",
        description: "YYYY-MM-DD"
      },

      followupDate: {
        type: "string",
        description: "YYYY-MM-DD"
      },

      balanceDue: { type: "string" },
      familyBalanceDue: { type: "string" }
    }
  }
};
