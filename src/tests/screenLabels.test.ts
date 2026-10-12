import { describe, expect, it } from 'vitest';
import { screenLabel } from '../lib/screenLabels.ts';

describe('screenLabel', () => {
  it('uses the exact name when known', () => {
    expect(screenLabel('/player/events')).toBe('События');
  });
  it('puts unknown paths into Russian instead of showing raw «player»', () => {
    expect(screenLabel('/player/school/trainer')).toBe('Игрок · Школа · Тренажёр');
    expect(screenLabel('/admin/tournaments/:id')).toBe('CRM · Турниры');
  });
});
