import type { DatabaseWrapper } from './index.ts';

const MIGRATION_KEY = '0014_merge_millourt_duplicate_v1';
const TARGET_NICKNAME = 'Millourt';
const DUPLICATE_NICKNAME = 'Милорд';

const text = (value: unknown) => String(value ?? '').trim();
const quoteIdent = (value: string) => `"${value.replace(/"/g, '""')}"`;

async function tableExists(db: DatabaseWrapper, table: string) {
  return Boolean(await db.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
    [table],
  ));
}

function chooseExplicit(current: unknown, duplicate: unknown, emptyValues: string[]) {
  const currentText = text(current);
  const duplicateText = text(duplicate);
  const currentEmpty = !currentText || emptyValues.includes(currentText);
  const duplicateEmpty = !duplicateText || emptyValues.includes(duplicateText);
  if (currentEmpty && !duplicateEmpty) return duplicateText;
  return currentText || duplicateText;
}

async function mergeEveningParticipants(db: DatabaseWrapper, keeperId: string, duplicateId: string) {
  if (!(await tableExists(db, 'evening_participants'))) return;
  const duplicateRows = await db.all<any>(
    'SELECT * FROM evening_participants WHERE player_id=?',
    [duplicateId],
  );
  const hasSlots = await tableExists(db, 'evening_slot_registrations');

  for (const duplicate of duplicateRows) {
    const keeper = await db.get<any>(
      'SELECT * FROM evening_participants WHERE evening_id=? AND player_id=? LIMIT 1',
      [duplicate.evening_id, keeperId],
    );
    if (!keeper) {
      await db.run('UPDATE evening_participants SET player_id=? WHERE id=?', [keeperId, duplicate.id]);
      continue;
    }

    if (hasSlots) {
      await db.run(
        'UPDATE OR IGNORE evening_slot_registrations SET participant_id=? WHERE participant_id=?',
        [keeper.id, duplicate.id],
      );
      await db.run('DELETE FROM evening_slot_registrations WHERE participant_id=?', [duplicate.id]);
    }

    const newerIsDuplicate = new Date(String(duplicate.updated_at || 0)).getTime()
      > new Date(String(keeper.updated_at || 0)).getTime();
    const responseStatus = chooseExplicit(keeper.response_status, duplicate.response_status, ['unanswered']);
    const registrationStatus = chooseExplicit(keeper.registration_status, duplicate.registration_status, ['unanswered', 'invited']);
    const attendanceStatus = chooseExplicit(keeper.attendance_status, duplicate.attendance_status, ['pending']);
    const arrivalStatus = chooseExplicit(keeper.arrival_status, duplicate.arrival_status, ['unknown']);

    await db.run(
      `UPDATE evening_participants SET
         response_status=?, registration_status=?, attendance_status=?, arrival_status=?,
         amount_paid=?, notes=?, registered_at=?, confirmed_at=?, checked_in_at=?, updated_at=?
       WHERE id=?`,
      [
        responseStatus || (newerIsDuplicate ? duplicate.response_status : keeper.response_status) || 'unanswered',
        registrationStatus || (newerIsDuplicate ? duplicate.registration_status : keeper.registration_status) || 'unanswered',
        attendanceStatus || 'pending',
        arrivalStatus || 'unknown',
        Math.max(Number(keeper.amount_paid || 0), Number(duplicate.amount_paid || 0)),
        text(keeper.notes) || text(duplicate.notes) || null,
        keeper.registered_at || duplicate.registered_at || null,
        keeper.confirmed_at || duplicate.confirmed_at || null,
        keeper.checked_in_at || duplicate.checked_in_at || null,
        newerIsDuplicate ? duplicate.updated_at : keeper.updated_at,
        keeper.id,
      ],
    );
    await db.run('DELETE FROM evening_participants WHERE id=?', [duplicate.id]);
  }
}

