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

  it('clears guest identity markers while preserving every gameplay fact', () => {
    const guestEnvelope = {
      version: 1,
      kind: 'club_evening_protocol',
      protocol: {
        status: 'completed',
        ppk_culprit_participant_id: 'guest-1',
        first_killed_participant_id: 'guest-1',
        best_moves: [{ source: 'first_killed', participant_id: 'guest-1', seat_numbers: [2, 3, 4] }],
        votes: [{ voter_participant_id: 'guest-1', target_participant_id: 'p2' }],
        shots: [{ night_number: 1, target_seat: 1, result: 'killed' }],
      },
      player_results: [
        {
          seat_number: 1,
          participant_id: 'guest-1',
          player_id: null,
          guest_placeholder_id: 'guest-1',
          display_name: 'Гость',
          role: 'citizen',
          exit_type: 'killed',
          regular_fouls: 3,
          minor_technical_fouls: 1,
          judge_bonus: 0.3,
          notes: 'не менять',
        },
        { seat_number: 2, participant_id: 'p2', player_id: 'player-2', display_name: 'Два', role: 'mafia' },
      ],
    };
    const slots = [{
      slot_num: 1,
      participant_id: 'guest-1',
      player_id: null,
      guest_placeholder_id: 'guest-1',
      nickname: 'Гость',
      role: 'citizen',
      fouls: 3,
    }];

    const result = replaceClubGameSeatIdentity(
      guestEnvelope,
      slots,
      1,
      { participantId: 'registered-participant', playerId: 'registered-player', nickname: 'Фандорин' },
    );

    expect(result.envelope.player_results[0]).toMatchObject({
      participant_id: 'registered-participant',
      player_id: 'registered-player',
      guest_placeholder_id: null,
      display_name: 'Фандорин',
      role: 'citizen',
      exit_type: 'killed',
      regular_fouls: 3,
      minor_technical_fouls: 1,
      judge_bonus: 0.3,
      notes: 'не менять',
    });
    expect(result.envelope.protocol).toMatchObject({
      ppk_culprit_participant_id: 'registered-participant',
      first_killed_participant_id: 'registered-participant',
      shots: [{ night_number: 1, target_seat: 1, result: 'killed' }],
    });
    expect(result.envelope.protocol.best_moves[0].participant_id).toBe('registered-participant');
    expect(result.envelope.protocol.votes[0].voter_participant_id).toBe('registered-participant');
    expect(result.slots[0]).toMatchObject({
      participant_id: 'registered-participant',
      player_id: 'registered-player',
      guest_placeholder_id: null,
      nickname: 'Фандорин',
      role: 'citizen',
      fouls: 3,
    });
    expect(guestEnvelope.player_results[0].guest_placeholder_id).toBe('guest-1');
  });

  it('rejects a player already occupying another seat', () => {
    expect(() => replaceClubGameSeatIdentity(envelope, [], 1, { participantId: 'p2', playerId: 'player-2', nickname: 'Два' })).toThrow('уже занимает другое место');
  });
});
