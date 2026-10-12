import { gameActionFacts, type ActionFactsMemo } from './gameActionFacts';
import type { StatGame, StatRole } from './gameStatistics';
import type { LiveGameEvent } from '../shared/liveGameEvents';

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
export function finalReveals(game: StatGame): Map<number, RevealRecord> { return finalRevealsOfEvents(game.events); }

export function finalRevealsOfEvents(events: LiveGameEvent[]): Map<number, RevealRecord> {
  const records = new Map<number, RevealRecord>();
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
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
  /**
   * The Don's reveals (owner, 2026-10-12). Games as the Don; games where a plain mafia partner revealed while he did not («отдал вскрытие»);
   * what he announced as black / red: by the real colour of the player named; and per named player id / per pair of players named black together.
   */
  donGames: number; donHandedReveal: number; donNamedBlackRed: number; donNamedBlackBlack: number; donNamedRedBlack: number; donNamedRedRed: number;
  donTargets: Record<string, { black: number; red: number }>; donBundles: Record<string, number>;
}
export const emptyRevealStats = (): PlayerRevealStats => ({
  sheriffGames: 0, sheriffReveals: 0, sheriffCheckedDon: 0, sheriffCheckedMafia: 0, sheriffCheckedRed: 0,
  blackGames: 0, blackReveals: 0, blackRevealsDon: 0, blackRevealsMafia: 0, blackCovers: 0, blackAnnouncedBlackOnRed: 0,
  townChances: 0, townVotesSheriff: 0, townVotesMafia: 0, townVotesDon: 0,
  donGames: 0, donHandedReveal: 0, donNamedBlackRed: 0, donNamedBlackBlack: 0, donNamedRedBlack: 0, donNamedRedRed: 0, donTargets: {}, donBundles: {},
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
      if (seat.role === 'don') {
        stats.donGames += 1;
        const mafiaRevealed = [...reveals.keys()].some((revealSeat) => roleOf(revealSeat) === 'mafia');
        if (mafiaRevealed && !reveals.has(seat.seat)) stats.donHandedReveal += 1;
      }
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
        if (owner.role === 'don') {
          // His version of the table: the blacks he announced plus every rival claimant (if he is the Sheriff, the rival is black).
          const named = new Set<number>([...record.checks].filter(([, color]) => color === 'black').map(([target]) => target));
          for (const rival of reveals.keys()) if (rival !== record.seat) named.add(rival);
          const note = (target: number, color: 'red' | 'black') => {
            const id = seated.find((seat) => seat.seat === target)?.playerId;
            if (id) { const entry = stats.donTargets[id] || (stats.donTargets[id] = { black: 0, red: 0 }); entry[color] += 1; }
            const role = roleOf(target);
            if (color === 'black') { if (isRed(role)) stats.donNamedBlackRed += 1; else if (isBlack(role)) stats.donNamedBlackBlack += 1; }
            else if (isBlack(role)) stats.donNamedRedBlack += 1; else if (isRed(role)) stats.donNamedRedRed += 1;
          };
          for (const target of named) note(target, 'black');
          for (const [target, color] of record.checks) if (color === 'red') note(target, 'red');
          const ids = [...named].map((target) => seated.find((seat) => seat.seat === target)?.playerId).filter(Boolean) as string[];
          ids.sort();
          for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) { const key = `${ids[i]}|${ids[j]}`; stats.donBundles[key] = (stats.donBundles[key] || 0) + 1; }
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

export interface RevealVersion { claimant: number; blacks: number[]; reds: number[] }
/**
 * The competing versions of the table (owner, 2026-10-12): every reveal says «the claimant is the Sheriff»; his blacks are the
 * black checks he announced plus every rival claimant (if he is the Sheriff, the rival is black), his reds the red checks he announced.
 * Meaningful only when two or more players revealed.
 */
export const revealVersions = (records: Array<{ seat: number; checks: Array<{ target: number; color: 'red' | 'black' }> }>): RevealVersion[] => {
  if (records.length < 2) return [];
  return records.map((record) => {
    const blacks = new Set(record.checks.filter((check) => check.color === 'black').map((check) => check.target));
    for (const rival of records) if (rival.seat !== record.seat) blacks.add(rival.seat);
    return { claimant: record.seat, blacks: [...blacks].sort((a, b) => a - b), reds: record.checks.filter((check) => check.color === 'red').map((check) => check.target).sort((a, b) => a - b) };
  });
};

/** The reveals of one finished game as plain data for a game page: who claimed to be the Sheriff and the announced checks. */
export const revealsForGamePage = (events: LiveGameEvent[]) => [...finalRevealsOfEvents(events).values()]
  .sort((a, b) => a.since - b.since || a.seat - b.seat)
  .map((record) => ({ seat: record.seat, round: record.since, checks: [...record.checks].map(([target, color]) => ({ target, color })) }));
