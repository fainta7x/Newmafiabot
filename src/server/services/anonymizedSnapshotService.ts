import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';
import type { DatabaseWrapper } from '../../db/index.ts';
import { SNAPSHOT_COLUMNS, SNAPSHOT_DDL } from './anonymizedSnapshotPolicy.ts';

export const SNAPSHOT_VERSION = 1;
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
const numeric = new Set(('elo tokens elo_seed stopped_attending attends_sometimes from_other_city capacity default_price sort_order amount_due amount_paid global_game_number game_count player_capacity entry_fee_rub prize_fund_rub tournament_evening_flow participant_number game_number seat_number exit_order regular_fouls minor_technical_fouls major_technical_fouls technical_fouls judge_bonus protocol_bonus penalty_points disciplinary_penalty_points ci_points auto_include').split(' '));
const enums = new Set(('tg vkontakte friend web import bot self crm crm_manual test legacy_guest_migrated alive voted_day mutual all none member team trainee judge STANDARD NOVICE_ACTIVE NOVICE_COMPLETED CLUB FIRST_VISIT NEW NOVICE_ESTABLISHING CLUB_PLAYER going thinking unanswered waitlist on_time not_marked attended not_attended tournament leading advanced host newcomer_to_club CIVIL MAFIA SHERIFF DON CITY Мирный Шериф Мафия Дон Красные Чёрные Черные normal paused blocked archived merged telegram vk manual referral website novice standard any beginner experienced club regular sometimes other_city stopped player helper organizer owner guest none citizen sheriff mafia don red black draw unknown CASUAL RATING TOURNAMENT NOVICE scheduled draft planned active published completed closed cancelled settled open confirmed pending reserve waiting declined accepted registered invited checked_in present absent arrived late no_show expected unpaid paid partial waived refunded free not_started running finished killed voted voted_zero_round removed ppk technical evaluator legacy season custom club_member newcomer graduated public private friends hidden').split(' '));
const enumColumns = new Set(('lifecycle_status contact_status source preferred_format game_level club_role judge_level birthday_visibility club_stage format status response_status registration_status attendance_status arrival_status payment_status winner_team role exit_type type').split(' '));
const dates = new Set(('do_not_invite_until elo_seed_set_at profile_checked_at profile_updated_at merged_at starts_at ends_at settled_at registered_at confirmed_at checked_in_at game_date archived_at date results_published_at published_at registration_closed_at tournament_evening_seating_prepared_at standings_hidden_at payment_deadline_72_done_at payment_deadline_24_done_at started_at completed_at created_at updated_at').split(' '));
const cleared = new Set(('telegram_user_id full_name telegram_username phone pause_reason notes stage elo_seed_reason birth_day birth_month birth_year profile_field_status_json profile_visibility_json profile_cosmetics_json host_formats organize_formats curator_areas public_token registration_token draft_protocol_json protocol_import_id judge_name chief_judge_name host_name removal_reason').split(' '));
const labels = new Set(['nickname', 'display_name', 'title', 'name', 'venue', 'winner_label']);
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(v) && Number.isFinite(Date.parse(v));

type Column = { name: string; type: string; notnull: number; pk: number };
export interface SnapshotStats { version: number; retainedTables: string[]; wipedTables: number; rows: number; bytes: number }

// Only numeric protocol facts and canonical role enums may survive JSON. Names, comments,
// unknown keys, URLs and nested payloads never leave the server.
function slots(raw: unknown, pseudonym: (v: unknown) => unknown): string {
  let items: unknown;
  try { items = JSON.parse(String(raw)); } catch { throw new Error('Snapshot contains invalid slots JSON'); }
  if (!Array.isArray(items)) throw new Error('Snapshot contains invalid slots JSON');
  return JSON.stringify(items.map((value: unknown, index) => {
    if (!value || typeof value !== 'object') throw new Error('Snapshot contains invalid slot');
    const row = value as Record<string, unknown>;
    const playerId = row.player_id ?? row.playerId;
    const out: Record<string, unknown> = { nickname: playerId == null ? `Гость ${index + 1}` : `Демо ${String(pseudonym(playerId)).slice(-8)}` };
    for (const key of ['player_id', 'playerId']) if (row[key] != null) out[key] = pseudonym(row[key]);
    for (const key of ['slot', 'seat', 'seat_number', 'fouls', 'technical_fouls', 'extra_points', 'points', 'bonus', 'penalty', 'elo_delta']) {
      if (typeof row[key] === 'number' && Number.isFinite(row[key])) out[key] = row[key];
    }
    for (const key of ['role', 'team', 'exit_type']) if (typeof row[key] === 'string' && enums.has(row[key])) out[key] = row[key];
    for (const key of ['won', 'is_best_player', 'is_first_killed']) if (typeof row[key] === 'boolean') out[key] = row[key];
    return out;
  }));
}

