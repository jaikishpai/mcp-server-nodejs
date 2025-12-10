/**
 * Unit tests for identifier validation
 */
import { describe, it, expect } from '@jest/globals';
import { validateIdentifier, validateBindVariableName, validateNoSemicolons } from '../../src/util/validators.js';

describe('validateIdentifier', () => {
  it('should accept valid identifiers', () => {
    expect(validateIdentifier('PATIENT_MASTER')).toBe('PATIENT_MASTER');
    expect(validateIdentifier('PS_MCPUSER')).toBe('PS_MCPUSER');
    expect(validateIdentifier('EXT_FIRST_NAME')).toBe('EXT_FIRST_NAME');
    expect(validateIdentifier('TABLE123')).toBe('TABLE123');
  });

  it('should normalize to uppercase', () => {
    expect(validateIdentifier('patient_master')).toBe('PATIENT_MASTER');
    expect(validateIdentifier('Ps_McpUser')).toBe('PS_MCPUSER');
  });

  it('should trim whitespace', () => {
    expect(validateIdentifier('  PATIENT_MASTER  ')).toBe('PATIENT_MASTER');
  });

  it('should reject non-string values', () => {
    expect(() => validateIdentifier(null)).toThrow('not a string');
    expect(() => validateIdentifier(123)).toThrow('not a string');
    expect(() => validateIdentifier({})).toThrow('not a string');
  });

  it('should reject empty strings', () => {
    expect(() => validateIdentifier('')).toThrow('empty string');
    expect(() => validateIdentifier('   ')).toThrow('empty string');
  });

  it('should reject illegal characters', () => {
    expect(() => validateIdentifier('TABLE-NAME')).toThrow('illegal characters');
    expect(() => validateIdentifier('TABLE.NAME')).toThrow('illegal characters');
    expect(() => validateIdentifier('TABLE NAME')).toThrow('illegal characters');
    expect(() => validateIdentifier('TABLE;NAME')).toThrow('illegal characters');
  });
});

describe('validateBindVariableName', () => {
  it('should accept valid bind variable names', () => {
    expect(validateBindVariableName('id')).toBe('id');
    expect(validateBindVariableName('NAME')).toBe('NAME');
    expect(validateBindVariableName('patient_id')).toBe('patient_id');
    expect(validateBindVariableName('VAR123')).toBe('VAR123');
  });

  it('should be case-insensitive', () => {
    expect(validateBindVariableName('Id')).toBe('Id');
    expect(validateBindVariableName('NAME')).toBe('NAME');
  });

  it('should reject non-string values', () => {
    expect(() => validateBindVariableName(null)).toThrow('not a string');
    expect(() => validateBindVariableName(123)).toThrow('not a string');
  });

  it('should reject empty strings', () => {
    expect(() => validateBindVariableName('')).toThrow('empty string');
  });

  it('should reject illegal characters', () => {
    expect(() => validateBindVariableName('var-name')).toThrow('illegal characters');
    expect(() => validateBindVariableName('var.name')).toThrow('illegal characters');
  });
});

describe('validateNoSemicolons', () => {
  it('should accept SQL without semicolons', () => {
    expect(() => validateNoSemicolons('SELECT * FROM TABLE')).not.toThrow();
    expect(() => validateNoSemicolons('SELECT * FROM TABLE WHERE id = :id')).not.toThrow();
  });

  it('should reject SQL with semicolons', () => {
    expect(() => validateNoSemicolons('SELECT * FROM TABLE;')).toThrow('semicolons are not allowed');
    expect(() => validateNoSemicolons('SELECT * FROM TABLE; DROP TABLE USERS;')).toThrow('semicolons are not allowed');
  });

  it('should reject non-string values', () => {
    expect(() => validateNoSemicolons(null)).toThrow('must be a string');
  });
});

