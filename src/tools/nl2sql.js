import { logger } from '../logger.js';

/**
 * MCP Tool: Convert natural language to SQL using external NL2SQL service
 * @param {Object} args - Tool arguments
 * @param {string} args.query - Natural language query
 * @returns {Promise<Object>} Generated SQL query
 */
export async function nl2sql(args) {
  try {
    const { query } = args;

    if (!query || typeof query !== 'string') {
      throw new Error('query is required and must be a string');
    }

    const nl2sqlUrl = process.env.NL2SQL_URL || 'http://nl2sql-service:8500/query';

    logger.info('Calling NL2SQL service', { 
      url: nl2sqlUrl,
      queryLength: query.length 
    });

    const response = await fetch(nl2sqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NL2SQL service returned ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    // Handle different response formats
    const sql = result.sql || result.query || result.text || null;
    
    if (!sql) {
      throw new Error('NL2SQL service did not return SQL in expected format');
    }

    logger.info('NL2SQL service returned SQL', { sqlLength: sql.length });

    return {
      success: true,
      data: {
        naturalLanguageQuery: query,
        sql: sql,
        explanation: result.explanation || result.reasoning || null,
        confidence: result.confidence || null
      }
    };
  } catch (error) {
    logger.error('nl2sql tool error', { 
      error: error.message, 
      stack: error.stack,
      name: error.name 
    });

    // Handle specific error types
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: {
          message: 'NL2SQL service request timed out after 30 seconds',
          code: 'TIMEOUT'
        }
      };
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return {
        success: false,
        error: {
          message: `Cannot connect to NL2SQL service at ${process.env.NL2SQL_URL || 'http://nl2sql-service:8500/query'}`,
          code: 'SERVICE_UNAVAILABLE'
        }
      };
    }

    return {
      success: false,
      error: {
        message: error.message,
        code: error.code || 'UNKNOWN'
      }
    };
  }
}

export const nl2sqlSchema = {
  name: 'nl2sql',
  description: 'Convert natural language query to SQL using an external NL2SQL service. The service should be running at the URL specified in NL2SQL_URL environment variable.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query to convert to SQL (e.g., "Show me all customers from New York")'
      }
    },
    required: ['query']
  }
};

