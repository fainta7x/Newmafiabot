import type { DatabaseWrapper } from './index.ts';

const TOURNAMENT_TITLE = 'Турнир Богдана 1.08';
const TOURNAMENT_DATE_PREFIX = '2026-08-01';
const PLAYER_NICKNAME = 'Богданчик';
const GAME_NUMBER = 10;
const CORRECT_JUDGE_BONUS = 0.7;
export const BOGDANA_FINAL_CORRECTION_MIGRATION = 'historical_bogdana_final_correction_v1';

/**
 * Repairs one confirmed historical result without restoring any snapshot.
 *
 * This is intentionally narrow and idempotent: the correction is applied only
 * to the canonical Bogdana tournament, game #10, Bogdanchik result row. No
 * protocol, seating, Elo, tournament status or any other player's data changes.
 */
export async function applyBogdanaFinalCorrection(db: DatabaseWrapper): Promise<void> {
  const existingMigration = await db.get<{ status?: string }>(
    'SELECT status FROM migration_history WHERE migration_name = ? LIMIT 1',
    [BOGDANA_FINAL_CORRECTION_MIGRATION],
  );
  if (existingMigration?.status === 'completed') return;
  if (existingMigration) {
    throw new Error('Bogdana final correction has an unexpected existing migration status.');
  }

  const tournament = await db.get<any>(
    `SELECT id, title, date
       FROM tournaments
      WHERE title = ?
        AND CAST(date AS TEXT) LIKE ?
      ORDER BY created_at DESC
      LIMIT 1`,
    [TOURNAMENT_TITLE, `${TOURNAMENT_DATE_PREFIX}%`],
  );

  if (!tournament?.id) return;

  const game = await db.get<any>(
    `SELECT id
       FROM tournament_games
      WHERE tournament_id = ? AND game_number = ?
      LIMIT 1`,
    [tournament.id, GAME_NUMBER],
  );
  if (!game?.id) {
    console.warn('[DATA CORRECTION] Bogdana game #10 not found; no data changed.');
    return;
  }

  const participant = await db.get<any>(
    `SELECT tp.id
       FROM tournament_participants tp
       LEFT JOIN players p ON p.id = tp.player_id
      WHERE tp.tournament_id = ?
        AND (tp.display_name = ? OR p.nickname = ?)
      LIMIT 1`,
    [tournament.id, PLAYER_NICKNAME, PLAYER_NICKNAME],
  );
  if (!participant?.id) {
    console.warn('[DATA CORRECTION] Bogdanchik participant not found; no data changed.');
    return;
  }

  const result = await db.get<any>(
    `SELECT id, judge_bonus
       FROM tournament_game_player_results
      WHERE game_id = ? AND participant_id = ?
      LIMIT 1`,
    [game.id, participant.id],
  );
  if (!result?.id) {
    console.warn('[DATA CORRECTION] Bogdanchik game #10 result row not found; no data invented.');
    return;
  }

  const currentBonus = Number(result.judge_bonus || 0);
  const alreadyCorrect = Math.abs(currentBonus - CORRECT_JUDGE_BONUS) < 0.0001;
  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    if (!alreadyCorrect) {
      await tx.run(
        `UPDATE tournament_game_player_results
            SET judge_bonus = ?
          WHERE id = ?`,
        [CORRECT_JUDGE_BONUS, result.id],
      );
    }
    await tx.run(
      `INSERT INTO migration_history
        (id, migration_name, status, details_json, executed_at)
       VALUES (?, ?, 'completed', ?, ?)`,
      [
        BOGDANA_FINAL_CORRECTION_MIGRATION,
        BOGDANA_FINAL_CORRECTION_MIGRATION,
        JSON.stringify({
          tournament_id: String(tournament.id),
          game_number: GAME_NUMBER,
          participant_id: String(participant.id),
          previous_judge_bonus: currentBonus,
          target_judge_bonus: CORRECT_JUDGE_BONUS,
          already_correct: alreadyCorrect,
        }),
        now,
      ],
    );
  });

  if (!alreadyCorrect) {
    console.log(
      `[DATA CORRECTION] ${TOURNAMENT_TITLE}: ${PLAYER_NICKNAME}, game #${GAME_NUMBER}, judge bonus ${currentBonus} -> ${CORRECT_JUDGE_BONUS}`,
    );
  }
}
