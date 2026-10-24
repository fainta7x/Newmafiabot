/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { api } from '../lib/api';
import { useTournamentDetail } from '../components/crm/tournaments/useTournamentDetail';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const game = (id: string, status: string) => ({ id, status, game_number: Number(id.slice(1)), seats: [] });

describe('tournament card loading', () => {
  it('opens on the game being played, otherwise the next one to play', async () => {
    vi.spyOn(api, 'getTournament').mockResolvedValue({ id: 't', games: [game('g1', 'completed'), game('g2', 'active'), game('g3', 'planned')] } as any);
    const first = renderHook(() => useTournamentDetail({ tournamentId: 't', onSilentError: vi.fn() }));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.selectedGameIdx).toBe(1);
    cleanup();
    vi.spyOn(api, 'getTournament').mockResolvedValue({ id: 't', games: [game('g1', 'completed'), game('g2', 'planned')] } as any);
    const second = renderHook(() => useTournamentDetail({ tournamentId: 't', onSilentError: vi.fn() }));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.selectedGameIdx).toBe(1);
  });

  it('a failed first load keeps the status code and no tournament', async () => {
    vi.spyOn(api, 'getTournament').mockRejectedValue(Object.assign(new Error('нет'), { status: 404 }));
    const { result } = renderHook(() => useTournamentDetail({ tournamentId: 't', onSilentError: vi.fn() }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tournament).toBeNull();
    expect(result.current.loadError).toEqual({ status: 404, message: 'нет' });
  });

  it('a failed silent refresh keeps the card and only reports the message', async () => {
    const spy = vi.spyOn(api, 'getTournament').mockResolvedValueOnce({ id: 't', games: [game('g1', 'planned')] } as any);
    const onSilentError = vi.fn();
    const { result } = renderHook(() => useTournamentDetail({ tournamentId: 't', onSilentError }));
    await waitFor(() => expect(result.current.tournament).not.toBeNull());
    spy.mockRejectedValueOnce(new Error('обрыв'));
    await act(async () => { await result.current.loadDetail({ silent: true }); });
    expect(result.current.tournament).not.toBeNull();
    expect(result.current.loading).toBe(false);
    expect(onSilentError).toHaveBeenCalledWith('обрыв');
  });
});
