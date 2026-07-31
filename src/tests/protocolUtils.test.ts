import { describe, it, expect } from 'vitest';
import { strictParseDecimal } from '../components/crm/tournaments/GameProtocolModal';

describe('strictParseDecimal', () => {
  it('should return 0 for empty or whitespace strings', () => {
    expect(strictParseDecimal('')).toBe(0);
    expect(strictParseDecimal('   ')).toBe(0);
  });

  it('should return the same number for numeric strings', () => {
    expect(strictParseDecimal('0')).toBe(0);
    expect(strictParseDecimal('0.3')).toBe(0.3);
    expect(strictParseDecimal('1.25')).toBe(1.25);
  });

  it('should handle commas as decimal points', () => {
    expect(strictParseDecimal('1,25')).toBe(1.25);
  });

  it('should handle leading dots or commas', () => {
    expect(strictParseDecimal('.5')).toBe(0.5);
    expect(strictParseDecimal(',5')).toBe(0.5);
  });

  it('should return null for invalid strings', () => {
    expect(strictParseDecimal('1abc')).toBeNull();
    expect(strictParseDecimal('-1')).toBeNull();
    expect(strictParseDecimal('.')).toBeNull();
    expect(strictParseDecimal(',')).toBeNull();
    expect(strictParseDecimal('NaN')).toBeNull();
    expect(strictParseDecimal('Infinity')).toBeNull();
    expect(strictParseDecimal('1.2.3')).toBeNull();
  });
});