async function mergeTournamentParticipants(db: DatabaseWrapper, keeperId: string, duplicateId: string) {
  if (!(await tableExists(db, 'tournament_participants'))) return;
  const rows = await db.all<any>('SELECT * FROM tournament_participants WHERE player_id=?', [duplicateId]);
  for (const duplicate of rows) {
    const keeper = await db.get<any>(
      'SELECT * FROM tournament_participants WHERE tournament_id=? AND player_id=? LIMIT 1',
      [duplicate.tournament_id, keeperId],
    );
    if (!keeper) {
      await db.run('UPDATE tournament_participants SET player_id=? WHERE id=?', [keeperId, duplicate.id]);
      continue;
    }

    const tables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    for (const table of tables) {
      if (table.name === 'tournament_participants') continue;
      const fks = await db.all<any>(`PRAGMA foreign_key_list(${quoteIdent(table.name)})`);
      for (const fk of fks) {
        if (String(fk.table) !== 'tournament_participants' || String(fk.to || 'id') !== 'id') continue;
        const column = String(fk.from || '');
        if (!column) continue;
        await db.run(
          `UPDATE OR IGNORE ${quoteIdent(table.name)} SET ${quoteIdent(column)}=? WHERE ${quoteIdent(column)}=?`,
          [keeper.id, duplicate.id],
        );
      }
    }
    await db.run('DELETE FROM tournament_participants WHERE id=?', [duplicate.id]);
  }
}

async function mergeAnnouncementTracking(db: DatabaseWrapper, keeperId: string, duplicateId: string) {
  if (await tableExists(db, 'evening_announcement_dm_tracking')) {
    const rows = await db.all<any>('SELECT * FROM evening_announcement_dm_tracking WHERE player_id=?', [duplicateId]);
    for (const duplicate of rows) {
      const keeper = await db.get<any>(
        'SELECT * FROM evening_announcement_dm_tracking WHERE evening_id=? AND player_id=? LIMIT 1',
        [duplicate.evening_id, keeperId],
      );
      if (!keeper) {
        await db.run('UPDATE evening_announcement_dm_tracking SET player_id=? WHERE evening_id=? AND player_id=?', [keeperId, duplicate.evening_id, duplicateId]);
        continue;
      }
      await db.run(
        `UPDATE evening_announcement_dm_tracking SET
           telegram_user_id=CASE WHEN telegram_user_id IS NULL OR trim(telegram_user_id)='' THEN ? ELSE telegram_user_id END,
           first_message_id=COALESCE(first_message_id, ?),
           first_sent_at=COALESCE(first_sent_at, ?),
           delivery_status=CASE WHEN first_sent_at IS NOT NULL OR ? IS NOT NULL THEN 'sent' ELSE delivery_status END,
           reminder_count=MAX(COALESCE(reminder_count,0), ?),
           last_reminder_attempt_at=COALESCE(last_reminder_attempt_at, ?),
           last_reminded_at=COALESCE(last_reminded_at, ?),
           last_reminder_message_id=COALESCE(last_reminder_message_id, ?),
           updated_at=CASE WHEN updated_at > ? THEN updated_at ELSE ? END
         WHERE evening_id=? AND player_id=?`,
        [
          duplicate.telegram_user_id || '', duplicate.first_message_id, duplicate.first_sent_at, duplicate.first_sent_at,
          Number(duplicate.reminder_count || 0), duplicate.last_reminder_attempt_at, duplicate.last_reminded_at,
          duplicate.last_reminder_message_id, duplicate.updated_at || '', duplicate.updated_at || '', duplicate.evening_id, keeperId,
        ],
      );
      await db.run('DELETE FROM evening_announcement_dm_tracking WHERE evening_id=? AND player_id=?', [duplicate.evening_id, duplicateId]);
    }
  }

  if (await tableExists(db, 'evening_announcement_dm_delivery')) {
    const rows = await db.all<any>('SELECT * FROM evening_announcement_dm_delivery WHERE player_id=?', [duplicateId]);
    for (const duplicate of rows) {
      const keeper = await db.get<any>(
        'SELECT * FROM evening_announcement_dm_delivery WHERE evening_id=? AND player_id=? LIMIT 1',
        [duplicate.evening_id, keeperId],
      );
      if (!keeper) {
        await db.run('UPDATE evening_announcement_dm_delivery SET player_id=? WHERE evening_id=? AND player_id=?', [keeperId, duplicate.evening_id, duplicateId]);
      } else {
        await db.run('DELETE FROM evening_announcement_dm_delivery WHERE evening_id=? AND player_id=?', [duplicate.evening_id, duplicateId]);
      }
    }
  }
}

async function reassignDirectPlayerReferences(db: DatabaseWrapper, keeperId: string, duplicateId: string) {
  const skipped = new Set(['players', 'evening_participants', 'tournament_participants', 'evening_announcement_dm_tracking', 'evening_announcement_dm_delivery']);
  const tables = await db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  for (const table of tables) {
    if (skipped.has(table.name)) continue;
    const fks = await db.all<any>(`PRAGMA foreign_key_list(${quoteIdent(table.name)})`);
    for (const fk of fks) {
      if (String(fk.table) !== 'players' || String(fk.to || 'id') !== 'id') continue;
      const column = String(fk.from || '');
      if (!column) continue;
      await db.run(
        `UPDATE OR IGNORE ${quoteIdent(table.name)} SET ${quoteIdent(column)}=? WHERE ${quoteIdent(column)}=?`,
        [keeperId, duplicateId],
      );
    }
  }
}

