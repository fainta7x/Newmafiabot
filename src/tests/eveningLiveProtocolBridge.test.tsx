// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { mapEngineResultToProtocol } from '../components/crm/EveningLiveGameModal';
import type { ClubGameRecord } from '../lib/clubGamesApi';

const game = (): ClubGameRecord => ({
  id: 77,
  evening_id: 'evening-1',
  global_game_number: 77,
  game_date: '2026-08-14',
  winner_team: 'draft',
  winner_label: 'Черновик',
  judge_name: 'Судья',
  slots: [],
  status: 'draft',
  created_at: '2026-08-14T00:00:00.000Z',
  club_protocol: {
    version: 1,
    kind: 'club_evening_protocol',
    protocol: {
      game_id: '77',
      status: 'draft',
      winner_team: null,
      end_reason: 'normal',
      ppk_culprit_participant_id: null,
      first_killed_participant_id: null,
      zero_round_voted_participant_id: null,
      best_move_participant_id: null,
      best_move_source: null,
      best_move_seats: [],
      best_moves: [],
      votes: [],
      shots: [],
      replacement: null,
      judge_notes: null,
    },
    player_results: Array.from({ length: 10 }, (_, index) => ({
      participant_id: `part-${index + 1}`,
      player_id: `player-${index + 1}`,
      seat_number: index + 1,
      display_name: `Игрок ${index + 1}`,
      role: null,
      exit_type: 'alive' as const,
      exit_order: null,
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
    })),
  },
});

describe('club live result -> persisted protocol', () => {
  beforeEach(() => localStorage.clear());

  it('keeps canonical tech fouls, discipline penalty, votes, shots and PPK culprit', () => {
    const source = game();
    const result = mapEngineResultToProtocol(source, {
      winning_team: 'Чёрные',
      end_reason: 'ppk',
      protocol_text: 'ППК игрока 3',
      protocol_markers: {},
      votes: [{
        round_number: 1,
        is_revote: false,
        nominated_seats: [2, 5],
        vote_counts: { 2: 6, 5: 4 },
        day_number: 0,
        eligible_voters: 10,
        parent_round_number: null,
        outcome: 'single_eliminated',
        eliminated_seats: [2],
        table_leave_votes: null,
      }],
      shots: [{ night_number: 1, target_seat: 4, result: 'killed' }],
      slots: source.club_protocol!.player_results.map((player) => ({
        slot_num: player.seat_number,
        user_id: player.player_id,
        nickname: player.display_name,
        role: player.seat_number === 8 ? 'Мафия' : player.seat_number === 9 ? 'Мафия' : player.seat_number === 10 ? 'Дон' : player.seat_number === 7 ? 'Шериф' : 'Мирный',
        alive: player.seat_number !== 3,
        exit_reason: player.seat_number === 3 ? 'removed' : 'alive',
        fouls: player.seat_number === 3 ? 2 : 0,
        minor_tech_fouls: player.seat_number === 3 ? 1 : 0,
        major_tech_fouls: player.seat_number === 3 ? 1 : 0,
        removal_reason: player.seat_number === 3 ? '2nd_tech' : null,
        ppk: player.seat_number === 3,
        status_reason: player.seat_number === 3 ? 'ППК' : 'Жив',
      })),
    });

    expect(result.protocol.status).toBe('completed');
    expect(result.protocol.winner_team).toBe('black');
    expect(result.protocol.end_reason).toBe('ppk');
    expect(result.protocol.ppk_culprit_participant_id).toBe('part-3');
    expect(result.protocol.votes).toHaveLength(1);
    expect(result.protocol.shots).toEqual([{ night_number: 1, target_seat: 4, result: 'killed' }]);

    const player3 = result.player_results.find((player) => player.seat_number === 3)!;
    expect(player3.exit_type).toBe('removed');
    expect(player3.minor_technical_fouls).toBe(1);
    expect(player3.major_technical_fouls).toBe(1);
    expect(player3.technical_fouls).toBe(2);
    expect(player3.removal_reason).toBe('2nd_tech');
    expect(player3.disciplinary_penalty_points).toBe(2.9);
  });

  it('persists fourth-foul removal and its canonical one-point discipline penalty', () => {
    const source = game();
    const result = mapEngineResultToProtocol(source, {
      winning_team: 'Красные',
      end_reason: 'normal',
      protocol_text: 'Удаление игрока 4 по четвёртому фолу',
      protocol_markers: {},
      slots: source.club_protocol!.player_results.map((player) => ({
        slot_num: player.seat_number,
        user_id: player.player_id,
        nickname: player.display_name,
        role: player.seat_number >= 8 ? 'Мафия' : 'Мирный',
        alive: player.seat_number !== 4,
        exit_reason: player.seat_number === 4 ? 'removed' : 'alive',
        fouls: player.seat_number === 4 ? 4 : 0,
        minor_tech_fouls: 0,
        major_tech_fouls: 0,
        removal_reason: player.seat_number === 4 ? '4th_foul' : null,
        ppk: false,
        status_reason: player.seat_number === 4 ? 'Удалён: 4-й фол' : 'Жив',
      })),
    });

    const player4 = result.player_results.find((player) => player.seat_number === 4)!;
    expect(player4.exit_type).toBe('removed');
    expect(player4.regular_fouls).toBe(4);
    expect(player4.removal_reason).toBe('4th_foul');
    expect(player4.disciplinary_penalty_points).toBe(1);
  });
});
