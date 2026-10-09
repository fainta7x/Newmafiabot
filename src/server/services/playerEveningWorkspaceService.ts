import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';

type GameStatus = 'draft' | 'completed';
type Team = 'red' | 'black' | null;

const parseProtocol = (text: unknown): { protocol: any; player_results: any[] } | null => {
  if (typeof text !== 'string' || !text) return null;
  try {
    const payload = JSON.parse(text);
    if (payload?.kind !== 'club_evening_protocol') return null;
    return { protocol: payload.protocol || {}, player_results: Array.isArray(payload.player_results) ? payload.player_results : [] };
  } catch {
    return null;
  }
};

const team = (value: unknown): Team => value === 'red' ? 'red' : value === 'black' ? 'black' : null;

/**
 * Read-only player projection of an organizer's evening.
 * Never return organizer notes, payment records, draft roles, night checks, votes or raw protocol JSON.
 * Completed-game details are fetched only through the existing, completion-gated /api/player/games/:key.
 */
export async function loadPlayerEveningWorkspace(db: any, eveningId: string, viewerId: string) {
  const [evening, viewer] = await Promise.all([
    db.get(
      'SELECT id, title, starts_at, ends_at, venue, format, status, capacity, settled_at FROM game_evenings WHERE id = ? LIMIT 1',
      [eveningId],
    ),
    db.get('SELECT id, game_level FROM players WHERE id = ? LIMIT 1', [viewerId]),
  ]);

  if (!viewer) throw Object.assign(new Error('Игрок не найден'), { statusCode: 404 });
  if (!evening || !['published', 'active', 'completed'].includes(String(evening.status))) {
    throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
  }

  const isCompleted = evening.status === 'completed' || Boolean(evening.settled_at);
  if (!isCompleted && !playerLevelAllowsEveningFormat(viewer.game_level, evening.format)) {
    throw Object.assign(new Error('Этот формат вечера недоступен для вашего уровня'), { statusCode: 403 });
  }

  const [self, rosterRows, tableRows, gameRows] = await Promise.all([
    db.get(
      `SELECT table_id, response_status, registration_status, arrival_status, attendance_status
         FROM evening_participants WHERE evening_id = ? AND player_id = ? LIMIT 1`,
      [eveningId, viewerId],
    ),
    db.all(
      `SELECT ep.player_id, p.nickname, ep.table_id, ep.response_status, ep.attendance_status
         FROM evening_participants ep
         JOIN players p ON p.id = ep.player_id
        WHERE ep.evening_id = ?
          AND (ep.response_status IN ('going', 'late', 'thinking') OR ep.attendance_status = 'attended')
        ORDER BY CASE WHEN ep.attendance_status = 'attended' THEN 0 ELSE 1 END, p.nickname COLLATE NOCASE`,
      [eveningId],
    ),
    db.all(
      `SELECT id, name, host_name, capacity
         FROM evening_tables WHERE evening_id = ?
        ORDER BY sort_order ASC, created_at ASC`,
      [eveningId],
    ),
    db.all(
      `SELECT g.id, g.global_game_number, g.judge_name, g.protocol_text,
              g.created_at, t.id AS table_id, t.name AS table_name
         FROM games g
         LEFT JOIN evening_tables t ON t.id = g.evening_table_id
        WHERE g.evening_id = ? AND g.archived_at IS NULL
        ORDER BY g.id ASC`,
      [eveningId],
    ),
  ]);

  const roster = rosterRows.map((row: any) => ({
    player_id: String(row.player_id),
    nickname: String(row.nickname || 'Игрок'),
    table_id: row.table_id ? String(row.table_id) : null,
    response_status: String(row.response_status || 'unanswered'),
    attendance_status: String(row.attendance_status || 'pending'),
    is_self: String(row.player_id) === viewerId,
  }));

  const games = gameRows.flatMap((row: any, index: number) => {
    const payload = parseProtocol(row.protocol_text);
    if (!payload) return [];
    const status: GameStatus = payload.protocol.status === 'completed' ? 'completed' : 'draft';
    const winnerTeam = status === 'completed' ? team(payload.protocol.winner_team) : null;
    const players = payload.player_results
      .map((person: any) => ({
        seat_number: Number(person.seat_number || 0),
        player_id: person.player_id ? String(person.player_id) : null,
        nickname: String(person.display_name || `Игрок ${person.seat_number || ''}`),
      }))
      .sort((a: any, b: any) => a.seat_number - b.seat_number);
    const selfSeat = players.find((person: any) => person.player_id === viewerId)?.seat_number || null;
    return [{
      id: Number(row.id),
      game_key: status === 'completed' ? `club:${row.id}` : null,
      local_number: index + 1,
      global_number: Number(row.global_game_number || 0),
      table_id: row.table_id ? String(row.table_id) : null,
      table_name: row.table_name ? String(row.table_name) : null,
      judge_name: row.judge_name ? String(row.judge_name) : null,
      status,
      winner_team: winnerTeam,
      self_seat: selfSeat,
      players,
    }];
  });

  if (isCompleted) {
    const personallyPlayed = games.some((game: any) => game.players.some((person: any) => person.player_id === viewerId));
    const attended = String(self?.attendance_status || '') === 'attended';
    if (!attended && !personallyPlayed) {
      throw Object.assign(new Error('Итоги доступны участникам вечера'), { statusCode: 403 });
    }
  }

  const completedGames = games.filter((game: any) => game.status === 'completed');
  return {
    evening: {
      id: String(evening.id),
      title: String(evening.title || 'Игровой вечер'),
      starts_at: String(evening.starts_at || ''),
      ends_at: evening.ends_at || null,
      venue: evening.venue || null,
      format: String(evening.format || 'CASUAL'),
      status: isCompleted ? 'completed' : String(evening.status),
      capacity: Number(evening.capacity || 0),
    },
    participation: {
      response_status: String(self?.response_status || 'unanswered'),
      registration_status: String(self?.registration_status || 'unanswered'),
      arrival_status: String(self?.arrival_status || 'unknown'),
      attendance_status: String(self?.attendance_status || 'pending'),
      table_id: self?.table_id ? String(self.table_id) : null,
      can_change_selection: !isCompleted && String(self?.attendance_status || 'pending') === 'pending',
    },
    roster,
    tables: tableRows.map((row: any) => ({
      id: String(row.id),
      name: String(row.name || 'Стол'),
      host_name: row.host_name ? String(row.host_name) : null,
      capacity: Number(row.capacity || 0),
      players: roster.filter((person: any) => person.table_id === String(row.id)),
    })),
    games,
    score: {
      red: completedGames.filter((game: any) => game.winner_team === 'red').length,
      black: completedGames.filter((game: any) => game.winner_team === 'black').length,
      completed: completedGames.length,
      running: games.length - completedGames.length,
    },
  };
}
