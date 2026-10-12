import { describe, expect, it } from 'vitest';
import { eloJourneyChartSummary, filterEloJourneyEvents, type EloJourneyScopedEvent } from '../lib/eloJourneyScope.ts';

const games: EloJourneyScopedEvent[] = [
  { id: 'club:1', source: 'club', date: '2026-06-30T23:00:00Z', elo_before: 1000, elo_after: 1020 },
  { id: 'club:2', source: 'club', date: '2026-07-01T01:00:00Z', elo_before: 1020, elo_after: 1034 },
  { id: 'tournament:t1', source: 'tournament', date: '2026-07-05T19:00:00Z', elo_before: 1034, elo_after: 1019 },
  { id: 'club:3', source: 'club', date: '2026-07-09T19:00:00Z', elo_before: 1019, elo_after: 1039 },
];
const july = { start: Date.parse('2026-07-01T00:00:00Z'), end: Date.parse('2026-08-01T00:00:00Z') };
const formats = new Map([['club:1', 'STANDARD'], ['club:2', 'CASUAL'], ['club:3', 'RATING']]);

describe('personal Elo history scope', () => {
  it('takes only canonical Elo events from the chosen rating season and keeps the beginning-of-season Elo', () => {
    const selected = filterEloJourneyEvents(games, july);
    expect(selected.map((event) => event.id)).toEqual(['club:2', 'tournament:t1', 'club:3']);
    const result = eloJourneyChartSummary(selected, 1000, 1048, true);
    expect(result).toMatchObject({ chart_start: 1020, current: 1048, games: 3, peak: 1039, floor: 1019, net: 19 });
  });

  it('uses actual completed-at date across midnight, not the older Elo replay sort time', () => {
    const lateFinish = { ...games[0], season_date: '2026-07-01T00:10:00Z' };
    expect(filterEloJourneyEvents([lateFinish], july)).toHaveLength(1);
    expect(filterEloJourneyEvents([games[0]], july)).toHaveLength(0);
  });

  it('respects format filtering and legacy STANDARD as CASUAL', () => {
    expect(filterEloJourneyEvents(games, { format: 'CASUAL' }, formats).map((game) => game.id)).toEqual(['club:1', 'club:2']);
    expect(filterEloJourneyEvents(games, { ...july, format: 'RATING' }, formats).map((game) => game.id)).toEqual(['club:3']);
    expect(filterEloJourneyEvents(games, { ...july, format: 'TOURNAMENT' }, formats).map((game) => game.id)).toEqual(['tournament:t1']);
  });

  it('does not include the Elo impact of omitted formats in a filtered total', () => {
    const casual = filterEloJourneyEvents(games, { format: 'CASUAL' }, formats);
    // An intervening rated game would make last.elo_after - first.elo_before incorrect.
    const withGap = [
      { id: 'club:a', source: 'club' as const, date: '2026-07-10', elo_before: 1000, elo_after: 1010 },
      { id: 'club:b', source: 'club' as const, date: '2026-07-11', elo_before: 1050, elo_after: 1060 },
    ];
    expect(casual).toHaveLength(2);
    expect(eloJourneyChartSummary(withGap, 1000, 1060, true).net).toBe(20);
  });

  it('does not invent a season trajectory or modify lifetime Elo for an empty period', () => {
    const selected = filterEloJourneyEvents(games, { start: Date.parse('2026-10-01'), end: Date.parse('2027-01-01') });
    expect(selected).toEqual([]);
    expect(eloJourneyChartSummary(selected, 1000, 1048, true)).toMatchObject({ chart_start: 1048, current: 1048, games: 0, net: 0 });
  });

  it('keeps the original all-time baseline when filters are not chosen', () => {
    expect(eloJourneyChartSummary(games, 1000, 1048, false)).toMatchObject({ chart_start: 1000, current: 1048, games: 4, net: 39 });
  });
});
