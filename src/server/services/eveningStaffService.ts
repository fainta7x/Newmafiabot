import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureClubOperationsSchema } from '../../db/ensureClubOperationsSchema.ts';

/** True when the evening already has its organizer (evening_staff_assignments). */
export async function eveningOrganizerAssigned(db: DatabaseWrapper, eveningId: string) {
  await ensureClubOperationsSchema(db);
  const row = await db.get<any>('SELECT organizer_player_id FROM evening_staff_assignments WHERE evening_id = ? LIMIT 1', [eveningId]);
  return Boolean(row?.organizer_player_id);
}

/** Assigns the signed-in organizer when their profile has the «Организатор» club role. */
export async function autoAssignEveningOrganizer(db: DatabaseWrapper, eveningId: string, playerId: string | null) {
  if (!playerId) return false;
  const organizer = await db.get<any>("SELECT id FROM players WHERE id = ? AND COALESCE(club_role, 'member') = 'organizer' LIMIT 1", [playerId]);
  if (!organizer) return false;
  await ensureClubOperationsSchema(db);
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO evening_staff_assignments (evening_id, organizer_player_id, assigned_at, updated_at)
     VALUES (?, ?, ?, ?) ON CONFLICT(evening_id) DO NOTHING`,
    [eveningId, playerId, now, now],
  );
  return true;
}
