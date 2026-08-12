import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import { loadCompletedGameSnapshots } from '../services/clubGameAnalyticsService.ts';

const router = Router();
router.use(requireOrganizerAuth);

const rate = (wins: number, games: number) => games ? Math.round((wins / games) * 100) : 0;

router.post('/table-scouting', async (req, res) => {
  const participantIds = Array.isArray(req.body?.participant_ids)
    ? [...new Set(req.body.participant_ids.map((value: unknown) => String(value || '').trim()).filter(Boolean))].slice(0, 10)
    : [];
  if (!participantIds.length) return res.status(400).json({ error: 'Не выбраны игроки для разведки стола' });

  try {
    const db = (req as any).db;
    const placeholders = participantIds.map(() => '?').join(',');
    const participants = await db.all(`
      SELECT ep.id AS participant_id, ep.player_id, p.nickname, p.elo
        FROM evening_participants ep
        JOIN players p ON p.id = ep.player_id
       WHERE ep.id IN (${placeholders})
    `, participantIds);
    if (!participants.length) return res.status(404).json({ error: 'Игроки стола не найдены' });

    const snapshots = await loadCompletedGameSnapshots(db);
    const byPlayer = new Map<string, { games: number; wins: number; last5: boolean[] }>();
    for (const participant of participants) {
      const playerId = String(participant.player_id);
      const games = snapshots.flatMap((game) => {
        const result = game.players.find((item) => item.player_id === playerId);
        return result ? [{ dateMs: game.dateMs, won: result.won }] : [];
      }).sort((a, b) => b.dateMs - a.dateMs);
      byPlayer.set(playerId, {
        games: games.length,
        wins: games.filter((game) => game.won).length,
        last5: games.slice(0, 5).map((game) => game.won),
      });
    }

    const players = participants.map((participant: any) => {
      const playerId = String(participant.player_id);
      const stat = byPlayer.get(playerId) || { games: 0, wins: 0, last5: [] };
      return {
        participant_id: String(participant.participant_id),
        player_id: playerId,
        nickname: String(participant.nickname || 'Игрок'),
        elo: Number(participant.elo || 0),
        games: stat.games,
        wins: stat.wins,
        win_rate: rate(stat.wins, stat.games),
        recent_form: stat.last5,
        avatar_url: `/api/player/players/${encodeURIComponent(playerId)}/avatar`,
      };
    }).sort((a: any, b: any) => b.elo - a.elo || b.games - a.games);

    const elos = players.map((player: any) => Number(player.elo || 0));
    const averageElo = elos.length ? elos.reduce((sum: number, value: number) => sum + value, 0) / elos.length : 0;
    const averageGames = players.length ? players.reduce((sum: number, player: any) => sum + player.games, 0) / players.length : 0;
    const experienced = players.filter((player: any) => player.games >= 20).length;
    const newcomers = players.filter((player: any) => player.games < 5).length;
    const hotPlayers = players.filter((player: any) => player.recent_form.length >= 3 && player.recent_form.filter(Boolean).length >= 3).length;
    const eloSpread = elos.length ? Math.max(...elos) - Math.min(...elos) : 0;

    const strengthLabel = averageElo >= 1600 ? 'Очень сильный стол' : averageElo >= 1450 ? 'Сильный стол' : averageElo >= 1300 ? 'Сбалансированный стол' : 'Развивающийся стол';
    const experienceLabel = newcomers >= 3 ? 'Много новых игроков' : experienced >= 6 ? 'Очень опытный состав' : 'Смешанный опыт';

    return res.json({
      selected: players.length,
      summary: {
        average_elo: Math.round(averageElo),
        elo_spread: Math.round(eloSpread),
        average_games: Math.round(averageGames * 10) / 10,
        experienced_players: experienced,
        newcomers,
        hot_players: hotPlayers,
        strength_label: strengthLabel,
        experience_label: experienceLabel,
      },
      players,
      notes: [
        `${strengthLabel}: средний Elo ${Math.round(averageElo)}.`,
        `${experienceLabel}: в среднем ${Math.round(averageGames * 10) / 10} завершённых игр на игрока.`,
        eloSpread >= 300 ? `Большой разброс Elo: ${Math.round(eloSpread)} пунктов.` : null,
        hotPlayers >= 3 ? `${hotPlayers} игрока(ов) выиграли минимум 3 из последних 5.` : null,
      ].filter(Boolean),
      meta: {
        safety: 'Разведка не показывает и не прогнозирует скрытые роли. Используются только открытые исторические результаты и текущий Elo.',
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось собрать разведку стола' });
  }
});

export default router;
