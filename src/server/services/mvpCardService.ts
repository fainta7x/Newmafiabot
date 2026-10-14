import type { DatabaseWrapper } from '../../db/index.ts';
import { dateLabel, loadAvatars } from './clubResultData.ts';
import { mvpResultSvg, mvpVoteSvg, renderPng } from './clubResultImages.ts';
import { EVENING_VOTING_WINDOW_MS } from './clubYearAwardsService.ts';

/**
 * The pictures of the «MVP вечера» posts and personal messages (owner, 2026-10-14: «только текст» was poor). Both return
 * `null` when a picture cannot be made, so the caller sends the text alone.
 */
const moscowDayTime = (ms: number) => new Date(ms).toLocaleString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

export async function buildMvpVoteCard(db: DatabaseWrapper, eveningId: string): Promise<Buffer | null> {
  try {
    const evening = await db.get<any>('SELECT title, starts_at, settled_at, updated_at FROM game_evenings WHERE id = ?', [eveningId]);
    if (!evening) return null;
    const nominees = await db.all<any>(`
      SELECT p.id, p.nickname FROM evening_participants ep JOIN players p ON p.id = ep.player_id
       WHERE ep.evening_id = ? AND ep.attendance_status = 'attended' ORDER BY p.nickname COLLATE NOCASE ASC
    `, [eveningId]);
    if (nominees.length < 2) return null;
    const base = new Date(String(evening.settled_at || evening.updated_at || evening.starts_at || '')).getTime();
    const avatars = await loadAvatars(db, nominees.map((nominee: any) => String(nominee.id)));
    return renderPng(mvpVoteSvg({
      eveningTitle: String(evening.title || 'Игровой вечер'),
      dateLabel: dateLabel(evening.starts_at) || '',
      deadlineLabel: Number.isFinite(base) ? `Голосование до ${moscowDayTime(base + EVENING_VOTING_WINDOW_MS)}` : 'Голосование открыто 3 дня',
      candidates: nominees.map((nominee: any) => ({ nickname: String(nominee.nickname || 'Игрок'), avatar: avatars.get(String(nominee.id)) || null })),
    }));
  } catch (error) {
    console.warn('[MVP CARD] vote card failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function buildMvpResultCard(
  db: DatabaseWrapper,
  eveningId: string,
  winner: { player_id: string; nickname: string; votes: number },
  totalVotes: number,
  reason: string,
): Promise<Buffer | null> {
  try {
    const evening = await db.get<any>('SELECT title, starts_at FROM game_evenings WHERE id = ?', [eveningId]);
    if (!evening) return null;
    const others = await db.all<any>(
      `SELECT v.nominee_player_id AS player_id, p.nickname, COUNT(*) AS votes
         FROM evening_player_votes v JOIN players p ON p.id = v.nominee_player_id
        WHERE v.evening_id = ? AND v.category = 'best_player' AND v.nominee_player_id <> ?
        GROUP BY v.nominee_player_id, p.nickname ORDER BY votes DESC, p.nickname COLLATE NOCASE LIMIT 4`,
      [eveningId, winner.player_id],
    );
    const avatars = await loadAvatars(db, [winner.player_id, ...others.map((row: any) => String(row.player_id))]);
    return renderPng(mvpResultSvg({
      eveningTitle: String(evening.title || 'Игровой вечер'), dateLabel: dateLabel(evening.starts_at) || '', totalVotes, reason,
      winner: { nickname: winner.nickname, avatar: avatars.get(winner.player_id) || null, votes: winner.votes },
      others: others.map((row: any) => ({ nickname: String(row.nickname || 'Игрок'), avatar: avatars.get(String(row.player_id)) || null, votes: Number(row.votes || 0) })),
    }));
  } catch (error) {
    console.warn('[MVP CARD] result card failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}
