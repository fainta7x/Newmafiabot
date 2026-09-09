import type { DatabaseWrapper } from './index.ts';

export const GUEST_PLAYER_MIGRATION_KEY = 'guest_player_001_quick_guest_reconciliation_v1';
const LEGACY_GUEST_SOURCES = new Set(['quick_guest']);

const safeJsonParse = <T = any>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const replaceExactStringsDeep = (value: any, from: string, to: string): any => {
  if (typeof value === 'string') return value === from ? to : value;
  if (Array.isArray(value)) return value.map((item) => replaceExactStringsDeep(item, from, to));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceExactStringsDeep(item, from, to)]));
  }
  return value;
};

const hasInlineExternalIdentity = (player: Record<string, any>) => Object.entries(player).some(([key, value]) => {
  const normalized = key.toLowerCase();
  if (!normalized.includes('telegram') && !normalized.startsWith('vk_') && !normalized.includes('vk_user')) return false;
  return value !== null && value !== undefined && String(value).trim() !== '';
});

async function tableExists(db: DatabaseWrapper, tableName: string) {
  return Boolean(await db.get<any>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [tableName]));
}

async function externalIdentityEvidence(db: DatabaseWrapper, player: Record<string, any>) {
  const evidence: string[] = [];
  if (hasInlineExternalIdentity(player)) evidence.push('players_row');
  const playerId = String(player.id);
  if (await tableExists(db, 'player_external_identities')) {
    const identities = await db.all<any>('SELECT platform FROM player_external_identities WHERE player_id = ?', [playerId]);
    for (const identity of identities) {
      const platform = String(identity?.platform || '').trim().toLowerCase();
      evidence.push(platform ? `external:${platform}` : 'player_external_identities');
    }
  }
  if (await tableExists(db, 'vk_player_identity_claims')) {
    if (await db.get<any>('SELECT 1 FROM vk_player_identity_claims WHERE player_id = ? LIMIT 1', [playerId])) evidence.push('vk_player_identity_claims');
  }
  return [...new Set(evidence)];
}

async function ensureSchema(db: DatabaseWrapper) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS guest_player_placeholders (
      id TEXT PRIMARY KEY,
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL DEFAULT 'Гость',
      table_id TEXT REFERENCES evening_tables(id) ON DELETE SET NULL,
      response_status TEXT NOT NULL DEFAULT 'unanswered',
      registration_status TEXT NOT NULL DEFAULT 'unanswered',
      attendance_status TEXT NOT NULL DEFAULT 'pending',
      arrival_status TEXT NOT NULL DEFAULT 'unknown',
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      amount_due INTEGER NOT NULL DEFAULT 0,
      amount_paid INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      registered_at TEXT,
      confirmed_at TEXT,
      checked_in_at TEXT,
      legacy_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
      legacy_participant_id TEXT UNIQUE,
      replaced_by_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
      replaced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await db.run('CREATE INDEX IF NOT EXISTS idx_guest_placeholders_evening ON guest_player_placeholders(evening_id, created_at)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_guest_placeholders_legacy_player ON guest_player_placeholders(legacy_player_id)');

  await db.run(`
    CREATE TABLE IF NOT EXISTS guest_player_replacement_audit (
      id TEXT PRIMARY KEY,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      seat_number INTEGER NOT NULL,
      guest_placeholder_id TEXT NOT NULL REFERENCES guest_player_placeholders(id) ON DELETE RESTRICT,
      replacement_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
      replacement_participant_id TEXT NOT NULL REFERENCES evening_participants(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      UNIQUE(game_id, seat_number, guest_placeholder_id, replacement_player_id)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS guest_player_migration_diagnostics (
      id TEXT PRIMARY KEY,
      migration_key TEXT NOT NULL,
      legacy_player_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(migration_key, legacy_player_id, reason)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS guest_player_migration_state (
      migration_key TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      total_count INTEGER NOT NULL DEFAULT 0,
      processed_count INTEGER NOT NULL DEFAULT 0,
      last_player_id TEXT,
      error_message TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      updated_at TEXT NOT NULL
    )
  `);
}

