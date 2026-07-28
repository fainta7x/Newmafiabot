import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { updateParticipantSchema } from '../validation.ts';

const router = Router();

// PATCH /api/evening-participants/:id - Update participant status, payment, notes
router.patch('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const data = updateParticipantSchema.parse(req.body);
    const db = (req as any).db || (await getDb());

    const part = await db.get('SELECT * FROM evening_participants WHERE id = ?', [req.params.id]);
    if (!part) {
      return res.status(404).json({ error: 'Запись участника не найдена' });
    }

    const fields: string[] = [];
    const values: any[] = [];

    // Recalculate payment status if amount_due or amount_paid changed
    const newAmountDue = data.amount_due !== undefined ? data.amount_due : part.amount_due;
    const newAmountPaid = data.amount_paid !== undefined ? data.amount_paid : part.amount_paid;
    let computedPaymentStatus = data.payment_status;

    if (!computedPaymentStatus) {
      if (newAmountPaid >= newAmountDue && newAmountDue > 0) {
        computedPaymentStatus = 'paid';
      } else if (newAmountPaid > 0) {
        computedPaymentStatus = 'partial';
      } else {
        computedPaymentStatus = 'unpaid';
      }
    }

    const updateData = {
      ...data,
      payment_status: computedPaymentStatus,
      amount_due: newAmountDue,
      amount_paid: newAmountPaid,
      updated_at: new Date().toISOString(),
    };

    Object.entries(updateData).forEach(([key, val]) => {
      if (val !== undefined) {
        fields.push(`${key} = ?`);
        values.push(val);
      }
    });

    values.push(req.params.id);
    await db.run(`UPDATE evening_participants SET ${fields.join(', ')} WHERE id = ?`, values);

    const updated = await db.get(`
      SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo
      FROM evening_participants ep
      JOIN players p ON ep.player_id = p.id
      WHERE ep.id = ?
    `, [req.params.id]);

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: 'Validation error', details: err.errors || err.message });
  }
});

// DELETE /api/evening-participants/:id - Remove participant from evening
router.delete('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    await db.run('DELETE FROM evening_participants WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Участник удален из вечера' });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

export default router;
