import { gameActionFacts, redRole, blackRole } from './gameActionFacts.ts';
import type { StatGame, StatRole } from './gameStatistics.ts';
import { sanitizeLiveGameEvents } from '../shared/liveGameEvents.ts';
import { normalizeGameRole } from '../shared/gameRoles.ts';

/**
 * Individual contribution of a seat in one club game, in the same «points» as the personal game points (1 point = 40 Elo).
 * Raw points only; the Elo layer subtracts the role's average so an ordinary game is zero.
 * Votings are the ones `gameActionFacts` keeps (zero circle and days with two or more players leaving at once are left out).
 *
 * Owner, 2026-10-25:
 * - a red earns for each **different** black he voted for, once per black (Polemica's «найденный чёрный»: three blacks found
 *   is the whole job, voting again for the same black earns nothing more); a vote for a red costs every time;
 * - wrong colours in the will are punished harder than in Polemica, so a random guess is worth zero (a «black» mark is right
 *   1 time in 3, a «red» mark 2 times in 3);
 * - a black is judged only by what the dead reds left about him in their wills; votes against a black do not move his points.
 */
export const CONTRIBUTION_WEIGHTS = {
  foundBlack: 0.2, voteRed: -0.1, criticalFactor: 2,
  colorRight: { red: 0.2, black: 0.3 }, colorWrong: { calledRed: -0.4, calledBlack: -0.15 },
  sheriffFoundBlack: 0.2,
  blackNamedRed: 0.2, blackNamedBlack: -0.2, blackNotNamed: 0.05,
} as const;

export type ContributionKind = 'found_black' | 'vote_red' | 'will_right' | 'will_wrong' | 'check_black' | 'named_red' | 'named_black' | 'not_named';
/** One line of the breakdown: what the player did, about which seat, and its points. */
export interface ContributionItem { kind: ContributionKind; seat: number; points: number; critical?: boolean }
export interface SeatContribution { seat: number; role: StatRole | null; points: number; items: ContributionItem[] }

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
    const items: ContributionItem[] = [];
    if (redRole(me.role)) {
      const found = new Map<number, boolean>();
      for (const voting of facts.votings) {
        const target = voting.votes.get(me.seat);
        if (!target) continue;
        const critical = voting.critical === true;
        if (blackRole(roleOf.get(target))) found.set(target, Boolean(found.get(target)) || critical);
        else if (redRole(roleOf.get(target))) items.push({ kind: 'vote_red', seat: target, points: W.voteRed * (critical ? W.criticalFactor : 1), critical });
      }
      for (const [seat, critical] of found) items.push({ kind: 'found_black', seat, points: W.foundBlack * (critical ? W.criticalFactor : 1), critical });
      for (const seat of marks(me, 'red')) {
        if (redRole(roleOf.get(seat))) items.push({ kind: 'will_right', seat, points: W.colorRight.red });
        else if (blackRole(roleOf.get(seat))) items.push({ kind: 'will_wrong', seat, points: W.colorWrong.calledRed });
      }
      for (const seat of marks(me, 'black')) {
        if (blackRole(roleOf.get(seat))) items.push({ kind: 'will_right', seat, points: W.colorRight.black });
        else if (redRole(roleOf.get(seat))) items.push({ kind: 'will_wrong', seat, points: W.colorWrong.calledBlack });
      }
      if (me.role === 'sheriff') {
        for (const check of facts.checks) if (check.kind === 'sheriff' && blackRole(roleOf.get(check.target))) items.push({ kind: 'check_black', seat: check.target, points: W.sheriffFoundBlack });
      }
    } else if (blackRole(me.role)) {
      for (const other of seats.filter((item) => redRole(item.role) && item.colors.length)) {
        if (marks(other, 'red').has(me.seat)) items.push({ kind: 'named_red', seat: other.seat, points: W.blackNamedRed });
        else if (marks(other, 'black').has(me.seat)) items.push({ kind: 'named_black', seat: other.seat, points: W.blackNamedBlack });
        else items.push({ kind: 'not_named', seat: other.seat, points: W.blackNotNamed });
      }
    }
    const points = items.reduce((sum, item) => sum + item.points, 0);
    return { seat: me.seat, role: me.role, points, items };
  });
}

const signed = (value: number) => `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(2).replace(/0$/, '').replace('.', ',')}`;

/** Plain words for one breakdown line on the game blank, e.g. «голос в №9 — чёрный +0,2». */
export function contributionItemText(item: ContributionItem): string {
  const crit = item.critical ? ' (критика)' : '';
  switch (item.kind) {
    case 'found_black': return `нашёл чёрного №${item.seat}${crit} ${signed(item.points)}`;
    case 'vote_red': return `голос в красного №${item.seat}${crit} ${signed(item.points)}`;
    case 'will_right': return `завещание: №${item.seat} верно ${signed(item.points)}`;
    case 'will_wrong': return `завещание: №${item.seat} ошибка ${signed(item.points)}`;
    case 'check_black': return `проверка: №${item.seat} чёрный ${signed(item.points)}`;
    case 'named_red': return `завещание №${item.seat}: назвал красным ${signed(item.points)}`;
    case 'named_black': return `завещание №${item.seat}: назвал чёрным ${signed(item.points)}`;
    case 'not_named': return `завещание №${item.seat}: не назвал ${signed(item.points)}`;
  }
}
