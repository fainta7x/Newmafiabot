import { describe, expect, it } from 'vitest';
import { mapEngineResult } from '../components/player/TournamentLiveGameModal';

const previousProtocol: any = { status: 'draft', votes: [], shots: [], judge_notes: null };
const previousResults: any[] = [1, 2, 3].map((seat) => ({
  participant_id: `p${seat}`, seat_number: seat, display_name: `Игрок ${seat}`, player_id: `pl${seat}`, role: 'citizen', exit_type: 'alive',
}));

describe('tournament live game result mapping', () => {
  it('carries the voting rounds and nights recorded during the game into the protocol', () => {
    const votes = [{ round_number: 1, day_number: 1, nominated_seats: [2, 3], vote_counts: { 2: 4, 3: 1 }, outcome: 'single_eliminated', eliminated_seats: [2] }];
    const shots = [{ night_number: 1, target_seat: 1, result: 'killed' }];
    const { protocol } = mapEngineResult(previousProtocol, previousResults, { winning_team: 'Красные', slots: [], votes, shots });
    expect(protocol.votes).toEqual(votes);
    expect(protocol.shots).toEqual(shots);
  });

  it('keeps what the protocol already had when nothing was recorded', () => {
    const existing: any = { ...previousProtocol, votes: [{ round_number: 1, nominated_seats: [1], vote_counts: {} }] };
    const { protocol } = mapEngineResult(existing, previousResults, { winning_team: 'Чёрные', slots: [], votes: [], shots: [] });
    expect(protocol.votes).toHaveLength(1);
  });
});
