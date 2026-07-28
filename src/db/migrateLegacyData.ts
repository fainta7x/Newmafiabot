import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDb } from './index.ts';

function parseDateToIso(dateStr?: string): string {
  if (!dateStr) return new Date().toISOString();
  if (dateStr.includes('.')) {
    const parts = dateStr.split('.');
    if (parts.length === 3) {
      // DD.MM.YYYY
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}T19:00:00.000Z`;
    }
  }
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();
  return new Date().toISOString();
}

export async function migrateLegacyData() {
  const db = await getDb();
  const legacyPath = path.join(process.cwd(), 'mafia_db.json');

  if (!fs.existsSync(legacyPath)) {
    console.log('No legacy mafia_db.json found. Skipping migration.');
    return;
  }

  // Backup legacy JSON
  const backupPath = path.join(process.cwd(), `mafia_db.backup.${Date.now()}.json`);
  fs.copyFileSync(legacyPath, backupPath);
  console.log(`Backed up legacy mafia_db.json to ${backupPath}`);

  const rawData = fs.readFileSync(legacyPath, 'utf-8');
  let legacyData: any = {};
  try {
    legacyData = JSON.parse(rawData);
  } catch (e) {
    console.error('Failed to parse legacy mafia_db.json:', e);
    return;
  }

  // Map to keep track of Player UUIDs by nickname and legacy ID
  const playerMap = new Map<string, string>();
  const playerNickMap = new Map<string, string>();

  // 1. Migrate Players
  if (Array.isArray(legacyData.players)) {
    for (const p of legacyData.players) {
      const existing = await db.get('SELECT id FROM players WHERE nickname = ? OR telegram_user_id = ?', [
        p.nickname,
        p.user_id ? String(p.user_id) : null,
      ]);

      let playerId: string;
      if (existing) {
        playerId = existing.id;
      } else {
        playerId = crypto.randomUUID();
        let status = 'newcomer';
        if (p.tag === 'Регуляр' || (p.games_played || 0) > 3) status = 'regular';
        if (p.tag === 'Лид') status = 'lead';

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
            new Date().toISOString(),
            new Date().toISOString(),
          ]
        );
      }

      playerMap.set(String(p.id), playerId);
      if (p.nickname) playerNickMap.set(p.nickname.toLowerCase(), playerId);
    }
  }

  // 2. Migrate Evenings
  const eveningDateMap = new Map<string, string>();
  if (Array.isArray(legacyData.evenings)) {
    for (const e of legacyData.evenings) {
      const existing = await db.get('SELECT id FROM game_evenings WHERE title = ?', [e.title]);
      let eveningId: string;
      const startsAt = parseDateToIso(e.date);

      if (existing) {
        eveningId = existing.id;
      } else {
        eveningId = crypto.randomUUID();
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
            status === 'completed' ? new Date().toISOString() : null,
            new Date().toISOString(),
            new Date().toISOString(),
          ]
        );
      }

      if (e.date) eveningDateMap.set(e.date, eveningId);
    }
  }

  // 3. Migrate Bookings into evening_participants
  if (Array.isArray(legacyData.bookings)) {
    for (const b of legacyData.bookings) {
      const eveningId = eveningDateMap.get(b.date);
      const playerId = playerNickMap.get((b.nickname || '').toLowerCase());

      if (eveningId && playerId) {
        const existingPart = await db.get(
          'SELECT id FROM evening_participants WHERE evening_id = ? AND player_id = ?',
          [eveningId, playerId]
        );

        if (!existingPart) {
          const partId = crypto.randomUUID();
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
              new Date().toISOString(),
              b.confirmed ? new Date().toISOString() : null,
              b.attended ? new Date().toISOString() : null,
              new Date().toISOString(),
              new Date().toISOString(),
            ]
          );
        }
      }
    }
  }

  // 4. Migrate Games
  if (Array.isArray(legacyData.games)) {
    for (const g of legacyData.games) {
      const existingGame = await db.get('SELECT id FROM games WHERE global_game_number = ?', [g.global_game_number || g.id]);
      if (!existingGame) {
        const eveningId = eveningDateMap.get(g.game_date) || null;
        await db.run(
          `INSERT INTO games (evening_id, global_game_number, game_date, winner_team, winner_label, judge_name, protocol_text, slots_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            eveningId,
            g.global_game_number || g.id,
            g.game_date || '31.07.2026',
            g.winner_team || g.winner_label || 'Чёрные',
            g.winner_label || 'Чёрные',
            g.judge_name || 'Главный судья',
            g.protocol_text || '',
            JSON.stringify(g.slots || []),
            new Date().toISOString(),
          ]
        );
      }
    }
  }

  // 5. Migrate Tasks
  if (Array.isArray(legacyData.tasks)) {
    for (const t of legacyData.tasks) {
      const existingTask = await db.get('SELECT id FROM organizer_tasks WHERE title = ?', [t.title]);
      if (!existingTask) {
        await db.run(
          `INSERT INTO organizer_tasks (id, title, description, type, status, priority, due_at, completed_at, player_id, evening_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            t.title,
            t.description || null,
            t.category?.toLowerCase() === 'закупки' ? 'preparation' : t.category?.toLowerCase() === 'оплата/касса' ? 'payment' : 'other',
            t.status || 'todo',
            t.priority || 'medium',
            t.due_date ? parseDateToIso(t.due_date) : null,
            t.status === 'done' ? new Date().toISOString() : null,
            null,
            null,
            new Date().toISOString(),
            new Date().toISOString(),
          ]
        );
      }
    }
  }

  // 6. Migrate Transactions
  if (Array.isArray(legacyData.transactions)) {
    for (const tx of legacyData.transactions) {
      const existingTx = await db.get('SELECT id FROM financial_transactions WHERE description = ? AND amount = ?', [tx.description, tx.amount]);
      if (!existingTx) {
        const playerId = tx.nickname ? playerNickMap.get(tx.nickname.toLowerCase()) || null : null;
        await db.run(
          `INSERT INTO financial_transactions (id, type, amount, category, description, player_id, evening_id, source_type, source_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            tx.type || 'income',
            tx.amount || 0,
            tx.category || 'Прочее',
            tx.description || '',
            playerId,
            null,
            'legacy_import',
            tx.id || null,
            parseDateToIso(tx.timestamp),
          ]
        );
      }
    }
  }

  console.log('Legacy data migration completed successfully!');
}

// Auto-run when executed directly via npx tsx
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateLegacyData().catch(console.error);
}
