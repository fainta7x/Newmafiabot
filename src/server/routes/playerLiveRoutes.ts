import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import playerSpeechRecordingRoutes from './playerSpeechRecordingRoutes.ts';

const router = Router();

router.use('/speech-recordings', playerSpeechRecordingRoutes);

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

const safeJsonParse = (value: unknown): any => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeWinner = (value: unknown): 'red' | 'black' | null => {
  const normalized = String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['red', 'красные', 'красная', 'город'].includes(normalized)) return 'red';
  if (['black', 'черные', 'черная', 'мафия'].includes(normalized)) return 'black';
  return null;
};

router.get('/live', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;

  try {
    const db = (req as any).db;
    const evening = await db.get(
      `SELECT id, title, starts_at, venue, format, status
         FROM game_evenings
        WHERE status = 'active' AND settled_at IS NULL
        ORDER BY starts_at DESC
        LIMIT 1`,
    );

    if (!evening) return res.json({ live: null });

    const [gameRows, presentRow] = await Promise.all([
      db.all(
        `SELECT g.id, g.global_game_number, g.winner_team, g.judge_name, g.protocol_text,
                g.created_at, et.name AS table_name
           FROM games g
      LEFT JOIN evening_tables et ON et.id = g.evening_table_id
          WHERE g.evening_id = ? AND g.archived_at IS NULL
          ORDER BY g.id ASC`,
        [evening.id],
      ),
      db.get(
        `SELECT COUNT(*) AS total
           FROM evening_participants
          WHERE evening_id = ? AND attendance_status = 'attended'`,
        [evening.id],
      ),
    ]);

    const games = gameRows.map((row: any, index: number) => {
      const payload = safeJsonParse(row.protocol_text);
      const protocol = payload?.kind === 'club_evening_protocol' ? payload.protocol : null;
      const results = payload?.kind === 'club_evening_protocol' && Array.isArray(payload.player_results)
        ? payload.player_results
        : [];
      const status = protocol?.status === 'completed' ? 'completed' : 'draft';
      const winner = status === 'completed'
        ? normalizeWinner(protocol?.winner_team || row.winner_team)
        : null;

      return {
        id: Number(row.id),
        local_number: index + 1,
        global_number: Number(row.global_game_number || 0),
        table_name: row.table_name || null,
        judge_name: row.judge_name || null,
        created_at: row.created_at || null,
        status,
        winner_team: winner,
        players: results
          .slice()
          .sort((a: any, b: any) => Number(a.seat_number) - Number(b.seat_number))
          .map((item: any) => ({
            seat_number: Number(item.seat_number || 0),
            player_id: item.player_id ? String(item.player_id) : null,
            nickname: String(item.display_name || `Игрок ${item.seat_number || ''}`).trim(),
          })),
      };
    });

    const completed = games.filter((game: any) => game.status === 'completed');
    const currentGame = games.filter((game: any) => game.status !== 'completed').slice(-1)[0] || null;
    const redWins = completed.filter((game: any) => game.winner_team === 'red').length;
    const blackWins = completed.filter((game: any) => game.winner_team === 'black').length;

    return res.json({
      live: {
        evening: {
          id: String(evening.id),
          title: String(evening.title || 'Игровой вечер'),
          starts_at: evening.starts_at || null,
          venue: evening.venue || null,
          format: String(evening.format || 'CASUAL'),
        },
        score: {
          red: redWins,
          black: blackWins,
          completed: completed.length,
          total_created: games.length,
        },
        present_count: Number(presentRow?.total || 0),
        state: currentGame ? 'game' : 'waiting',
        current_game: currentGame,
        recent_results: completed.slice(-3).reverse().map((game: any) => ({
          id: game.id,
          local_number: game.local_number,
          winner_team: game.winner_team,
          table_name: game.table_name,
          judge_name: game.judge_name,
        })),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить live-центр клуба' });
  }
});

export default router;
