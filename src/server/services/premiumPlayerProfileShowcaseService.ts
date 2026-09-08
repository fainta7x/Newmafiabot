import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { loadPlayerAchievementProfile } from './playerAchievementsService.ts';
import { loadPlayerGameProfile } from './playerProfileService.ts';
import { listVerifiedAwards, syncTrustedTournamentAwards } from './playerVerifiedAwardsService.ts';

const dateTime = (value: unknown) => {
  const time = value ? new Date(String(value)).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : 0;
};

export async function loadPremiumProfileShowcase(db: DatabaseWrapper, playerId: string, isSelf: boolean) {
  await syncTrustedTournamentAwards(db, playerId);
  const [player, awards, achievements, profile, manualMilestones] = await Promise.all([
    db.get<any>('SELECT id, created_at FROM players WHERE id=? LIMIT 1', [playerId]),
    listVerifiedAwards(db, playerId, false),
    loadPlayerAchievementProfile(db, playerId, isSelf),
    loadPlayerGameProfile(db, playerId),
    db.all<any>("SELECT id,title,description,milestone_date,icon,source,created_at FROM player_club_milestones WHERE player_id=? AND verification_status='verified' ORDER BY COALESCE(milestone_date,created_at) DESC", [playerId]),
  ]);
  if (!player) throw new Error('Игрок не найден');

  const completedGames = [...profile.clubGames, ...profile.tournamentGames]
    .filter((game) => game.status === 'completed' && game.winner_team)
    .sort((a, b) => dateTime(a.date) - dateTime(b.date));
  const earnedAchievements = achievements.categories
    .flatMap((category) => category.achievements.map((achievement) => ({ ...achievement, category_name: category.name })))
    .filter((achievement) => achievement.earned)
    .sort((a, b) => dateTime(b.earned_at) - dateTime(a.earned_at));

  const timeline: Array<{ id: string; type: string; date: string | null; icon: string; title: string; description: string | null }> = [];
  if (player.created_at) timeline.push({ id: 'joined', type: 'joined', date: String(player.created_at), icon: '◆', title: 'Вступление в клуб', description: 'Начало истории игрока в 2LA Noire.' });
  for (const item of manualMilestones) timeline.push({ id: String(item.id), type: 'milestone', date: item.milestone_date || item.created_at || null, icon: item.icon || '◆', title: String(item.title), description: item.description || null });
  for (const award of awards) timeline.push({ id: `award:${award.id}`, type: 'award', date: award.award_date || award.created_at || null, icon: '🏆', title: award.title, description: [award.tournament_name, award.place_result].filter(Boolean).join(' · ') || null });
  for (const achievement of earnedAchievements) timeline.push({ id: `achievement:${achievement.id}`, type: 'achievement', date: achievement.earned_at || null, icon: achievement.icon || '🏅', title: achievement.name, description: achievement.category_name || null });

  for (const threshold of [1, 10, 25, 50, 100, 250]) {
    if (completedGames.length < threshold) continue;
    const game = completedGames[threshold - 1];
    timeline.push({ id: `games:${threshold}`, type: 'games', date: game?.date || null, icon: '🎭', title: threshold === 1 ? 'Первая завершённая игра' : `${threshold} завершённых игр`, description: game?.title || null });
  }

  timeline.sort((a, b) => dateTime(b.date) - dateTime(a.date) || a.id.localeCompare(b.id));
  const sortedAwards = awards.slice().sort((a: any, b: any) => {
    const aPin = Number(a.pinned_position || 0); const bPin = Number(b.pinned_position || 0);
    if (aPin && bPin) return aPin - bPin;
    if (aPin) return -1; if (bPin) return 1;
    return dateTime(b.award_date || b.created_at) - dateTime(a.award_date || a.created_at);
  });

  return {
    awards: sortedAwards,
    pinned_awards: sortedAwards.filter((award: any) => Number(award.pinned_position || 0) >= 1 && Number(award.pinned_position || 0) <= 3).slice(0, 3),
    achievements,
    earned_achievements: earnedAchievements,
    timeline,
    stats: {
      verified_awards: awards.length,
      achievements_earned: achievements.earned,
      achievements_total: achievements.total,
      completed_games: completedGames.length,
      manual_milestones: manualMilestones.length,
    },
  };
}

export async function setPinnedVerifiedAwards(db: DatabaseWrapper, playerId: string, awardIds: string[]) {
  const ids = [...new Set(awardIds.map(String).filter(Boolean))];
  if (ids.length > 3) throw new Error('Можно закрепить не больше трёх наград');
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.all<any>(`SELECT id FROM player_verified_awards WHERE player_id=? AND verification_status='verified' AND id IN (${placeholders})`, [playerId, ...ids]);
    if (rows.length !== ids.length) throw new Error('Закреплять можно только проверенные награды этого профиля');
  }
  await db.transaction(async (tx: any) => {
    await tx.run('UPDATE player_verified_awards SET pinned_position=NULL WHERE player_id=?', [playerId]);
    for (let index = 0; index < ids.length; index += 1) {
      await tx.run('UPDATE player_verified_awards SET pinned_position=?, updated_at=? WHERE player_id=? AND id=?', [index + 1, new Date().toISOString(), playerId, ids[index]]);
    }
  });
  return listVerifiedAwards(db, playerId, false);
}

export async function createVerifiedClubMilestone(db: DatabaseWrapper, playerId: string, body: any, actorId: string) {
  const title = String(body?.title || '').trim().slice(0, 160);
  if (!title) throw new Error('Укажи название этапа клубной истории');
  const description = String(body?.description || '').trim().slice(0, 1200) || null;
  const icon = String(body?.icon || '◆').trim().slice(0, 12) || '◆';
  const rawDate = String(body?.milestone_date || '').trim();
  const milestoneDate = rawDate && !Number.isNaN(new Date(rawDate).getTime()) ? rawDate.slice(0, 10) : null;
  const player = await db.get<any>('SELECT id FROM players WHERE id=? LIMIT 1', [playerId]);
  if (!player) throw new Error('Игрок не найден');
  const now = new Date().toISOString();
  const id = `milestone_${crypto.randomUUID()}`;
  await db.run(`INSERT INTO player_club_milestones (id,player_id,title,description,milestone_date,icon,source,verification_status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,'manual','verified',?,?,?)`, [id, playerId, title, description, milestoneDate, icon, actorId, now, now]);
  return db.get<any>('SELECT * FROM player_club_milestones WHERE id=?', [id]);
}
