import { DatabaseWrapper } from '../../db/index.ts';

export class TableAssignmentError extends Error {
  status: number;
  constructor(message: string, status: number = 400) { super(message); this.status = status; this.name = 'TableAssignmentError'; }
}

// Table assignment is intentionally isolated from response, attendance and payment state.
export async function assignParticipantToTable(db: DatabaseWrapper, participantId: string, targetTableId?: string | null, eveningIdParam?: string) {
  const participant = await db.get('SELECT * FROM evening_participants WHERE id = ?', [participantId]);
  if (!participant) throw new TableAssignmentError('Участник не найден', 404);
  const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [participant.evening_id]);
  if (!evening) throw new TableAssignmentError('Игровой вечер не найден', 404);
  if (eveningIdParam && participant.evening_id !== eveningIdParam) throw new TableAssignmentError('Участник не принадлежит этому вечеру', 400);
  if (evening.status === 'completed' || evening.settled_at) throw new TableAssignmentError('Запрещено изменять участника на завершённом вечере', 400);
  let finalTableId = participant.table_id;
  if (targetTableId !== undefined) finalTableId = targetTableId === null || targetTableId === '' ? null : targetTableId;
  if (finalTableId) {
    const table = await db.get('SELECT * FROM evening_tables WHERE id = ?', [finalTableId]);
    if (!table) throw new TableAssignmentError('Стол не найден', 404);
    if (table.evening_id !== participant.evening_id) throw new TableAssignmentError('Стол принадлежит другому вечеру', 400);
  }
  await db.run('UPDATE evening_participants SET table_id = ?, updated_at = ? WHERE id = ?', [finalTableId, new Date().toISOString(), participantId]);
  return await db.get('SELECT * FROM evening_participants WHERE id = ?', [participantId]);
}
