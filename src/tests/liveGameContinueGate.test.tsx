/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveGameContinueGate } from '../components/game/LiveGameContinueGate';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
const answer = (body: string, status = 200) => vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(body, { status, headers: { 'Content-Type': 'application/json' } }))));

describe('«Продолжить игру» offers only a real server copy', () => {
  it('an empty or foreign answer starts the game as usual', async () => {
    for (const body of ['null', '{}', '<!doctype html>']) {
      answer(body);
      render(<LiveGameContinueGate gameKey="tournament:7" enabled><div>Игра</div></LiveGameContinueGate>);
      await waitFor(() => expect(screen.getByText('Игра')).toBeDefined());
      expect(screen.queryByText(/Найдена незавершённая игра/)).toBeNull();
      cleanup();
    }
  });

  it('a copy with a session is offered', async () => {
    answer(JSON.stringify({ session: '{"phase":"day_speeches"}', saved_at: '2026-11-03T18:00:00.000Z' }));
    render(<LiveGameContinueGate gameKey="tournament:7" enabled><div>Игра</div></LiveGameContinueGate>);
    await waitFor(() => expect(screen.getByText(/Найдена незавершённая игра/)).toBeDefined());
  });

  it('a server that does not answer within 2 seconds does not hold the game (owner, 2026-11-09)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => { /* never answers */ })));
    render(<LiveGameContinueGate gameKey="tournament:8" enabled><div>Игра</div></LiveGameContinueGate>);
    expect(screen.queryByText('Игра')).toBeNull();
    await waitFor(() => expect(screen.getByText('Игра')).toBeDefined(), { timeout: 4000 });
  });
});
