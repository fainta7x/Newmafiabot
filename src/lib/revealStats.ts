import { gameActionFacts, type ActionFactsMemo } from './gameActionFacts';
import type { StatGame, StatRole } from './gameStatistics';

/**
 * «Вскрытие» in numbers (owner, 2026-10-12; rules in docs/BUSINESS_RULES.md): who openly claimed to be the Sheriff and which
 * checks he announced, read from the judge's records in the move chronology. Announced checks are what the table heard, not
 * the real night checks. Pure and read-only; games without a chronology or without a reveal contribute nothing.
 *
 * - The real Sheriff: how often he revealed and whom his announced checks named (the Don, a plain mafia, a red player).
 * - A black player (mafia or don): how often he revealed as the Sheriff, how often he «covered» a black partner with an
 *   announced red check, and how often he announced a black check on a red player.
 * - A red player: the votes he cast for revealed candidates, split by who the candidate really was.
 */

export interface RevealRecord { seat: number; checks: Map<number, 'red' | 'black'>; since: number }

/** The reveals standing at the end of a game (a removed reveal or check is gone), with the event order they were made in. */
export function finalReveals(game: StatGame): Map<number, RevealRecord> {
  const records = new Map<number, RevealRecord>();
  for (const event of [...game.events].sort((a, b) => a.seq - b.seq)) {
    const seat = event.seat ?? null;
    if (!seat) continue;
    if (event.kind === 'reveal' && !records.has(seat)) records.set(seat, { seat, checks: new Map(), since: event.round });
    else if (event.kind === 'reveal_removed') records.delete(seat);
    else if (event.kind === 'announced_check' && event.target && (event.value === 'red' || event.value === 'black')) {
      const record = records.get(seat) ?? { seat, checks: new Map(), since: event.round };
      record.checks.set(event.target, event.value);
      records.set(seat, record);
    } else if (event.kind === 'announced_check_removed' && event.target) records.get(seat)?.checks.delete(event.target);
  }
  return records;
}

/** Seats that were revealed by the end of the given engine round. */
const revealedByRound = (game: StatGame, round: number) => {
  const seats = new Set<number>();
  for (const event of [...game.events].sort((a, b) => a.seq - b.seq)) {
    if (event.round > round) break;
    if ((event.kind === 'reveal' || event.kind === 'announced_check') && event.seat) seats.add(event.seat);
    if (event.kind === 'reveal_removed' && event.seat) seats.delete(event.seat);
  }
  return seats;
};

export interface PlayerRevealStats {
  /** Games as the real Sheriff, those in which he revealed, and whom his announced checks named (by the target's real role). */
  sheriffGames: number; sheriffReveals: number; sheriffCheckedDon: number; sheriffCheckedMafia: number; sheriffCheckedRed: number;
  /** Games on the black team; reveals as the Sheriff (split by the real role); covers; announced black checks on reds. */
  blackGames: number; blackReveals: number; blackRevealsDon: number; blackRevealsMafia: number; blackCovers: number; blackAnnouncedBlackOnRed: number;
  /** Red player: voting days where a revealed candidate stood, and his vote for each kind of revealed candidate. */
  townChances: number; townVotesSheriff: number; townVotesMafia: number; townVotesDon: number;
}
export const emptyRevealStats = (): PlayerRevealStats => ({
  sheriffGames: 0, sheriffReveals: 0, sheriffCheckedDon: 0, sheriffCheckedMafia: 0, sheriffCheckedRed: 0,
  blackGames: 0, blackReveals: 0, blackRevealsDon: 0, blackRevealsMafia: 0, blackCovers: 0, blackAnnouncedBlackOnRed: 0,
  townChances: 0, townVotesSheriff: 0, townVotesMafia: 0, townVotesDon: 0,
});

const isBlack = (role: StatRole | null | undefined) => role === 'mafia' || role === 'don';
const isRed = (role: StatRole | null | undefined) => role === 'citizen' || role === 'sheriff';

export function buildRevealStats(games: StatGame[], memo?: ActionFactsMemo): Map<string, PlayerRevealStats> {
  const players = new Map<string, PlayerRevealStats>();
  const of = (id: string) => { let value = players.get(id); if (!value) { value = emptyRevealStats(); players.set(id, value); } return value; };
  const seen = new Set<string>();
  for (const game of games) {
    if (seen.has(game.id) || !Array.isArray(game.events) || !game.events.length) continue;
    seen.add(game.id);
    const seated = game.seats.filter((seat) => seat.playerId && seat.role);
    const roleOf = (seat: number) => game.seats.find((item) => item.seat === seat)?.role ?? null;
    const reveals = finalReveals(game);
    for (const seat of seated) {
      const stats = of(seat.playerId!);
      if (seat.role === 'sheriff') stats.sheriffGames += 1;
      if (isBlack(seat.role)) stats.blackGames += 1;
    }
    for (const record of reveals.values()) {
      const owner = seated.find((seat) => seat.seat === record.seat);
      if (!owner) continue;
      const stats = of(owner.playerId!);
      if (owner.role === 'sheriff') {
        stats.sheriffReveals += 1;
        for (const target of record.checks.keys()) {
          const role = roleOf(target);
          if (role === 'don') stats.sheriffCheckedDon += 1;
          else if (role === 'mafia') stats.sheriffCheckedMafia += 1;
          else if (isRed(role)) stats.sheriffCheckedRed += 1;
        }
      } else if (isBlack(owner.role)) {
        stats.blackReveals += 1;
        if (owner.role === 'don') stats.blackRevealsDon += 1; else stats.blackRevealsMafia += 1;
        for (const [target, color] of record.checks) {
          const role = roleOf(target);
          if (color === 'red' && isBlack(role)) stats.blackCovers += 1;
          if (color === 'black' && isRed(role)) stats.blackAnnouncedBlackOnRed += 1;
        }
      }
    }
    if (!reveals.size) continue;
    for (const voting of gameActionFacts(game, memo).votings) {
      const revealed = revealedByRound(game, voting.round);
      const candidates = voting.nominations.map((item) => item.seat).filter((seat) => revealed.has(seat));
      if (!candidates.length) continue;
      for (const voter of seated.filter((seat) => isRed(seat.role))) {
        const own = candidates.filter((seat) => seat !== voter.seat);
        if (!own.length) continue;
        const stats = of(voter.playerId!);
        stats.townChances += 1;
        const choice = voting.votes.get(voter.seat);
        if (!choice || !own.includes(choice)) continue;
        const role = roleOf(choice);
        if (role === 'sheriff') stats.townVotesSheriff += 1;
        else if (role === 'mafia') stats.townVotesMafia += 1;
        else if (role === 'don') stats.townVotesDon += 1;
      }
    }
  }
  return players;
}
