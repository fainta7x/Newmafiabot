import type { DatabaseWrapper } from './index.ts';

/**
 * Repairs only the pre-cutover mismatch where response_status was added with its
 * default while registration_status still contained the actual player answer.
 */
export async function ensureCanonicalEveningParticipantState(db: DatabaseWrapper) {
  await db.run(`
    UPDATE evening_participants
       SET response_status = CASE
             WHEN registration_status IN ('going', 'registered', 'confirmed') THEN 'going'
             WHEN registration_status = 'late' OR (registration_status = 'waitlist' AND arrival_status = 'late') THEN 'late'
             WHEN registration_status = 'thinking' THEN 'thinking'
             WHEN registration_status IN ('declined', 'cancelled') THEN 'declined'
             ELSE 'unanswered'
           END,
           registration_status = CASE
             WHEN registration_status IN ('going', 'registered', 'confirmed') THEN 'going'
             WHEN registration_status = 'late' OR (registration_status = 'waitlist' AND arrival_status = 'late') THEN 'late'
             WHEN registration_status = 'thinking' THEN 'thinking'
             WHEN registration_status IN ('declined', 'cancelled') THEN 'declined'
             ELSE 'unanswered'
           END,
           updated_at = CURRENT_TIMESTAMP
     WHERE COALESCE(response_status, 'unanswered') = 'unanswered'
       AND registration_status IN ('going', 'late', 'registered', 'confirmed', 'thinking', 'declined', 'cancelled', 'waitlist')
       AND NOT (registration_status = 'waitlist' AND COALESCE(arrival_status, 'unknown') != 'late')
  `);
}
