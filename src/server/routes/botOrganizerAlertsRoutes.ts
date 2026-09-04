import { Router } from 'express';
import { botServiceAuth } from '../botServiceAuth.ts';

const router = Router();
router.use(botServiceAuth);

const safeProtocolStatus = (value: unknown): 'draft' | 'completed' => {
  if (typeof value !== 'string' || !value.trim()) return 'draft';
  try {
    const parsed = JSON.parse(value);
    return parsed?.protocol?.status === 'completed' ? 'completed' : 'draft';
  } catch {
    return 'draft';
  }
};

router.get('/organizer-alerts', async (req, res) => {
  try {
    const db = req.db;
    const now = new Date();
    const dueSoon = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const tasks = await db.all(
      `SELECT t.id, t.title, t.description, t.type, t.status, t.priority, t.due_at,
              t.player_id, t.evening_id, p.nickname AS player_nickname, e.title AS evening_title
         FROM organizer_tasks t
    LEFT JOIN players p ON p.id = t.player_id
    LEFT JOIN game_evenings e ON e.id = t.evening_id
        WHERE t.status NOT IN ('done', 'cancelled')
          AND (t.priority = 'high' OR (t.due_at IS NOT NULL AND t.due_at <= ?))
        ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                 CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,
                 t.due_at ASC
        LIMIT 40`,
      [dueSoon],
    );

    const eveningRows = await db.all(
      `SELECT id, title, starts_at, ends_at, timezone, venue, format, status, capacity, default_price
         FROM game_evenings
        WHERE status IN ('published', 'active') AND settled_at IS NULL
        ORDER BY starts_at ASC`,
    );

    const evenings = [];
    for (const evening of eveningRows) {
      const participants = await db.all(
        `SELECT ep.id, ep.player_id, p.nickname, ep.response_status, ep.registration_status,
                ep.attendance_status, ep.arrival_status, ep.payment_status,
                ep.amount_due, ep.amount_paid
           FROM evening_participants ep
           JOIN players p ON p.id = ep.player_id
          WHERE ep.evening_id = ?
          ORDER BY p.nickname COLLATE NOCASE ASC`,
        [evening.id],
      );

      const attending = participants.filter((p: any) => ['going', 'late'].includes(String(p.response_status || '')));
      const thinking = participants.filter((p: any) => String(p.response_status || '') === 'thinking');
      const unanswered = participants.filter((p: any) => ['unanswered', ''].includes(String(p.response_status || '')));
      const unresolvedAttendance = attending.filter((p: any) => String(p.attendance_status || 'pending') === 'pending');
      const unpaid = attending.filter((p: any) => {
        const due = Math.max(0, Number(p.amount_due || 0));
        const paid = Math.max(0, Number(p.amount_paid || 0));
        return due > paid && !['paid', 'waived'].includes(String(p.payment_status || ''));
      }).map((p: any) => ({
        player_id: p.player_id,
        nickname: p.nickname,
        amount_due: Math.max(0, Number(p.amount_due || 0)),
        amount_paid: Math.max(0, Number(p.amount_paid || 0)),
        payment_status: p.payment_status,
      }));

      const gameRows = await db.all(
        `SELECT id, global_game_number, winner_team, protocol_text, archived_at
           FROM games
          WHERE evening_id = ? AND archived_at IS NULL
          ORDER BY global_game_number ASC, id ASC`,
        [evening.id],
      );
      const games = gameRows.map((game: any) => ({
        id: game.id,
        global_game_number: game.global_game_number,
        status: safeProtocolStatus(game.protocol_text),
      }));

      evenings.push({
        ...evening,
        attending_count: attending.length,
        thinking_count: thinking.length,
        unanswered_count: unanswered.length,
        thinking_players: thinking.map((p: any) => ({ player_id: p.player_id, nickname: p.nickname })),
        unresolved_attendance_count: unresolvedAttendance.length,
        unresolved_attendance_players: unresolvedAttendance.map((p: any) => ({ player_id: p.player_id, nickname: p.nickname })),
        unpaid,
        game_count: games.length,
        draft_games: games.filter((game: any) => game.status === 'draft'),
        completed_game_count: games.filter((game: any) => game.status === 'completed').length,
      });
    }

    return res.json({
      generated_at: now.toISOString(),
      tasks,
      evenings,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось собрать уведомления организатора' });
  }
});

export default router;
