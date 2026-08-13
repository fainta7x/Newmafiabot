import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import { getEveningResponse } from '../../lib/eveningResponse.ts';
import { loadAnnouncementOverview } from '../services/eveningAnnouncementTrackingService.ts';

const router = Router();
router.use(requireOrganizerAuth);

const safeJsonParse = (value: unknown): any => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return JSON.parse(value); } catch { return null; }
};

const gameCompleted = (row: any, payload: any) => (
  payload?.kind === 'club_evening_protocol'
  && (payload?.protocol?.status === 'completed' || Boolean(payload?.protocol?.winner_team || row.winner_team))
);

const participantView = (row: any, playCount = 0) => ({
  participant_id: String(row.id),
  player_id: String(row.player_id),
  nickname: String(row.nickname || 'Игрок'),
  elo: Number(row.elo || 0),
  response_status: getEveningResponse(row),
  attendance_status: String(row.attendance_status || 'pending'),
  arrival_status: String(row.arrival_status || 'unknown'),
  payment_status: String(row.payment_status || 'unpaid'),
  amount_due: Number(row.amount_due || 0),
  amount_paid: Number(row.amount_paid || 0),
  play_count: playCount,
});

router.get('/command-center', async (req, res) => {
  try {
    const db = (req as any).db;
    const nowIso = new Date().toISOString();
    const wrapupSince = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    const [activeEvening, upcomingEvening, recentCompleted] = await Promise.all([
      db.get(`
        SELECT * FROM game_evenings
         WHERE status = 'active' AND settled_at IS NULL
         ORDER BY starts_at DESC LIMIT 1
      `),
      db.get(`
        SELECT * FROM game_evenings
         WHERE status IN ('draft','published') AND settled_at IS NULL AND starts_at >= ?
         ORDER BY starts_at ASC LIMIT 1
      `, [nowIso]),
      db.get(`
        SELECT * FROM game_evenings
         WHERE (status = 'completed' OR settled_at IS NOT NULL)
           AND COALESCE(settled_at, starts_at) >= ?
         ORDER BY COALESCE(settled_at, starts_at) DESC LIMIT 1
      `, [wrapupSince]),
    ]);

    const evening = activeEvening || upcomingEvening || null;
    const mode: 'active' | 'upcoming' | 'idle' = activeEvening ? 'active' : upcomingEvening ? 'upcoming' : 'idle';

    let snapshot: any = null;
    if (evening) {
      const [participants, gameRows, linkedTasks, announcement] = await Promise.all([
        db.all(`
          SELECT ep.*, p.nickname, p.elo, p.telegram_username, p.phone
            FROM evening_participants ep
            JOIN players p ON p.id = ep.player_id
           WHERE ep.evening_id = ?
           ORDER BY p.nickname COLLATE NOCASE ASC
        `, [evening.id]),
        db.all(`
          SELECT g.id, g.global_game_number, g.winner_team, g.judge_name, g.protocol_text,
                 g.created_at, et.name AS table_name
            FROM games g
       LEFT JOIN evening_tables et ON et.id = g.evening_table_id
           WHERE g.evening_id = ? AND g.archived_at IS NULL
           ORDER BY g.id ASC
        `, [evening.id]),
        db.all(`
          SELECT t.*, p.nickname AS player_nickname
            FROM organizer_tasks t
       LEFT JOIN players p ON p.id = t.player_id
           WHERE t.evening_id = ? AND t.status NOT IN ('done','cancelled')
           ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                    COALESCE(t.due_at, t.created_at) ASC
           LIMIT 12
        `, [evening.id]),
        loadAnnouncementOverview(db, String(evening.id)).catch(() => null),
      ]);

      const games = gameRows.map((row: any, index: number) => {
        const payload = safeJsonParse(row.protocol_text);
        const results = payload?.kind === 'club_evening_protocol' && Array.isArray(payload.player_results)
          ? payload.player_results : [];
        const completed = gameCompleted(row, payload);
        return {
          id: Number(row.id),
          local_number: index + 1,
          global_number: Number(row.global_game_number || 0),
          table_name: row.table_name || null,
          judge_name: row.judge_name || null,
          completed,
          winner_team: payload?.protocol?.winner_team || row.winner_team || null,
          players: results.slice().sort((a: any, b: any) => Number(a.seat_number) - Number(b.seat_number)).map((item: any) => ({
            participant_id: String(item.participant_id || ''),
            player_id: item.player_id ? String(item.player_id) : null,
            nickname: String(item.display_name || 'Игрок'),
            seat_number: Number(item.seat_number || 0),
          })),
        };
      });

      const playCounts = new Map<string, number>();
      for (const game of games.filter((item: any) => item.completed)) {
        for (const player of game.players) {
          if (!player.participant_id) continue;
          playCounts.set(player.participant_id, (playCounts.get(player.participant_id) || 0) + 1);
        }
      }

      const roster = participants.map((row: any) => participantView(row, playCounts.get(String(row.id)) || 0));
      const expected = roster.filter((row: any) => ['going', 'late'].includes(row.response_status));
      const present = roster.filter((row: any) => row.attendance_status === 'attended');
      const pendingAttendance = expected.filter((row: any) => row.attendance_status === 'pending');
      const noShow = roster.filter((row: any) => row.attendance_status === 'no_show');
      const paymentExpected = roster.filter((row: any) => row.attendance_status === 'attended' || ['going', 'late'].includes(row.response_status));
      const unpaid = paymentExpected.filter((row: any) => row.payment_status !== 'waived' && row.amount_due > row.amount_paid);
      const completedGames = games.filter((item: any) => item.completed);
      const draftGames = games.filter((item: any) => !item.completed);
      const currentGame = draftGames.length ? draftGames[draftGames.length - 1] : null;
      const suggestedLineup = present
        .slice()
        .sort((a: any, b: any) => a.play_count - b.play_count || b.elo - a.elo || a.nickname.localeCompare(b.nickname, 'ru'))
        .slice(0, 10);

      const communicationAttention = (announcement?.players || [])
        .filter((player: any) => player.attention_status !== 'answered')
        .sort((a: any, b: any) => {
          const rank: Record<string, number> = { failed: 0, not_sent: 1, unanswered: 2 };
          return (rank[a.attention_status] ?? 9) - (rank[b.attention_status] ?? 9) || a.nickname.localeCompare(b.nickname, 'ru');
        })
        .slice(0, 12)
        .map((player: any) => ({
          player_id: String(player.id),
          nickname: String(player.nickname || 'Игрок'),
          status: String(player.attention_status || 'unanswered'),
          reminder_count: Number(player.reminder_count || 0),
          last_error: player.last_error || null,
        }));

      const blockers: Array<{ kind: string; count: number; label: string }> = [];
      if (pendingAttendance.length) blockers.push({ kind: 'attendance', count: pendingAttendance.length, label: 'Не отмечена явка' });
      if (draftGames.length) blockers.push({ kind: 'games', count: draftGames.length, label: 'Незавершённые игры' });
      if (unpaid.length) blockers.push({ kind: 'payments', count: unpaid.length, label: 'Не закрыты оплаты' });
      if (linkedTasks.length) blockers.push({ kind: 'tasks', count: linkedTasks.length, label: 'Открытые задачи вечера' });

      snapshot = {
        mode,
        evening: {
          id: String(evening.id), title: String(evening.title || 'Игровой вечер'), starts_at: evening.starts_at || null,
          venue: evening.venue || null, format: String(evening.format || 'CASUAL'), status: String(evening.status || 'draft'),
        },
        stats: {
          expected: expected.length,
          present: present.length,
          pending_attendance: pendingAttendance.length,
          no_show: noShow.length,
          unpaid_count: unpaid.length,
          unpaid_amount: unpaid.reduce((sum: number, row: any) => sum + Math.max(0, row.amount_due - row.amount_paid), 0),
          games: games.length,
          completed_games: completedGames.length,
          draft_games: draftGames.length,
          open_tasks: linkedTasks.length,
          ready_to_close: mode === 'active' && pendingAttendance.length === 0 && draftGames.length === 0,
        },
        current_game: currentGame,
        suggested_lineup: suggestedLineup,
        roster: {
          expected,
          present,
          pending_attendance: pendingAttendance,
          unpaid,
        },
        attention: {
          communication: communicationAttention,
          tasks: linkedTasks,
        },
        blockers,
      };
    }

    let wrapup: any = null;
    if (recentCompleted) {
      const [unpaidRows, openTasks] = await Promise.all([
        db.all(`
          SELECT ep.id, ep.player_id, p.nickname, ep.amount_due, ep.amount_paid, ep.payment_status
            FROM evening_participants ep
            JOIN players p ON p.id = ep.player_id
           WHERE ep.evening_id = ? AND ep.attendance_status = 'attended'
             AND ep.payment_status != 'waived' AND ep.amount_due > ep.amount_paid
           ORDER BY p.nickname COLLATE NOCASE ASC
        `, [recentCompleted.id]),
        db.all(`
          SELECT t.*, p.nickname AS player_nickname
            FROM organizer_tasks t
       LEFT JOIN players p ON p.id = t.player_id
           WHERE t.evening_id = ? AND t.status NOT IN ('done','cancelled')
           ORDER BY COALESCE(t.due_at, t.created_at) ASC
           LIMIT 10
        `, [recentCompleted.id]),
      ]);
      if (unpaidRows.length || openTasks.length) {
        wrapup = {
          evening: { id: String(recentCompleted.id), title: String(recentCompleted.title || 'Игровой вечер'), starts_at: recentCompleted.starts_at || null },
          unpaid: unpaidRows.map((row: any) => ({ ...row, amount_due: Number(row.amount_due || 0), amount_paid: Number(row.amount_paid || 0) })),
          tasks: openTasks,
        };
      }
    }

    return res.json({ snapshot, wrapup, generated_at: new Date().toISOString() });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось собрать пульт организатора' });
  }
});

export default router;
