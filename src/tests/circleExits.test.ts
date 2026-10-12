import { describe, expect, it } from 'vitest';
import { buildCircleExits } from '../lib/circleExits.ts';
import type { StatGame, StatRole } from '../lib/gameStatistics.ts';
import type { LiveGameEvent } from '../shared/liveGameEvents.ts';

const roles: StatRole[] = ['citizen', 'mafia', 'sheriff', 'citizen', 'don', 'citizen', 'citizen', 'mafia', 'citizen', 'citizen'];
const seats = roles.map((role, index) => ({ seat: index + 1, role, playerId: `p${index + 1}` }));
let seq = 0;
const ev = (round: number, kind: string, extra: Partial<LiveGameEvent> = {}): LiveGameEvent => ({ seq: ++seq, at: '2026-10-12T10:00:00Z', round, phase: 'day_voting', kind, ...extra });

const events = () => { seq = 0; return [
  ev(1, 'game_start', { phase: 'setup' }),
  ev(1, 'exit', { seat: 7, value: 'killed', phase: 'night' }),
  ev(2, 'nomination', { seat: 8, by: 1 }), ev(2, 'nomination', { seat: 4, by: 2 }),
  ev(2, 'vote', { seat: 1, target: 8, value: 1 }), ev(2, 'vote', { seat: 2, target: 4, value: 1 }),
  ev(2, 'vote_round_result', { value: '1:single_eliminated' }),
  ev(2, 'exit', { seat: 8, value: 'voted_day' }),
  ev(2, 'game_end', { value: 'red', phase: 'finished' }),
]; };
const game = (): StatGame => ({ id: 'g', source: 'club', date: '2026-10-12T10:00:00Z', winner: 'red', seats, events: events() });

describe('circle of exit', () => {
  it('counts the day a player was voted out by the number alive and the games played', () => {
    const stats = buildCircleExits([game()]);
    expect(stats.get('p8')).toMatchObject({ games: 1, votedOut: 1, byAlive: { 9: 1 } });
    expect(stats.get('p1')).toMatchObject({ games: 1, votedOut: 0 });
  });
});
