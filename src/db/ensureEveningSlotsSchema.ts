import type { DatabaseWrapper } from './index.ts';

const slotSchemaInitialization = new WeakMap<object, Promise<void>>();

async function initializeEveningSlotsSchema(db: DatabaseWrapper): Promise<void> {
  // Keep ordinary DDL in exec(). Turso's compatibility splitter treats every
  // semicolon as a statement boundary, so CREATE TRIGGER bodies must be sent
  // as single statements through run() instead of being embedded in this script.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS evening_slot_settings (
      evening_id TEXT PRIMARY KEY REFERENCES game_evenings(id) ON DELETE CASCADE,
      planned_slots INTEGER NOT NULL DEFAULT 6,
      slot_duration_minutes INTEGER NOT NULL DEFAULT 60,
      price_per_game INTEGER NOT NULL DEFAULT 100,
      ready_slots_required INTEGER NOT NULL DEFAULT 4,
      ready_players_per_slot INTEGER NOT NULL DEFAULT 11,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evening_game_slots (
      id TEXT PRIMARY KEY,
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      slot_number INTEGER NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      price_rub INTEGER NOT NULL DEFAULT 100,
      target_players INTEGER NOT NULL DEFAULT 11,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (evening_id, slot_number)
    );

    CREATE TABLE IF NOT EXISTS evening_slot_registrations (
      id TEXT PRIMARY KEY,
      slot_id TEXT NOT NULL REFERENCES evening_game_slots(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES evening_participants(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (slot_id, participant_id)
    );

    CREATE INDEX IF NOT EXISTS idx_evening_game_slots_evening_time
      ON evening_game_slots(evening_id, starts_at);
    CREATE INDEX IF NOT EXISTS idx_evening_slot_registrations_slot
      ON evening_slot_registrations(slot_id);
    CREATE INDEX IF NOT EXISTS idx_evening_slot_registrations_participant
      ON evening_slot_registrations(participant_id);
  `);

  // This view is the single SQL source of truth for planned slot pricing.
  // CASUAL and legacy STANDARD evenings are 100 ₽ per selected game, capped at 400 ₽.
  // Competitive/novice formats keep the uncapped sum configured on their slots.
  await db.run('DROP VIEW IF EXISTS evening_participant_slot_pricing');
  await db.run(`
    CREATE VIEW evening_participant_slot_pricing AS
    SELECT ep.id AS participant_id,
           CASE
             WHEN UPPER(COALESCE(e.format, '')) NOT IN ('NOVICE', 'RATING', 'TOURNAMENT')
               THEN MIN(400, COALESCE(SUM(s.price_rub), 0))
             ELSE COALESCE(SUM(s.price_rub), 0)
           END AS canonical_due
      FROM evening_participants ep
      JOIN game_evenings e ON e.id = ep.evening_id
      LEFT JOIN evening_slot_registrations r ON r.participant_id = ep.id
      LEFT JOIN evening_game_slots s ON s.id = r.slot_id
     GROUP BY ep.id, e.format
  `);

  // Replace old trigger bodies on every schema initialization. CREATE TRIGGER IF NOT
  // EXISTS would otherwise leave the pre-fix uncapped production triggers in place.
  await db.run('DROP TRIGGER IF EXISTS trg_evening_slot_registration_insert_amount');
  await db.run('DROP TRIGGER IF EXISTS trg_evening_slot_registration_delete_amount');
  await db.run('DROP TRIGGER IF EXISTS trg_evening_slot_price_update_amount');
  await db.run('DROP TRIGGER IF EXISTS trg_evening_manual_participant_whole_evening_slots');

  await db.run(`
    CREATE TRIGGER trg_evening_slot_registration_insert_amount
    AFTER INSERT ON evening_slot_registrations
    BEGIN
      UPDATE evening_participants
         SET amount_due = COALESCE((
               SELECT canonical_due FROM evening_participant_slot_pricing
                WHERE participant_id = NEW.participant_id
             ), 0),
             payment_status = CASE
               WHEN COALESCE((
                 SELECT canonical_due FROM evening_participant_slot_pricing
                  WHERE participant_id = NEW.participant_id
               ), 0) = 0 THEN 'waived'
               WHEN COALESCE(amount_paid, 0) >= COALESCE((
                 SELECT canonical_due FROM evening_participant_slot_pricing
                  WHERE participant_id = NEW.participant_id
               ), 0) THEN 'paid'
               WHEN COALESCE(amount_paid, 0) > 0 THEN 'partial'
               ELSE 'unpaid'
             END,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = NEW.participant_id;
    END
  `);

  await db.run(`
    CREATE TRIGGER trg_evening_slot_registration_delete_amount
    AFTER DELETE ON evening_slot_registrations
    BEGIN
      UPDATE evening_participants
         SET amount_due = COALESCE((
               SELECT canonical_due FROM evening_participant_slot_pricing
                WHERE participant_id = OLD.participant_id
             ), 0),
             payment_status = CASE
               WHEN COALESCE((
                 SELECT canonical_due FROM evening_participant_slot_pricing
                  WHERE participant_id = OLD.participant_id
               ), 0) = 0 THEN 'waived'
               WHEN COALESCE(amount_paid, 0) >= COALESCE((
                 SELECT canonical_due FROM evening_participant_slot_pricing
                  WHERE participant_id = OLD.participant_id
               ), 0) THEN 'paid'
               WHEN COALESCE(amount_paid, 0) > 0 THEN 'partial'
               ELSE 'unpaid'
             END,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = OLD.participant_id;
    END
  `);

  await db.run(`
    CREATE TRIGGER trg_evening_slot_price_update_amount
    AFTER UPDATE OF price_rub ON evening_game_slots
    BEGIN
      UPDATE evening_participants
         SET amount_due = COALESCE((
               SELECT canonical_due FROM evening_participant_slot_pricing
                WHERE participant_id = evening_participants.id
             ), 0),
             payment_status = CASE
               WHEN COALESCE((
                 SELECT canonical_due FROM evening_participant_slot_pricing
                  WHERE participant_id = evening_participants.id
               ), 0) = 0 THEN 'waived'
               WHEN COALESCE(amount_paid, 0) >= COALESCE((
                 SELECT canonical_due FROM evening_participant_slot_pricing
                  WHERE participant_id = evening_participants.id
               ), 0) THEN 'paid'
               WHEN COALESCE(amount_paid, 0) > 0 THEN 'partial'
               ELSE 'unpaid'
             END,
             updated_at = CURRENT_TIMESTAMP
       WHERE id IN (
         SELECT participant_id
           FROM evening_slot_registrations
          WHERE slot_id = NEW.id
       );
    END
  `);

  // Compatibility for the old organizer button "Добавить на вечер". The new
  // canonical flow selects exact games, but a legacy manual "Иду" still means
  // the whole evening. Slot triggers above now apply the same capped formula.
  await db.run(`
    CREATE TRIGGER trg_evening_manual_participant_whole_evening_slots
    AFTER INSERT ON evening_participants
    WHEN NEW.response_status IN ('going', 'late')
      AND EXISTS (
        SELECT 1 FROM evening_game_slots
         WHERE evening_id = NEW.evening_id AND status = 'open'
      )
      AND NOT EXISTS (
        SELECT 1 FROM evening_slot_registrations WHERE participant_id = NEW.id
      )
    BEGIN
      INSERT OR IGNORE INTO evening_slot_registrations
        (id, slot_id, participant_id, created_at, updated_at)
      SELECT lower(hex(randomblob(16))), s.id, NEW.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM evening_game_slots s
       WHERE s.evening_id = NEW.evening_id AND s.status = 'open';

      UPDATE evening_participants
         SET amount_due = COALESCE((
               SELECT canonical_due FROM evening_participant_slot_pricing
                WHERE participant_id = NEW.id
             ), 0),
             payment_status = CASE
               WHEN COALESCE((
                 SELECT canonical_due FROM evening_participant_slot_pricing
                  WHERE participant_id = NEW.id
               ), 0) = 0 THEN 'waived'
               WHEN COALESCE(amount_paid, 0) >= COALESCE((
                 SELECT canonical_due FROM evening_participant_slot_pricing
                  WHERE participant_id = NEW.id
               ), 0) THEN 'paid'
               WHEN COALESCE(amount_paid, 0) > 0 THEN 'partial'
               ELSE 'unpaid'
             END,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = NEW.id;
    END
  `);

  // Repair stale planned charges for open evenings only. Closed regular evenings are
  // priced from actual completed games by eveningPaymentPricingService; slot selection
  // must never overwrite that historical fact on application startup.
  await db.run(`
    UPDATE evening_participants
       SET amount_due = COALESCE((
             SELECT canonical_due FROM evening_participant_slot_pricing
              WHERE participant_id = evening_participants.id
           ), 0),
           payment_status = CASE
             WHEN COALESCE((
               SELECT canonical_due FROM evening_participant_slot_pricing
                WHERE participant_id = evening_participants.id
             ), 0) = 0 THEN 'waived'
             WHEN COALESCE(amount_paid, 0) >= COALESCE((
               SELECT canonical_due FROM evening_participant_slot_pricing
                WHERE participant_id = evening_participants.id
             ), 0) THEN 'paid'
             WHEN COALESCE(amount_paid, 0) > 0 THEN 'partial'
             ELSE 'unpaid'
           END,
           updated_at = CURRENT_TIMESTAMP
     WHERE id IN (SELECT DISTINCT participant_id FROM evening_slot_registrations)
       AND evening_id IN (
         SELECT id FROM game_evenings
          WHERE status != 'completed' AND settled_at IS NULL
       )
  `);
}

export async function ensureEveningSlotsSchema(db: DatabaseWrapper): Promise<void> {
  const key = db as unknown as object;
  const running = slotSchemaInitialization.get(key);
  if (running) return running;

  const initialization = initializeEveningSlotsSchema(db);
  slotSchemaInitialization.set(key, initialization);
  try {
    await initialization;
  } catch (error) {
    if (slotSchemaInitialization.get(key) === initialization) {
      slotSchemaInitialization.delete(key);
    }
    throw error;
  }
}
