import { executeQuery } from '../oracle.js';
import { logger } from '../logger.js';

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
 * BLOCKLIST — fields NOT allowed in fallback (Option B)
 * ============================================================
 */
const BLOCKLIST = [
  "SSN",
  "VISA_NUM",
  "DRIVING_LICENSE_NUM",
  "ACCOUNT_NUM",
  "ROUTING_NUM",
  "CCARD1_ACCOUNT_NUM",
  "CCARD2_ACCOUNT_NUM",
  "CCARD3_ACCOUNT_NUM",
  "CCARD4_ACCOUNT_NUM",
  "CCARD1_HOLDER",
  "CCARD1_NAME",
  "CCARD2_HOLDER",
  "CCARD3_HOLDER",
  "CCARD4_HOLDER",
  "BILL_COLLECTION_INFO",
  "BILL_COLLECTION_DATE",

  // Attribute fields blocked (Option B)
  ...Array.from({ length: 20 }).map((_, i) => `ATTRIBUTE${i + 1}`),
  ...Array.from({ length: 20 }).map((_, i) => `GLOBAL_ATTRIBUTE${i + 1}`)
];

/**
 * ============================================================
 * Canonical table
 * ============================================================
 */
const CANONICAL_SCHEMA = "PS_MCPUSER";
const CANONICAL_TABLE = "PATIENT_MASTER";

/**
 * ============================================================
 * Date / Timestamp Validators
 * ============================================================
 */
function isValidDateYYYYMMDD(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTimestamp(value) {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value);
}

/**
 * ============================================================
 * Schema Cache (Column Types)
 * ============================================================
 */
let SCHEMA_CACHE = null;

async function loadTableSchema() {
  if (SCHEMA_CACHE) return SCHEMA_CACHE;

  const sql = `
    SELECT COLUMN_NAME, DATA_TYPE
    FROM ALL_TAB_COLUMNS
    WHERE OWNER = :schema AND TABLE_NAME = :table
  `;

  const result = await executeQuery(sql, {
    schema: CANONICAL_SCHEMA,
    table: CANONICAL_TABLE
  });

  const schema = {};
  for (const row of result.rows) {
    schema[row.COLUMN_NAME] = row.DATA_TYPE;
  }

  SCHEMA_CACHE = schema;

  logger.info("Schema loaded for fallback engine", {
    columns: Object.keys(schema).length
  });

  return schema;
}

/**
 * ============================================================
 * Build WHERE clause with friendly mappings + fallback
 * ============================================================
 */
function buildFilterExpressions(filters, schema, binds) {
  const conditions = [];

  for (const [friendlyField, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === "") continue;

    const mapped = FRIENDLY_MAP[friendlyField];

    /**
     * ========================
     * Friendly Mapping Exists
     * ========================
     */
    if (mapped) {
      if (Array.isArray(mapped)) {
        const orList = [];
        mapped.forEach((col, i) => {
          const bind = `${friendlyField}_${i}`;
          binds[bind] = `%${value}%`;
          orList.push(`UPPER(${col}) LIKE UPPER(:${bind})`);
        });
        conditions.push(`(${orList.join(" OR ")})`);
      } else {
        const col = mapped;
        const bind = friendlyField;

        if (schema[col] === "DATE") {
          if (!isValidDateYYYYMMDD(value)) {
            logger.warn("Invalid date format for friendly field", { field: friendlyField, value });
            continue;
          }
          binds[bind] = value;
          conditions.push(`${col} = TO_DATE(:${bind}, 'YYYY-MM-DD')`);
        } else {
          binds[bind] = `%${value}%`;
          conditions.push(`UPPER(${col}) LIKE UPPER(:${bind})`);
        }
      }
      continue;
    }

    /**
     * ========================
     * Smart Fallback
     * ========================
     */
    const col = friendlyField.toUpperCase();

    if (!schema[col]) {
      logger.warn("Ignoring unknown field from AI", { field: friendlyField });
      continue;
    }

    if (BLOCKLIST.includes(col)) {
      logger.warn("Blocked sensitive fallback column", { col });
      continue;
    }

    const bind = `fb_${col}`;
    const type = schema[col];

    switch (type) {
      case "NUMBER":
        if (value === "" || isNaN(value)) {
          logger.warn("Invalid NUMBER format", { col, value });
          continue;
        }
        binds[bind] = Number(value);
        conditions.push(`${col} = :${bind}`);
        break;

      case "DATE":
        if (!isValidDateYYYYMMDD(value)) {
          logger.warn("Invalid DATE format", { col, value });
          continue;
        }
        binds[bind] = value;
        conditions.push(`${col} = TO_DATE(:${bind}, 'YYYY-MM-DD')`);
        break;

      case "TIMESTAMP":
      case "TIMESTAMP(6)":
        // Auto-append time if only date provided
        let timestampValue = value;
        if (isValidDateYYYYMMDD(value)) {
          timestampValue = `${value} 00:00:00`;
        } else if (!isValidTimestamp(value)) {
          logger.warn("Invalid TIMESTAMP format", { col, value });
          continue;
        }
        binds[bind] = timestampValue;
        conditions.push(`${col} = TO_TIMESTAMP(:${bind}, 'YYYY-MM-DD HH24:MI:SS')`);
        break;

      default:
        binds[bind] = `%${value}%`;
        conditions.push(`UPPER(${col}) LIKE UPPER(:${bind})`);
    }
  }

  return conditions.join(" AND ");
}

/**
 * ============================================================
 * MCP TOOL: searchPatients
 * ============================================================
 */
export async function searchPatients(args = {}) {
  try {
    const filters = Object.fromEntries(
      Object.entries(args).filter(([_, v]) => v !== null && v !== undefined && v !== "")
    );

    const schema = await loadTableSchema();
    const binds = {};
    const whereClause = buildFilterExpressions(filters, schema, binds);

    const sql = `
      SELECT *
      FROM ${CANONICAL_SCHEMA}.${CANONICAL_TABLE}
      ${whereClause ? `WHERE ${whereClause}` : ""}
      FETCH FIRST 25 ROWS ONLY
    `;

    logger.info("Executing smart patient search", {
      filters,
      whereClause,
      bindCount: Object.keys(binds).length
    });

    const result = await executeQuery(sql, binds, { maxRows: 25 });

    return {
      success: true,
      data: {
        patients: result.rows,
        count: result.rowCount,
        filters: Object.keys(filters),
        table: `${CANONICAL_SCHEMA}.${CANONICAL_TABLE}`
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
        message: error.message
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
    "Smart patient search with friendly mappings + safe fallback. Supports name, DOB, MRN, SSN, phone, email, city/state, dates, balances, and more.",
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
