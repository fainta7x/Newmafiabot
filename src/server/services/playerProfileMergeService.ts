import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePlayerProfileMergeSchema } from '../../db/ensurePlayerProfileMergeSchema.ts';
import { mutateTokenBalance } from './tokenLedgerService.ts';
import { rebuildCanonicalEloRatings } from './eloRatingService.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../../db/ensureOrganizerPlayerAccessSchema.ts';

const MERGE_PREVIEW_TTL_MS = 10 * 60 * 1000;
const DEDUPE_TABLES = new Set(['player_achievements', 'player_split_vote_progress']);
const META_TABLES = new Set(['player_profile_merge_previews', 'player_profile_merges', 'migration_history']);
const CLAIM_TABLE = 'player_claim_links';
// The token journal stays with its own profile: every row carries the balance after it, so moving
// the duplicate's rows would double its history on the keeper. The balance moves as one debit + credit.
const LEDGER_TABLES = new Set(['token_ledger']);
const UNSUPPORTED_LEGACY_TABLES = new Set([
  'guest_player_migration_diagnostics', 'guest_player_migration_state', 'guest_player_placeholders',
  'guest_player_replacement_audit',
]);
const JSON_COLUMNS = new Set(['slots_json', 'protocol_text', 'role_snapshot_json']);
const PLAYER_FIELD_COLUMNS = new Set([
  'full_name', 'phone', 'telegram_username', 'preferred_format', 'do_not_invite_until', 'pause_reason',
  'profile_field_status_json', 'profile_visibility_json', 'profile_cosmetics_json', 'birth_day', 'birth_month',
  'birth_year', 'birthday_visibility', 'profile_checked_at', 'profile_updated_at', 'notes',
]);

type PlayerRow = Record<string, any> & { id: string; nickname: string };
type Blocker = { code: string; message: string; table?: string; count?: number };
type ReferenceSummary = { table: string; column: string; count: number };

const text = (value: unknown) => String(value ?? '').trim();
const quoteIdent = (value: string) => `"${value.replace(/"/g, '""')}"`;
const nowIso = () => new Date().toISOString();
const randomToken = () => crypto.randomBytes(32).toString('hex');
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

async function tableExists(db: DatabaseWrapper, table: string) {
  return Boolean(await db.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", [table],
  ));
}

async function tableColumns(db: DatabaseWrapper, table: string): Promise<string[]> {
  return (await db.all<{ name: string }>(`PRAGMA table_info(${quoteIdent(table)})`)).map((row) => String(row.name));
}

async function playerColumns(db: DatabaseWrapper, table: string): Promise<string[]> {
  return (await tableColumns(db, table)).filter((name) => name === 'player_id' || /_player_id$/.test(name));
}

async function listTables(db: DatabaseWrapper): Promise<string[]> {
  const rows = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  return rows.map((row) => String(row.name));
}

async function externalIdentityCount(db: DatabaseWrapper, playerId: string): Promise<number> {
  const count = await db.get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM player_external_identities WHERE player_id=?",
    [playerId],
  ).catch(() => null);
  return Number(count?.count || 0);
}

function replacePlayerIds(value: any, sourceId: string, keeperId: string): { value: any; sourceFound: boolean; keeperFound: boolean } {
  if (Array.isArray(value)) {
    let sourceFound = false; let keeperFound = false;
    const next = value.map((item) => {
      const result = replacePlayerIds(item, sourceId, keeperId);
      sourceFound ||= result.sourceFound; keeperFound ||= result.keeperFound;
      return result.value;
    });
    return { value: next, sourceFound, keeperFound };
  }
  if (value && typeof value === 'object') {
    let sourceFound = false; let keeperFound = false;
    const next: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      if ((key === 'player_id' || key.endsWith('_player_id')) && typeof item === 'string') {
        if (item === sourceId) { next[key] = keeperId; sourceFound = true; continue; }
        if (item === keeperId) keeperFound = true;
      }
      const result = replacePlayerIds(item, sourceId, keeperId);
      sourceFound ||= result.sourceFound; keeperFound ||= result.keeperFound;
      next[key] = result.value;
    }
    return { value: next, sourceFound, keeperFound };
  }
  return { value, sourceFound: false, keeperFound: false };
}

