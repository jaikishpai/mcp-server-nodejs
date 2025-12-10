/**
 * Unit tests for runQuery tool
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { runQuery } from '../../src/tools/runQuery.js';
import { executeQuery } from '../../src/oracle.js';

// Mock oracle module
jest.mock('../../src/oracle.js', () => ({
  executeQuery: jest.fn()
}));

describe('runQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject queries without approved flag', async () => {
    const result = await runQuery({
      sql: 'SELECT * FROM PATIENT_MASTER',
      binds: {}
    });

    expect(result.success).toBe(false);
    expect(result.error.message).toContain('approved=true');
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('should accept queries with approved=true', async () => {
    executeQuery.mockResolvedValue({
      rows: [{ id: 1, name: 'Test' }],
      rowCount: 1,
      meta: { columnNames: ['id', 'name'], columnCount: 2 }
    });

    const result = await runQuery({
      sql: 'SELECT * FROM PATIENT_MASTER WHERE id = :id',
      binds: { id: 123 },
      approved: true
    });

    expect(result.success).toBe(true);
    expect(executeQuery).toHaveBeenCalledWith(
      'SELECT * FROM PATIENT_MASTER WHERE id = :id',
      { id: 123 },
      expect.objectContaining({ maxRows: 1000, approved: true })
    );
  });

  it('should validate bind variable names', async () => {
    const result = await runQuery({
      sql: 'SELECT * FROM TABLE WHERE id = :id',
      binds: { 'id;DROP': 123 },
      approved: true
    });

    expect(result.success).toBe(false);
    expect(result.error.message).toContain('Invalid bind variable name');
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('should accept valid bind variable names', async () => {
    executeQuery.mockResolvedValue({
      rows: [],
      rowCount: 0,
      meta: { columnNames: [], columnCount: 0 }
    });

    const result = await runQuery({
      sql: 'SELECT * FROM TABLE WHERE id = :id AND name = :name',
      binds: { id: 123, name: 'Test' },
      approved: true
    });

    expect(result.success).toBe(true);
    expect(executeQuery).toHaveBeenCalled();
  });

  it('should parse JSON string binds', async () => {
    executeQuery.mockResolvedValue({
      rows: [],
      rowCount: 0,
      meta: { columnNames: [], columnCount: 0 }
    });

    const result = await runQuery({
      sql: 'SELECT * FROM TABLE',
      binds: '{"id": 123}',
      approved: true
    });

    expect(result.success).toBe(true);
    expect(executeQuery).toHaveBeenCalledWith(
      'SELECT * FROM TABLE',
      { id: 123 },
      expect.any(Object)
    );
  });

  it('should validate maxRows', async () => {
    const result1 = await runQuery({
      sql: 'SELECT * FROM TABLE',
      maxRows: -1,
      approved: true
    });

    expect(result1.success).toBe(false);
    expect(result1.error.message).toContain('positive integer');

    const result2 = await runQuery({
      sql: 'SELECT * FROM TABLE',
      maxRows: 'invalid',
      approved: true
    });

    expect(result2.success).toBe(false);
    expect(result2.error.message).toContain('positive integer');
  });

  it('should handle Oracle errors', async () => {
    const dbError = new Error('ORA-00904: invalid identifier');
    dbError.errorNum = 904;
    dbError.sqlState = '42000';

    executeQuery.mockRejectedValue(dbError);

    const result = await runQuery({
      sql: 'SELECT * FROM INVALID_TABLE',
      approved: true
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(904);
    expect(result.error.message).toContain('invalid identifier');
  });
});

