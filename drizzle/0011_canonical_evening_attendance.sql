-- 04B0: canonical planned response, independent from actual attendance.
UPDATE evening_participants
SET response_status = CASE
  WHEN attendance_status = 'pending' AND arrival_status = 'late' THEN 'late'
  WHEN registration_status = 'going' THEN 'going'
  WHEN registration_status = 'late' THEN 'late'
  WHEN registration_status = 'thinking' THEN 'thinking'
  WHEN registration_status IN ('declined', 'cancelled') THEN 'declined'
  WHEN registration_status IN ('registered', 'confirmed') THEN 'going'
  WHEN registration_status IN ('invited', 'waitlist') THEN 'unanswered'
  ELSE CASE
    WHEN response_status IN ('going', 'late', 'thinking', 'declined', 'unanswered') THEN response_status
    ELSE 'unanswered'
  END
END;
UPDATE evening_participants
SET registration_status = response_status,
    arrival_status = CASE WHEN attendance_status = 'pending' THEN 'unknown' ELSE arrival_status END
WHERE registration_status IS NOT response_status
   OR (attendance_status = 'pending' AND arrival_status != 'unknown');
CREATE INDEX IF NOT EXISTS idx_evening_participants_response ON evening_participants(evening_id, response_status);