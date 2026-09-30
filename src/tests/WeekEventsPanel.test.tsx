/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const NOW = Date.parse('2026-09-30T09:00:00Z');
const at = (days: number) => new Date(NOW + days * 86_400_000).toISOString();
vi.mock('../lib/api.ts', () => ({
  api: {
    getTournaments: vi.fn(async () => [
      { id: 't1', title: 'Турнир Богдана', date: at(3), status: 'draft' },
      { id: 't-old', title: 'Прошлый турнир', date: at(-5), status: 'completed' },
      { id: 't-far', title: 'Далёкий турнир', date: at(20), status: 'draft' },
    ]),
  },
}));

const { default: WeekEventsPanel } = await import('../components/crm/WeekEventsPanel.tsx');
const evening = (id: string, format: string, days: number, status = 'published') =>
  ({ id, title: `Вечер ${id}`, starts_at: at(days), format, status, settled_at: null }) as any;

describe('«На этой неделе» on «Сегодня»', () => {
  afterEach(cleanup);

  it('lists every evening and tournament of the next 7 days in time order and opens each', async () => {
    const openEvening = vi.fn();
    const openTournament = vi.fn();
    render(<WeekEventsPanel now={NOW} onOpenEvening={openEvening} onOpenTournament={openTournament} evenings={[
      evening('club', 'CASUAL', 2),
      evening('novice', 'NOVICE', 2 - 0.1),
      evening('draft', 'RATING', 5, 'draft'),
      evening('gone', 'CASUAL', 1, 'cancelled'),
      evening('later', 'CASUAL', 9),
    ]} />);
    await waitFor(() => expect(screen.getAllByTestId('crm-week-event')).toHaveLength(4));
    const titles = screen.getAllByTestId('crm-week-event').map((row) => row.querySelector('strong')?.textContent);
    expect(titles).toEqual(['Вечер novice', 'Вечер club', 'Турнир Богдана', 'Вечер draft']);
    expect(screen.getByText(/черновик/)).toBeTruthy();
    fireEvent.click(screen.getByText('Турнир Богдана'));
    expect(openTournament).toHaveBeenCalledWith('t1');
    fireEvent.click(screen.getByText('Вечер club'));
    expect(openEvening).toHaveBeenCalledWith('club');
  });
});
