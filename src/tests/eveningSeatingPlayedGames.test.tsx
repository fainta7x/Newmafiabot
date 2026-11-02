// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { EveningSeatingEditor } from '../components/crm/EveningSeatingEditor.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const slots = [{ id: 's1', slot_number: 1 }, { id: 's2', slot_number: 2 }, { id: 's3', slot_number: 3 }];
const mockFetch = () => vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
  const url = String(typeof input === 'string' ? input : input.url);
  const body = url.endsWith('/slots') ? { slots } : { seats: [] };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
const tables = [{ id: 't1', name: 'Стол 1', capacity: 10 }];

describe('seating for games that were already played (owner, 2026-11-02)', () => {
  it('marks played games and opens the first unplayed one', async () => {
    mockFetch();
    render(<EveningSeatingEditor eveningId="e1" tables={tables} participants={[]} playedGames={2} />);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Игра 3/ }).getAttribute('aria-selected')).toBe('true'));
    expect(screen.getByRole('tab', { name: /Игра 1 · сыграна/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Игра 2 · сыграна/ })).toBeTruthy();
    expect(screen.queryByTestId('seating-slot-played')).toBeNull();
  });

  it('a played game offers no seating', async () => {
    mockFetch();
    render(<EveningSeatingEditor eveningId="e1" tables={tables} participants={[]} playedGames={3} />);
    await waitFor(() => expect(screen.getByTestId('seating-slot-played')).toBeTruthy());
    expect((screen.getByRole('button', { name: 'Только эту игру' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('without recorded games nothing is marked', async () => {
    mockFetch();
    render(<EveningSeatingEditor eveningId="e1" tables={tables} participants={[]} />);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Игра 1' }).getAttribute('aria-selected')).toBe('true'));
    expect(screen.queryByText(/сыграна/)).toBeNull();
  });
});
