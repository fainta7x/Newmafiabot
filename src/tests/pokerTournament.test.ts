import { describe, expect, it } from 'vitest';
import {
  normalizePokerTournamentConfig, planPokerTournamentTables, pokerTournamentClock, pokerTournamentLateRegOpen, pokerTournamentRebuyOpen,
  pokerTournamentPrizes, pokerTournamentSchedule, TURBO_BLIND_LEVELS,
} from '../shared/pokerTournament.ts';

const NOW = Date.parse('2026-10-20T16:00:00Z');
const start = '2026-10-20T18:00:00Z';

describe('poker tournament settings', () => {
  it('fills the turbo defaults and keeps no upper limit on players', () => {
    const result = normalizePokerTournamentConfig({ startAt: start }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config).toMatchObject({ minPlayers: 4, maxPlayers: null, levelMinutes: 6, seatsPerTable: 6, rebuyUntilLevel: 6, rebuyCostTokens: 200, rebuyChips: 1000, lateRegUntilLevel: 6, prizeTokens: [] });
    expect(result.config.levels[0]).toEqual({ small: 10, big: 20 });
  });

  it('accepts organizer settings in both naming styles and rejects nonsense', () => {
    const ok = normalizePokerTournamentConfig({ start_at: start, min_players: 5, max_players: 20, level_minutes: 8, seats_per_table: 8, prize_tokens: [3000, 1500, 500] }, NOW);
    expect(ok.ok && ok.config).toMatchObject({ minPlayers: 5, maxPlayers: 20, levelMinutes: 8, seatsPerTable: 8, prizeTokens: [3000, 1500, 500] });
    for (const bad of [
      { startAt: start, lateRegUntilLevel: -1 }, { startAt: start, lateRegUntilLevel: TURBO_BLIND_LEVELS.length + 1 },
      { startAt: 'soon' }, { startAt: '2026-10-20T10:00:00Z' }, { startAt: start, seatsPerTable: 9 }, { startAt: start, minPlayers: 1 },
      { startAt: start, minPlayers: 6, maxPlayers: 4 }, { startAt: start, prizeTokens: [-5] }, { startAt: start, prizeTokens: ['x'] }, { startAt: start, levelMinutes: 0 },
    ]) expect(normalizePokerTournamentConfig(bad, NOW).ok, JSON.stringify(bad)).toBe(false);
  });
});

describe('poker tournament prize pool', () => {
  it('takes the guarantee and the percentages, and refuses shares that do not add up to 100', () => {
    const ok = normalizePokerTournamentConfig({ startAt: start, guaranteeTokens: 2000, prizeSharesPct: [65, 25, 10], prizeTokens: [999] }, NOW);
    expect(ok.ok && ok.config).toMatchObject({ guaranteeTokens: 2000, prizeSharesPct: [65, 25, 10], prizeTokens: [] });
    for (const bad of [
      { prizeSharesPct: [60, 30] }, { prizeSharesPct: [110, -10] }, { prizeSharesPct: [50, 50, 'x'] }, { prizeSharesPct: [65, 25, 10], guaranteeTokens: -1 },
      { prizeSharesPct: Array.from({ length: 11 }, () => 10) },
    ]) expect(normalizePokerTournamentConfig({ startAt: start, ...bad }, NOW).ok, JSON.stringify(bad)).toBe(false);
  });

  it('pays the guarantee plus all re-buys by the shares, scales the shares up when fewer people played, and pays out exactly the pool', () => {
    const config = { prizeTokens: [], guaranteeTokens: 2000, prizeSharesPct: [65, 25, 10], rebuyCostTokens: 200 };
    expect(pokerTournamentPrizes(config, 0, 8)).toMatchObject({ mode: 'pool', guarantee: 2000, rebuyTokens: 0, total: 2000, payouts: [1300, 500, 200] });
    expect(pokerTournamentPrizes(config, 5, 8)).toMatchObject({ rebuyTokens: 1000, total: 3000, payouts: [1950, 750, 300] });
    expect(pokerTournamentPrizes(config, 0, 2)).toMatchObject({ total: 2000, payouts: [1445, 555] });
    expect(pokerTournamentPrizes(config, 0, 1).payouts).toEqual([2000]);
    expect(pokerTournamentPrizes(config, 0, 0).payouts).toEqual([]);
    // a pool that does not divide evenly: the remainder goes to first place
    const odd = pokerTournamentPrizes({ ...config, guaranteeTokens: 1001 }, 0, 3);
    expect(odd.payouts.reduce((sum, value) => sum + value, 0)).toBe(1001);
    expect(odd.payouts).toEqual([651, 250, 100]);
  });

  it('keeps the fixed prizes of a tournament made before the pool existed', () => {
    expect(pokerTournamentPrizes({ prizeTokens: [3000, 1500], rebuyCostTokens: 200 }, 4, 5)).toMatchObject({ mode: 'fixed', total: 4500, payouts: [3000, 1500] });
  });
});

