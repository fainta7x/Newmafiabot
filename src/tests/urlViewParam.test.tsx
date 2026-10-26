/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readViewParam, writeViewParam } from '../lib/urlViewParam';

// Global review 2026-10-26 (P2): a reload returned to the first tab of «Сообщество», «Рейтинг» and «Кошелёк».
afterEach(() => window.history.replaceState(null, '', '/'));

describe('a view kept in the address', () => {
  it('reads only allowed values and writes without touching the path or other parameters', () => {
    window.history.replaceState(null, '', '/player/wallet?tab=history&x=1#top');
    expect(readViewParam('tab', ['payments', 'history'] as const)).toBe('history');
    expect(readViewParam('tab', ['payments'] as const)).toBeNull();
    const length = window.history.length;
    writeViewParam('tab', 'bets');
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/player/wallet?tab=bets&x=1#top');
    writeViewParam('tab', null);
    expect(window.location.search).toBe('?x=1');
    expect(window.history.length).toBe(length);
  });
});
