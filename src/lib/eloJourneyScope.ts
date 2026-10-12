import { normalizeEveningFormat, type EveningFormat } from './eveningFormat.ts';

export type EloJourneyScopedEvent = {
  id: string;
  source: 'club' | 'tournament';
  date: string;
  /** Actual game completion date for season inclusion, distinct from Elo replay sort date. */
  season_date?: string;
  elo_before: number;
  elo_after: number;
};

type Scope = { start?: number; end?: number; format?: EveningFormat | 'all' };

export const filterEloJourneyEvents = <T extends EloJourneyScopedEvent>(
  events: T[],
  scope: Scope,
  clubFormats: ReadonlyMap<string, string> = new Map(),
): T[] => events.filter((event) => {
  if (scope.start !== undefined && scope.end !== undefined) {
    const date = new Date(event.season_date || event.date).getTime();
    if (!Number.isFinite(date) || date < scope.start || date >= scope.end) return false;
  }
  if (!scope.format || scope.format === 'all') return true;
  const storedFormat = event.source === 'club' ? clubFormats.get(event.id) : null;
  if (event.source === 'club' && !storedFormat) return false;
  const format = event.source === 'tournament' ? 'TOURNAMENT' : normalizeEveningFormat(storedFormat);
  return format === scope.format;
});

export const eloJourneyChartSummary = (
  events: EloJourneyScopedEvent[], seed: number, current: number, scoped: boolean,
) => {
  // The lifetime rating is always the real current Elo, even in a filtered view.
  // The season graph starts at the Elo *before* the first selected game, not the
  // lifetime seed: its shape and the season delta must represent the same games.
  const chartStart = scoped ? events[0]?.elo_before ?? current : seed;
  const values = [chartStart, ...events.map((event) => event.elo_after)].filter(Number.isFinite);
  // Format filters may skip intervening rated games. Only the selected games' own deltas belong in the total.
  const net = events.reduce((sum, event) => sum + (event.elo_after - event.elo_before), 0);
  return {
    chart_start: chartStart,
    games: events.length,
    current,
    peak: Math.max(...values),
    floor: Math.min(...values),
    net,
    last_delta: events.length ? events[events.length - 1].elo_after - events[events.length - 1].elo_before : 0,
  };
};
