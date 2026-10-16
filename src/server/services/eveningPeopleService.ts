import type { DatabaseWrapper } from '../../db/index.ts';
import { listGuestPlaceholdersForEvening } from './guestPlayerService.ts';
import { serializeEveningParticipant } from './eveningParticipantState.ts';

/** The organizer roster: club players plus guests/companions, without migrated legacy duplicates. */
export async function loadEveningPeople(db: DatabaseWrapper, eveningId: string, includeAssignedJudge = false) {
  const guests = await listGuestPlaceholdersForEvening(db, eveningId);
  const registered = await db.all<any>(`
    SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo
      FROM evening_participants ep JOIN players p ON p.id = ep.player_id
     WHERE ep.evening_id = ? AND NOT EXISTS (
       SELECT 1 FROM guest_player_placeholders gp WHERE gp.legacy_participant_id = ep.id
     ) ORDER BY ep.created_at ASC`, [eveningId]);
  const people = [...registered.map(serializeEveningParticipant), ...guests];
  if (includeAssignedJudge) {
    const judge = await db.get<any>(`SELECT p.id, p.nickname FROM evening_staff_assignments s
      JOIN players p ON p.id = s.judge_player_id WHERE s.evening_id = ?`, [eveningId]);
    const existing = judge && people.find((person) => String(person.player_id || '') === String(judge.id));
    if (existing && ['going', 'late'].includes(existing.response_status)) existing.is_assigned_judge = true;
    if (judge && !existing) {
      people.push({ id: `judge:${judge.id}`, player_id: String(judge.id), nickname: judge.nickname,
        is_assigned_judge: true, is_staff_only: true, response_status: 'going', registration_status: 'going', attendance_status: 'pending' } as any);
    }
  }
  return people.sort((a: any, b: any) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
}
