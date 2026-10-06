import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { DatabaseWrapper } from './index.ts';

export const UNIFIED_TOURNAMENT_FLOW_MIGRATION = 'tournament_unified_flow_v1';
export const BOGDANA_TOURNAMENT_STAFF_MIGRATION = 'bogdana_tournament_staff_v1';

const BOGDANA_MARK = 'богдан';
const JUDGE_NICKNAME = 'Чагин';
const ORGANIZER_NICKNAME = 'Богданчик';

type Options = {
  /** Where the pre-migration snapshot goes (default: `backups` next to the database file). */
  backupDir?: string;
  /** Tests only: do not take a file snapshot. */
  skipSnapshot?: boolean;
  now?: () => string;
};

const isFileDatabase = (db: DatabaseWrapper) => Boolean(db.dbPath) && db.dbPath !== ':memory:' && !String(db.dbPath).startsWith('file:');

async function markerStatus(db: DatabaseWrapper, name: string): Promise<string | null> {
  const row = await db.get<{ status?: string }>('SELECT status FROM migration_history WHERE migration_name = ? LIMIT 1', [name]);
  return row ? String(row.status || '') : null;
}

/**
 * A standalone copy of the whole database, taken with SQLite's backup API and checked with integrity_check before anything
 * is changed (owner: «сделай снимок БД, чтобы в случае чего безопасно всё вернуть»). Returns the path; throws on any problem,
 * and then nothing is migrated.
 */
async function takeSnapshot(db: DatabaseWrapper, options: Options, stamp: string): Promise<string | null> {
  if (options.skipSnapshot || !isFileDatabase(db)) return null;
  const dir = options.backupDir || process.env.SQLITE_BACKUP_DIR || path.join(path.dirname(String(db.dbPath)), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `pre-tournament-unify-${stamp.replace(/[:.]/g, '-')}.sqlite`);
  await db.sqlite.backup(target);
  if (!fs.existsSync(target) || fs.statSync(target).size === 0) throw new Error('snapshot is empty');
  const Database = (await import('better-sqlite3')).default;
  const copy = new Database(target, { readonly: true, fileMustExist: true });
  try {
    const integrity = copy.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`snapshot integrity_check returned ${String(integrity)}`);
  } finally {
    copy.close();
  }
  return target;
}

/**
 * One tournament format for everybody (owner, 2026-10-06): tournaments made the old way become «tournament evenings» too —
 * their participants become confirmed registrations and the flow flag is set. Games, protocols, results and places are not
 * touched. Every changed value is kept in `migration_history.details_json`, and a file snapshot is taken first.
 */
