/**
 * Unit tests for getSchema tool
 * Tests that it uses validated interpolation instead of bind variables for identifiers
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { getSchema } from '../../src/tools/getSchema.js';
import { executeQuery } from '../../src/oracle.js';

// Mock oracle module
jest.mock('../../src/oracle.js', () => ({
  executeQuery: jest.fn()
}));

describe('getSchema', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should use validated interpolation for schema and table names', async () => {
    executeQuery.mockResolvedValue({
      rows: [
        { COLUMN_NAME: 'ID', DATA_TYPE: 'NUMBER', COLUMN_ID: 1 }
      ],
      rowCount: 1
    });

    await getSchema({
      tableName: 'PATIENT_MASTER',
      schema: 'PS_MCPUSER'
    });

    expect(executeQuery).toHaveBeenCalled();
    const sql = executeQuery.mock.calls[0][0];
    
    // Should use string interpolation, not bind variables for identifiers
    expect(sql).toContain("owner = 'PS_MCPUSER'");
    expect(sql).toContain("table_name = 'PATIENT_MASTER'");
    expect(sql).not.toContain(':schema');
    expect(sql).not.toContain(':tableName');
    
    // Binds should be empty object
    const binds = executeQuery.mock.calls[0][1];
    expect(binds).toEqual({});
  });

  it('should validate identifiers before using them', async () => {
    // Should throw error for invalid identifier
    const result = await getSchema({
      tableName: 'TABLE;DROP',
      schema: 'SCHEMA'
    });

    expect(result.success).toBe(false);
    expect(result.error.message).toContain('illegal characters');
  });

  it('should handle table name without schema', async () => {
    executeQuery.mockResolvedValue({
      rows: [],
      rowCount: 0
    });

    await getSchema({
      tableName: 'PATIENT_MASTER'
    });

    const sql = executeQuery.mock.calls[0][0];
    // Should use user_tab_columns when no schema
    expect(sql).toContain('user_tab_columns');
    expect(sql).toContain("table_name = 'PATIENT_MASTER'");
  });

  it('should normalize table and schema names to uppercase', async () => {
    executeQuery.mockResolvedValue({
      rows: [],
      rowCount: 0
    });

    await getSchema({
      tableName: 'patient_master',
      schema: 'ps_mcpuser'
    });

    const sql = executeQuery.mock.calls[0][0];
    expect(sql).toContain("table_name = 'PATIENT_MASTER'");
    expect(sql).toContain("owner = 'PS_MCPUSER'");
  });
});

