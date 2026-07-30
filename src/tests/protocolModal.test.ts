import { describe, it, expect } from 'vitest';
import { formatColorMark } from '../components/crm/tournaments/GameProtocolModal';

describe('GameProtocolModal Frontend Helpers', () => {
  it('formats color marks correctly', () => {
    expect(formatColorMark({ seat_numbers: [4], mark: 'red' })).toBe('4 кр');
    expect(formatColorMark({ seat_numbers: [2, 1], mark: 'black' })).toBe('1 2 ч');
    expect(formatColorMark({ seat_numbers: [5], mark: 'sheriff' })).toBe('5 ш');
    expect(formatColorMark({ seat_numbers: [8, 3], mark: 'red' })).toBe('3 8 кр');
  });

  it('handles empty or missing seat_numbers gracefully', () => {
    expect(formatColorMark({ seat_numbers: [], mark: 'red' })).toBe(' кр');
    expect(formatColorMark(null as any)).toBe('');
  });
});
