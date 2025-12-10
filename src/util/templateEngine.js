/**
 * Safe template engine for SQL templates
 * Only replaces bind placeholders, never identifiers
 */

/**
 * Fill a SQL template with bind variables
 * This function does NOT modify the template - it only returns the template and binds
 * The template must already be safe (no identifiers from LLM)
 * @param {string} template - SQL template with :bind placeholders
 * @param {Object} binds - Bind variable values
 * @returns {Object} - { sql: string, binds: Object }
 */
export function fillTemplate(template, binds = {}) {
  if (typeof template !== 'string') {
    throw new Error('Template must be a string');
  }
  
  if (typeof binds !== 'object' || binds === null || Array.isArray(binds)) {
    throw new Error('Binds must be an object');
  }
  
  // The template should already be safe (from semantic mappings)
  // We just return it as-is with the binds
  // No interpolation of identifiers - only bind variables are used
  return {
    sql: template,
    binds: binds
  };
}

/**
 * Extract bind variable names from a SQL template
 * @param {string} template - SQL template
 * @returns {Array<string>} - Array of bind variable names (without colons)
 */
export function extractBindVariables(template) {
  if (typeof template !== 'string') {
    return [];
  }
  
  // Match :bindVariableName pattern
  const bindPattern = /:([A-Z0-9_]+)/gi;
  const matches = template.matchAll(bindPattern);
  const bindVars = [];
  
  for (const match of matches) {
    if (match[1]) {
      bindVars.push(match[1].toUpperCase());
    }
  }
  
  // Return unique bind variables
  return [...new Set(bindVars)];
}