async function inspectReferences(db: DatabaseWrapper, sourceId: string, keeperId: string) {
  const references: ReferenceSummary[] = [];
  const blockers: Blocker[] = [];
  const tables = await listTables(db);

  for (const table of tables) {
    if (META_TABLES.has(table) || table === 'players' || UNSUPPORTED_LEGACY_TABLES.has(table) || LEDGER_TABLES.has(table)) continue;
    const columns = await playerColumns(db, table);
    if (!columns.length) continue;
    const clauses = columns.map((column) => `${quoteIdent(column)}=?`).join(' OR ');
    const rows = await db.all<any>(`SELECT * FROM ${quoteIdent(table)} WHERE ${clauses}`, columns.map(() => sourceId));
    for (const column of columns) {
      const count = rows.filter((row) => String(row[column] ?? '') === sourceId).length;
      if (count) references.push({ table, column, count });
    }

    // A row with two different player roles must never become self-referential.
    if (columns.length > 1) {
      for (const row of rows) {
        const normalized = columns.map((column) => String(row[column] ?? '') === sourceId ? keeperId : String(row[column] ?? '')).filter(Boolean);
        if (new Set(normalized).size < normalized.length) {
          blockers.push({ code: 'self_reference', table, message: `В таблице ${table} объединение создало бы связь игрока с самим собой.` });
          break;
        }
      }
    }

    if (DEDUPE_TABLES.has(table)) continue;
    const indexes = await db.all<any>(`PRAGMA index_list(${quoteIdent(table)})`);
    for (const index of indexes.filter((item: any) => Number(item.unique) === 1)) {
      const indexColumns = (await db.all<any>(`PRAGMA index_info(${quoteIdent(String(index.name))})`))
        .sort((a, b) => Number(a.seqno) - Number(b.seqno)).map((item) => String(item.name)).filter(Boolean);
      if (!indexColumns.some((column) => columns.includes(column))) continue;
      const allRelevant = await db.all<any>(`SELECT * FROM ${quoteIdent(table)}`);
      const keys = new Map<string, { changed: boolean }>();
      for (const row of allRelevant) {
        const sourceInRow = columns.some((column) => String(row[column] ?? '') === sourceId);
        const key = JSON.stringify(indexColumns.map((column) => columns.includes(column) && String(row[column] ?? '') === sourceId ? keeperId : row[column] ?? null));
        const previous = keys.get(key);
        if (previous && (sourceInRow || previous.changed)) {
          blockers.push({ code: 'unique_conflict', table, message: `В таблице ${table} уже есть запись, которая совпадёт после переноса.` });
          break;
        }
        keys.set(key, { changed: Boolean(sourceInRow || previous?.changed) });
      }
      if (blockers.some((item) => item.table === table && item.code === 'unique_conflict')) break;
    }
  }
  return { references, blockers };
}

async function inspectJsonReferences(db: DatabaseWrapper, sourceId: string, keeperId: string) {
  const blockers: Blocker[] = [];
  const jsonRows: Array<{ table: string; column: string; id: any; value: string }> = [];
  for (const table of await listTables(db)) {
    if (META_TABLES.has(table) || table === 'players') continue;
    const columns = await tableColumns(db, table);
    for (const column of columns.filter((item) => JSON_COLUMNS.has(item))) {
      const rows = await db.all<any>(`SELECT rowid AS __rowid__, ${quoteIdent(column)} AS value FROM ${quoteIdent(table)} WHERE ${quoteIdent(column)} LIKE ?`, [`%${sourceId}%`]).catch(() => []);
      for (const row of rows) {
        let parsed: any;
        try { parsed = JSON.parse(String(row.value)); } catch { continue; }
        const result = replacePlayerIds(parsed, sourceId, keeperId);
        if (!result.sourceFound) continue;
        if (result.keeperFound) blockers.push({ code: 'json_conflict', table, message: `В ${table}.${column} уже есть оба профиля в одной записи.` });
        jsonRows.push({ table, column, id: row.__rowid__, value: JSON.stringify(result.value) });
      }
    }
  }
  return { blockers, jsonRows };
}

