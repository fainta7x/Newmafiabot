import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { gameContribution } from '../lib/playerContribution.ts';
import { calculateCanonicalEloGame, clubContributionByPlayer, clubPersonalGamePoints, clubPersonalPointParts, normalizeContributions, tournamentPersonalEloPoints, tournamentWillContributions, type PreparedEloEvent } from '../server/services/eloRatingService.ts';
import { clubBestMovePointsForParticipant } from '../server/services/bestMovePoints.ts';
import { explainEloDelta } from '../lib/eloExplanation.ts';

const roles = ['sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'mafia', 'mafia', 'don'];
const rows = () => roles.map((role, i) => ({ seat_number: i + 1, participant_id: `p${i + 1}`, player_id: `p${i + 1}`, role, exit_type: 'alive', color_protocol: [] as Array<{ mark: string; seat_numbers: number[] }>, judge_bonus: 0, protocol_bonus: 0 }));
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const event = (round: number, kind: string, data: object = {}) => ({ seq: 0, at: 'x', round, phase: 'day_voting', kind, ...data });
const sequence = (events: ReturnType<typeof event>[]) => events.map((item, i) => ({ ...item, seq: i + 1 }));
const seatScore = (players: ReturnType<typeof rows>, protocol: any, seat: number, mode: 'club' | 'wills' = 'club') => gameContribution({ protocol, player_results: players }, mode).find((item) => item.seat === seat)!;
const baseTable = () => rows().map((row) => ({ playerId: row.player_id, team: (['mafia', 'don'].includes(row.role) ? 'black' : 'red') as 'black' | 'red', elo: 1000, canonicalPersonalGamePoints: 0 }));

describe('approved find credit and series', () => {
  it('a PU calling all nine other seats red earns zero colour points', () => {
    const players = rows(); players[1].exit_type = 'killed';
    players[1].color_protocol = [{ mark: 'red', seat_numbers: [1, 3, 4, 5, 6, 7, 8, 9, 10] }];
    close(seatScore(players, { winner_team: 'black', first_killed_participant_id: 'p2' }, 2).points, 0);
  });
  for (const count of [1, 2, 3]) it(`LH and will pay once for ${count} identical black targets`, () => {
    const players = rows(); players[1].exit_type = 'killed';
    const targets = [8, 9, 10].slice(0, count);
    players[1].color_protocol = [{ mark: 'black', seat_numbers: targets }];
    const protocol = { winner_team: 'black', first_killed_participant_id: 'p2', best_moves: [{ participant_id: 'p2', source: 'first_killed', seat_numbers: targets }] };
    const automatic = seatScore(players, protocol, 2);
    close((automatic.points + clubBestMovePointsForParticipant(protocol, 'p2', players)) * 40, 8 * count);
    assert.equal(automatic.streaks.length, 0);
  });
  it('a half-find is topped up to eight by a clean will without creating a repeat-target series', () => {
    const players = rows(); players[1].exit_type = 'killed'; players[1].color_protocol = [{ mark: 'black', seat_numbers: [8] }];
    const events = sequence([event(1, 'game_start', { phase: 'zero_night' }), event(2, 'vote', { seat: 2, target: 8, value: 1 }), event(2, 'vote_round_result', { value: '1:single_eliminated' }), event(2, 'exit', { seat: 3, value: 'voted_day' }), event(2, 'exit', { seat: 2, value: 'killed', phase: 'night' }), event(3, 'game_end', { value: 'black' })]);
    const score = seatScore(players, { winner_team: 'black', events }, 2);
    close(score.points * 40, 8);
    close(score.items.find((item) => item.kind === 'will_right')!.points * 40, 4);
    assert.equal(score.streaks.length, 0);
  });
  it('a mistaken ordinary will cannot earn a top-up or erase the separately earned half-find', () => {
    const players = rows(); players[1].exit_type = 'killed'; players[1].color_protocol = [{ mark: 'black', seat_numbers: [8, 4] }];
    const events = sequence([event(1, 'game_start', { phase: 'zero_night' }), event(2, 'vote', { seat: 2, target: 8, value: 1 }), event(2, 'vote_round_result', { value: '1:single_eliminated' }), event(2, 'exit', { seat: 3, value: 'voted_day' }), event(2, 'exit', { seat: 2, value: 'killed', phase: 'night' }), event(3, 'game_end', { value: 'black' })]);
    const score = seatScore(players, { winner_team: 'black', events }, 2);
    close(score.points, 0);
    assert.ok(score.items.some((item) => item.kind === 'will_blocked'));
  });
  it('a vote before the sheriff check and later table exit cannot pay sixteen or create a repeat series', () => {
    const events = sequence([event(1, 'game_start', { phase: 'zero_night' }), event(2, 'vote', { seat: 1, target: 8, value: 1 }), event(2, 'vote_round_result', { value: '1:single_eliminated' }), event(2, 'exit', { seat: 3, value: 'voted_day' }), event(2, 'sheriff_check', { phase: 'night', target: 8 }), event(2, 'night_step', { phase: 'night', value: 'best_move' }), event(3, 'vote', { seat: 1, target: 8, value: 1 }), event(3, 'vote_round_result', { value: '1:single_eliminated' }), event(3, 'exit', { seat: 8, value: 'voted_day' }), event(4, 'game_end', { value: 'red' })]);
    const score = seatScore(rows(), { winner_team: 'red', events }, 1);
    close(score.points * 40, 8);
    assert.equal(score.items.some((item) => item.kind === 'streak_correct'), false);
  });
  it('two different found blacks still receive the approved second-decision series bonus', () => {
    const events = sequence([event(1, 'game_start', { phase: 'zero_night' }), event(2, 'vote', { seat: 2, target: 8, value: 1 }), event(2, 'vote_round_result', { value: '1:single_eliminated' }), event(2, 'exit', { seat: 8, value: 'voted_day' }), event(3, 'vote', { seat: 2, target: 9, value: 1 }), event(3, 'vote_round_result', { value: '1:single_eliminated' }), event(3, 'exit', { seat: 9, value: 'voted_day' }), event(4, 'game_end', { value: 'red' })]);
    close(seatScore(rows(), { winner_team: 'red', events }, 2).points * 40, 18);
  });
});

describe('positive rewards first, actual misses after all personal limits', () => {
  it('does not let an error create room for unused positive rewards', () => {
    const players = baseTable();
    players[7] = { ...players[7], canonicalPersonalGamePoints: 0.5 };
    const prepared: PreparedEloEvent = { source: 'club', sourceId: '1', sortAt: '', sortOrder: 1, winnerTeam: 'red', players: players.map((p, i) => ({ ...p, contribution: { role: roles[i], raw: i === 7 ? 0.5 : 0, positive: i === 7 ? 0.6 : 0, negative: i === 7 ? -0.1 : 0 } })) };
    normalizeContributions([prepared]);
    const delta = calculateCanonicalEloGame(prepared.players.map((p) => ({ ...p, elo: 1000 })), 'red')[7];
    close(delta.totalDelta, -4); // -35 + min(20+24,35) -4
  });
  for (const personal of [-2, 0, 2]) it(`each miss costs six even at personal score ${personal}`, () => {
    const players = baseTable(); players[7].canonicalPersonalGamePoints = personal;
    const before = calculateCanonicalEloGame(players, 'red')[7];
    const after = calculateCanonicalEloGame(players.map((p, i) => ({ ...p, missPenaltyElo: i === 7 ? 12 : 0 })), 'red')[7];
    close(after.totalDelta - before.totalDelta, -12);
    close(after.missDelta!, -12);
    assert.ok(explainEloDelta({ ...after, won: false }).details.some((line) => line.includes('отдельный штраф за промах −12')));
  });
  it('keeps a miss separate from the automatic contribution and discipline', () => {
    const players = rows();
    const score = seatScore(players, { winner_team: 'red', shots: [{ night_number: 1, result: 'miss', miss_reason: 'error', miss_responsible_seats: [8] }] }, 8);
    close(score.points, 0); assert.equal(score.missPenaltyElo, 6);
  });
});

describe('protocol bonus excluded; manual judge evaluation retained', () => {
  it('club protocol points do not enter Elo, and a manual +0.5 still gives +20', () => {
    const players = rows(); Object.assign(players[1], { judge_bonus: 0.5, protocol_bonus: 0.75 });
    const payload = { protocol: {}, player_results: players };
    close(clubPersonalGamePoints(payload, players[1], players), 0.5);
    close(clubPersonalPointParts(payload, players[1], players).personalPositivePoints * 40, 20);
  });
  it('tournament protocol points can change sporting totals without changing Elo inputs', () => {
    const base = { win_point: 1, judge_bonus: 0.5, protocol_bonus: 0.2, game_total: 1.7 };
    const before = tournamentPersonalEloPoints(base);
    const after = tournamentPersonalEloPoints({ ...base, protocol_bonus: 0.8, game_total: 2.3 });
    close(before.canonicalPersonalGamePoints, 0.5); close(after.canonicalPersonalGamePoints, 0.5);
    close(before.personalPositivePoints * 40, 20); close(after.personalPositivePoints * 40, 20);
    assert.equal(base.protocol_bonus, 0.2);
  });
  it('loads real tournament colour evidence with LH top-ups through the shared loader', async () => {
    const players = rows(); players[1].exit_type = 'killed'; players[1].color_protocol = [{ mark: 'black', seat_numbers: [8, 9] }];
    const standings = players.map((p) => ({ participant_id: p.participant_id, player_id: p.player_id, games: [{ game_number: 1, seat_number: p.seat_number, role: p.role }] }));
    const raw = players.map((p) => ({ participant_id: p.participant_id, exit_type: p.exit_type, color_protocol_json: JSON.stringify(p.color_protocol) }));
    const db = { get: async () => ({ first_killed_participant_id: 'p2', events_json: '[]', shots_json: '[]' }), all: async (sql: string) => sql.includes('best_moves') ? [{ participant_id: 'p2', seat_numbers_json: '[8,9]' }] : raw };
    const contributions = await tournamentWillContributions(db as any, { id: 'g', game_number: 1 }, 'black', standings);
    close(contributions.get('p2')!.raw * 40, 4); // LH12 + will4 =16
    close(contributions.get('p2')!.positive! * 40, 4);
    const noClubActions = clubContributionByPlayer({ protocol: { winner_team: 'black' }, player_results: players }, players, 'wills');
    close(noClubActions.get('p2')!.raw * 40, 16);
  });
});
