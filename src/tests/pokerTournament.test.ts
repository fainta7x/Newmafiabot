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
