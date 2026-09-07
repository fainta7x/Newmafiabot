import { describe, expect, it } from 'vitest';
import { replaceClubGameSeatIdentity } from '../server/services/clubGameSeatIdentityRepair';

describe('replaceClubGameSeatIdentity', () => {
  const envelope = {
    version: 1, kind: 'club_evening_protocol',
    protocol: { status: 'completed', votes: [{ voter_participant_id: 'old-participant', target_participant_id: 'p2' }], best_move: ['old-participant'] },
    player_results: [
      { seat_number: 1, participant_id: 'old-participant', player_id: 'old-player', display_name: 'Ошибка', role: 'mafia', fouls: 2, exit_reason: 'voted' },
      { seat_number: 2, participant_id: 'p2', player_id: 'player-2', display_name: 'Два', role: 'citizen', fouls: 0 },
    ],
  };

  it('moves identity and references while preserving gameplay on the seat', () => {
    const result = replaceClubGameSeatIdentity(envelope, [{ slot_num: 1, participant_id: 'old-participant', player_id: 'old-player', nickname: 'Ошибка', role: 'mafia' }], 1, { participantId: 'new-participant', playerId: 'new-player', nickname: 'Верный' });
    expect(result.envelope.protocol.votes[0].voter_participant_id).toBe('new-participant');
    expect(result.envelope.protocol.best_move).toEqual(['new-participant']);
    expect(result.envelope.player_results[0]).toMatchObject({ participant_id: 'new-participant', player_id: 'new-player', display_name: 'Верный', role: 'mafia', fouls: 2, exit_reason: 'voted' });
    expect(result.slots[0]).toMatchObject({ participant_id: 'new-participant', player_id: 'new-player', nickname: 'Верный', role: 'mafia' });
    expect(envelope.player_results[0].player_id).toBe('old-player');
  });

  it('rejects a player already occupying another seat', () => {
    expect(() => replaceClubGameSeatIdentity(envelope, [], 1, { participantId: 'p2', playerId: 'player-2', nickname: 'Два' })).toThrow('уже занимает другое место');
  });
});
