import type { DatabaseWrapper } from '../../db/index.ts';
import { getBetPoolByGame, openBetPoolForGame, parseRoleSnapshot } from './bettingPoolService.ts';
import { notifyBettingSpectators } from './bettingNotificationService.ts';

export interface ClubGameRoleAssignment {
  seat_number: number;
  role: unknown;
}

/**
 * Betting is enabled by default. Setting LIVE_BETTING_ENABLED=false is the
 * emergency kill switch; it must never disable or weaken game validation.
 */
export const isLiveBettingEnabled = () => process.env.LIVE_BETTING_ENABLED !== 'false';

const canonicalPlayerAppUrl = () => (
  String(process.env.PLAYER_APP_URL || process.env.WEBHOOK_URL || 'https://2la-noire-chagina7x.waw0.amvera.tech')
    .replace(/\/webhook\/?$/, '')
    .replace(/\/$/, '')
);

/**
 * Canonical server-side start lifecycle for a real club-evening game.
 * The betting pool has a UNIQUE(game_id) constraint and openBetPoolForGame returns
 * the existing row before doing any mutation, so repeated starts never reset bets.
 */
export async function startClubGameLifecycle(
  db: DatabaseWrapper,
  input: { gameId: number; roles: ClubGameRoleAssignment[]; webAppUrl?: string },
) {
  const game = await db.get<any>(`
    SELECT id, evening_id, judge_player_id, archived_at
      FROM games WHERE id = ? LIMIT 1
  `, [input.gameId]);
  if (!game) throw new Error('Игра не найдена');
  if (!game.evening_id || game.archived_at) throw new Error('Ставки открываются только для активной клубной игры вечера');
  // New canonical games always have judge_player_id. Refuse to guess by nickname in the
  // start lifecycle because referee eligibility is a safety rule, not a display concern.
  if (!game.judge_player_id) throw new Error('У игры не указан canonical judge_player_id');

  if (!isLiveBettingEnabled()) {
    return {
      pool: null,
      created: false,
      idempotent: true,
      disabled: true,
      degraded: false,
      betting_status: 'disabled' as const,
      notification: { eligible: 0, sent: 0, disabled: true },
    };
  }

  let before;
  let pool: any;
  try {
    before = await getBetPoolByGame(db, input.gameId);
    pool = before || await openBetPoolForGame(db, input.gameId, input.roles);
  } catch (error: any) {
    console.error('[BETS][START] Pool initialization failed; Live Game remains available', {
      game_id: input.gameId,
      error: error?.message || String(error),
    });
    return {
      pool: null,
      created: false,
      idempotent: false,
      disabled: false,
      degraded: true,
      betting_status: 'pool_failed' as const,
      notification: { eligible: 0, sent: 0, failed: 0, skipped: true, reason: 'pool_initialization_failed' },
    };
  }

  const roleSnapshot = parseRoleSnapshot(pool);
  let notification;
  try {
    notification = await notifyBettingSpectators(db, {
      poolId: String(pool.id),
      gameId: input.gameId,
      gameNumber: Number(pool.game_number || 0) || null,
      closesAt: String(pool.closes_at),
      judgePlayerId: String(pool.judge_player_id || game.judge_player_id),
      roleSnapshot,
      webAppUrl: input.webAppUrl || canonicalPlayerAppUrl(),
    });
  } catch (error: any) {
    console.error('[BETS][START] Notification preparation failed; pool stays usable', {
      game_id: input.gameId,
      pool_id: String(pool.id),
      error: error?.message || String(error),
    });
    notification = {
      eligible: 0,
      queued: 0,
      sent: 0,
      failed: 1,
      skipped: true,
      reason: 'notification_preparation_failed',
    };
  }

  return {
    pool,
    created: !before,
    idempotent: Boolean(before),
    disabled: false,
    degraded: notification.reason === 'notification_preparation_failed',
    betting_status: notification.reason === 'notification_preparation_failed' ? 'notification_failed' as const : 'ready' as const,
    notification,
  };
}
