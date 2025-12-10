/**
 * Integration tests for safe MCP workflow
 * Tests the full flow: getSemanticMappings → getSchema → runQuery approved
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { getSemanticMappings } from '../../src/tools/getSemanticMappings.js';
import { getSchema } from '../../src/tools/getSchema.js';
import { runQuery } from '../../src/tools/runQuery.js';
import { searchPatients } from '../../src/tools/searchPatients.js';

// Mock all dependencies
jest.mock('../../src/oracle.js', () => ({
  executeQuery: jest.fn(),
  initPool: jest.fn(),
  getConnection: jest.fn()
}));

describe('Safe MCP Workflow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should complete full safe workflow: mappings → schema → approved query', async () => {
    // Step 1: Get semantic mappings
    const mappingsResult = await getSemanticMappings({ tableName: 'PATIENT_MASTER' });
    expect(mappingsResult.success).toBe(true);
    expect(mappingsResult.data.mapping).toBeDefined();

    // Step 2: Get schema
    const schemaResult = await getSchema({
      tableName: mappingsResult.data.mapping.tableName,
      schema: mappingsResult.data.mapping.schema
    });
    expect(schemaResult.success).toBe(true);
    expect(schemaResult.data.columns).toBeDefined();

    // Step 3: Run approved query using validated table/columns
    const { executeQuery } = require('../../src/oracle.js');
    executeQuery.mockResolvedValue({
      rows: [{ PATIENT_PKEY: 1 }],
      rowCount: 1,
      meta: { columnNames: ['PATIENT_PKEY'], columnCount: 1 }
    });

    const queryResult = await runQuery({
      sql: `SELECT * FROM ${schemaResult.data.schema}.${schemaResult.data.tableName} WHERE PATIENT_PKEY = :id`,
      binds: { id: 1 },
      approved: true
    });

    expect(queryResult.success).toBe(true);
    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining(schemaResult.data.tableName),
      { id: 1 },
      expect.objectContaining({ approved: true })
    );
  });

  it('should reject unapproved queries in workflow', async () => {
    const queryResult = await runQuery({
      sql: 'SELECT * FROM PATIENT_MASTER',
      approved: false
    });

    expect(queryResult.success).toBe(false);
    expect(queryResult.error.message).toContain('approved=true');
  });

  it('should use searchPatients with semantic mappings', async () => {
    const { executeQuery } = require('../../src/oracle.js');
    executeQuery.mockResolvedValue({
      rows: [{ PATIENT_PKEY: 1, EXT_LAST_NAME: 'Doe' }],
      rowCount: 1
    });

    const result = await searchPatients({
      lastName: 'Doe'
    });

    expect(result.success).toBe(true);
    expect(result.data.patients).toBeDefined();
    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('PATIENT_MASTER'),
      expect.objectContaining({ lastName: expect.any(String) }),
      expect.objectContaining({ approved: true })
    );
  });

  it('should ensure no bind variables for identifiers in schema queries', async () => {
    const { executeQuery } = require('../../src/oracle.js');
    executeQuery.mockResolvedValue({
      rows: [],
      rowCount: 0
    });

    await getSchema({
      tableName: 'PATIENT_MASTER',
      schema: 'PS_MCPUSER'
    });

    const sql = executeQuery.mock.calls[0][0];
    const binds = executeQuery.mock.calls[0][1];

    // Should use string interpolation for identifiers
    expect(sql).toContain("owner = 'PS_MCPUSER'");
    expect(sql).toContain("table_name = 'PATIENT_MASTER'");
    
    // Should NOT use bind variables for identifiers
    expect(sql).not.toContain(':schema');
    expect(sql).not.toContain(':tableName');
    
    // Binds should be empty
    expect(Object.keys(binds)).toHaveLength(0);
  });
});