describe('poker tournament clock', () => {
  const config = { levels: TURBO_BLIND_LEVELS, levelMinutes: 6 };
  const startedAt = Date.parse(start);

  it('raises the blinds every level and counts the seconds to the next one', () => {
    expect(pokerTournamentClock(config, startedAt, startedAt)).toMatchObject({ level: 1, small: 10, big: 20, secondsToNextLevel: 360 });
    expect(pokerTournamentClock(config, startedAt, startedAt + 6 * 60_000)).toMatchObject({ level: 2, big: 30 });
    expect(pokerTournamentClock(config, startedAt, startedAt + 5 * 60_000 + 30_000)).toMatchObject({ level: 1, secondsToNextLevel: 30 });
  });

  it('stays on the last level when the schedule runs out', () => {
    const late = pokerTournamentClock(config, startedAt, startedAt + 24 * 60 * 60_000);
    expect(late).toMatchObject({ level: TURBO_BLIND_LEVELS.length, isLastLevel: true, secondsToNextLevel: null });
  });

  it('closes the re-buy after the chosen level', () => {
    expect(pokerTournamentRebuyOpen({ rebuyUntilLevel: 4 }, { elapsedLevel: 4 })).toBe(true);
    expect(pokerTournamentRebuyOpen({ rebuyUntilLevel: 4 }, { elapsedLevel: 5 })).toBe(false);
    expect(pokerTournamentRebuyOpen({ rebuyUntilLevel: 0 }, { elapsedLevel: 1 })).toBe(false);
  });

  it('still closes a re-buy set to the last blind level once that level has passed', () => {
    const last = TURBO_BLIND_LEVELS.length;
    const during = pokerTournamentClock(config, startedAt, startedAt + (last - 1) * 6 * 60_000 + 1000);
    const after = pokerTournamentClock(config, startedAt, startedAt + last * 6 * 60_000 + 1000);
    expect(during.level).toBe(last);
    expect(after.level).toBe(last);
    expect(pokerTournamentRebuyOpen({ rebuyUntilLevel: last }, during)).toBe(true);
    expect(pokerTournamentRebuyOpen({ rebuyUntilLevel: last }, after)).toBe(false);
  });
});

