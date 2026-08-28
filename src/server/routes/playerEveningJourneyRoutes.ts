import { Router } from 'express';
import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';
import { getEveningResponse } from '../../lib/eveningResponse.ts';
import { getPlayerSessionId } from '../auth.ts';
import { loadPlayerEveningSummaries } from '../services/playerEveningSummaryService.ts';

const router = Router();

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return String(playerId);
};

const safeJsonParse = (value: unknown): any => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return JSON.parse(value); } catch { return null; }
};

const normalizeWinner = (value: unknown): 'red' | 'black' | null => {
  const normalized = String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['red', 'красные', 'красная', 'город'].includes(normalized)) return 'red';
  if (['black', 'черные', 'черная', 'мафия'].includes(normalized)) return 'black';
  return null;
};

const teamFromRole = (value: unknown): 'red' | 'black' | null => {
  const role = String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['citizen', 'sheriff', 'мирный', 'мирный житель', 'красный', 'шериф'].includes(role)) return 'red';
  if (['mafia', 'don', 'мафия', 'маф', 'дон'].includes(role)) return 'black';
  return null;
};

const recapIsFresh = (value: string | null | undefined) => {
  if (!value) return false;
  const at = new Date(value).getTime();
  if (!Number.isFinite(at)) return false;
  const age = Date.now() - at;
  return age >= 0 && age <= 20 * 60 * 60 * 1000;
};

