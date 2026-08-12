import { Router } from 'express';
import { loadCompletedGameSnapshots } from '../services/clubGameAnalyticsService.ts';

const router = Router();

const safeParse = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return JSON.parse(value); } catch { return null; }
};

const scoreFor = (games: Array<{ winner_team: 'red' | 'black' }>) => games.reduce((score, game) => {
  if (game.winner_team === 'red') score.red += 1;
  else score.black += 1;
  return score;
}, { red: 0, black: 0 });

const playerOfEvening = (games: any[]) => {
  const stats = new Map<string, { player_id: string; nickname: string; games: number; wins: number }>();
  for (const game of games) {
    for (const player of game.players) {
      const current = stats.get(player.player_id) || { player_id: player.player_id, nickname: player.nickname, games: 0, wins: 0 };
      current.nickname = player.nickname || current.nickname;
      current.games += 1;
      if (player.won) current.wins += 1;
      stats.set(player.player_id, current);
    }
  }
  const all = [...stats.values()];
  const pool = all.some((item) => item.games >= 2) ? all.filter((item) => item.games >= 2) : all;
  const winner = pool.sort((a, b) => b.wins - a.wins || (b.wins / Math.max(1, b.games)) - (a.wins / Math.max(1, a.games)) || b.games - a.games)[0];
  return winner ? {
    ...winner,
    win_rate: Math.round((winner.wins / Math.max(1, winner.games)) * 100),
    avatar_url: `/api/player/players/${encodeURIComponent(winner.player_id)}/avatar`,
  } : null;
};

router.get('/live', async (req, res) => {
  try {
    const db = (req as any).db;
    const snapshots = await loadCompletedGameSnapshots(db);
    const active = await db.get(`
      SELECT id, title, starts_at, venue, format, status
        FROM game_evenings
       WHERE status = 'active' AND settled_at IS NULL
       ORDER BY datetime(starts_at) DESC
       LIMIT 1
    `);

    if (active) {
      const games = snapshots.filter((game) => game.source === 'club' && game.event_id === String(active.id)).sort((a, b) => a.dateMs - b.dateMs);
      const score = scoreFor(games);
      const attendance = await db.get(`SELECT COUNT(*) AS count FROM evening_participants WHERE evening_id = ? AND attendance_status = 'attended'`, [active.id]);
      const currentRow = await db.get(`
        SELECT id, global_game_number, protocol_text, created_at
          FROM games
         WHERE evening_id = ? AND archived_at IS NULL
         ORDER BY id DESC
         LIMIT 1
      `, [active.id]);
      let current: any = null;
      if (currentRow) {
        const payload = safeParse(currentRow.protocol_text);
        const completed = payload?.protocol?.status === 'completed' || Boolean(payload?.protocol?.winner_team);
        if (!completed && Array.isArray(payload?.player_results)) {
          current = {
            id: String(currentRow.id),
            game_number: Number(currentRow.global_game_number || games.length + 1),
            created_at: currentRow.created_at || null,
            players: payload.player_results
              .map((player: any) => ({ seat_number: Number(player.seat_number || 0), nickname: String(player.display_name || player.nickname || 'Игрок') }))
              .sort((a: any, b: any) => a.seat_number - b.seat_number),
          };
        }
      }
      return res.json({
        mode: 'live',
        generated_at: new Date().toISOString(),
        evening: {
          id: String(active.id),
          title: String(active.title || '2LA noire'),
          starts_at: active.starts_at,
          venue: active.venue || null,
          format: active.format || null,
          score,
          completed_games: games.length,
          attended: Number(attendance?.count || 0),
          current_game: current,
          recent_results: games.slice(-4).reverse().map((game, index) => ({
            game_key: game.id,
            local_number: games.length - index,
            winner_team: game.winner_team,
          })),
        },
        safety: 'До завершения текущей партии публичный экран не получает роли, проверки, голосования или другую закрытую игровую информацию.',
      });
    }

    const latestEvening = await db.get(`
      SELECT id, title, starts_at, settled_at, venue, format
        FROM game_evenings
       WHERE status = 'completed' OR settled_at IS NOT NULL
       ORDER BY datetime(COALESCE(settled_at, starts_at)) DESC
       LIMIT 1
    `);
    if (latestEvening) {
      const baseMs = new Date(String(latestEvening.settled_at || latestEvening.starts_at)).getTime();
      const ageMs = Date.now() - baseMs;
      if (Number.isFinite(ageMs) && ageMs <= 18 * 60 * 60 * 1000) {
        const games = snapshots.filter((game) => game.source === 'club' && game.event_id === String(latestEvening.id)).sort((a, b) => a.dateMs - b.dateMs);
        const score = scoreFor(games);
        const attendance = await db.get(`SELECT COUNT(*) AS count FROM evening_participants WHERE evening_id = ? AND attendance_status = 'attended'`, [latestEvening.id]);
        return res.json({
          mode: 'recap',
          generated_at: new Date().toISOString(),
          evening: {
            id: String(latestEvening.id),
            title: String(latestEvening.title || '2LA noire'),
            starts_at: latestEvening.starts_at,
            settled_at: latestEvening.settled_at,
            venue: latestEvening.venue || null,
            format: latestEvening.format || null,
            score,
            games: games.length,
            attended: Number(attendance?.count || 0),
            player_of_evening: playerOfEvening(games),
            results: games.map((game, index) => ({ local_number: index + 1, winner_team: game.winner_team })),
          },
        });
      }
    }

    const nextEvening = await db.get(`
      SELECT id, title, starts_at, venue, format
        FROM game_evenings
       WHERE status IN ('published', 'draft') AND settled_at IS NULL AND datetime(starts_at) >= datetime('now')
       ORDER BY datetime(starts_at) ASC
       LIMIT 1
    `);
    return res.json({
      mode: 'idle',
      generated_at: new Date().toISOString(),
      next_evening: nextEvening ? {
        id: String(nextEvening.id), title: String(nextEvening.title || '2LA noire'), starts_at: nextEvening.starts_at, venue: nextEvening.venue || null, format: nextEvening.format || null,
      } : null,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить live-экран' });
  }
});

export default router;
