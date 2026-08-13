import type { DatabaseWrapper } from './index.ts';

export async function ensureEveningSlotsSchema(db: DatabaseWrapper): Promise<void> {
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

    CREATE TRIGGER IF NOT EXISTS trg_evening_slot_registration_insert_amount
    AFTER INSERT ON evening_slot_registrations
    BEGIN
      UPDATE evening_participants
         SET amount_due = (
               SELECT COALESCE(SUM(s.price_rub), 0)
                 FROM evening_slot_registrations r
                 JOIN evening_game_slots s ON s.id = r.slot_id
                WHERE r.participant_id = NEW.participant_id
             ),
             payment_status = CASE
               WHEN (
                 SELECT COALESCE(SUM(s.price_rub), 0)
                   FROM evening_slot_registrations r
                   JOIN evening_game_slots s ON s.id = r.slot_id
                  WHERE r.participant_id = NEW.participant_id
               ) = 0 THEN 'waived'
               WHEN COALESCE(amount_paid, 0) >= (
                 SELECT COALESCE(SUM(s.price_rub), 0)
                   FROM evening_slot_registrations r
                   JOIN evening_game_slots s ON s.id = r.slot_id
                  WHERE r.participant_id = NEW.participant_id
               ) THEN 'paid'
               ELSE 'unpaid'
             END,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = NEW.participant_id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_evening_slot_registration_delete_amount
    AFTER DELETE ON evening_slot_registrations
    BEGIN
      UPDATE evening_participants
         SET amount_due = (
               SELECT COALESCE(SUM(s.price_rub), 0)
                 FROM evening_slot_registrations r
                 JOIN evening_game_slots s ON s.id = r.slot_id
                WHERE r.participant_id = OLD.participant_id
             ),
             payment_status = CASE
               WHEN (
                 SELECT COALESCE(SUM(s.price_rub), 0)
                   FROM evening_slot_registrations r
                   JOIN evening_game_slots s ON s.id = r.slot_id
                  WHERE r.participant_id = OLD.participant_id
               ) = 0 THEN 'waived'
               WHEN COALESCE(amount_paid, 0) >= (
                 SELECT COALESCE(SUM(s.price_rub), 0)
                   FROM evening_slot_registrations r
                   JOIN evening_game_slots s ON s.id = r.slot_id
                  WHERE r.participant_id = OLD.participant_id
               ) THEN 'paid'
               ELSE 'unpaid'
             END,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = OLD.participant_id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_evening_slot_price_update_amount
    AFTER UPDATE OF price_rub ON evening_game_slots
    BEGIN
      UPDATE evening_participants
         SET amount_due = (
               SELECT COALESCE(SUM(s.price_rub), 0)
                 FROM evening_slot_registrations r
                 JOIN evening_game_slots s ON s.id = r.slot_id
                WHERE r.participant_id = evening_participants.id
             ),
             payment_status = CASE
               WHEN (
                 SELECT COALESCE(SUM(s.price_rub), 0)
                   FROM evening_slot_registrations r
                   JOIN evening_game_slots s ON s.id = r.slot_id
                  WHERE r.participant_id = evening_participants.id
               ) = 0 THEN 'waived'
               WHEN COALESCE(amount_paid, 0) >= (
                 SELECT COALESCE(SUM(s.price_rub), 0)
                   FROM evening_slot_registrations r
                   JOIN evening_game_slots s ON s.id = r.slot_id
                  WHERE r.participant_id = evening_participants.id
               ) THEN 'paid'
               ELSE 'unpaid'
             END,
             updated_at = CURRENT_TIMESTAMP
       WHERE id IN (
         SELECT participant_id
           FROM evening_slot_registrations
          WHERE slot_id = NEW.id
       );
    END;

    UPDATE evening_participants
       SET amount_due = (
             SELECT COALESCE(SUM(s.price_rub), 0)
               FROM evening_slot_registrations r
               JOIN evening_game_slots s ON s.id = r.slot_id
              WHERE r.participant_id = evening_participants.id
           ),
           payment_status = CASE
             WHEN (
               SELECT COALESCE(SUM(s.price_rub), 0)
                 FROM evening_slot_registrations r
                 JOIN evening_game_slots s ON s.id = r.slot_id
                WHERE r.participant_id = evening_participants.id
             ) = 0 THEN 'waived'
             WHEN COALESCE(amount_paid, 0) >= (
               SELECT COALESCE(SUM(s.price_rub), 0)
                 FROM evening_slot_registrations r
                 JOIN evening_game_slots s ON s.id = r.slot_id
                WHERE r.participant_id = evening_participants.id
             ) THEN 'paid'
             ELSE 'unpaid'
           END,
           updated_at = CURRENT_TIMESTAMP
     WHERE id IN (SELECT DISTINCT participant_id FROM evening_slot_registrations);
  `);
}
