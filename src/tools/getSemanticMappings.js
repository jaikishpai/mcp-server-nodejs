import { logger } from '../logger.js';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to schemas folder
const SCHEMAS_DIR = join(__dirname, '../schemas');

// Cache for loaded semantic mappings
let SEMANTIC_MAPPINGS = null;
let loadPromise = null;

/**
 * Split schema.tableName into separate schema and tableName
 * @param {string} input - Input string (may be "schema.table" or just "table")
 * @returns {Object} { schema: string|null, tableName: string }
 */
function splitTableName(input) {
  if (!input || typeof input !== 'string') {
    return { schema: null, tableName: null };
  }
  
  const trimmed = input.trim().toUpperCase();
  const dotIndex = trimmed.indexOf('.');
  
  if (dotIndex === -1) {
    // No schema prefix
    return { schema: null, tableName: trimmed };
  }
  
  // Has schema prefix
  const schema = trimmed.substring(0, dotIndex);
  const tableName = trimmed.substring(dotIndex + 1);
  
  return {
    schema: schema || null,
    tableName: tableName || null
  };
}

/**
 * Load all semantic mapping JSON files from the schemas folder
 * Uses lenient error handling - skips invalid files and continues loading others
 * @returns {Promise<Object>} Map of tableName -> schema object
 */
async function loadSemanticMappings() {
  // Return cached mappings if already loaded
  if (SEMANTIC_MAPPINGS !== null) {
    return SEMANTIC_MAPPINGS;
  }

  // If already loading, wait for that promise
  if (loadPromise) {
    return loadPromise;
  }

  // Start loading
  loadPromise = (async () => {
    const mappings = {};
    let loadedCount = 0;
    let skippedCount = 0;

    try {
      // Read all files in schemas directory
      const files = await readdir(SCHEMAS_DIR);
      const jsonFiles = files.filter(file => file.endsWith('.json') && file !== '.gitkeep');

      if (jsonFiles.length === 0) {
        logger.warn('No semantic mapping JSON files found in schemas folder', { schemasDir: SCHEMAS_DIR });
        SEMANTIC_MAPPINGS = mappings;
        return mappings;
      }

      logger.info('Loading semantic mappings from schemas folder', { 
        fileCount: jsonFiles.length,
        files: jsonFiles 
      });

      // Load each JSON file
      for (const file of jsonFiles) {
        const filePath = join(SCHEMAS_DIR, file);
        
        try {
          // Read and parse JSON file
          const fileContent = await readFile(filePath, 'utf8');
          const schemaData = JSON.parse(fileContent);

          // Validate required fields (lenient - just check if tableName exists)
          if (!schemaData.tableName) {
            logger.warn('Skipping schema file - missing tableName', { 
              file,
              filePath 
            });
            skippedCount++;
            continue;
          }

          // Split schema.tableName if present
          const { schema: extractedSchema, tableName: extractedTableName } = splitTableName(schemaData.tableName);
          
          if (!extractedTableName) {
            logger.warn('Skipping schema file - invalid tableName', { 
              file,
              filePath,
              tableName: schemaData.tableName
            });
            skippedCount++;
            continue;
          }

          // Normalize table name (without schema prefix)
          const tableName = extractedTableName;

          // Check for duplicates (warn but use the last one)
          if (mappings[tableName]) {
            logger.warn('Duplicate tableName found in schemas - overwriting', { 
              tableName,
              existingFile: Object.keys(mappings).find(k => mappings[k]._sourceFile),
              newFile: file 
            });
          }

          // Store mapping with normalized tableName and extracted schema
          // Note: schemaData.schema is the JSON schema object, extractedSchema is the Oracle schema name
          const oracleSchema = extractedSchema || null;
          
          // Preserve the JSON schema object (schemaData.schema) but also store Oracle schema separately
          mappings[tableName] = {
            ...schemaData,
            tableName: tableName, // Store only table name (no schema prefix)
            oracleSchema: oracleSchema, // Store Oracle schema name separately
            _sourceFile: file // Track which file this came from
          };

          loadedCount++;
          logger.debug('Loaded semantic mapping', { 
            tableName,
            file,
            hasSchema: !!schemaData.schema,
            hasTemplates: !!schemaData.mcp_sql_templates
          });

        } catch (error) {
          // Lenient error handling - log warning and continue
          logger.warn('Failed to load schema file - skipping', { 
            file,
            filePath,
            error: error.message 
          });
          skippedCount++;
          continue;
        }
      }

      logger.info('Semantic mappings loaded successfully', { 
        loaded: loadedCount,
        skipped: skippedCount,
        total: Object.keys(mappings).length,
        tables: Object.keys(mappings)
      });

      SEMANTIC_MAPPINGS = mappings;
      return mappings;

    } catch (error) {
      // If directory doesn't exist or can't be read, log error but return empty mappings
      logger.error('Failed to load semantic mappings from schemas folder', { 
        schemasDir: SCHEMAS_DIR,
        error: error.message,
        stack: error.stack
      });
      SEMANTIC_MAPPINGS = {};
      return {};
    }
  })();

  return loadPromise;
}

