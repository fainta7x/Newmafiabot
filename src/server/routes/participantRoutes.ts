import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { updateParticipantSchema } from '../validation.ts';
import { assignParticipantToTable } from '../services/tableAssignmentService.ts';
import { runCrmAutomations } from '../services/crmAutomationService.ts';
import {
  legacyAttendancePatchToFact, parseAttendanceFact, parseResponseStatus,
  serializeEveningParticipant, setParticipantAttendance, setParticipantResponse,
} from '../services/eveningParticipantState.ts';
import baseRouter from './participantRoutesBase.ts';

const router = Router();

router.patch('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const data = updateParticipantSchema.parse(req.body);
    const db = req.db || (await getDb());
    const current = await db.get<any>('SELECT * FROM evening_participants WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Участник не найден' });
    const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ?', [current.evening_id]);
    if (evening?.status === 'completed' || evening?.settled_at) return res.status(400).json({ error: 'Завершённый вечер доступен только для чтения' });

    if (data.table_id !== undefined) await assignParticipantToTable(db, current.id, data.table_id);
    const explicitResponse = data.response_status ?? (['going','late','thinking','declined','unanswered'].includes(String(data.registration_status)) ? data.registration_status : undefined);
    if (explicitResponse !== undefined) await setParticipantResponse(db, current.id, parseResponseStatus(explicitResponse));

    const fact = data.attendance_fact !== undefined
      ? parseAttendanceFact(data.attendance_fact)
      : legacyAttendancePatchToFact(current, data.attendance_status, data.arrival_status);
    if (fact) await setParticipantAttendance(db, current.id, fact);

    const fields: string[] = [];
    const values: any[] = [];
    for (const key of ['payment_status', 'amount_due', 'amount_paid', 'notes'] as const) {
      if (data[key] !== undefined) { fields.push(`${key} = ?`); values.push(data[key]); }
    }
    if (fields.length) {
      fields.push('updated_at = ?'); values.push(new Date().toISOString()); values.push(current.id);
      await db.run(`UPDATE evening_participants SET ${fields.join(', ')} WHERE id = ?`, values);
    }
    await runCrmAutomations(db);
    const updated = await db.get<any>(`SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo FROM evening_participants ep JOIN players p ON p.id = ep.player_id WHERE ep.id = ?`, [current.id]);
    return res.json(serializeEveningParticipant(updated));
  } catch (err: any) {
    return res.status(err.status || 400).json({ error: err.message || 'Не удалось обновить участника' });
  }
});

router.use(baseRouter);
export default router;
