/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJson } from '../lib/requestJson.ts';
import PlayerEventsCalendar from '../components/player/PlayerEventsCalendar.tsx';

vi.mock('../lib/requestJson.ts', () => ({ getJson: vi.fn() }));
vi.mock('../components/player/PlayerEventSlotDetail.tsx', () => ({ default: () => null }));
vi.mock('../components/player/PlayerPokerTournamentDetail.tsx', () => ({ default: () => null }));
vi.mock('../components/player/PlayerCustomEventDetail.tsx', () => ({ default: () => null }));

const body = (monthOffset: number, title: string) => {
  const date = new Date();
  const inMonth = new Date(date.getFullYear(), date.getMonth() + monthOffset, 25, 19);
  return { novice_state: { player: { club_stage: 'CLUB' }, applications: [] }, events: [{
    id: title, title, starts_at: inMonth.toISOString(), venue: 'Клуб',
    format: 'CASUAL', event_type: 'evening', required_slots: 4, assembled_slots: 1,
  }] };
};

type Deferred = { resolve: (value: any) => void; reject: (error: Error) => void };
const requests: Deferred[] = [];
const urls: string[] = [];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  requests.splice(0);
  urls.splice(0);
});

const renderCalendar = () => render(<PlayerEventsCalendar embedded />);

describe('Player Cabinet «Вечера» request isolation', () => {
  it('never replaces the selected next month with a late response for the previous month', async () => {
    vi.mocked(getJson).mockImplementation((url) => {
      urls.push(url);
      return new Promise<any>((resolve, reject) => { requests.push({ resolve, reject }); });
    });
    renderCalendar();
    await waitFor(() => expect(requests.length).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }));
    await waitFor(() => expect(requests.length).toBe(2));
    expect(urls[0]).not.toBe(urls[1]);

    await act(async () => { requests[1].resolve(body(1, 'Вечер нового месяца')); });
    expect(screen.getByText('Вечер нового месяца')).toBeDefined();

    await act(async () => { requests[0].resolve(body(0, 'Старый вечер')); });
    expect(screen.getByText('Вечер нового месяца')).toBeDefined();
    expect(screen.queryByText('Старый вечер')).toBeNull();
    expect(screen.queryByTestId('player-calendar-error')).toBeNull();
  });

  it('does not show a stale first-month failure after the second month succeeds', async () => {
    vi.mocked(getJson).mockImplementation(() => new Promise<any>((resolve, reject) => {
      requests.push({ resolve, reject });
    }));
    renderCalendar();
    await waitFor(() => expect(requests.length).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }));
    await waitFor(() => expect(requests.length).toBe(2));
    await act(async () => { requests[1].resolve(body(1, 'Событие Б')); });
    await act(async () => { requests[0].reject(new Error('Старая ошибка')); });
    expect(screen.queryByText('Старая ошибка')).toBeNull();
    expect(screen.getByText('Событие Б')).toBeDefined();
  });

  it('shows a retry action for the current month and recovers without changing selection', async () => {
    let attempts = 0;
    vi.mocked(getJson).mockImplementation(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('Не удалось получить события');
      return body(0, 'Событие после повтора') as any;
    });
    renderCalendar();
    expect((await screen.findByTestId('player-calendar-error')).textContent).toContain('Не удалось получить события');
    expect(screen.queryByText('В этом месяце событий выбранного формата пока нет.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(screen.getByText('Событие после повтора')).toBeDefined());
    expect(screen.queryByTestId('player-calendar-error')).toBeNull();
    expect(attempts).toBe(2);
  });
});