export async function applyUnifiedTournamentFlowMigration(db: DatabaseWrapper, options: Options = {}): Promise<{ migrated: number; snapshot: string | null }> {
  const status = await markerStatus(db, UNIFIED_TOURNAMENT_FLOW_MIGRATION);
  if (status === 'completed' || status === 'reverted') return { migrated: 0, snapshot: null };
  if (status) throw new Error(`Unexpected migration status: ${status}`);

  const legacy = await db.all<any>(
    `SELECT id, status, registration_closed_at, player_capacity, updated_at FROM tournaments WHERE COALESCE(tournament_evening_flow, 0) = 0`,
  );
  const now = (options.now || (() => new Date().toISOString()))();
  const changes: any[] = [];
  let snapshot: string | null = null;
  if (legacy.length) snapshot = await takeSnapshot(db, options, now);

  await db.transaction(async (tx) => {
    for (const tournament of legacy) {
      const participants = await tx.all<any>(
        'SELECT id, player_id, participant_number FROM tournament_participants WHERE tournament_id = ? ORDER BY participant_number',
        [tournament.id],
      );
      const inserted: string[] = [];
      for (const participant of participants) {
        const exists = await tx.get<any>('SELECT 1 AS found FROM tournament_registrations WHERE tournament_id = ? AND player_id = ? LIMIT 1', [tournament.id, participant.player_id]);
        if (exists) continue;
        const id = crypto.randomUUID();
        const number = Number(participant.participant_number || 0);
        await tx.run(
          `INSERT INTO tournament_registrations (id, tournament_id, player_id, status, slot_number, registered_at, queue_order, updated_at)
           VALUES (?, ?, ?, 'confirmed', ?, ?, ?, ?)`,
          [id, tournament.id, participant.player_id, number >= 1 && number <= 10 ? number : null, tournament.updated_at || now, number || null, now],
        );
        inserted.push(id);
      }
      const capacity = Number(tournament.player_capacity || 10);
      await tx.run(
        `UPDATE tournaments
            SET tournament_evening_flow = 1,
                registration_closed_at = COALESCE(registration_closed_at, ?),
                player_capacity = CASE WHEN ? > COALESCE(player_capacity, 10) THEN ? ELSE player_capacity END
          WHERE id = ?`,
        // An unpublished draft keeps its registration open-ended: closing it would leave no way to publish it.
        [tournament.status === 'draft' ? null : now, participants.length, participants.length, tournament.id],
      );
      changes.push({
        tournament_id: String(tournament.id),
        previous: { tournament_evening_flow: 0, registration_closed_at: tournament.registration_closed_at ?? null, player_capacity: capacity },
        inserted_registration_ids: inserted,
      });
    }
    await tx.run(
      `INSERT INTO migration_history (id, migration_name, status, details_json, executed_at) VALUES (?, ?, 'completed', ?, ?)`,
      [UNIFIED_TOURNAMENT_FLOW_MIGRATION, UNIFIED_TOURNAMENT_FLOW_MIGRATION, JSON.stringify({ snapshot, tournaments: changes }), now],
    );
  });
  if (legacy.length) console.info(`[TOURNAMENTS] ${legacy.length} old-format tournament(s) moved to the unified format; snapshot: ${snapshot || 'none (in-memory database)'}`);
  return { migrated: legacy.length, snapshot };
}

/** Puts every value of the unified-format migration back (registrations it created, flag, closing time, capacity). */
export async function revertUnifiedTournamentFlowMigration(db: DatabaseWrapper): Promise<number> {
  const row = await db.get<{ status?: string; details_json?: string }>('SELECT status, details_json FROM migration_history WHERE migration_name = ? LIMIT 1', [UNIFIED_TOURNAMENT_FLOW_MIGRATION]);
  if (!row || row.status !== 'completed') return 0;
  const details = JSON.parse(String(row.details_json || '{}'));
  const list: any[] = Array.isArray(details.tournaments) ? details.tournaments : [];
  await db.transaction(async (tx) => {
    for (const item of list) {
      for (const id of item.inserted_registration_ids || []) await tx.run('DELETE FROM tournament_registrations WHERE id = ?', [id]);
      await tx.run(
        'UPDATE tournaments SET tournament_evening_flow = ?, registration_closed_at = ?, player_capacity = ? WHERE id = ?',
        [item.previous.tournament_evening_flow, item.previous.registration_closed_at, item.previous.player_capacity, item.tournament_id],
      );
    }
    await tx.run("UPDATE migration_history SET status = 'reverted' WHERE migration_name = ?", [UNIFIED_TOURNAMENT_FLOW_MIGRATION]);
  });
  return list.length;
}

/**
 * Forced by the owner (2026-10-06): in every tournament of Bogdan the judge is Чагин and the organizer is Богданчик.
 * Both players are looked up by their exact nickname and must be unambiguous; otherwise nothing is changed (and it is
 * tried again at the next start). The previous values are kept for a revert.
 */
