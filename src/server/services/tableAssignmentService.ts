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
  targetTableId?: string | null,
  targetRegistrationStatus?: string | null,
  eveningIdParam?: string
) {
  // Handle flexible signature where 4th argument might be eveningIdParam if not a valid status
  const VALID_STATUSES = ['invited', 'registered', 'confirmed', 'waitlist', 'cancelled'];
  let finalRegistrationStatusParam = targetRegistrationStatus;
  let finalEveningIdParam = eveningIdParam;

  if (targetRegistrationStatus && !VALID_STATUSES.includes(targetRegistrationStatus)) {
    finalEveningIdParam = targetRegistrationStatus;
    finalRegistrationStatusParam = undefined;
  }

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
  if (finalEveningIdParam && participant.evening_id !== finalEveningIdParam) {
    throw new TableAssignmentError('Участник не принадлежит этому вечеру', 400);
  }

  // 4. Verify evening is not completed or settled
  if (evening.status === 'completed' || evening.settled_at) {
    throw new TableAssignmentError('Запрещено изменять столы или статусы участников на завершённых вечерах', 400);
  }

  const now = new Date().toISOString();

  // Determine finalTableId:
  // - undefined: keep current table_id
  // - null or '': unassign (set to null)
  // - string: target table_id
  let finalTableId: string | null;
  if (targetTableId === undefined) {
    finalTableId = participant.table_id;
  } else if (targetTableId === null || targetTableId === '') {
    finalTableId = null;
  } else {
    finalTableId = targetTableId;
  }

  // Requested status
  const requestedStatus = finalRegistrationStatusParam ?? participant.registration_status;

  if (finalTableId !== null) {
    // 5. Verify table exists and belongs to participant's evening
    const table = await db.get('SELECT * FROM evening_tables WHERE id = ?', [finalTableId]);
    if (!table) {
      throw new TableAssignmentError('Стол не найден', 404);
    }
    if (table.evening_id !== participant.evening_id) {
      throw new TableAssignmentError('Стол принадлежит другому вечеру', 400);
    }

    // 6. Calculate occupied seats (only registered and confirmed occupy seats!)
    const countRow = await db.get(
      `SELECT COUNT(*) as cnt FROM evening_participants 
       WHERE table_id = ? AND registration_status IN ('registered', 'confirmed') AND id != ?`,
      [finalTableId, participantId]
    );
    const occupied = countRow?.cnt || 0;

    let newStatus = requestedStatus;

    if (requestedStatus === 'invited' || requestedStatus === 'cancelled') {
      newStatus = requestedStatus;
    } else if (requestedStatus === 'registered' || requestedStatus === 'confirmed') {
      if (occupied >= table.capacity) {
        newStatus = 'waitlist';
      } else {
        newStatus = requestedStatus;
      }
    } else if (requestedStatus === 'waitlist') {
      if (occupied < table.capacity && participant.registration_status === 'waitlist' && !finalRegistrationStatusParam) {
        newStatus = 'registered';
      } else {
        newStatus = 'waitlist';
      }
    }

    await db.run(
      `UPDATE evening_participants SET table_id = ?, registration_status = ?, updated_at = ? WHERE id = ?`,
      [finalTableId, newStatus, now, participantId]
    );
  } else {
    // Unassign table
    await db.run(
      `UPDATE evening_participants SET table_id = NULL, registration_status = ?, updated_at = ? WHERE id = ?`,
      [requestedStatus, now, participantId]
    );
  }

  return await db.get('SELECT * FROM evening_participants WHERE id = ?', [participantId]);
}
