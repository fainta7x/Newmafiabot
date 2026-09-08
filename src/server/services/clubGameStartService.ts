import type { DatabaseWrapper } from '../../db/index.ts';
import { getBetPoolByGame, openBetPoolForGame, parseRoleSnapshot } from './bettingPoolService.ts';
import { notifyBettingSpectators } from './bettingNotificationService.ts';

export interface ClubGameRoleAssignment {
  seat_number: number;
  role: unknown;
}

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

  const before = await getBetPoolByGame(db, input.gameId);
  const pool: any = before || await openBetPoolForGame(db, input.gameId, input.roles);
  const roleSnapshot = parseRoleSnapshot(pool);
  const notification = await notifyBettingSpectators(db, {
    poolId: String(pool.id),
    gameId: input.gameId,
    gameNumber: Number(pool.game_number || 0) || null,
    closesAt: String(pool.closes_at),
    judgePlayerId: String(pool.judge_player_id || game.judge_player_id),
    roleSnapshot,
    webAppUrl: input.webAppUrl || canonicalPlayerAppUrl(),
  });

  return {
    pool,
    created: !before,
    idempotent: Boolean(before),
    notification,
  };
}
