import { describe, expect, it } from 'vitest';
import { parsePublicGoMafiaStats } from '../server/services/goMafiaPublicStatsService.ts';
import { parseGoMafiaPlayerReference } from '../lib/gomafiaExternalProfile.ts';

const ref = parseGoMafiaPlayerReference('https://gomafia.pro/stats/1')!;
const page = (tokens: string[]) => '<!DOCTYPE html><html><body>' +
  tokens.map(token => '<div>' + token + '</div>').join('') + '</body></html>';
const tokens = [
  'Chagin', '2026', 'Все игры', 'Турниры ФСМ', 'Основная статистика',
  '63 (62%)', 'Игры за мирного', '9 (9%)', 'Игр за дона',
  '23 (23%)', 'Игры за мафию', '7 (7%)', 'Игр за шерифа',
  '2562.17', 'Общий ELO', '0.9', 'Средний балл',
  '1730.25', 'ELO столов', '102', 'Сыграно игр',
  'Винрейт (WR)', '49%', 'Общий винрейт', '38%', 'Мирный',
  '29%', 'Шериф', '74%', 'Мафия', '78%', 'Дон', 'Дополнительные баллы',
];
describe('GoMafia publicly visible stats adapter', () => {
  it('parses the observed labels and numbers without ever inventing games', () => {
    const stats = parsePublicGoMafiaStats(page(tokens), ref, '2026-10-12T10:00:00Z');
    expect(stats.year).toBe(2026);
    expect(stats.totalGames).toBe(102);
    expect(stats.overallElo).toBe(2562.17);
    expect(stats.tableElo).toBe(1730.25);
    expect(stats.averageScore).toBe(0.9);
    expect(stats.overallWinRatePercent).toBe(49);
    expect(stats.roleGames).toEqual({ citizen: 63, sheriff: 7, mafia: 23, don: 9 });
    expect(stats.roleWinRatePercent).toEqual({ citizen: 38, sheriff: 29, mafia: 74, don: 78 });
    expect(stats.source).toBe('gomafia');
  });
  it('rejects unreadable content rather than importing wrong figures', () => {
    expect(() => parsePublicGoMafiaStats('<html>not stats</html>', ref, '2026-10-12')).toThrow();
    expect(() => parsePublicGoMafiaStats(page(['Основная статистика', '123', 'Игры']), ref, '2026-10-12')).toThrow();
  });
});