async function analyse(db: DatabaseWrapper, keeperId: string, sourceId: string) {
  const keeper = await db.get<PlayerRow>('SELECT * FROM players WHERE id=? LIMIT 1', [keeperId]);
  const source = await db.get<PlayerRow>('SELECT * FROM players WHERE id=? LIMIT 1', [sourceId]);
  const blockers: Blocker[] = [];
  if (!keeper) blockers.push({ code: 'keeper_not_found', message: 'Основной профиль не найден.' });
  if (!source) blockers.push({ code: 'source_not_found', message: 'Профиль-дубликат не найден.' });
  if (keeperId === sourceId) blockers.push({ code: 'same_profile', message: 'Нельзя объединить профиль с самим собой.' });
  if (!keeper || !source) return { keeper, source, blockers, references: [], jsonRows: [], summary: null };

  if (String(keeper.lifecycle_status || '') === 'merged' || String(source.lifecycle_status || '') === 'merged') blockers.push({ code: 'already_merged', message: 'Один из профилей уже объединён.' });
  if (!new Set(['crm_manual', 'manual', '']).has(String(source.source || ''))) blockers.push({ code: 'source_not_manual', message: 'В первой версии можно переносить только ручной профиль из CRM.' });
  if (text(source.telegram_user_id)) blockers.push({ code: 'source_has_telegram', message: 'У профиля-дубликата уже есть Telegram-привязка.' });
  if (await externalIdentityCount(db, sourceId)) blockers.push({ code: 'source_has_external_identity', message: 'У профиля-дубликата уже есть VK или другая внешняя привязка.' });
  if (!text(keeper.telegram_user_id) && !(await externalIdentityCount(db, keeperId))) blockers.push({ code: 'keeper_not_linked', message: 'Основной профиль должен иметь Telegram или VK-привязку.' });
  if (String(source.id) === String(PRIMARY_ORGANIZER_PLAYER_ID)) blockers.push({ code: 'owner_source', message: 'Профиль владельца нельзя объединять как дубль.' });
  const access = await db.get('SELECT player_id FROM organizer_player_access WHERE player_id=? LIMIT 1', [sourceId]).catch(() => null);
  if (access) blockers.push({ code: 'source_has_organizer_access', message: 'Профиль-дубликат имеет доступ организатора.' });

  const refs = await inspectReferences(db, sourceId, keeperId);
  const json = await inspectJsonReferences(db, sourceId, keeperId);
  blockers.push(...refs.blockers, ...json.blockers);
  const uniqueBlockers = blockers.filter((item, index, list) => list.findIndex((other) => other.code === item.code && other.table === item.table && other.message === item.message) === index);
  return {
    keeper, source, blockers: uniqueBlockers, references: refs.references, jsonRows: json.jsonRows,
    summary: {
      source_id: sourceId, keeper_id: keeperId, source_nickname: source.nickname, keeper_nickname: keeper.nickname,
      reference_count: refs.references.reduce((sum, item) => sum + item.count, 0),
      references: refs.references, json_count: json.jsonRows.length,
      claim_links_revoked: await tableExists(db, CLAIM_TABLE) ? Number((await db.get<any>(`SELECT COUNT(*) AS count FROM ${CLAIM_TABLE} WHERE player_id=?`, [sourceId]))?.count || 0) : 0,
      source_tokens: Number(source.tokens || 0),
      target_tokens: Number(keeper.tokens || 0),
    },
  };
}

