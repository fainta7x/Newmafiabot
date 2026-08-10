import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { updateParticipantSchema } from '../validation.ts';
import { runCrmAutomations } from '../services/crmAutomationService.ts';
import { assignParticipantToTable, TableAssignmentError } from '../services/tableAssignmentService.ts';
import { normalizeEveningResponse, normalizeLegacyEveningResponseInput, resolveAttendanceWrite } from '../../lib/eveningResponse.ts';

const router = Router();

// PATCH /api/evening-participants/:id - Update participant status, payment, notes
router.patch('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const data = updateParticipantSchema.parse(req.body);
    const db = (req as any).db || (await getDb());
    const participant = await db.get('SELECT * FROM evening_participants WHERE id = ?', [req.params.id]);
    if (!participant) return res.status(404).json({ error: 'Участник не найден' });
    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [participant.evening_id]);
    if (evening?.status === 'completed' || evening?.settled_at) return res.status(400).json({ error: 'Завершённый вечер нельзя редактировать' });

    if (data.response_status !== undefined && data.registration_status !== undefined) {
      const canonical = normalizeEveningResponse(data.response_status);
      const compat = normalizeLegacyEveningResponseInput(data.registration_status);
      if (canonical !== compat) return res.status(400).json({ error: 'response_status конфликтует с registration_status' });
    }
    const response = data.response_status !== undefined
      ? normalizeEveningResponse(data.response_status)
      : data.registration_status !== undefined ? normalizeLegacyEveningResponseInput(data.registration_status) : null;
    let attendance = null;
    try {
      attendance = resolveAttendanceWrite(participant, data, new Date().toISOString());
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }

    await db.transaction(async (tx) => {
      if (data.table_id !== undefined) await assignParticipantToTable(tx, req.params.id, data.table_id, participant.evening_id);
      const fields: string[] = []; const values: any[] = [];
      if (response) { fields.push('response_status = ?', 'registration_status = ?'); values.push(response, response); }
      if (attendance) {
        fields.push('attendance_status = ?', 'arrival_status = ?', 'checked_in_at = ?');
        values.push(attendance.attendance_status, attendance.arrival_status, attendance.checked_in_at ?? null);
      }
      for (const key of ['payment_status','amount_due','amount_paid','notes'] as const) {
        if ((data as any)[key] !== undefined) { fields.push(`${key} = ?`); values.push((data as any)[key]); }
      }
      if (fields.length) {
        fields.push('updated_at = ?'); values.push(new Date().toISOString(), req.params.id);
        await tx.run(`UPDATE evening_participants SET ${fields.join(', ')} WHERE id = ?`, values);
      }
    });
    res.json(await db.get(`SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo,
      (SELECT updated_at FROM player_avatars pa WHERE pa.player_id = p.id) AS avatar_updated_at
      FROM evening_participants ep JOIN players p ON p.id = ep.player_id WHERE ep.id = ?`, [req.params.id]));
  } catch (err: any) {
    const status = err instanceof TableAssignmentError ? err.status : 400;
    res.status(status).json({ error: err.message || 'Validation error', details: err.errors });
  }
});

// DELETE /api/evening-participants/:id - Remove participant from evening
router.delete('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const part = await db.get('SELECT * FROM evening_participants WHERE id = ?', [req.params.id]);
    if (!part) {
      return res.status(404).json({ error: 'Запись участника не найдена' });
    }

    const evening = await db.get('SELECT status, settled_at FROM game_evenings WHERE id = ?', [part.evening_id]);
    if (evening?.status === 'completed' || evening?.settled_at) {
      return res.status(400).json({ error: 'Запрещено удалять участников из завершённых вечеров' });
    }

    await db.run('DELETE FROM evening_participants WHERE id = ?', [req.params.id]);

    // Run CRM automations
    await runCrmAutomations(db);

    res.json({ success: true, message: 'Участник удален из вечера' });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

export default router;
