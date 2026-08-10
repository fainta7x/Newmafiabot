BEGIN IMMEDIATE;

UPDATE evening_participants
SET response_status = CASE
  WHEN response_status IN ('going','late','thinking','declined') THEN response_status
  WHEN registration_status IN ('going','late','thinking','declined') THEN registration_status
  WHEN registration_status = 'cancelled' THEN 'declined'
  WHEN registration_status IN ('registered','confirmed','waitlist')
       AND attendance_status = 'pending' AND arrival_status = 'late' THEN 'late'
  WHEN registration_status IN ('registered','confirmed','waitlist') THEN 'going'
  ELSE 'unanswered'
END
WHERE NOT EXISTS (
  SELECT 1 FROM migration_history WHERE migration_name = '0011_canonical_evening_response_attendance'
);

UPDATE evening_participants
SET arrival_status = 'unknown'
WHERE NOT EXISTS (
  SELECT 1 FROM migration_history WHERE migration_name = '0011_canonical_evening_response_attendance'
)
  AND registration_status IN ('registered','confirmed','waitlist')
  AND attendance_status = 'pending'
  AND arrival_status = 'late';

UPDATE evening_participants
SET registration_status = response_status
WHERE NOT EXISTS (
  SELECT 1 FROM migration_history WHERE migration_name = '0011_canonical_evening_response_attendance'
);

CREATE INDEX IF NOT EXISTS idx_evening_participants_response ON evening_participants(evening_id, response_status);

INSERT OR IGNORE INTO migration_history (id, migration_name, status, details_json, executed_at)
VALUES (
  '0011_canonical_evening_response_attendance',
  '0011_canonical_evening_response_attendance',
  'success',
  '{"scope":"response_status_backfill_only","tokens":false,"settlements":false,"transactions":false}',
  CURRENT_TIMESTAMP
);

COMMIT;
