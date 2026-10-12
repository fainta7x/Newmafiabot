import type { StatGame } from './gameStatistics';

/**
 * Night shots of the black team, read from the move chronology (owner request 2026-10-12): which nights ended without a
 * victim («промах») and who was shot when. A shot is the whole team's decision, so everything here is attributed to
 * every black player (mafia and don) who sat at that table — «когда … в чёрной команде».
 *
 * A night is counted only when the engine really reached the shooting step of a night (the zero night has none) and
 * either somebody was killed in that round or the night was closed with the results step. Restored players are not victims.
 * Pure and read-only; the per-game result is kept per game object.
 */

export type NightResult = 'killed' | 'no_shot' | 'survived';
export interface Night { round: number; result: NightResult; /** Seat of the victim when somebody was killed. */ victim: number | null }

const KILL_REASONS = new Set(['killed', 'night_kill']);
const isBlack = (role: string | null | undefined) => role === 'mafia' || role === 'don';

const nightsCache = new WeakMap<StatGame, Night[]>();

export function gameNights(game: StatGame): Night[] {
  const cached = nightsCache.get(game);
  if (cached) return cached;
  const events = [...game.events].sort((a, b) => a.seq - b.seq);
  const shooting = new Set<number>();
  const morning = new Set<number>();
  const shotAt = new Map<number, number | null>();
  const killed = new Map<number, Set<number>>();
  for (const event of events) {
    const round = Math.max(1, Number(event.round) || 1);
    if (event.kind === 'night_step' && event.phase === 'night') {
      if (event.value === 'shooting') shooting.add(round);
      if (event.value === 'morning') morning.add(round);
    }
    if (event.kind === 'shot_target' && event.phase === 'night') shotAt.set(round, event.target ?? null);
    if (event.kind === 'exit' && event.seat && KILL_REASONS.has(String(event.value))) {
      if (!killed.has(round)) killed.set(round, new Set());
      killed.get(round)!.add(event.seat);
    }
    if (event.kind === 'restored' && event.seat) killed.get(round)?.delete(event.seat);
  }
  const nights: Night[] = [];
  for (const round of [...shooting].sort((a, b) => a - b)) {
    const victims = [...(killed.get(round) || [])];
    if (victims.length) { nights.push({ round, result: 'killed', victim: victims[0] }); continue; }
    if (!morning.has(round)) continue; // the night was never closed: nothing to say about it
    nights.push({ round, result: shotAt.get(round) ? 'survived' : 'no_shot', victim: null });
  }
  nightsCache.set(game, nights);
  return nights;
}

export interface PlayerNightStats {
  /** Nights played while sitting in the black team, and how many of them ended without a victim. */
  blackNights: number;
  blackMisses: number;
  /** Times killed at night, and the games (as a non-black player) that could have ended so. */
  killed: number;
  redGames: number;
}
export interface PairNightStats { victim: string; black: string; kills: number; together: number }
export interface NightShotStats { players: Map<string, PlayerNightStats>; pairs: Map<string, PairNightStats> }

const emptyPlayer = (): PlayerNightStats => ({ blackNights: 0, blackMisses: 0, killed: 0, redGames: 0 });

/** Night statistics over a set of finished games that have a chronology. */
export function buildNightShotStats(games: StatGame[]): NightShotStats {
  const players = new Map<string, PlayerNightStats>();
  const pairs = new Map<string, PairNightStats>();
  const playerOf = (id: string) => { let value = players.get(id); if (!value) { value = emptyPlayer(); players.set(id, value); } return value; };
  for (const game of games) {
    if (!Array.isArray(game.events) || !game.events.length) continue;
    const nights = gameNights(game);
    const seated = game.seats.filter((seat) => seat.playerId && seat.role);
    const blacks = seated.filter((seat) => isBlack(seat.role));
    const others = seated.filter((seat) => !isBlack(seat.role));
    if (!blacks.length) continue;
    const misses = nights.filter((night) => night.result !== 'killed').length;
    for (const black of blacks) {
      const stats = playerOf(black.playerId!);
      stats.blackNights += nights.length;
      stats.blackMisses += misses;
    }
    for (const other of others) {
      playerOf(other.playerId!).redGames += 1;
      for (const black of blacks) {
        const key = `${other.playerId}|${black.playerId}`;
        const pair = pairs.get(key) || { victim: other.playerId!, black: black.playerId!, kills: 0, together: 0 };
        pair.together += 1;
        pairs.set(key, pair);
      }
    }
    for (const night of nights) {
      if (night.result !== 'killed' || night.victim === null) continue;
      const victim = seated.find((seat) => seat.seat === night.victim);
      if (!victim || isBlack(victim.role)) continue; // the table's own black player shot is not a «victim of the black team»
      playerOf(victim.playerId!).killed += 1;
      for (const black of blacks) {
        const pair = pairs.get(`${victim.playerId}|${black.playerId}`);
        if (pair) pair.kills += 1;
      }
    }
  }
  return { players, pairs };
}