export async function createPlayerMergePreview(db: DatabaseWrapper, input: { keeperId: string; sourceId: string; actorId: string }) {
  await ensurePlayerProfileMergeSchema(db);
  const analysis = await analyse(db, input.keeperId, input.sourceId);
  const snapshot = JSON.stringify({
    keeper: analysis.keeper && { id: analysis.keeper.id, updated_at: analysis.keeper.updated_at, nickname: analysis.keeper.nickname },
    source: analysis.source && { id: analysis.source.id, updated_at: analysis.source.updated_at, nickname: analysis.source.nickname },
    summary: analysis.summary, blockers: analysis.blockers,
  });
  const token = randomToken();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + MERGE_PREVIEW_TTL_MS).toISOString();
  await db.run(
    `INSERT INTO player_profile_merge_previews (token_hash, keeper_player_id, source_player_id, actor_id, snapshot_hash, preview_json, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [sha256(token), input.keeperId, input.sourceId, input.actorId, sha256(snapshot), JSON.stringify({ ...analysis.summary, blockers: analysis.blockers }), expiresAt, createdAt],
  );
  return { token, expires_at: expiresAt, keeper: analysis.keeper, source: analysis.source, blockers: analysis.blockers, summary: analysis.summary };
}

function mergeCoreFields(target: PlayerRow, source: PlayerRow) {
  const updates: Record<string, any> = {};
  for (const column of PLAYER_FIELD_COLUMNS) {
    if (!(column in target) || !(column in source)) continue;
    const targetValue = text(target[column]);
    const sourceValue = source[column];
    if (!targetValue && sourceValue !== null && sourceValue !== undefined && text(sourceValue)) updates[column] = sourceValue;
  }
  if ('notes' in target && text(target.notes) && text(source.notes) && text(target.notes) !== text(source.notes)) {
    updates.notes = `${text(target.notes)}\n\nПеренесено из дубля:\n${text(source.notes)}`;
  }
  for (const column of ['host_formats', 'organize_formats', 'curator_areas']) {
    if (!(column in target) || !(column in source)) continue;
    const values = [...new Set(`${target[column] || ''},${source[column] || ''}`.split(',').map((item) => item.trim()).filter(Boolean))];
    if (values.length) updates[column] = values.join(',');
  }
  return updates;
}

async function mergeInsideTransaction(db: DatabaseWrapper, keeperId: string, sourceId: string, analysis: any, actorId: string) {
  const now = nowIso();
  const target = analysis.keeper as PlayerRow;
  const source = analysis.source as PlayerRow;
  const coreUpdates = mergeCoreFields(target, source);
  const fields = Object.keys(coreUpdates);
  if (fields.length) {
    await db.run(`UPDATE players SET ${fields.map((field) => `${quoteIdent(field)}=?`).join(', ')}, updated_at=? WHERE id=?`, [...fields.map((field) => coreUpdates[field]), now, keeperId]);
  }

  // Profile claims are one-time security links. A link for the old manual profile
  // must never remain usable after the profile is archived.
  if (await tableExists(db, CLAIM_TABLE)) await db.run(`DELETE FROM ${CLAIM_TABLE} WHERE player_id=?`, [sourceId]);

  // Union tables with a natural player/achievement key before the generic FK move.
  if (await tableExists(db, 'player_achievements')) {
    await db.run(`DELETE FROM player_achievements WHERE player_id=? AND achievement_id IN (SELECT achievement_id FROM player_achievements WHERE player_id=?)`, [sourceId, keeperId]);
  }
  if (await tableExists(db, 'player_split_vote_progress')) {
    await db.run(`DELETE FROM player_split_vote_progress WHERE player_id=? AND level IN (SELECT level FROM player_split_vote_progress WHERE player_id=?)`, [sourceId, keeperId]);
  }

  for (const table of await listTables(db)) {
    if (META_TABLES.has(table) || table === 'players' || UNSUPPORTED_LEGACY_TABLES.has(table) || LEDGER_TABLES.has(table) || table === CLAIM_TABLE) continue;
    for (const column of await playerColumns(db, table)) {
      await db.run(`UPDATE ${quoteIdent(table)} SET ${quoteIdent(column)}=? WHERE ${quoteIdent(column)}=?`, [keeperId, sourceId]);
    }
  }

  for (const item of analysis.jsonRows as Array<{ table: string; column: string; id: any; value: string }>) {
    await db.run(`UPDATE ${quoteIdent(item.table)} SET ${quoteIdent(item.column)}=? WHERE rowid=?`, [item.value, item.id]);
  }

  const sourceTokens = Number(source.tokens || 0);
  if (sourceTokens) {
    await mutateTokenBalance(db, { playerId: sourceId, delta: -sourceTokens, reasonType: 'profile_merge', description: 'Перенос баланса при объединении профилей', sourceType: 'player_profile_merge', sourceId, idempotencyKey: `profile-merge:${sourceId}:debit`, debitPolicy: 'allow_negative', actorType: 'owner', actorId });
    await mutateTokenBalance(db, { playerId: keeperId, delta: sourceTokens, reasonType: 'profile_merge', description: 'Перенос баланса из объединённого профиля', sourceType: 'player_profile_merge', sourceId, idempotencyKey: `profile-merge:${sourceId}:credit`, debitPolicy: 'allow_negative', actorType: 'owner', actorId });
  }

  await db.run(
    `UPDATE players SET lifecycle_status='merged', contact_status='archived', merged_into_player_id=?, merged_at=?, updated_at=? WHERE id=?`,
    [keeperId, now, now, sourceId],
  );
  // Ratings are derived from the now-canonical game history, not averaged.
  await rebuildCanonicalEloRatings(db);

  const mergeId = crypto.randomUUID();
  const summary = { ...analysis.summary, fields_filled: Object.keys(coreUpdates), tokens_transferred: sourceTokens };
  await db.run(
    `INSERT INTO player_profile_merges (id, keeper_player_id, source_player_id, actor_id, source_nickname, keeper_nickname, summary_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [mergeId, keeperId, sourceId, actorId, source.nickname, target.nickname, JSON.stringify(summary), now],
  );
  return { merge_id: mergeId, summary };
}

