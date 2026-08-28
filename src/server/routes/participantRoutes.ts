import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { updateParticipantSchema } from '../validation.ts';
import { assignParticipantToTable } from '../services/tableAssignmentService.ts';
import { runCrmAutomations } from '../services/crmAutomationService.ts';
import { setClosedEveningParticipantPaid } from '../services/closedEveningPaymentService.ts';
import {
  legacyAttendancePatchToFact, parseAttendanceFact, parseResponseStatus,
  serializeEveningParticipant, setParticipantAttendance, setParticipantResponse,
} from '../services/eveningParticipantState.ts';

const router = Router();

router.patch('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const data = updateParticipantSchema.parse(req.body);
    const db = req.db || (await getDb());
    const current = await db.get<any>('SELECT * FROM evening_participants WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Участник не найден' });
    const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ?', [current.evening_id]);
    const closed = evening?.status === 'completed' || Boolean(evening?.settled_at);
    if (closed) {
      const suppliedKeys = Object.entries(data)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key);
      const paymentOnly = suppliedKeys.length > 0
        && suppliedKeys.every((key) => key === 'payment_status' || key === 'amount_paid');
      if (!paymentOnly) return res.status(400).json({ error: 'Завершённый вечер доступен только для чтения' });

      const due = Math.max(0, Number(current.amount_due || 0));
      const requestedPaid = data.payment_status === 'paid'
        || (data.amount_paid !== undefined && Number(data.amount_paid) >= due && due > 0);
      const requestedUnpaid = data.payment_status === 'unpaid'
        || (data.amount_paid !== undefined && Number(data.amount_paid) <= 0);
      if (!requestedPaid && !requestedUnpaid) {
        return res.status(400).json({ error: 'Для завершённого вечера можно только подтвердить или снять оплату' });
      }

      const updated = await setClosedEveningParticipantPaid(db, String(current.id), requestedPaid);
      await runCrmAutomations(db);
      return res.json(serializeEveningParticipant(updated));
    }

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
    return res.status(err.statusCode || err.status || 400).json({ error: err.message || 'Не удалось обновить участника' });
  }
});

router.delete('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const part = await db.get('SELECT * FROM evening_participants WHERE id = ?', [String(req.params.id)]);
    if (!part) {
      return res.status(404).json({ error: 'Запись участника не найдена' });
    }

    const evening = await db.get('SELECT status, settled_at FROM game_evenings WHERE id = ?', [part.evening_id]);
    if (evening?.status === 'completed' || evening?.settled_at) {
      return res.status(400).json({ error: 'Запрещено удалять участников из завершённых вечеров' });
    }

    await db.run('DELETE FROM evening_participants WHERE id = ?', [String(req.params.id)]);

    await runCrmAutomations(db);

    res.json({ success: true, message: 'Участник удален из вечера' });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

export default router;
