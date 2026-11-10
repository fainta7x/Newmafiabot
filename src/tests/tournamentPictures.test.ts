import { describe, expect, it } from 'vitest';
import { renderPngAsync, tournamentNominationsSvg, tournamentTableSvg } from '../server/services/clubResultImages.ts';

describe('tournament pictures for Telegram', () => {
  it('draws the full table and the nominations as PNG', async () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({ place: index + 1, nickname: `Игрок ${index + 1}`, avatar: null, value: String(30 - index), detail: 'игр 6 · побед 3' }));
    const table = await renderPngAsync(tournamentTableSvg({ title: 'Турнир Богдана #2', dateLabel: '3 октября 2026', rows }));
    const items = [
      { title: 'Лучший мирный', tie: false, winner: { nickname: 'Аня', avatar: null, value: '4,5' }, others: ['Борис 3', 'Вера 2,5'] },
      { title: 'MVP', tie: true, winner: { nickname: 'Глеб', avatar: null, value: '6' }, others: [] },
    ];
    const nominations = await renderPngAsync(tournamentNominationsSvg({ title: 'Турнир Богдана #2', dateLabel: '3 октября 2026', items }));
    for (const png of [table, nominations]) expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(tournamentTableSvg({ title: 'T', dateLabel: '', rows: [] })).toContain('Результатов пока нет');
  });
});
