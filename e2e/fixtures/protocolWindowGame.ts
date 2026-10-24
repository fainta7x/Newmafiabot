/** A synthetic club game for the protocol window preview: invented nicknames, no production data. */
const NAMES = ['Алекс', 'Борис', 'Вера', 'Глеб', 'Дарья', 'Егор', 'Жанна', 'Зоя', 'Игорь', 'Кира'];
const ROLES = ['citizen', 'citizen', 'citizen', 'don', 'sheriff', 'citizen', 'mafia', 'mafia', 'citizen', 'citizen'];
let seq = 0;
const ev = (round: number, kind: string, extra: Record<string, unknown> = {}) => ({ seq: ++seq, at: '2026-10-23T18:00:00.000Z', round, phase: 'day_voting', kind, ...extra });

export const buildProtocolWindowGame = (status: 'draft' | 'completed') => {
  seq = 0;
  const exits: Record<number, string> = { 5: 'killed', 7: 'voted_day', 9: 'killed', 10: 'voted_day', 2: 'killed', 4: 'voted_day' };
  const player_results = ROLES.map((role, index) => ({
    participant_id: `p${index + 1}`, player_id: `u${index + 1}`, seat_number: index + 1, display_name: NAMES[index], role,
    exit_type: exits[index + 1] || 'alive', regular_fouls: [1, 2, 0, 2, 0, 0, 3, 1, 2, 0][index], minor_technical_fouls: index === 5 ? 1 : 0, major_technical_fouls: 0, technical_fouls: index === 5 ? 1 : 0,
    judge_bonus: 0, protocol_bonus: 0, color_protocol: index === 4 ? [{ mark: 'red', seat_numbers: [2, 9] }] : [],
  }));
  const votes = [
    { round_number: 1, day_number: 0, is_revote: false, nominated_seats: [1, 2, 7], vote_counts: { 1: 5, 2: 0, 7: 5 }, eligible_voters: 10, outcome: 'tie_revote', eliminated_seats: [] },
    { round_number: 2, day_number: 0, is_revote: true, parent_round_number: 1, nominated_seats: [1, 7], vote_counts: { 1: 5, 7: 5 }, eligible_voters: 10, outcome: 'no_elimination', eliminated_seats: [], table_leave_votes: 2 },
    { round_number: 3, day_number: 1, is_revote: false, nominated_seats: [7, 4], vote_counts: { 7: 8, 4: 1 }, eligible_voters: 9, outcome: 'single_eliminated', eliminated_seats: [7] },
    { round_number: 4, day_number: 2, is_revote: false, nominated_seats: [10, 4], vote_counts: { 10: 4, 4: 3 }, eligible_voters: 7, outcome: 'single_eliminated', eliminated_seats: [10] },
  ];
  const events = [
    ev(1, 'nomination', { seat: 1, by: 2 }), ev(1, 'nomination', { seat: 2, by: 3 }), ev(1, 'nomination', { seat: 7, by: 10 }),
    ev(1, 'night_step', { value: 'sheriff' }), ev(1, 'sheriff_check', { target: 7, value: 'ЧЁРНЫЙ!' }), ev(1, 'first_killed', { seat: 5 }), ev(1, 'exit', { seat: 5, value: 'killed' }),
    ev(2, 'nomination', { seat: 7, by: 2 }), ev(2, 'nomination', { seat: 4, by: 8 }),
    ...[1, 2, 3, 4, 6, 8, 9, 10].map((voter) => ev(2, 'vote', { seat: voter, target: 7, value: 1 })), ev(2, 'vote', { seat: 7, target: 4, value: 1 }),
    ev(2, 'night_step', { value: 'don' }), ev(2, 'exit', { seat: 7, value: 'voted_day' }), ev(2, 'exit', { seat: 9, value: 'killed' }), ev(2, 'foul', { seat: 9, value: 2 }),
    ev(3, 'nomination', { seat: 10, by: 4 }), ev(3, 'nomination', { seat: 4, by: 6 }), ev(3, 'night_step', { value: 'don' }), ev(3, 'exit', { seat: 10, value: 'voted_day' }),
  ];
  return {
    id: 21, evening_id: 'e1', global_game_number: 21, table_name: 'Основной стол', judge_name: 'Судья', game_date: '2026-10-23', winner_team: 'black', winner_label: 'Чёрные', slots: [], status,
    club_protocol: {
      version: 1, kind: 'club_evening_protocol',
      protocol: {
        game_id: '21', status, winner_team: 'black', end_reason: 'normal', zero_round_rule: 'club', first_killed_participant_id: 'p5', zero_round_voted_participant_id: null, votes,
        shots: [{ night_number: 1, target_seat: 5, result: 'killed' }, { night_number: 2, target_seat: 9, result: 'killed' }],
        best_moves: [{ participant_id: 'p5', source: 'first_killed', seat_numbers: [3, 7, 10] }], replacement: null, judge_notes: null, events,
      },
      player_results,
    },
  };
};
