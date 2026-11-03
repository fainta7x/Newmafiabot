import { buildColourReading, type ColourReading, type ColourReadingListKey } from '../../lib/colourReading.ts';
import { loadStatGames } from './gameStatisticsService.ts';

export interface ColourReadingResponse {
  games: number;
  lists: Record<ColourReadingListKey, Array<{ playerId: string; nickname: string; count: number }>>;
}

/** «Читать цвет» of one player with nicknames; read-only (rules: BUSINESS_RULES «"Обучение": reading colours»). */
export async function loadColourReading(db: any, playerId: string): Promise<ColourReadingResponse> {
  const games = await loadStatGames(db);
  const reading: ColourReading = buildColourReading(games, playerId);
  const { games: count, ...lists } = reading;
  const ids = [...new Set(Object.values(lists).flat().map((entry) => entry.playerId))];
  const rows = ids.length
    ? await db.all(`SELECT id, nickname FROM players WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
    : [];
  const names = new Map<string, string>(rows.map((row: any) => [String(row.id), String(row.nickname || 'Без ника')]));
  const named = Object.fromEntries(Object.entries(lists).map(([key, entries]) => [key,
    entries.map((entry) => ({ ...entry, nickname: names.get(entry.playerId) || 'Без ника' }))])) as ColourReadingResponse['lists'];
  return { games: count, lists: named };
}
