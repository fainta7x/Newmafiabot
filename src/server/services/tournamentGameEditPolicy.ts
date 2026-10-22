import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureTournamentEveningSchema } from '../../db/ensureTournamentEveningSchema.ts';

export type TournamentGameEditKind = 'judge' | 'roles' | 'seats';

/**
 * What an organizer may change in a tournament game (owner, 2026-10-22: «чем гибче и быстрее всё правится, тем
 * лучше; почему в игре нельзя что-то изменить, если мисскликнул»). One rule for judge, roles and seats:
 * - a game that has not started: everything;
 * - a running game: everything until its protocol is completed;
 * - a completed game: the judge at once; roles and seats after «Исправить» reopens the game;
 * - a completed tournament: «Исправить» first returns it to correction.
 * Another game running at the same time never blocks an edit.
 */
export async function tournamentGameEditPermission(
  db: DatabaseWrapper,
  tournament: { status: string },
  game: { id: string; status: string },
  kind: TournamentGameEditKind,
): Promise<{ allowed: boolean; error?: string }> {
  if (tournament.status === 'completed') {
    return { allowed: false, error: 'Турнир завершён. Нажмите «Исправить» на игре — турнир откроется для исправления' };
  }
  if (!['draft', 'active', 'correction'].includes(String(tournament.status))) {
    return { allowed: false, error: 'Изменение игры запрещено в текущем статусе турнира' };
  }
  if (game.status === 'planned') return { allowed: true };
  if (game.status === 'active') {
    const protocol = await db.get<{ status: string }>('SELECT status FROM tournament_game_protocols WHERE game_id = ?', [game.id]);
    if (protocol?.status === 'completed') {
      return { allowed: false, error: 'Протокол игры завершён. Нажмите «Исправить», чтобы открыть игру для правки' };
    }
    return { allowed: true };
  }
  if (game.status === 'completed') {
    if (kind === 'judge') return { allowed: true };
    return { allowed: false, error: 'Игра завершена. Нажмите «Исправить», чтобы открыть её для правки' };
  }
  return { allowed: false, error: 'Изменение игры запрещено' };
}

/** Every correction of a tournament game is kept: who, what and when (tournament_evening_audit). */
export async function recordTournamentGameEdit(
  db: DatabaseWrapper,
  input: { tournamentId: string; gameId: string; action: string; actorId: string | null; payload?: Record<string, unknown> },
) {
  try {
    await ensureTournamentEveningSchema(db);
    await db.run(
      `INSERT INTO tournament_evening_audit (id, tournament_id, player_id, action, actor_type, actor_id, reason, payload_json, created_at)
       VALUES (?, ?, NULL, ?, 'organizer', ?, NULL, ?, ?)`,
      [crypto.randomUUID(), input.tournamentId, input.action, input.actorId, JSON.stringify({ game_id: input.gameId, ...(input.payload || {}) }), new Date().toISOString()],
    );
  } catch (error) {
    // The edit itself already succeeded; a failed history line must not undo it.
    console.error('[TOURNAMENT] correction history write failed:', error instanceof Error ? error.message : String(error));
  }
}