export async function applyBogdanaTournamentStaff(db: DatabaseWrapper, options: Options = {}): Promise<number> {
  const status = await markerStatus(db, BOGDANA_TOURNAMENT_STAFF_MIGRATION);
  if (status === 'completed' || status === 'reverted') return 0;
  if (status) throw new Error(`Unexpected migration status: ${status}`);

  const tournaments = (await db.all<any>('SELECT id, title, judge_player_id, organizer_player_id, chief_judge_name FROM tournaments'))
    .filter((item) => String(item.title || '').toLowerCase().includes(BOGDANA_MARK));
  if (!tournaments.length) return 0;

  const players = await db.all<any>('SELECT id, nickname FROM players');
  const find = (nickname: string) => players.filter((player) => String(player.nickname || '').trim().toLowerCase() === nickname.toLowerCase());
  const judges = find(JUDGE_NICKNAME);
  const organizers = find(ORGANIZER_NICKNAME);
  if (judges.length !== 1 || organizers.length !== 1) {
    console.warn(`[TOURNAMENTS] Bogdan staff not set: found ${judges.length} «${JUDGE_NICKNAME}» and ${organizers.length} «${ORGANIZER_NICKNAME}» (exactly one of each is needed).`);
    return 0;
  }
  const judgeId = String(judges[0].id);
  const organizerId = String(organizers[0].id);
  const now = (options.now || (() => new Date().toISOString()))();
  const snapshot = await takeSnapshot(db, options, now);

  // The judge of a game decides who gets the judge's tokens and the «Отсудил игр» count (games before 2026-09-24 never fall back
  // to the tournament's judge), so the judge of every game of these tournaments is set too; the previous values are kept.
  const previousGames: any[] = [];
  await db.transaction(async (tx) => {
    for (const tournament of tournaments) {
      await tx.run(
        'UPDATE tournaments SET judge_player_id = ?, chief_judge_name = ?, organizer_player_id = ?, updated_at = ? WHERE id = ?',
        [judgeId, JUDGE_NICKNAME, organizerId, now, tournament.id],
      );
      const games = await tx.all<any>('SELECT id, judge_player_id, judge_name FROM tournament_games WHERE tournament_id = ?', [tournament.id]);
      for (const game of games) {
        previousGames.push({ game_id: String(game.id), judge_player_id: game.judge_player_id ?? null, judge_name: game.judge_name ?? null });
        await tx.run('UPDATE tournament_games SET judge_player_id = ?, judge_name = ? WHERE id = ?', [judgeId, JUDGE_NICKNAME, game.id]);
      }
    }
    await tx.run(
      `INSERT INTO migration_history (id, migration_name, status, details_json, executed_at) VALUES (?, ?, 'completed', ?, ?)`,
      [BOGDANA_TOURNAMENT_STAFF_MIGRATION, BOGDANA_TOURNAMENT_STAFF_MIGRATION, JSON.stringify({
        snapshot,
        judge_player_id: judgeId,
        organizer_player_id: organizerId,
        games: previousGames,
        tournaments: tournaments.map((item) => ({
          tournament_id: String(item.id),
          previous: { judge_player_id: item.judge_player_id ?? null, organizer_player_id: item.organizer_player_id ?? null, chief_judge_name: item.chief_judge_name ?? null },
        })),
      }), now],
    );
  });
  console.info(`[TOURNAMENTS] Judge «${JUDGE_NICKNAME}» and organizer «${ORGANIZER_NICKNAME}» set in ${tournaments.length} tournament(s) of Bogdan; snapshot: ${snapshot || 'none'}`);
  return tournaments.length;
}

/** Puts the judge, organizer, chief-judge name and every game's judge of the forced Bogdan update back. */
export async function revertBogdanaTournamentStaff(db: DatabaseWrapper): Promise<number> {
  const row = await db.get<{ status?: string; details_json?: string }>('SELECT status, details_json FROM migration_history WHERE migration_name = ? LIMIT 1', [BOGDANA_TOURNAMENT_STAFF_MIGRATION]);
  if (!row || row.status !== 'completed') return 0;
  const details = JSON.parse(String(row.details_json || '{}'));
  const list: any[] = details.tournaments || [];
  await db.transaction(async (tx) => {
    for (const item of list) {
      await tx.run('UPDATE tournaments SET judge_player_id = ?, organizer_player_id = ?, chief_judge_name = ? WHERE id = ?',
        [item.previous.judge_player_id, item.previous.organizer_player_id, item.previous.chief_judge_name, item.tournament_id]);
    }
    for (const game of details.games || []) {
      await tx.run('UPDATE tournament_games SET judge_player_id = ?, judge_name = ? WHERE id = ?', [game.judge_player_id, game.judge_name, game.game_id]);
    }
    await tx.run("UPDATE migration_history SET status = 'reverted' WHERE migration_name = ?", [BOGDANA_TOURNAMENT_STAFF_MIGRATION]);
  });
  return list.length;
}