const protocolNumeric = new Set(('version slot seat seat_number exit_order regular_fouls minor_technical_fouls major_technical_fouls technical_fouls judge_bonus protocol_bonus penalty_points disciplinary_penalty_points ci_points global_game_number game_number round day points bonus penalty').split(' '));
function structuredProtocol(raw: unknown, pseudonym: (v: unknown) => unknown, gameId: unknown): string | null {
  let parsed: unknown;
  try { parsed = JSON.parse(String(raw)); } catch { return null; }
  const scrub = (value: unknown, depth = 0): unknown => {
    if (depth > 6) throw new Error('Protocol nesting exceeds snapshot limit');
    if (Array.isArray(value)) return value.map(x => scrub(x, depth + 1));
    if (!value || typeof value !== 'object') return null;
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (key === 'game_id') out[key] = String(gameId);
      else if (['player_id', 'participant_id', 'guest_placeholder_id', 'evening_id'].includes(key)) out[key] = pseudonym(v);
      else if (protocolNumeric.has(key) && typeof v === 'number' && Number.isFinite(v)) out[key] = v;
      else if (['kind','status','role','winner_team','team','exit_type','source'].includes(key) && typeof v === 'string' && (enums.has(v) || v === 'club_evening_protocol')) out[key] = v;
      else if (['protocol','player_results','best_moves'].includes(key)) out[key] = scrub(v, depth + 1);
    }
    return out;
  };
  return JSON.stringify(scrub(parsed));
}

/** Mutates ONLY the temporary SQLite backup. The caller must never pass a live database. */
export function anonymizeSnapshotFile(file: string): Omit<SnapshotStats, 'bytes'> {
  const source = new Database(file, { readonly: true, fileMustExist: true });
  const target = `${file}.scrubbed`;
  const db = new Database(target);
  fs.chmodSync(target, 0o600);
  let complete = false;
  const salt = crypto.randomBytes(32);
  const pseudonym = (v: unknown): unknown => v == null ? null : `dev-${crypto.createHmac('sha256', salt).update(String(v)).digest('hex').slice(0, 32)}`;
  try {
    db.pragma('foreign_keys = OFF');
    db.pragma('secure_delete = ON');
    for (const ddl of SNAPSHOT_DDL) db.exec(ddl);
    const tables = (source.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map(x => x.name);
    let rows = 0;
    const retainedTables: string[] = [];
    db.transaction(() => {
      for (const table of tables) {
        const allowed = SNAPSHOT_COLUMNS[table];
        if (!allowed) continue;
        const columns = source.prepare(`PRAGMA table_info(${quote(table)})`).all() as Column[];
        if (columns.some(c => !allowed.includes(c.name))) throw new Error(`Snapshot schema needs review: ${table}`);
        const data = source.prepare(`SELECT * FROM ${quote(table)}`).all() as Record<string, unknown>[];
        db.exec(`DELETE FROM ${quote(table)}`);
        const insert = db.prepare(`INSERT INTO ${quote(table)} (${columns.map(c => quote(c.name)).join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
        for (const row of data) {
          const values = columns.map(column => {
            const name = column.name, value = row[name];
            if (value == null) return null;
            if (cleared.has(name)) return column.notnull ? (column.type === 'INTEGER' ? 0 : '') : null;
            if (numeric.has(name)) { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid snapshot metric: ${table}`); return value; }
            if (name === 'id' && column.type === 'INTEGER') return value;
            if (name === 'id' || name.endsWith('_id') || name === 'referred_by') return pseudonym(value);
            if (dates.has(name)) { if (!isDate(value)) throw new Error(`Invalid snapshot date: ${table}`); return value; }
            if (enumColumns.has(name)) { if (typeof value !== 'string' || !enums.has(value)) throw new Error(`Snapshot enum needs review: ${table}.${name}`); return value; }
            if (labels.has(name)) return `Демо ${String(pseudonym(row.player_id ?? row.id)).slice(-8)}`;
            if (name === 'timezone') return 'Europe/Moscow';
            if (name === 'protocol_text') return structuredProtocol(value, pseudonym, row.id);
            if (name === 'slots_json') return slots(value, pseudonym);
            if (name === 'color_protocol_json') return '{}';
            if (name === 'prize_allocations_json') return '[]';
            if (name === 'seat_numbers_json') {
              const list: unknown = JSON.parse(String(value));
              if (!Array.isArray(list) || list.some(x => !Number.isInteger(x) || x < 1 || x > 10)) throw new Error('Invalid snapshot seat list');
              return JSON.stringify(list);
            }
            throw new Error(`Snapshot field needs review: ${table}.${name}`);
          });
          insert.run(...values);
          rows += 1;
        }
        retainedTables.push(table);
      }
    })();
    if ((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Snapshot relationship validation failed');
    db.exec('VACUUM');
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Snapshot integrity validation failed');
    complete = true;
    return { version: SNAPSHOT_VERSION, retainedTables, wipedTables: tables.length - retainedTables.length, rows };
  } finally {
    db.close(); source.close();
    if (complete) fs.renameSync(target, file);
    else fs.rmSync(target, { force: true });
  }
}

export async function buildAnonymizedSnapshot(db: DatabaseWrapper): Promise<{ gzip: Buffer; stats: SnapshotStats }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mafia-dev-snapshot-'));
  fs.chmodSync(dir, 0o700);
  const file = path.join(dir, 'copy.sqlite');
  try {
    await db.sqlite.backup(file);
    fs.chmodSync(file, 0o600);
    if (fs.statSync(file).size > 256 * 1024 * 1024) throw new Error('Source copy exceeds size limit');
    const stats = anonymizeSnapshotFile(file);
    const raw = fs.readFileSync(file);
    if (raw.length > 256 * 1024 * 1024) throw new Error('Snapshot exceeds size limit');
    return { gzip: zlib.gzipSync(raw), stats: { ...stats, bytes: raw.length } };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
