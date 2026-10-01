import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';
import type { DatabaseWrapper } from '../../db/index.ts';

/**
 * Weekly anonymized database copy for development checks (owner, 2026-10-01).
 *
 * The live database is copied with SQLite's online backup; every change below happens on that
 * temporary copy only. Personal data and secrets are removed, nicknames, avatars, evenings,
 * games, Elo and tokens stay, so local checks run on real club data.
 */

// Whole tables that hold secrets, sessions, raw outgoing messages or audit copies of personal data.
const WIPED_TABLE = /(session|oauth|credential|secret|claim_link|outbox|callback_runtime|merge_previews|onboarding|identity_link|usage_events|change_log|payment_intents|remote_connections|join_oauth|poll_votes)/i;

// Columns that identify a person or hold a secret, whatever table they are in.
const PERSONAL_COLUMN = /^(phone|full_name|email|telegram_username|birth_day|birth_month|birth_year|vk_user_id|external_user_id|used_external_user_id|channel_target|token_hash|code_hash|session_hash|pairing_code_hash|bridge_token_hash|access_token|refresh_token|secret|password|password_hash|public_token|registration_token|confirmation_url|provider_payment_id|invite_url)$/i;
const NOTE_COLUMN = /(^|_)notes$/i;
// Kept but replaced: a linked account stays linked, its real id does not leave the server.
const PSEUDONYM_COLUMN = /^(telegram_user_id|chat_id)$/i;

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

export interface SnapshotStats { tables: number; wipedTables: string[]; scrubbedColumns: number; bytes: number }

export function anonymizeSnapshotFile(file: string): Omit<SnapshotStats, 'bytes'> {
  const db = new Database(file);
  try {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>).map((row) => row.name);
    const wipedTables: string[] = [];
    let scrubbedColumns = 0;
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      for (const table of tables) {
        if (WIPED_TABLE.test(table)) {
          db.prepare(`DELETE FROM ${quote(table)}`).run();
          wipedTables.push(table);
          continue;
        }
        const columns = db.prepare(`PRAGMA table_info(${quote(table)})`).all() as Array<{ name: string; notnull: number; pk: number }>;
        for (const column of columns) {
          if (column.pk) continue;
          const name = column.name;
          if (PSEUDONYM_COLUMN.test(name)) {
            db.prepare(`UPDATE ${quote(table)} SET ${quote(name)} = 'anon-' || rowid WHERE ${quote(name)} IS NOT NULL AND ${quote(name)} != ''`).run();
            scrubbedColumns += 1;
          } else if (PERSONAL_COLUMN.test(name) || NOTE_COLUMN.test(name)) {
            db.prepare(`UPDATE ${quote(table)} SET ${quote(name)} = ${column.notnull ? `'anon-' || rowid` : 'NULL'} WHERE ${quote(name)} IS NOT NULL`).run();
            scrubbedColumns += 1;
          }
        }
      }
    })();
    // Freed pages would still hold the removed values: rebuild the file.
    db.exec('VACUUM');
    return { tables: tables.length, wipedTables, scrubbedColumns };
  } finally {
    db.close();
  }
}

/** A gzip of the anonymized copy. The live database is only read by the backup. */
export async function buildAnonymizedSnapshot(db: DatabaseWrapper): Promise<{ gzip: Buffer; stats: SnapshotStats }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mafia-snapshot-'));
  const file = path.join(dir, `snapshot-${crypto.randomUUID()}.sqlite`);
  try {
    await db.sqlite.backup(file);
    const stats = anonymizeSnapshotFile(file);
    const raw = fs.readFileSync(file);
    return { gzip: zlib.gzipSync(raw, { level: 9 }), stats: { ...stats, bytes: raw.length } };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
