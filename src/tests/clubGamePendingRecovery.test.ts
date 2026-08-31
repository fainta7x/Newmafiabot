import { describe, expect, it } from 'vitest';
import { rebasePendingClubGameProtocol, type ClubGameRecord, type ProtocolSavePayload } from '../lib/clubGamesApi.ts';

const makeResults = (participantPrefix: string, playerPrefix: string) => Array.from({ length: 10 }, (_, index) => ({
  participant_id: `${participantPrefix}-${index + 1}`,
  player_id: `${playerPrefix}-${index + 1}`,
  seat_number: index + 1,
  display_name: `${playerPrefix} ${index + 1}`,
  role: index + 1 === 1 ? 'mafia' : index + 1 === 2 ? 'don' : index + 1 === 10 ? 'sheriff' : 'citizen',
  exit_type: 'alive',
  regular_fouls: 0,
  minor_technical_fouls: 0,
  major_technical_fouls: 0,
  technical_fouls: 0,
  judge_bonus: 0,
  protocol_bonus: 0,
  penalty_points: 0,
  disciplinary_penalty_points: 0,
  removal_reason: null,
  ci_points: 0,
  color_protocol: [],
  notes: null,
})) as any[];

const canonical = makeResults('current-participant', 'current-player');
const stale = makeResults('old-participant', 'old-player');
stale[3] = {
  ...stale[3],
  role: 'mafia',
  regular_fouls: 2,
  judge_bonus: 0.4,
  display_name: 'Старое имя',
};

const game: ClubGameRecord = {
  id: 4,
  evening_id: 'evening-1',
  global_game_number: 4,
  game_date: '2026-08-28T20:00:00+03:00',
  winner_team: 'draft',
  winner_label: 'Черновик',
  slots: [],
  status: 'draft',
  created_at: '2026-08-28T20:00:00.000Z',
  club_protocol: {
    version: 1,
    kind: 'club_evening_protocol',
    protocol: { game_id: '4', status: 'draft', winner_team: null } as any,
    player_results: canonical as any,
  },
};

const pending: ProtocolSavePayload = {
  protocol: {
    game_id: '4',
    status: 'completed',
    winner_team: 'red',
    first_killed_participant_id: 'old-participant-4',
    best_move_participant_id: 'old-participant-4',
    best_moves: [{ participant_id: 'old-participant-4', source: 'first_killed', seat_numbers: [1, 2, 4] }],
  } as any,
  player_results: stale as any,
};

describe('pending club game recovery', () => {
  it('keeps gameplay data by seat but always preserves current server identities', () => {
    const result = rebasePendingClubGameProtocol(game, pending);

    expect(result.protocol.status).toBe('completed');
    expect(result.protocol.winner_team).toBe('red');
    expect(result.protocol.first_killed_participant_id).toBe('current-participant-4');
    expect(result.protocol.best_move_participant_id).toBe('current-participant-4');
    expect(result.protocol.best_moves?.[0]?.participant_id).toBe('current-participant-4');

    expect(result.player_results[3]).toMatchObject({
      seat_number: 4,
      participant_id: 'current-participant-4',
      player_id: 'current-player-4',
      display_name: 'current-player 4',
      role: 'mafia',
      regular_fouls: 2,
      judge_bonus: 0.4,
    });
    expect(result.player_results.map((item) => item.participant_id)).toEqual(canonical.map((item) => item.participant_id));
    expect(result.player_results.map((item) => item.player_id)).toEqual(canonical.map((item) => item.player_id));
  });

  it('fails closed when local seating is not a complete 1-10 mapping', () => {
    const broken = { ...pending, player_results: pending.player_results.slice(0, 9) };
    expect(() => rebasePendingClubGameProtocol(game, broken)).toThrow('локальная копия игры повреждена');
  });
});
