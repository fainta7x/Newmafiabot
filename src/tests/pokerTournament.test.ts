import { describe, expect, it } from 'vitest';
import {
  normalizePokerTournamentConfig, planPokerTournamentTables, pokerTournamentClock, pokerTournamentRebuyOpen, TURBO_BLIND_LEVELS,
} from '../shared/pokerTournament.ts';

const NOW = Date.parse('2026-10-20T16:00:00Z');
const start = '2026-10-20T18:00:00Z';

describe('poker tournament settings', () => {
  it('fills the turbo defaults and keeps no upper limit on players', () => {
    const result = normalizePokerTournamentConfig({ startAt: start }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config).toMatchObject({ minPlayers: 4, maxPlayers: null, levelMinutes: 6, seatsPerTable: 6, rebuyUntilLevel: 4, prizeTokens: [] });
    expect(result.config.levels[0]).toEqual({ small: 10, big: 20 });
  });

  it('accepts organizer settings in both naming styles and rejects nonsense', () => {
    const ok = normalizePokerTournamentConfig({ start_at: start, min_players: 5, max_players: 20, level_minutes: 8, seats_per_table: 8, prize_tokens: [3000, 1500, 500] }, NOW);
    expect(ok.ok && ok.config).toMatchObject({ minPlayers: 5, maxPlayers: 20, levelMinutes: 8, seatsPerTable: 8, prizeTokens: [3000, 1500, 500] });
    for (const bad of [
      { startAt: 'soon' }, { startAt: '2026-10-20T10:00:00Z' }, { startAt: start, seatsPerTable: 9 }, { startAt: start, minPlayers: 1 },
      { startAt: start, minPlayers: 6, maxPlayers: 4 }, { startAt: start, prizeTokens: [-5] }, { startAt: start, prizeTokens: ['x'] }, { startAt: start, levelMinutes: 0 },
    ]) expect(normalizePokerTournamentConfig(bad, NOW).ok, JSON.stringify(bad)).toBe(false);
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
    expect(pokerTournamentRebuyOpen({ rebuyUntilLevel: 4 }, { level: 4 })).toBe(true);
    expect(pokerTournamentRebuyOpen({ rebuyUntilLevel: 4 }, { level: 5 })).toBe(false);
    expect(pokerTournamentRebuyOpen({ rebuyUntilLevel: 0 }, { level: 1 })).toBe(false);
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
