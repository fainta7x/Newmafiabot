/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../components/player/PlayerEventSlotDetail.tsx', () => ({
  default: ({ event, onSaved }: { event: { title: string }; onSaved: () => void }) => (
    <div>
      <div>DETAIL:{event.title}</div>
      <button type="button" onClick={onSaved}>REFRESH_EVENT</button>
    </div>
  ),
}));

import PlayerEventsCalendar from '../components/player/PlayerEventsCalendar.tsx';

const event = {
  id: 'evening-1',
  title: 'Пятничная игра',
  starts_at: new Date(Date.now() + 3600000).toISOString(),
  format: 'STANDARD',
  event_type: 'evening',
  slots: [],
};

const calendarResponse = () => ({
  ok: true,
  json: async () => ({ events: [event] }),
}) as Response;

describe('PlayerEventsCalendar', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens event detail after a click', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(calendarResponse());

    render(<PlayerEventsCalendar />);
    const buttons = await screen.findAllByRole('button', { name: /Пятничная игра/ });
    fireEvent.click(buttons[0]);
    expect(await screen.findByText('DETAIL:Пятничная игра')).toBeTruthy();
  });

  it('shows the novice onboarding action from calendar state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [],
        novice_state: {
          player: { club_stage: 'NEW', game_level: 'unrated' },
          applications: [],
          novice_visits: 0,
          free_visits_remaining: 2,
          next_novice_price_per_game: 200,
          can_self_register: false,
        },
      }),
    } as Response);

    render(<PlayerEventsCalendar />);
    expect(await screen.findByRole('button', { name: /Я новичок или почти не играл/ })).toBeTruthy();
  });

  it('starts the novice path without silently booking the nearest evening', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/novice/applications')) return {
        ok: true, status: 201, json: async () => ({ created: true, state: {
          player: { club_stage: 'NOVICE_ACTIVE', game_level: 'novice' }, applications: [], novice_visits: 0, free_visits_remaining: 2, can_self_register: true,
        } }),
      } as Response;
      return { ok: true, json: async () => ({ events: [{ ...event, format: 'NOVICE' }], novice_state: {
        player: { club_stage: 'NEW', game_level: 'unrated' }, applications: [], novice_visits: 0, free_visits_remaining: 2, can_self_register: false,
      } }) } as Response;
    });
    render(<PlayerEventsCalendar />);
    fireEvent.click(await screen.findByRole('button', { name: /Я новичок или почти не играл/ }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/player/novice/applications', expect.objectContaining({
      body: JSON.stringify({ entry_route: 'NOVICE', evening_id: null }),
    })));
    expect(await screen.findByText(/Готово! Теперь можно выбрать новичковый вечер/)).toBeTruthy();
  });

  it('replaces the first-application choices with a single pending status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [],
        novice_state: {
          player: { club_stage: 'NEW', game_level: 'unrated' },
          applications: [{ id: 'application-1', status: 'NEW', entry_route: 'NOVICE', evening_title: 'Пятничная игра', reservation_status: 'reserved' }],
          novice_visits: 0,
          free_visits_remaining: 2,
          next_novice_price_per_game: 200,
          can_self_register: false,
        },
      }),
    } as Response);

    render(<PlayerEventsCalendar />);
    expect(await screen.findByRole('heading', { name: 'Заявка отправлена' })).toBeTruthy();
    expect(screen.getByText(/место временно зарезервировано/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Я новичок или почти не играл/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Я уже умею играть/ })).toBeNull();
  });

  it('loads novice state separately when the calendar omits the optional envelope', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(calendarResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          player: { club_stage: 'NEW', game_level: 'unrated' },
          applications: [],
          novice_visits: 0,
          free_visits_remaining: 2,
          next_novice_price_per_game: 200,
          can_self_register: false,
        }),
      } as Response);

    render(<PlayerEventsCalendar />);
    expect(await screen.findByRole('button', { name: /Я новичок или почти не играл/ })).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps a manually opened event selected after calendar refresh', async () => {
    let resolveRefresh: ((response: Response) => void) | null = null;
    let calendarRequests = 0;
    // Route by URL: a calendar without novice_state also triggers the
    // /api/player/novice fallback, which must not consume the refresh response.
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (!String(input).startsWith('/api/player/calendar')) {
        return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
      }
      calendarRequests += 1;
      if (calendarRequests === 1) return Promise.resolve(calendarResponse());
      return new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      });
    });

    render(<PlayerEventsCalendar />);
    const buttons = await screen.findAllByRole('button', { name: /Пятничная игра/ });
    fireEvent.click(buttons[0]);
    expect(await screen.findByText('DETAIL:Пятничная игра')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'REFRESH_EVENT' }));
    await waitFor(() => expect(calendarRequests).toBe(2));

    await act(async () => {
      resolveRefresh?.(calendarResponse());
    });

    expect(screen.getByText('DETAIL:Пятничная игра')).toBeTruthy();
  });
});

describe('PlayerEventsCalendar with a poker tournament', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  const poker = { id: 'ptr_1', title: 'Турбо вечера', starts_at: new Date(Date.now() + 3600000).toISOString(), format: 'POKER', event_type: 'poker', poker_status: 'registration', participant_count: 3, participant_limit: 0, registration_status: null };
  const tournament = {
    id: 'ptr_1', title: 'Турбо вечера', description: 'Для своих', status: 'registration', cancel_reason: null, start_at: poker.starts_at, players: 3, spots_left: null, alive: null, my_table_id: null,
    settings: { minPlayers: 4, maxPlayers: null, startingStack: 1000, levelMinutes: 6, seatsPerTable: 6, rebuyUntilLevel: 4, rebuyCostTokens: 500, rebuyChips: 1000, prizeTokens: [3000, 1000] },
    my_entry: null, standings: [],
  };

  it('shows it as a «Покер» event with its player count and opens a page where registration is free', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method || 'GET'} ${url}`);
      if (url.includes('/api/player/calendar')) return { ok: true, json: async () => ({ events: [poker] }) } as Response;
      return { ok: true, json: async () => ({ tournament }) } as Response;
    });
    render(<PlayerEventsCalendar />);
    const rows = await screen.findAllByRole('button', { name: /Турбо вечера/ });
    expect(screen.getAllByText('Покер').length).toBeGreaterThan(0);
    fireEvent.click(rows[0]);
    expect(await screen.findByText('Покерный турнир')).toBeTruthy();
    expect(screen.getByText(/бесплатно, стек 1\s?000 фишек/)).toBeTruthy();
    expect(screen.getByText(/3 000 жетонов|3\s?000 жетонов/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Записаться бесплатно' }));
    await waitFor(() => expect(calls.some((call) => call.startsWith('POST') && call.endsWith('/ptr_1/register'))).toBe(true));
  });
});
