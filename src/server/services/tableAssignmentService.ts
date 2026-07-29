import { DatabaseWrapper } from '../../db/index.ts';

export class TableAssignmentError extends Error {
  status: number;
  constructor(message: string, status: number = 400) {
    super(message);
    this.status = status;
    this.name = 'TableAssignmentError';
  }
}

/**
 * Assigns or moves a participant to a table with capacity check and validation.
 *
 * Requirements:
 * - Validate participant exists
 * - Validate evening exists and is NOT completed/settled
 * - If eveningIdParam provided, validate participant belongs to that evening
 * - If targetTableId is provided:
 *   - Validate table exists
 *   - Validate table belongs to same evening as participant
 *   - Count occupied seats (excluding cancelled and waitlist, and excluding target participant)
 *   - If occupied >= table.capacity and current status != 'cancelled' -> registration_status becomes 'waitlist'
 *   - If occupied < table.capacity and current status == 'waitlist' -> registration_status becomes 'registered'
 * - If targetTableId is null/empty -> table_id becomes null (unassigned)
 */
export async function assignParticipantToTable(
  db: DatabaseWrapper,
  participantId: string,
  targetTableId: string | null | undefined,
  eveningIdParam?: string
) {
  // 1. Verify participant exists
  const participant = await db.get('SELECT * FROM evening_participants WHERE id = ?', [participantId]);
  if (!participant) {
    throw new TableAssignmentError('Участник не найден', 404);
  }

  // 2. Verify evening exists
  const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [participant.evening_id]);
  if (!evening) {
    throw new TableAssignmentError('Игровой вечер не найден', 404);
  }

  // 3. Verify participant belongs to eveningIdParam if provided
  if (eveningIdParam && participant.evening_id !== eveningIdParam) {
    throw new TableAssignmentError('Участник не принадлежит этому вечеру', 400);
  }

  // 4. Verify evening is not completed
  if (evening.status === 'completed' || evening.settled_at) {
    throw new TableAssignmentError('Запрещено изменять столы завершённых вечеров', 400);
  }

  const now = new Date().toISOString();

  // 5. If targetTableId is null/empty -> unassign table
  if (!targetTableId) {
    await db.run(
      `UPDATE evening_participants SET table_id = NULL, updated_at = ? WHERE id = ?`,
      [now, participantId]
    );
    return await db.get('SELECT * FROM evening_participants WHERE id = ?', [participantId]);
  }

  // 6. Verify table exists
  const table = await db.get('SELECT * FROM evening_tables WHERE id = ?', [targetTableId]);
  if (!table) {
    throw new TableAssignmentError('Стол не найден', 404);
  }

  // 7. Verify table belongs to participant's evening
  if (table.evening_id !== participant.evening_id) {
    throw new TableAssignmentError('Стол принадлежит другому вечеру', 400);
  }

  // 8. Calculate occupied seats (excluding cancelled and waitlist, and excluding current participant)
  const countRow = await db.get(
    `SELECT COUNT(*) as cnt FROM evening_participants 
     WHERE table_id = ? AND registration_status NOT IN ('cancelled', 'waitlist') AND id != ?`,
    [targetTableId, participantId]
  );
  const occupied = countRow?.cnt || 0;

  let newRegistrationStatus = participant.registration_status;

  if (occupied >= table.capacity && participant.registration_status !== 'cancelled') {
    newRegistrationStatus = 'waitlist';
  } else if (occupied < table.capacity && participant.registration_status === 'waitlist') {
    newRegistrationStatus = 'registered';
  }

  // 9. Update participant
  await db.run(
    `UPDATE evening_participants 
     SET table_id = ?, registration_status = ?, updated_at = ? 
     WHERE id = ?`,
    [targetTableId, newRegistrationStatus, now, participantId]
  );

  return await db.get('SELECT * FROM evening_participants WHERE id = ?', [participantId]);
}
