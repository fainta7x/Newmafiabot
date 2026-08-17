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

  it('keeps a manually opened event selected after calendar refresh', async () => {
    let resolveRefresh: ((response: Response) => void) | null = null;
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(calendarResponse())
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      }));

    render(<PlayerEventsCalendar />);
    const buttons = await screen.findAllByRole('button', { name: /Пятничная игра/ });
    fireEvent.click(buttons[0]);
    expect(await screen.findByText('DETAIL:Пятничная игра')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'REFRESH_EVENT' }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveRefresh?.(calendarResponse());
    });

    expect(screen.getByText('DETAIL:Пятничная игра')).toBeTruthy();
  });
});
