/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../components/player/PlayerEventSlotDetail.tsx', () => ({
  default: ({ event }: { event: { title: string } }) => <div>DETAIL:{event.title}</div>,
}));

import PlayerEventsCalendar from '../components/player/PlayerEventsCalendar.tsx';

describe('PlayerEventsCalendar', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens event detail after a click', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [{
          id: 'evening-1',
          title: 'Пятничная игра',
          starts_at: new Date(Date.now() + 3600000).toISOString(),
          format: 'STANDARD',
          event_type: 'evening',
          slots: [],
        }],
      }),
    } as Response);

    render(<PlayerEventsCalendar />);
    const buttons = await screen.findAllByRole('button', { name: /Пятничная игра/ });
    fireEvent.click(buttons[0]);
    expect(await screen.findByText('DETAIL:Пятничная игра')).toBeTruthy();
  });
});