router.get('/evening-journey', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;

  try {
    const db = req.db;
    const player = await db.get('SELECT id, game_level FROM players WHERE id = ? LIMIT 1', [playerId]);
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });

    const active = await db.get(`
      SELECT id, title, starts_at, venue, format, status
        FROM game_evenings
       WHERE status = 'active' AND settled_at IS NULL
       ORDER BY datetime(starts_at) DESC
       LIMIT 1
    `);

    if (active) {
      const [gameRows, presentRow, participant] = await Promise.all([
        db.all(`
          SELECT g.id, g.global_game_number, g.winner_team, g.judge_name, g.protocol_text,
                 g.created_at, et.name AS table_name
            FROM games g
       LEFT JOIN evening_tables et ON et.id = g.evening_table_id
           WHERE g.evening_id = ? AND g.archived_at IS NULL
           ORDER BY g.id ASC
        `, [active.id]),
        db.get(`SELECT COUNT(*) AS total FROM evening_participants WHERE evening_id = ? AND attendance_status = 'attended'`, [active.id]),
        db.get(`
          SELECT id, response_status, registration_status, arrival_status, attendance_status
            FROM evening_participants
           WHERE evening_id = ? AND player_id = ?
           LIMIT 1
        `, [active.id, playerId]),
      ]);

      const games = gameRows.map((row: any, index: number) => {
        const payload = safeJsonParse(row.protocol_text);
        const protocol = payload?.kind === 'club_evening_protocol' ? payload.protocol : null;
        const results = payload?.kind === 'club_evening_protocol' && Array.isArray(payload.player_results)
          ? payload.player_results
          : [];
        const status = protocol?.status === 'completed' ? 'completed' : 'draft';
        const winnerTeam = status === 'completed' ? normalizeWinner(protocol?.winner_team || row.winner_team) : null;
        const players = results
          .slice()
          .sort((a: any, b: any) => Number(a.seat_number) - Number(b.seat_number))
          .map((item: any) => ({
            seat_number: Number(item.seat_number || 0),
            player_id: item.player_id ? String(item.player_id) : null,
            nickname: String(item.display_name || `Игрок ${item.seat_number || ''}`).trim(),
          }));
        const selfResult = results.find((item: any) => String(item?.player_id || '') === playerId) || null;
        const selfTeam = selfResult ? teamFromRole(selfResult.role) : null;
        return {
          id: Number(row.id),
          game_key: `club:${row.id}`,
          local_number: index + 1,
          global_number: Number(row.global_game_number || 0),
          table_name: row.table_name || null,
          judge_name: row.judge_name || null,
          created_at: row.created_at || null,
          status,
          winner_team: winnerTeam,
          players,
          self_played: Boolean(selfResult),
          self_won: status === 'completed' && selfTeam && winnerTeam ? selfTeam === winnerTeam : null,
        };
      });

      const completed = games.filter((game: any) => game.status === 'completed');
      const currentGame = games.filter((game: any) => game.status !== 'completed').slice(-1)[0] || null;
      const selfSeat = currentGame?.players.find((item: any) => item.player_id === playerId) || null;
      const redWins = completed.filter((game: any) => game.winner_team === 'red').length;
      const blackWins = completed.filter((game: any) => game.winner_team === 'black').length;
      const latestSelfGame = completed.slice().reverse().find((game: any) => game.self_played) || null;
      const attendanceStatus = String(participant?.attendance_status || 'pending');
      const responseStatus = getEveningResponse(participant);
      const selfState = selfSeat
        ? 'playing'
        : attendanceStatus === 'attended'
          ? 'waiting'
          : ['going', 'late'].includes(responseStatus)
            ? 'expected'
            : 'watching';

      return res.json({
        journey: {
          phase: 'live',
          evening: {
            id: String(active.id), title: String(active.title || 'Игровой вечер'), starts_at: active.starts_at || null,
            venue: active.venue || null, format: String(active.format || 'CASUAL'),
          },
          participation: {
            response_status: responseStatus,
            attendance_status: attendanceStatus,
            state: selfState,
            seat_number: selfSeat?.seat_number || null,
          },
          score: { red: redWins, black: blackWins, completed: completed.length, total_created: games.length },
          present_count: Number(presentRow?.total || 0),
          current_game: currentGame,
          recent_results: completed.slice(-4).reverse().map((game: any) => ({
            id: game.id,
            game_key: game.game_key,
            local_number: game.local_number,
            winner_team: game.winner_team,
            table_name: game.table_name,
            judge_name: game.judge_name,
            self_played: game.self_played,
            self_won: game.self_won,
          })),
          latest_self_game: latestSelfGame ? {
            game_key: latestSelfGame.game_key,
            local_number: latestSelfGame.local_number,
            won: latestSelfGame.self_won,
          } : null,
        },
      });
    }

    const summaries = await loadPlayerEveningSummaries(db, playerId, 1);
    const latestSummary = summaries[0] || null;
    if (latestSummary && recapIsFresh(latestSummary.settled_at || latestSummary.starts_at)) {
      return res.json({ journey: { phase: 'recap', recap: latestSummary } });
    }

    const upcomingRows = await db.all(`
      SELECT e.id, e.title, e.starts_at, e.venue, e.format, e.default_price,
             ep.response_status, ep.registration_status, ep.arrival_status, ep.attendance_status,
             (SELECT COUNT(*) FROM evening_participants x WHERE x.evening_id = e.id AND x.response_status IN ('going','late')) AS attending_count,
             (SELECT COUNT(*) FROM evening_participants x WHERE x.evening_id = e.id AND x.response_status = 'thinking') AS thinking_count
        FROM game_evenings e
   LEFT JOIN evening_participants ep ON ep.evening_id = e.id AND ep.player_id = ?
       WHERE e.status = 'published'
         AND e.settled_at IS NULL
         AND datetime(e.starts_at) >= datetime('now', '-6 hours')
       ORDER BY datetime(e.starts_at) ASC
       LIMIT 12
    `, [playerId]);
    const upcoming = upcomingRows.find((row: any) => playerLevelAllowsEveningFormat(player.game_level, row.format)) || null;

    if (upcoming) {
      return res.json({
        journey: {
          phase: 'upcoming',
          evening: {
            id: String(upcoming.id), title: String(upcoming.title || 'Игровой вечер'), starts_at: upcoming.starts_at,
            venue: upcoming.venue || null, format: String(upcoming.format || 'CASUAL'), default_price: upcoming.default_price == null ? null : Number(upcoming.default_price),
          },
          participation: {
            response_status: getEveningResponse(upcoming),
            attendance_status: String(upcoming.attendance_status || 'pending'),
          },
          attending_count: Number(upcoming.attending_count || 0),
          thinking_count: Number(upcoming.thinking_count || 0),
        },
      });
    }

    return res.json({ journey: { phase: 'idle' } });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось собрать сценарий игрового вечера' });
  }
});

export default router;
