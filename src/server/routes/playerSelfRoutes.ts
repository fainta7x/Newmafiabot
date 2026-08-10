import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { getRepositoryPlayerAvatarAsset } from '../../lib/playerAvatarManifest.ts';
import { loadPlayerAchievementProfile } from '../services/playerAchievementsService.ts';
import { loadPlayerGameProfile } from '../services/playerProfileService.ts';

const router = Router();

router.get('/me', async (req, res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    return res.status(401).json({ error: 'Player authentication required.' });
  }

  try {
    const db = (req as any).db;
    const player = await db.get(
      `SELECT id, nickname, full_name, telegram_username, elo, tokens
         FROM players
        WHERE id = ?
        LIMIT 1`,
      [playerId],
    );

    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    const [gameProfile, achievements] = await Promise.all([
      loadPlayerGameProfile(db, playerId),
      loadPlayerAchievementProfile(db, playerId, false),
    ]);

    const repositoryAvatar = getRepositoryPlayerAvatarAsset(playerId);

    return res.json({
      player: {
        id: String(player.id),
        nickname: player.nickname,
        full_name: player.full_name ?? null,
        telegram_username: player.telegram_username ?? null,
        elo: Number(player.elo || 0),
        tokens: Number(player.tokens || 0),
        avatar_url: repositoryAvatar ? `/player-avatars/${encodeURIComponent(repositoryAvatar.file)}` : null,
      },
      achievements,
      tournaments: {
        games: gameProfile.tournamentGames,
        awards: gameProfile.tournamentAwards,
        award_stats: gameProfile.awardStats,
        completed_participations: gameProfile.awardTournaments,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Database error', message: error?.message || String(error) });
  }
});

export default router;