async function recordDiagnostic(db: DatabaseWrapper, legacyPlayerId: string, reason: string, details: Record<string, any>) {
  const now = new Date().toISOString();
  await db.run(`
    INSERT INTO guest_player_migration_diagnostics (id, migration_key, legacy_player_id, reason, details_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(migration_key, legacy_player_id, reason) DO UPDATE SET details_json = excluded.details_json, updated_at = excluded.updated_at
  `, [`guestdiag:${legacyPlayerId}:${reason}`, GUEST_PLAYER_MIGRATION_KEY, legacyPlayerId, reason, JSON.stringify(details), now, now]);
}

async function migrateLegacyParticipantGames(
  db: DatabaseWrapper,
  legacyPlayerId: string,
  legacyParticipantId: string,
  guestId: string,
  displayName: string,
  eveningId: string,
) {
  const games = await db.all<any>('SELECT id, protocol_text, slots_json FROM games WHERE evening_id = ?', [eveningId]);
  for (const game of games) {
    const envelope = safeJsonParse<any>(game.protocol_text, null);
    if (!envelope || envelope.kind !== 'club_evening_protocol' || envelope.version !== 1 || !Array.isArray(envelope.player_results)) continue;

    const matches = envelope.player_results.filter((result: any) =>
      String(result?.participant_id || '') === legacyParticipantId
      || String(result?.player_id || '') === legacyPlayerId,
    );
    if (matches.length === 0) continue;
    if (matches.length !== 1) {
      await recordDiagnostic(db, legacyPlayerId, 'ambiguous_game_seat', { game_id: game.id, evening_id: eveningId, legacy_participant_id: legacyParticipantId, matches: matches.length });
      continue;
    }

    const rewritten = replaceExactStringsDeep(envelope, legacyParticipantId, guestId);
    rewritten.player_results = rewritten.player_results.map((result: any) => {
      if (String(result?.participant_id || '') !== guestId && String(result?.player_id || '') !== legacyPlayerId) return result;
      return {
        ...result,
        participant_id: guestId,
        player_id: null,
        guest_placeholder_id: guestId,
        display_name: displayName,
      };
    });

    const slots = safeJsonParse<any[]>(game.slots_json, []);
    const rewrittenSlots = replaceExactStringsDeep(slots, legacyParticipantId, guestId).map((slot: any) => {
      if (String(slot?.participant_id || '') !== guestId && String(slot?.player_id || '') !== legacyPlayerId) return slot;
      return {
        ...slot,
        participant_id: guestId,
        player_id: null,
        guest_placeholder_id: guestId,
        nickname: displayName,
      };
    });
    await db.run('UPDATE games SET protocol_text = ?, slots_json = ? WHERE id = ?', [JSON.stringify(rewritten), JSON.stringify(rewrittenSlots), game.id]);
  }
}

async function migrateLegacyPlayer(db: DatabaseWrapper, player: any) {
  const legacyPlayerId = String(player.id);
  const source = String(player.source || '').trim();
  if (source === 'legacy_guest_migrated') return;
  if (!LEGACY_GUEST_SOURCES.has(source)) return;

  const identityEvidence = await externalIdentityEvidence(db, player);
  if (identityEvidence.length) {
    await recordDiagnostic(db, legacyPlayerId, 'external_identity_linked', {
      source: player.source,
      nickname: player.nickname,
      evidence: identityEvidence,
    });
    return;
  }

  const now = new Date().toISOString();
  const participants = await db.all<any>('SELECT * FROM evening_participants WHERE player_id = ? ORDER BY created_at ASC, id ASC', [legacyPlayerId]);
  for (const participant of participants) {
    const guestId = `guest:${String(participant.id)}`;
    const displayName = String(player.nickname || '').trim() || 'Гость';
    await db.run(`
      INSERT INTO guest_player_placeholders (
        id, evening_id, display_name, table_id, response_status, registration_status,
        attendance_status, arrival_status, payment_status, amount_due, amount_paid, notes,
        registered_at, confirmed_at, checked_in_at, legacy_player_id, legacy_participant_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(legacy_participant_id) DO NOTHING
    `, [
      guestId,
      participant.evening_id,
      displayName,
      participant.table_id || null,
      participant.response_status || 'unanswered',
      participant.registration_status || participant.response_status || 'unanswered',
      participant.attendance_status || 'pending',
      participant.arrival_status || 'unknown',
      participant.payment_status || 'unpaid',
      Number(participant.amount_due || 0),
      Number(participant.amount_paid || 0),
      participant.notes || null,
      participant.registered_at || participant.created_at || now,
      participant.confirmed_at || null,
      participant.checked_in_at || null,
      legacyPlayerId,
      String(participant.id),
      participant.created_at || now,
      now,
    ]);
    await migrateLegacyParticipantGames(db, legacyPlayerId, String(participant.id), guestId, displayName, String(participant.evening_id));
  }

  await db.run(
    "UPDATE players SET source = 'legacy_guest_migrated', lifecycle_status = 'archived', updated_at = ? WHERE id = ? AND source = 'quick_guest'",
    [now, legacyPlayerId],
  );
}

