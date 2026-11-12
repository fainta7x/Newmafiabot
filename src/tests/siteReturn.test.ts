import { describe, expect, it } from 'vitest';
import { parseSiteReturn, rememberSiteReturn, takeSiteReturn } from '../lib/siteReturn.ts';

const memory = () => { const data = new Map<string, string>(); return { setItem: (k: string, v: string) => { data.set(k, v); }, getItem: (k: string) => data.get(k) ?? null, removeItem: (k: string) => { data.delete(k); } }; };

describe('return from the app to the club site after the sign-in', () => {
  it('accepts only the club\'s own site over https', () => {
    expect(parseSiteReturn('https://2lamafia.ru/')).toBe('https://2lamafia.ru/');
    expect(parseSiteReturn('https://www.2lamafia.ru/#join')).toBe('https://www.2lamafia.ru/#join');
    expect(parseSiteReturn('http://2lamafia.ru/')).toBeNull();
    expect(parseSiteReturn('https://2lamafia.ru.evil.example/')).toBeNull();
    expect(parseSiteReturn('https://evil.example/?x=https://2lamafia.ru')).toBeNull();
    expect(parseSiteReturn('https://user:pass@2lamafia.ru/')).toBeNull();
    expect(parseSiteReturn('javascript:alert(1)')).toBeNull();
    expect(parseSiteReturn('')).toBeNull();
  });
  it('keeps the address until the sign-in is done and gives it once', () => {
    const storage = memory();
    rememberSiteReturn('?return=https%3A%2F%2F2lamafia.ru%2F', storage);
    expect(takeSiteReturn(storage)).toBe('https://2lamafia.ru/');
    expect(takeSiteReturn(storage)).toBeNull();
    rememberSiteReturn('?return=https%3A%2F%2Fevil.example%2F', storage);
    expect(takeSiteReturn(storage)).toBeNull();
  });
});