export async function applyMillourtDuplicateMergeMigration(db: DatabaseWrapper): Promise<void> {
  if (!(await tableExists(db, 'players')) || !(await tableExists(db, 'migration_history'))) return;
  const existing = await db.get<{ status?: string }>(
    'SELECT status FROM migration_history WHERE migration_name=? LIMIT 1',
    [MIGRATION_KEY],
  );
  if (existing?.status === 'completed') return;

  await db.transaction(async (tx) => {
    const keepers = await tx.all<any>(
      'SELECT * FROM players WHERE lower(trim(nickname))=lower(trim(?)) ORDER BY created_at ASC LIMIT 2',
      [TARGET_NICKNAME],
    );
    const duplicates = await tx.all<any>(
      'SELECT * FROM players WHERE lower(trim(nickname))=lower(trim(?)) ORDER BY created_at ASC LIMIT 2',
      [DUPLICATE_NICKNAME],
    );
    const now = new Date().toISOString();

    if (!duplicates.length) {
      await tx.run(
        'INSERT INTO migration_history (id,migration_name,status,details_json,executed_at) VALUES (?,?,?,?,?)',
        [MIGRATION_KEY, MIGRATION_KEY, 'completed', JSON.stringify({ action: 'noop', reason: 'duplicate_not_found' }), now],
      );
      return;
    }

    const duplicate = duplicates[0];
    if (!keepers.length) {
      await tx.run('UPDATE players SET nickname=?, updated_at=? WHERE id=?', [TARGET_NICKNAME, now, duplicate.id]);
      await tx.run(
        'INSERT INTO migration_history (id,migration_name,status,details_json,executed_at) VALUES (?,?,?,?,?)',
        [MIGRATION_KEY, MIGRATION_KEY, 'completed', JSON.stringify({ action: 'renamed', player_id: duplicate.id }), now],
      );
      return;
    }

    const keeper = keepers[0];
    if (String(keeper.id) === String(duplicate.id)) return;

    const keeperTelegram = text(keeper.telegram_user_id);
    const duplicateTelegram = text(duplicate.telegram_user_id);
    if (!keeperTelegram && duplicateTelegram) {
      await tx.run('UPDATE players SET telegram_user_id=NULL WHERE id=?', [duplicate.id]);
      await tx.run('UPDATE players SET telegram_user_id=? WHERE id=?', [duplicateTelegram, keeper.id]);
    }

    const columns = new Set((await tx.all<{ name: string }>('PRAGMA table_info(players)')).map((column) => String(column.name)));
    const copyIfMissing = ['full_name', 'telegram_username', 'phone', 'preferred_format', 'referred_by', 'do_not_invite_until', 'pause_reason', 'notes', 'vk_user_id', 'vk_username', 'vk_screen_name'];
    for (const column of copyIfMissing) {
      if (!columns.has(column) || !text(duplicate[column]) || text(keeper[column])) continue;
      await tx.run(`UPDATE players SET ${quoteIdent(column)}=? WHERE id=?`, [duplicate[column], keeper.id]);
    }
    await tx.run('UPDATE players SET nickname=?, updated_at=? WHERE id=?', [TARGET_NICKNAME, now, keeper.id]);

    await mergeEveningParticipants(tx, keeper.id, duplicate.id);
    await mergeTournamentParticipants(tx, keeper.id, duplicate.id);
    await mergeAnnouncementTracking(tx, keeper.id, duplicate.id);
    await reassignDirectPlayerReferences(tx, keeper.id, duplicate.id);

    await tx.run('DELETE FROM players WHERE id=?', [duplicate.id]);
    await tx.run(
      'INSERT INTO migration_history (id,migration_name,status,details_json,executed_at) VALUES (?,?,?,?,?)',
      [MIGRATION_KEY, MIGRATION_KEY, 'completed', JSON.stringify({ action: 'merged', keeper_id: keeper.id, removed_id: duplicate.id, telegram_transferred: !keeperTelegram && Boolean(duplicateTelegram) }), now],
    );
  });

  console.log('Merged duplicate player Милорд into Millourt.');
}
