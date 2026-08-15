/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clubGamePendingProtocolKey,
  clubGamesApi,
  getPendingClubGameProtocolSave,
} from '../lib/clubGamesApi';

const payload = {
  protocol: {
    status: 'completed',
    winner_team: 'red',
    end_reason: 'normal',
  } as any,
  player_results: [
    {
      participant_id: 'participant-1',
      player_id: 'player-1',
      display_name: 'Игрок 1',
      seat_number: 1,
      role: 'citizen',
    } as any,
  ],
};

const game = {
  id: 91,
  evening_id: 'evening-1',
  global_game_number: 1,
  game_date: '2026-08-15',
  winner_team: 'red',
  winner_label: 'Красные',
  slots: [],
  status: 'completed',
  club_protocol: null,
  created_at: '2026-08-15T10:00:00.000Z',
};

const response = (status: number, body: any) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(body),
}) as any;

describe('club game final-save reliability', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes the exact final protocol to the local outbox before the request and removes it only after success', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      expect(getPendingClubGameProtocolSave(91)?.payload.protocol.winner_team).toBe('red');
      return response(200, game);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(clubGamesApi.saveProtocol(91, payload)).resolves.toEqual(game);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(clubGamePendingProtocolKey(91))).toBeNull();
  });

  it('retries a transient server failure and clears the outbox after the retry succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(500, { error: 'temporary' }))
      .mockResolvedValueOnce(response(200, game));
    vi.stubGlobal('fetch', fetchMock);

    await expect(clubGamesApi.saveProtocol(91, payload)).resolves.toEqual(game);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(clubGamePendingProtocolKey(91))).toBeNull();
  });

  it('does not retry a validation failure and keeps the final payload for recovery', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(400, { error: 'invalid protocol' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(clubGamesApi.saveProtocol(91, payload)).rejects.toThrow('invalid protocol');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getPendingClubGameProtocolSave(91)?.payload.protocol.winner_team).toBe('red');
  });

  it('can resend a previously failed final payload without rebuilding the played game', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(400, { error: 'offline' })));
    await expect(clubGamesApi.saveProtocol(91, payload)).rejects.toThrow('offline');
    expect(getPendingClubGameProtocolSave(91)).not.toBeNull();

    const retryFetch = vi.fn().mockResolvedValue(response(200, game));
    vi.stubGlobal('fetch', retryFetch);

    await expect(clubGamesApi.retryPendingProtocolSave(91)).resolves.toEqual(game);

    expect(retryFetch).toHaveBeenCalledTimes(1);
    expect(getPendingClubGameProtocolSave(91)).toBeNull();
  });
});