export async function reconcileLegacyGuestPlayers(db: DatabaseWrapper) {
  await ensureSchema(db);
  const existing = await db.get<any>('SELECT * FROM guest_player_migration_state WHERE migration_key = ?', [GUEST_PLAYER_MIGRATION_KEY]);
  if (existing?.status === 'completed') return existing;

  // Include already-converted rows in the candidate snapshot so a process crash
  // between the per-player transaction and progress checkpoint remains resumable.
  const players = await db.all<any>("SELECT * FROM players WHERE source IN ('quick_guest','legacy_guest_migrated') ORDER BY id ASC");
  const startedAt = existing?.started_at || new Date().toISOString();
  const totalCount = Math.max(Number(existing?.total_count || 0), players.length);
  if (!existing) {
    await db.run(`
      INSERT INTO guest_player_migration_state (migration_key, status, total_count, processed_count, started_at, updated_at)
      VALUES (?, 'running', ?, 0, ?, ?)
    `, [GUEST_PLAYER_MIGRATION_KEY, totalCount, startedAt, startedAt]);
  } else {
    await db.run("UPDATE guest_player_migration_state SET status = 'running', total_count = ?, error_message = NULL, updated_at = ? WHERE migration_key = ?", [totalCount, new Date().toISOString(), GUEST_PLAYER_MIGRATION_KEY]);
  }

  let processed = Number(existing?.processed_count || 0);
  const lastPlayerId = String(existing?.last_player_id || '');
  const pending = lastPlayerId ? players.filter((player) => String(player.id) > lastPlayerId) : players;
  for (const player of pending) {
    try {
      await db.transaction(async (tx) => migrateLegacyPlayer(tx, player));
      processed += 1;
      await db.run(
        'UPDATE guest_player_migration_state SET processed_count = ?, last_player_id = ?, updated_at = ? WHERE migration_key = ?',
        [processed, String(player.id), new Date().toISOString(), GUEST_PLAYER_MIGRATION_KEY],
      );
    } catch (error: any) {
      const message = String(error?.message || error || 'Unknown guest migration error').slice(0, 2000);
      await db.run(
        "UPDATE guest_player_migration_state SET status = 'failed', error_message = ?, updated_at = ? WHERE migration_key = ?",
        [message, new Date().toISOString(), GUEST_PLAYER_MIGRATION_KEY],
      );
      console.error(`[GUEST-PLAYER-001] Legacy guest reconciliation failed at ${String(player.id)}: ${message}`);
      throw error;
    }
  }

  const completedAt = new Date().toISOString();
  await db.run(
    "UPDATE guest_player_migration_state SET status = 'completed', processed_count = total_count, completed_at = ?, error_message = NULL, updated_at = ? WHERE migration_key = ?",
    [completedAt, completedAt, GUEST_PLAYER_MIGRATION_KEY],
  );
  return db.get<any>('SELECT * FROM guest_player_migration_state WHERE migration_key = ?', [GUEST_PLAYER_MIGRATION_KEY]);
}

export async function ensureGuestPlayerPlaceholderSchema(db: DatabaseWrapper) {
  await ensureSchema(db);
  await reconcileLegacyGuestPlayers(db);
}
