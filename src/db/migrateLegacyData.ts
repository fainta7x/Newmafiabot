import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDb } from './index.ts';

function parseDateToIso(dateStr?: string): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const str = dateStr.trim();
  if (!str) return null;

  if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length === 3) {
      // DD.MM.YYYY -> convert interpreting as Europe/Moscow
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      const isoLocal = `${year}-${month}-${day}T19:00:00.000+03:00`;
      const parsed = new Date(isoLocal);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();
  return null; // Do NOT fallback silently to current date
}

export async function migrateLegacyData() {
  const db = await getDb();
  const MIGRATION_NAME = 'legacy_data_import';

  // Check if migration already ran
  const alreadyRan = await db.get(
    'SELECT id, status FROM migration_history WHERE migration_name = ?',
    [MIGRATION_NAME]
  );

  if (alreadyRan && alreadyRan.status === 'success') {
    console.log(`Migration "${MIGRATION_NAME}" has already been executed successfully. Skipping.`);
    return;
  }

  const legacyPath = path.join(process.cwd(), 'mafia_db.json');
  if (!fs.existsSync(legacyPath)) {
    console.log('No legacy mafia_db.json file found. Skipping migration.');
    return;
  }

  const report = {
    imported: { players: 0, evenings: 0, bookings: 0, games: 0, tasks: 0, transactions: 0 },
    skipped: { players: 0, evenings: 0, bookings: 0, games: 0, tasks: 0, transactions: 0 },
    conflict: { players: 0, evenings: 0, bookings: 0, games: 0, tasks: 0, transactions: 0 },
    errors: [] as string[],
  };

  try {
    const rawData = fs.readFileSync(legacyPath, 'utf-8');
    const legacyData = JSON.parse(rawData);

    const playerNickMap = new Map<string, string>();
    const eveningDateMap = new Map<string, string>();

    // 1. Players
    if (Array.isArray(legacyData.players)) {
      for (const p of legacyData.players) {
        try {
          const existing = await db.get(
            'SELECT id FROM players WHERE nickname = ? OR (telegram_user_id IS NOT NULL AND telegram_user_id = ?)',
            [p.nickname, p.user_id ? String(p.user_id) : '']
          );

          if (existing) {
            report.conflict.players++;
            playerNickMap.set((p.nickname || '').toLowerCase(), existing.id);
          } else {
            const playerId = crypto.randomUUID();
            let status = 'newcomer';
            if (p.tag === 'Регуляр' || (p.games_played || 0) > 3) status = 'regular';
            if (p.tag === 'Лид') status = 'lead';

            const createdAt = parseDateToIso(p.created_at) || new Date().toISOString();

            await db.run(
              `INSERT INTO players (id, telegram_user_id, nickname, full_name, telegram_username, phone, lifecycle_status, source, notes, elo, tokens, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                playerId,
                p.user_id ? String(p.user_id) : null,
                p.nickname || `Игрок_${p.id}`,
                p.full_name || '',
                p.username || '',
                p.phone || null,
                status,
                'legacy_import',
                p.notes || null,
                p.elo || 1000,
                p.tokens || 0,
                createdAt,
                createdAt,
              ]
            );
            report.imported.players++;
            playerNickMap.set((p.nickname || '').toLowerCase(), playerId);
          }
        } catch (err: any) {
          report.errors.push(`Player error (${p.nickname}): ${err.message}`);
        }
      }
    }

    // 2. Evenings
    if (Array.isArray(legacyData.evenings)) {
      for (const e of legacyData.evenings) {
        try {
          const existing = await db.get('SELECT id FROM game_evenings WHERE title = ?', [e.title]);
          const startsAt = parseDateToIso(e.date);

          if (!startsAt) {
            report.skipped.evenings++;
            report.errors.push(`Skipped evening "${e.title}": Invalid date "${e.date}"`);
            continue;
          }

          if (existing) {
            report.conflict.evenings++;
            eveningDateMap.set(e.date, existing.id);
          } else {
            const eveningId = crypto.randomUUID();
            const status = e.status === 'Завершен' ? 'completed' : e.status === 'Идет сейчас' ? 'active' : 'published';

            await db.run(
              `INSERT INTO game_evenings (id, title, starts_at, ends_at, timezone, venue, format, status, capacity, default_price, notes, settled_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                eveningId,
                e.title || `Игровой вечер ${e.date}`,
                startsAt,
                null,
                'Europe/Moscow',
                e.location || 'Главный зал #1',
                'STANDARD',
                status,
                20,
                400,
                e.notes || null,
                status === 'completed' ? startsAt : null,
                startsAt,
                startsAt,
              ]
            );
            report.imported.evenings++;
            eveningDateMap.set(e.date, eveningId);
          }
        } catch (err: any) {
          report.errors.push(`Evening error (${e.title}): ${err.message}`);
        }
      }
    }

    // 3. Bookings
    if (Array.isArray(legacyData.bookings)) {
      for (const b of legacyData.bookings) {
        try {
          const eveningId = eveningDateMap.get(b.date);
          const playerId = playerNickMap.get((b.nickname || '').toLowerCase());

          if (!eveningId || !playerId) {
            report.skipped.bookings++;
            continue;
          }

          const existingPart = await db.get(
            'SELECT id FROM evening_participants WHERE evening_id = ? AND player_id = ?',
            [eveningId, playerId]
          );

          if (existingPart) {
            report.conflict.bookings++;
          } else {
            const partId = crypto.randomUUID();
            const nowIso = new Date().toISOString();
            await db.run(
              `INSERT INTO evening_participants (id, evening_id, player_id, registration_status, attendance_status, arrival_status, payment_status, amount_due, amount_paid, notes, registered_at, confirmed_at, checked_in_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                partId,
                eveningId,
                playerId,
                b.confirmed ? 'confirmed' : 'registered',
                b.attended ? 'attended' : 'pending',
                b.arrival || 'unknown',
                b.paid ? 'paid' : 'unpaid',
                b.amount_due ?? 400,
                b.amount_paid ?? (b.paid ? 400 : 0),
                b.notes || null,
                nowIso,
                b.confirmed ? nowIso : null,
                b.attended ? nowIso : null,
                nowIso,
                nowIso,
              ]
            );
            report.imported.bookings++;
          }
        } catch (err: any) {
          report.errors.push(`Booking error (${b.nickname} / ${b.date}): ${err.message}`);
        }
      }
    }

    // Record migration run
    const migrationId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    await db.run(
      'INSERT INTO migration_history (id, migration_name, status, details_json, executed_at) VALUES (?, ?, ?, ?, ?)',
      [migrationId, MIGRATION_NAME, 'success', JSON.stringify(report), nowIso]
    );

    console.log('Legacy Data Migration Report:');
    console.log(JSON.stringify(report, null, 2));
  } catch (err: any) {
    console.error('Legacy migration failed:', err);
    await db.run(
      'INSERT INTO migration_history (id, migration_name, status, details_json, executed_at) VALUES (?, ?, ?, ?, ?)',
      [crypto.randomUUID(), MIGRATION_NAME, 'error', JSON.stringify({ error: err.message, report }), new Date().toISOString()]
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateLegacyData().catch(console.error);
}
