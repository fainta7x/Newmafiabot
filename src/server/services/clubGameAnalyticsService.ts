export type AnalyticsTeam = 'red' | 'black';

export type AnalyticsPlayerResult = {
  player_id: string;
  nickname: string;
  role: 'citizen' | 'sheriff' | 'mafia' | 'don' | null;
  team: AnalyticsTeam;
  won: boolean;
  seat_number: number;
};

export type CompletedGameSnapshot = {
  id: string;
  source: 'club' | 'tournament';
  event_id: string;
  date: string;
  dateMs: number;
  played_at: string;
  title: string;
  game_number: number;
  winner_team: AnalyticsTeam;
  players: AnalyticsPlayerResult[];
};

const safeJsonParse = (value: unknown): any => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return JSON.parse(value); } catch { return null; }
};

export const normalizeWinner = (value: unknown): AnalyticsTeam | null => {
  const normalized = String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['red', 'красные', 'красная', 'город'].includes(normalized)) return 'red';
  if (['black', 'черные', 'черная', 'мафия'].includes(normalized)) return 'black';
  return null;
};

export const normalizeRole = (value: unknown): AnalyticsPlayerResult['role'] => {
  const role = String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['citizen', 'мирный', 'мирный житель', 'красный'].includes(role)) return 'citizen';
  if (['sheriff', 'шериф'].includes(role)) return 'sheriff';
  if (['mafia', 'мафия', 'маф'].includes(role)) return 'mafia';
  if (['don', 'дон'].includes(role)) return 'don';
  return null;
};

export const teamFromRole = (value: unknown): AnalyticsTeam | null => {
  const role = normalizeRole(value);
  if (role === 'mafia' || role === 'don') return 'black';
  if (role === 'citizen' || role === 'sheriff') return 'red';
  return null;
};

const validDate = (value: unknown): { iso: string; ms: number } | null => {
  if (!value) return null;
  const date = new Date(String(value));
  const ms = date.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return { iso: date.toISOString(), ms };
};

export async function loadCompletedGameSnapshots(db: any): Promise<CompletedGameSnapshot[]> {
  const [clubRows, tournamentRows] = await Promise.all([
    db.all(`
      SELECT g.id, g.evening_id, g.global_game_number, g.game_date, g.created_at,
             g.winner_team, g.protocol_text,
             e.title AS evening_title, e.starts_at AS evening_date
        FROM games g
   LEFT JOIN game_evenings e ON e.id = g.evening_id
       WHERE g.evening_id IS NOT NULL
         AND g.archived_at IS NULL
         AND g.protocol_text IS NOT NULL
    `),
    db.all(`
      SELECT t.id AS tournament_id, tg.id AS game_id, tg.game_number, tg.winner_team, tg.completed_at,
             t.title AS tournament_title, t.date AS tournament_date,
             tp.player_id, p.nickname, tgs.seat_number, tgs.role
        FROM tournament_game_seats tgs
        JOIN tournament_participants tp ON tp.id = tgs.participant_id
        JOIN tournament_games tg ON tg.id = tgs.game_id
        JOIN tournaments t ON t.id = tg.tournament_id
   LEFT JOIN players p ON p.id = tp.player_id
       WHERE tg.status = 'completed'
    `),
  ]);

  const snapshots: CompletedGameSnapshot[] = [];

  for (const row of clubRows) {
    const payload = safeJsonParse(row.protocol_text);
    if (!payload || payload.kind !== 'club_evening_protocol' || payload.protocol?.status !== 'completed' || !Array.isArray(payload.player_results)) continue;
    const winner = normalizeWinner(payload.protocol?.winner_team || row.winner_team);
    const eventDate = validDate(row.evening_date || row.game_date || row.created_at);
    const playedDate = validDate(row.game_date || row.created_at || row.evening_date) || eventDate;
    const eventId = String(row.evening_id || '').trim();
    if (!winner || !eventDate || !playedDate || !eventId) continue;

    const players = payload.player_results.flatMap((result: any) => {
      const playerId = String(result.player_id || '').trim();
      const team = teamFromRole(result.role);
      if (!playerId || !team) return [];
      return [{
        player_id: playerId,
        nickname: String(result.display_name || 'Игрок'),
        role: normalizeRole(result.role),
        team,
        won: team === winner,
        seat_number: Number(result.seat_number || 0),
      } satisfies AnalyticsPlayerResult];
    });
    if (!players.length) continue;

    snapshots.push({
      id: `club:${row.id}`,
      source: 'club',
      event_id: eventId,
      date: eventDate.iso,
      dateMs: playedDate.ms,
      played_at: playedDate.iso,
      title: String(row.evening_title || 'Клубный вечер'),
      game_number: Number(row.global_game_number || 0),
      winner_team: winner,
      players,
    });
  }

  const tournamentByGame = new Map<string, any[]>();
  for (const row of tournamentRows) {
    const key = String(row.game_id);
    const bucket = tournamentByGame.get(key) || [];
    bucket.push(row);
    tournamentByGame.set(key, bucket);
  }

  for (const [gameId, rows] of tournamentByGame.entries()) {
    const head = rows[0];
    const winner = normalizeWinner(head?.winner_team);
    const eventDate = validDate(head?.tournament_date || head?.completed_at);
    const playedDate = validDate(head?.completed_at || head?.tournament_date) || eventDate;
    const eventId = String(head?.tournament_id || '').trim();
    if (!winner || !eventDate || !playedDate || !eventId) continue;
    const players = rows.flatMap((row: any) => {
      const playerId = String(row.player_id || '').trim();
      const team = teamFromRole(row.role);
      if (!playerId || !team) return [];
      return [{
        player_id: playerId,
        nickname: String(row.nickname || 'Игрок'),
        role: normalizeRole(row.role),
        team,
        won: team === winner,
        seat_number: Number(row.seat_number || 0),
      } satisfies AnalyticsPlayerResult];
    });
    if (!players.length) continue;

    snapshots.push({
      id: `tournament:${gameId}`,
      source: 'tournament',
      event_id: eventId,
      date: eventDate.iso,
      dateMs: playedDate.ms,
      played_at: playedDate.iso,
      title: String(head?.tournament_title || 'Турнир'),
      game_number: Number(head?.game_number || 0),
      winner_team: winner,
      players,
    });
  }

  return snapshots.sort((a, b) => b.dateMs - a.dateMs || b.game_number - a.game_number);
}
