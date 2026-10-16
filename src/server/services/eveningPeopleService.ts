import type { DatabaseWrapper } from '../../db/index.ts';
import { listGuestPlaceholdersForEvening } from './guestPlayerService.ts';
import { serializeEveningParticipant } from './eveningParticipantState.ts';

/** The organizer roster: club players plus guests/companions, without migrated legacy duplicates. */
export async function loadEveningPeople(db: DatabaseWrapper, eveningId: string) {
  const guests = await listGuestPlaceholdersForEvening(db, eveningId);
  const registered = await db.all<any>(`
    SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo
      FROM evening_participants ep JOIN players p ON p.id = ep.player_id
     WHERE ep.evening_id = ? AND NOT EXISTS (
       SELECT 1 FROM guest_player_placeholders gp WHERE gp.legacy_participant_id = ep.id
     ) ORDER BY ep.created_at ASC`, [eveningId]);
  return [...registered.map(serializeEveningParticipant), ...guests]
    .sort((a: any, b: any) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
}
