/**
 * Identifier validation utilities for Oracle SQL
 * Ensures identifiers (schema, table, column names) are safe for interpolation
 */

/**
 * Validate and normalize an Oracle identifier
 * @param {string} id - Identifier to validate
 * @returns {string} - Uppercase, validated identifier
 * @throws {Error} - If identifier is invalid
 */
export function validateIdentifier(id) {
  if (typeof id !== 'string') {
    throw new Error(`Invalid identifier: not a string`);
  }
  
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    throw new Error(`Invalid identifier: empty string`);
  }
  
  const upper = trimmed.toUpperCase();
  // Oracle identifiers: alphanumeric, underscore, dollar sign, hash
  // But for safety, we'll only allow alphanumeric and underscore
  if (!/^[A-Z0-9_]+$/.test(upper)) {
    throw new Error(`Invalid identifier: illegal characters. Only A-Z, 0-9, and _ are allowed`);
  }
  
  // Check length (Oracle max is 128, but we'll be conservative)
  if (upper.length > 128) {
    throw new Error(`Invalid identifier: too long (max 128 characters)`);
  }
  
  return upper;
}

/**
 * Validate bind variable name
 * @param {string} name - Bind variable name (without colon)
 * @returns {string} - Validated bind variable name
 * @throws {Error} - If bind variable name is invalid
 */
export function validateBindVariableName(name) {
  if (typeof name !== 'string') {
    throw new Error(`Invalid bind variable name: not a string`);
  }
  
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error(`Invalid bind variable name: empty string`);
  }
  
  // Bind variables: alphanumeric and underscore, case-insensitive
  if (!/^[A-Z0-9_]+$/i.test(trimmed)) {
    throw new Error(`Invalid bind variable name: ${name}. Only A-Z, 0-9, and _ are allowed`);
  }
  
  return trimmed;
}

/**
 * Validate that SQL does not contain semicolons (prevent injection)
 * @param {string} sql - SQL query to validate
 * @throws {Error} - If SQL contains semicolons
 */
export function validateNoSemicolons(sql) {
  if (typeof sql !== 'string') {
    throw new Error(`SQL must be a string`);
  }
  
  if (sql.includes(';')) {
    throw new Error(`Unsafe SQL: semicolons are not allowed`);
  }
}

