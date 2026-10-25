import { gameActionFacts, redRole, blackRole } from './gameActionFacts.ts';
import type { StatGame, StatRole } from './gameStatistics.ts';
import { sanitizeLiveGameEvents } from '../shared/liveGameEvents.ts';
import { normalizeGameRole } from '../shared/gameRoles.ts';

/**
 * Individual contribution of a seat in one club game, in the same «points» as the personal game points (1 point = 40 Elo).
 * Raw points only; the Elo layer subtracts the role's average so an ordinary game is zero.
 * Votings are the ones `gameActionFacts` keeps (zero circle and days with two or more players leaving at once are left out).
 */
export const CONTRIBUTION_WEIGHTS = {
  voteBlack: 0.1, voteRed: -0.1, criticalFactor: 2,
  colorRight: { red: 0.2, black: 0.3 }, colorWrong: -0.1,
  sheriffFoundBlack: 0.2,
  blackFooled: 0.1, blackExposed: -0.1,
} as const;

export interface SeatContribution { seat: number; role: StatRole | null; points: number; parts: Record<string, number> }

const seatList = (value: unknown): number[] => (Array.isArray(value) ? [...new Set(value.map(Number).filter((seat) => Number.isInteger(seat) && seat > 0))] : []);

export function gameContribution(envelope: any): SeatContribution[] {
  const protocol = envelope?.protocol || {};
  const results: any[] = Array.isArray(envelope?.player_results) ? envelope.player_results : [];
  const seats = results
    .map((result) => ({ seat: Number(result?.seat_number), role: normalizeGameRole(result?.role) as StatRole | null, playerId: String(result?.player_id || '') || null, colors: Array.isArray(result?.color_protocol) ? result.color_protocol : [] }))
    .filter((item) => Number.isInteger(item.seat) && item.seat > 0);
  const roleOf = new Map(seats.map((item) => [item.seat, item.role]));
  const facts = gameActionFacts({
    id: '', source: 'club', date: '', winner: protocol.winner_team === 'red' || protocol.winner_team === 'black' ? protocol.winner_team : null,
    seats: seats.map(({ seat, role, playerId }) => ({ seat, role: role as any, playerId })), events: sanitizeLiveGameEvents(protocol.events),
  } satisfies StatGame);
  const W = CONTRIBUTION_WEIGHTS;
  const marks = (item: { colors: any[] }, mark: string) => new Set(item.colors.filter((entry) => entry?.mark === mark).flatMap((entry) => seatList(entry?.seat_numbers)));
  return seats.map((me) => {
    const parts: Record<string, number> = {};
    const add = (key: string, value: number) => { if (value) parts[key] = (parts[key] || 0) + value; };
    if (redRole(me.role)) {
      for (const voting of facts.votings) {
        const target = voting.votes.get(me.seat);
        if (!target) continue;
        const factor = voting.critical ? W.criticalFactor : 1;
        if (blackRole(roleOf.get(target))) add('votes', W.voteBlack * factor);
        else if (redRole(roleOf.get(target))) add('votes', W.voteRed * factor);
      }
      for (const seat of marks(me, 'red')) add('colors', redRole(roleOf.get(seat)) ? W.colorRight.red : blackRole(roleOf.get(seat)) ? W.colorWrong : 0);
      for (const seat of marks(me, 'black')) add('colors', blackRole(roleOf.get(seat)) ? W.colorRight.black : redRole(roleOf.get(seat)) ? W.colorWrong : 0);
      if (me.role === 'sheriff') add('checks', facts.checks.filter((check) => check.kind === 'sheriff' && blackRole(roleOf.get(check.target))).length * W.sheriffFoundBlack);
    } else if (blackRole(me.role)) {
      for (const other of seats.filter((item) => redRole(item.role))) {
        if (marks(other, 'red').has(me.seat)) add('hidden', W.blackFooled);
        if (marks(other, 'black').has(me.seat)) add('hidden', W.blackExposed);
      }
    }
    const points = Object.values(parts).reduce((sum, value) => sum + value, 0);
    return { seat: me.seat, role: me.role, points, parts };
  });
}