export async function mergePlayerProfiles(db: DatabaseWrapper, input: { keeperId: string; sourceId: string; actorId: string; previewToken: string; confirmationNickname: string }) {
  await ensurePlayerProfileMergeSchema(db);
  const preview = await db.get<any>(
    'SELECT * FROM player_profile_merge_previews WHERE token_hash=? AND keeper_player_id=? AND source_player_id=? AND actor_id=? AND used_at IS NULL AND expires_at>? LIMIT 1',
    [sha256(input.previewToken), input.keeperId, input.sourceId, input.actorId, nowIso()],
  );
  if (!preview) throw Object.assign(new Error('Предпросмотр объединения устарел. Сначала сформируйте его заново.'), { statusCode: 409, code: 'merge_preview_expired' });

  let result: any;
  await db.transaction(async (tx) => {
    const analysis = await analyse(tx, input.keeperId, input.sourceId);
    if (analysis.blockers.length) throw Object.assign(new Error('Объединение заблокировано проверками безопасности.'), { statusCode: 409, code: 'merge_blocked', blockers: analysis.blockers });
    if (!analysis.keeper || !analysis.source) throw Object.assign(new Error('Один из профилей не найден.'), { statusCode: 404, code: 'player_not_found' });
    if (text(input.confirmationNickname).toLocaleLowerCase('ru-RU') !== text(analysis.keeper.nickname).toLocaleLowerCase('ru-RU')) {
      throw Object.assign(new Error('Для подтверждения введи ник основного профиля полностью.'), { statusCode: 400, code: 'merge_confirmation_mismatch' });
    }
    result = await mergeInsideTransaction(tx, input.keeperId, input.sourceId, analysis, input.actorId);
    await tx.run('UPDATE player_profile_merge_previews SET used_at=? WHERE token_hash=?', [nowIso(), sha256(input.previewToken)]);
  });
  return result;
}
