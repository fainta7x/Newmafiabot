import { describe, expect, it } from 'vitest';
import { mapEngineResult, requireFreshTournamentLivePayload } from '../components/player/TournamentLiveGameModal';

const previousProtocol: any = { status: 'draft', votes: [], shots: [], judge_notes: null };
const previousResults: any[] = [1, 2, 3].map((seat) => ({
  participant_id: `p${seat}`, seat_number: seat, display_name: `Игрок ${seat}`, player_id: `pl${seat}`, role: 'citizen', exit_type: 'alive',
}));

describe('tournament live game result mapping', () => {
  it('carries the voting rounds and nights recorded during the game into the protocol', () => {
    const votes = [{ round_number: 1, day_number: 1, nominated_seats: [2, 3], vote_counts: { 2: 4, 3: 1 }, outcome: 'single_eliminated', eliminated_seats: [2] }];
    const shots = [{ night_number: 1, target_seat: 1, result: 'killed' }];
    const { protocol } = mapEngineResult(previousProtocol, previousResults, { winning_team: 'Красные', slots: [], votes, shots });
    expect(protocol.votes).toMatchObject(votes);
    expect(protocol.shots).toEqual(shots);
  });

  it('keeps what the protocol already had when nothing was recorded', () => {
    const existing: any = { ...previousProtocol, votes: [{ round_number: 1, nominated_seats: [1], vote_counts: {} }] };
    const { protocol } = mapEngineResult(existing, previousResults, { winning_team: 'Чёрные', slots: [], votes: [], shots: [] });
    expect(protocol.votes).toHaveLength(1);
  });

  it('numbers the voting rounds of several days one after another and keeps revotes pointing at their parent', () => {
    const votes: any[] = [
      { round_number: 1, day_number: 1, is_revote: false, nominated_seats: [2, 3], vote_counts: { 2: 5, 3: 5 }, outcome: 'tie_revote', parent_round_number: null },
      { round_number: 2, day_number: 1, is_revote: true, nominated_seats: [2, 3], vote_counts: { 2: 6, 3: 4 }, outcome: 'single_eliminated', parent_round_number: 1 },
      { round_number: 1, day_number: 2, is_revote: false, nominated_seats: [4], vote_counts: { 4: 8 }, outcome: 'single_eliminated', parent_round_number: null },
    ];
    const { protocol } = mapEngineResult(previousProtocol, previousResults, { winning_team: 'Красные', slots: [], votes, shots: [] });
    const rounds = protocol.votes as any[];
    expect(rounds.map((round) => round.round_number)).toEqual([1, 2, 3]);
    expect(new Set(rounds.map((round) => round.round_number)).size).toBe(3);
    expect(rounds[1].parent_round_number).toBe(1);
    expect(rounds[2].day_number).toBe(2);
    expect(rounds[2].parent_round_number).toBeNull();
  });
});

describe('tournament live save integrity under loss of connection and CRM edits', () => {
  const tenSeats = () => Array.from({ length: 10 }, (_, i) => ({
    participant_id: `participant-${i + 1}`, player_id: `player-${i + 1}`,
    seat_number: i + 1, role: i === 0 ? 'sheriff' : i <= 6 ? 'citizen' : i === 9 ? 'don' : 'mafia',
    display_name: `Игрок ${i + 1}`, exit_type: 'alive',
  }));
  const fresh = (rows = tenSeats(), status = 'active') => ({
    protocol: { status: 'draft', votes: [], shots: [] }, player_results: rows,
    game: { status, game_number: 1 },
  }) as any;

  it('does not silently award a black win when an engine result has no winner', () => {
    expect(() => mapEngineResult(previousProtocol, previousResults, { slots: [], votes: [], shots: [] }))
      .toThrow('не передал победившую команду');
    expect(() => mapEngineResult(previousProtocol, previousResults, { winning_team: 'unknown', slots: [] }))
      .toThrow('не передал победившую команду');
  });

  it('refuses a disconnected CRM rather than falling back to potentially stale seating', async () => {
    await expect(requireFreshTournamentLivePayload(async () => { throw new Error('network offline'); }))
      .rejects.toThrow('актуальный состав');
  });

  it('reads updated participant identity from the CRM, assigning the engine seat result to the new occupant', async () => {
    const rows = tenSeats();
    [rows[0].participant_id, rows[1].participant_id] = [rows[1].participant_id, rows[0].participant_id];
    const result = await requireFreshTournamentLivePayload(async () => fresh(rows));
    const mapped = mapEngineResult(result.protocol, result.player_results, {
      winning_team: 'Красные', slots: [{ slot_num: 1, role: 'sheriff', alive: false, exit_reason: 'killed' }],
      protocol_markers: { firstKilledSlot: 1 },
    });
    expect(mapped.protocol.first_killed_participant_id).toBe('participant-2');
    expect(mapped.player_results.find((row) => row.seat_number === 1)?.participant_id).toBe('participant-2');
    expect(mapped.player_results.find((row) => row.seat_number === 1)?.exit_type).toBe('killed');
  });

  it('rejects incomplete, duplicate or already completed roster snapshots', async () => {
    const cases = [
      fresh(tenSeats().slice(0, 9)),
      fresh(tenSeats().map((row) => row.seat_number === 2 ? { ...row, seat_number: 1 } : row)),
      fresh(tenSeats().map((row) => row.seat_number === 2 ? { ...row, participant_id: 'participant-1' } : row)),
      fresh(tenSeats(), 'completed'),
    ];
    for (const value of cases) {
      await expect(requireFreshTournamentLivePayload(async () => value)).rejects.toThrow();
    }
    await expect(requireFreshTournamentLivePayload(async () => fresh())).resolves.toHaveProperty('player_results');
  });

  it('replays a full tournament-distance result mapper 100 times without changing the seat-to-player mapping', async () => {
    const rows = tenSeats();
    const checkpoint = await requireFreshTournamentLivePayload(async () => fresh(rows));
    const engine = { winning_team: 'Чёрные', slots: rows.map((row) => ({
      slot_num: row.seat_number, role: row.role, alive: row.seat_number % 2 === 0,
      exit_reason: row.seat_number % 2 === 0 ? null : 'voted_day', fouls: row.seat_number % 3,
    })) };
    for (let game = 0; game < 100; game++) {
      const mapped = mapEngineResult(checkpoint.protocol, checkpoint.player_results, engine);
      expect(mapped.player_results.map((row) => row.participant_id)).toEqual(rows.map((row) => row.participant_id));
      expect(mapped.protocol.winner_team).toBe('black');
      expect(mapped.player_results).toHaveLength(10);
    }
  });
});
