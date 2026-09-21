import { describe, expect, it } from 'vitest';
import type { PlayerResultData } from '../lib/api';
import { validateProtocolVoting } from '../components/crm/tournaments/protocol/protocolValidationUtils';

const player = (
  participantId: string,
  seatNumber: number,
  exitType: PlayerResultData['exit_type'] = 'alive',
): PlayerResultData => ({
  participant_id: participantId,
  seat_number: seatNumber,
  exit_type: exitType,
} as PlayerResultData);

describe('protocol voting completion validation', () => {
  it('accepts a protocol without voting rounds', () => {
    expect(validateProtocolVoting([], [], null)).toEqual({
      errorMsg: null,
      roundIndexWithError: null,
    });
  });

  it('reports the exact failing round for an empty voting stage', () => {
    expect(validateProtocolVoting([
      {
        round_number: 4,
        day_number: 2,
        nominated_seats: [],
        vote_counts: {},
        eligible_voters: 7,
        outcome: 'pending',
        eliminated_seats: [],
      },
    ], [], null)).toEqual({
      errorMsg: 'Запрещено завершать протокол с пустым кругом голосования (круг #4, день 2).',
      roundIndexWithError: 0,
    });
  });

  it('rejects incomplete vote totals before completion', () => {
    const result = validateProtocolVoting([
      {
        round_number: 1,
        day_number: 1,
        nominated_seats: [2, 5],
        vote_counts: { 2: 4, 5: 3 },
        eligible_voters: 8,
        outcome: 'pending',
        eliminated_seats: [],
      },
    ], [], null);

    expect(result.roundIndexWithError).toBe(0);
    expect(result.errorMsg).toContain('сумма распределённых голосов (7) не равна количеству голосующих (8)');
  });

  it('keeps confirmed outcome consistent with calculated voting result', () => {
    const result = validateProtocolVoting([
      {
        round_number: 1,
        day_number: 1,
        nominated_seats: [2, 5],
        vote_counts: { 2: 6, 5: 4 },
        eligible_voters: 10,
        outcome: 'no_elimination',
        eliminated_seats: [],
      },
    ], [], null);

    expect(result).toEqual({
      errorMsg: 'Голосование (этап #1, день 1): исход не соответствует распределению голосов (ожидается выбывание игрока #2).',
      roundIndexWithError: 0,
    });
  });

  it('accepts one zero-round elimination only when player status and selected participant match', () => {
    const votes = [{
      round_number: 1,
      day_number: 0,
      nominated_seats: [3],
      vote_counts: { 3: 10 },
      eligible_voters: 10,
      outcome: 'single_eliminated',
      eliminated_seats: [3],
    }];

    expect(validateProtocolVoting(
      votes,
      [player('p-3', 3, 'voted_zero_round')],
      'p-3',
    )).toEqual({
      errorMsg: null,
      roundIndexWithError: null,
    });

    expect(validateProtocolVoting(
      votes,
      [player('p-3', 3, 'voted_zero_round')],
      'other-player',
    ).errorMsg).toBe('Игрок в поле "Заголосованный в нулевой круг" должен совпадать с выбывшим игроком #3.');
  });
});