describe('late registration and the table of levels', () => {
  const config = { levels: TURBO_BLIND_LEVELS, levelMinutes: 6 };
  const startedAt = Date.parse(start);

  it('lets a newcomer in until the chosen level ends, never in a tournament saved without the setting', () => {
    const late = { lateRegUntilLevel: 6 };
    expect(pokerTournamentLateRegOpen(late, { elapsedLevel: 6 })).toBe(true);
    expect(pokerTournamentLateRegOpen(late, { elapsedLevel: 7 })).toBe(false);
    expect(pokerTournamentLateRegOpen({ lateRegUntilLevel: 0 }, { elapsedLevel: 1 })).toBe(false);
    expect(pokerTournamentLateRegOpen({}, { elapsedLevel: 1 })).toBe(false);
    const clock = (minutes: number) => pokerTournamentClock(config, startedAt, startedAt + minutes * 60_000);
    expect(pokerTournamentLateRegOpen(late, clock(35))).toBe(true);   // the 6th level lasts until minute 36
    expect(pokerTournamentLateRegOpen(late, clock(36))).toBe(false);
  });

  it('lists every level with its start, the stack in big blinds and what is still possible', () => {
    const rows = pokerTournamentSchedule({ ...config, startingStack: 1000, rebuyUntilLevel: 6, lateRegUntilLevel: 4 }, startedAt);
    expect(rows).toHaveLength(TURBO_BLIND_LEVELS.length);
    expect(rows[0]).toMatchObject({ level: 1, small: 10, big: 20, startMinute: 0, startingStackBb: 50, lateRegOpen: true, rebuyOpen: true });
    expect(rows[0].startsAt).toBe('2026-10-20T18:00:00.000Z');
    expect(rows[5]).toMatchObject({ level: 6, big: 100, startMinute: 30, startingStackBb: 10, lateRegOpen: false, rebuyOpen: true });
    expect(rows[5].startsAt).toBe('2026-10-20T18:30:00.000Z');
    expect(rows[6]).toMatchObject({ level: 7, rebuyOpen: false, lateRegOpen: false });
    expect(pokerTournamentSchedule({ ...config, startingStack: 1000, rebuyUntilLevel: 0 }, null)[0]).toMatchObject({ startsAt: null, lateRegOpen: false, rebuyOpen: false });
  });
});

describe('poker tournament tables', () => {
  it('fills as few tables as possible, evenly, for any number of players', () => {
    expect(planPokerTournamentTables(4, 6)).toEqual([4]);
    expect(planPokerTournamentTables(6, 6)).toEqual([6]);
    expect(planPokerTournamentTables(7, 6)).toEqual([4, 3]);
    expect(planPokerTournamentTables(10, 6)).toEqual([5, 5]);
    expect(planPokerTournamentTables(20, 6)).toEqual([5, 5, 5, 5]);
    expect(planPokerTournamentTables(25, 8)).toEqual([7, 6, 6, 6]);
    expect(planPokerTournamentTables(0, 6)).toEqual([]);
  });

  it('never seats more than the table allows or leaves a table more than one seat apart', () => {
    for (let seats = 2; seats <= 8; seats += 1) for (let players = 1; players <= 120; players += 1) {
      const sizes = planPokerTournamentTables(players, seats);
      expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(players);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(seats);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });
});

describe('a hand where the blinds put everybody all-in', () => {
  const players = [
    { id: 'a', nickname: 'A', seat: 1, chips: 15 },
    { id: 'b', nickname: 'B', seat: 2, chips: 20 },
  ];

  it('runs the board out and pays the pot at once when there is no deal animation', async () => {
    const { createPokerHand } = await import('../server/services/pokerEngine.ts');
    const hand = createPokerHand({ id: 'h1', players, small_blind: 15, big_blind: 20 });
    expect(hand.street).toBe('finished');
    expect(hand.board).toHaveLength(5);
    expect(hand.players.reduce((sum, player) => sum + player.chips, 0)).toBe(35);
  });

  it('runs the board out by itself once the animated deal is over, instead of waiting for a move nobody can make', async () => {
    const { createPokerHand, advancePokerAnimation } = await import('../server/services/pokerEngine.ts');
    const hand = createPokerHand({ id: 'h2', players, small_blind: 15, big_blind: 20, animate: true });
    expect(hand.animation_phase).toBe('dealing');
    const later = Date.now() + 60_000;
    advancePokerAnimation(hand, later);
    advancePokerAnimation(hand, later + 60_000);
    expect(hand.street).toBe('finished');
    expect(hand.board).toHaveLength(5);
    expect(hand.players.reduce((sum, player) => sum + player.chips, 0)).toBe(35);
  });
});
