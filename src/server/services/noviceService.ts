import type { DatabaseWrapper } from '../../db/index.ts';

export const NOVICE_APPLICATION_STATUSES = {
  NEW: 'NEW',
  CONFIRMED: 'CONFIRMED',
  ATTENDED: 'ATTENDED',
  COMPLETED: 'COMPLETED',
  CONVERTED: 'CONVERTED',
  CANCELLED: 'CANCELLED',
} as const;

export type NoviceApplicationStatus = keyof typeof NOVICE_APPLICATION_STATUSES;

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

export async function createNoviceApplication(
  db: DatabaseWrapper,
  input: { playerId?: string; source?: string; notes?: string },
) {
  const timestamp = now();
  const applicationId = id();

  await db.run(
    `INSERT INTO novice_applications
      (id, player_id, source, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, 'NEW', ?, ?, ?)`,
    [
      applicationId,
      input.playerId ?? null,
      input.source ?? 'telegram',
      input.notes ?? null,
      timestamp,
      timestamp,
    ],
  );

  if (input.playerId) {
    await db.run(
      `UPDATE players SET club_stage = 'NOVICE_ACTIVE' WHERE id = ?`,
      [input.playerId],
    );
  }

  return applicationId;
}

export async function updateNoviceApplicationStatus(
  db: DatabaseWrapper,
  applicationId: string,
  status: NoviceApplicationStatus,
) {
  await db.run(
    `UPDATE novice_applications SET status = ?, updated_at = ? WHERE id = ?`,
    [status, now(), applicationId],
  );
}

export async function convertNoviceToClubPlayer(
  db: DatabaseWrapper,
  playerId: string,
) {
  const timestamp = now();

  await db.run(
    `UPDATE players SET club_stage = 'CLUB_PLAYER' WHERE id = ?`,
    [playerId],
  );

  await db.run(
    `UPDATE novice_applications
        SET status = 'CONVERTED', updated_at = ?
      WHERE player_id = ?
        AND status != 'CONVERTED'`,
    [timestamp, playerId],
  );
}
