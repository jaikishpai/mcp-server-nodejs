/**
 * Unit tests for oracle.js executeQuery hardening
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { executeQuery } from '../../src/oracle.js';
import { getConnection } from '../../src/oracle.js';

// Mock oracledb
jest.mock('oracledb', () => ({
  OUT_FORMAT_OBJECT: 'object',
  createPool: jest.fn(),
  initOracleClient: jest.fn()
}));

// Mock getConnection
jest.mock('../../src/oracle.js', () => {
  const actualModule = jest.requireActual('../../src/oracle.js');
  return {
    ...actualModule,
    getConnection: jest.fn()
  };
});

describe('executeQuery hardening', () => {
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      execute: jest.fn(),
      close: jest.fn()
    };
    getConnection.mockResolvedValue(mockConnection);
  });

  it('should reject SQL with semicolons (unless approved)', async () => {
    await expect(executeQuery('SELECT * FROM TABLE;', {})).rejects.toThrow('semicolons are not allowed');
    expect(mockConnection.execute).not.toHaveBeenCalled();
  });

  it('should allow SQL with semicolons if approved', async () => {
    mockConnection.execute.mockResolvedValue({
      rows: [],
      metaData: []
    });

    await executeQuery('SELECT * FROM TABLE;', {}, { approved: true });
    expect(mockConnection.execute).toHaveBeenCalled();
  });

  it('should log SQL audit information', async () => {
    const logger = require('../../src/logger.js').logger;
    jest.spyOn(logger, 'info');

    mockConnection.execute.mockResolvedValue({
      rows: [],
      metaData: []
    });

    await executeQuery('SELECT * FROM TABLE WHERE id = :id', { id: 123 });

    expect(logger.info).toHaveBeenCalledWith(
      'DB_EXECUTE',
      expect.objectContaining({
        sql: expect.any(String),
        binds: ['id'],
        bindCount: 1,
        timestamp: expect.any(String)
      })
    );
  });

  it('should normalize Oracle errors', async () => {
    const oraError = new Error('ORA-00904: invalid identifier');
    oraError.errorNum = 904;
    oraError.sqlState = '42000';
    mockConnection.execute.mockRejectedValue(oraError);

    await expect(executeQuery('SELECT * FROM INVALID', {})).rejects.toMatchObject({
      errorNum: 904,
      sqlState: '42000',
      message: expect.stringContaining('invalid identifier')
    });
  });

  it('should handle ORA-01745 errors', async () => {
    const oraError = new Error('ORA-01745: invalid host/bind variable name');
    oraError.errorNum = 1745;
    mockConnection.execute.mockRejectedValue(oraError);

    await expect(executeQuery('SELECT * FROM TABLE', {})).rejects.toMatchObject({
      errorNum: 1745,
      message: expect.stringContaining('invalid host/bind variable')
    });
  });

  it('should handle ORA-00942 errors', async () => {
    const oraError = new Error('ORA-00942: table or view does not exist');
    oraError.errorNum = 942;
    mockConnection.execute.mockRejectedValue(oraError);

    await expect(executeQuery('SELECT * FROM MISSING_TABLE', {})).rejects.toMatchObject({
      errorNum: 942,
      message: expect.stringContaining('table or view does not exist')
    });
  });
});