/**
 * MCP Tool: Get semantic mappings (JSON schema) for database tables
 * @param {Object} args - Tool arguments
 * @param {string} args.tableName - Optional fully qualified table name (schema.table). If not provided, returns all available mappings.
 * @returns {Promise<Object>} Semantic mapping schema(s)
 */
export async function getSemanticMappings(args) {
  try {
    const { tableName } = args;

    // Load schemas (will use cache if already loaded)
    const mappings = await loadSemanticMappings();

    logger.info('Getting semantic mappings via MCP tool', { 
      tableName: tableName || 'all',
      availableTablesCount: Object.keys(mappings).length
    });

    // If tableName is provided, return specific mapping
    if (tableName) {
      // Split schema.tableName if present
      const { schema: inputSchema, tableName: inputTableName } = splitTableName(tableName);
      
      if (!inputTableName) {
        return {
          success: false,
          error: {
            message: `Invalid tableName: ${tableName}`,
            code: 'INVALID_TABLE_NAME',
            availableTables: Object.keys(mappings)
          }
        };
      }

      // Look up by table name only (no schema prefix)
      const mapping = mappings[inputTableName];

      if (!mapping) {
        return {
          success: false,
          error: {
            message: `No semantic mapping found for table: ${inputTableName}`,
            code: 'MAPPING_NOT_FOUND',
            availableTables: Object.keys(mappings)
          }
        };
      }

      // Return mapping without internal metadata
      const { _sourceFile, oracleSchema, ...mappingData } = mapping;
      
      // Ensure mapping.tableName is normalized (no schema prefix)
      const normalizedMapping = {
        ...mappingData,
        tableName: inputTableName // Always table name without schema prefix
      };
      
      // Add Oracle schema if available
      if (oracleSchema) {
        normalizedMapping.schema = oracleSchema;
      }
      
      return {
        success: true,
        data: {
          tableName: inputTableName, // Always return table name without schema prefix
          mapping: normalizedMapping
        }
      };
    }

    // If no tableName provided, return all available mappings (without internal metadata)
    const cleanMappings = {};
    for (const [key, value] of Object.entries(mappings)) {
      const { _sourceFile, oracleSchema, ...cleanValue } = value;
      
      // Ensure tableName is normalized (no schema prefix)
      const normalizedMapping = {
        ...cleanValue,
        tableName: key // Always table name without schema prefix
      };
      
      // Add Oracle schema if available
      if (oracleSchema) {
        normalizedMapping.schema = oracleSchema;
      }
      
      cleanMappings[key] = normalizedMapping;
    }

    return {
      success: true,
      data: {
        availableTables: Object.keys(mappings), // Only table names, no schema prefix
        mappings: cleanMappings,
        count: Object.keys(mappings).length
      }
    };
  } catch (error) {
    logger.error('getSemanticMappings tool error', { error: error.message, stack: error.stack });
    return {
      success: false,
      error: {
        message: error.message,
        code: error.errorNum || 'UNKNOWN'
      }
    };
  }
}

export const getSemanticMappingsSchema = {
  name: 'getSemanticMappings',
  description: 'Get semantic mappings (JSON schema) for database tables. These schemas describe table structure, column meanings, data types, and include SQL templates for safe query generation. Use this to understand table semantics before generating SQL queries.',
  inputSchema: {
    type: 'object',
    properties: {
      tableName: {
        type: 'string',
        description: 'Optional table name (e.g., "PATIENT_MASTER" or "P_COMMONUSEROBJECT.PATIENT_MASTER"). Schema prefix is automatically stripped. If not provided, returns all available semantic mappings.'
      }
    }
  }
};
