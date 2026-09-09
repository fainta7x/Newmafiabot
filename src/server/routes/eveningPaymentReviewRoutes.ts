import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { ensureClubOperationsSchema } from '../../db/ensureClubOperationsSchema.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { reconcileRegularEveningPayments } from '../services/eveningPaymentPricingService.ts';

const router = Router();

// Mounted before eveningStaffRoutes. This preserves the existing organizer payments
// endpoint while making durable legacy-waiver review holds visible to the organizer.
router.get('/:id/payments', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const eveningId = String(req.params.id);
    await ensureClubOperationsSchema(db);
    await reconcileRegularEveningPayments(db, eveningId);

    const evening = await db.get<any>(
      'SELECT id, title, status, settled_at FROM game_evenings WHERE id = ? LIMIT 1',
      [eveningId],
    );
    if (!evening) return res.status(404).json({ error: 'Вечер не найден' });

    const participants = await db.all<any>(`
      SELECT ep.id, ep.player_id, p.nickname, ep.attendance_status,
             ep.payment_status, ep.amount_due, ep.amount_paid,
             p.club_role, p.judge_level,
             CASE WHEN w.participant_id IS NULL THEN 0 ELSE 1 END AS fee_waived,
             d.status AS fee_review_status,
             d.reason AS fee_review_reason
        FROM evening_participants ep
        JOIN players p ON p.id = ep.player_id
        LEFT JOIN evening_fee_waivers w
          ON w.participant_id = ep.id AND w.evening_id = ep.evening_id
        LEFT JOIN evening_fee_waiver_migration_diagnostics d
          ON d.participant_id = ep.id AND d.evening_id = ep.evening_id
       WHERE ep.evening_id = ?
         AND ep.attendance_status = 'attended'
       ORDER BY p.nickname COLLATE NOCASE
    `, [eveningId]);

    return res.json({
      evening: {
        id: evening.id,
        title: evening.title,
        status: evening.status,
        settled_at: evening.settled_at || null,
        closed: evening.status === 'completed' || Boolean(evening.settled_at),
      },
      participants: participants.map((participant: any) => ({
        ...participant,
        fee_waived: Boolean(participant.fee_waived),
        fee_review_required: participant.fee_review_status === 'needs_review',
        fee_review_status: participant.fee_review_status || null,
        fee_review_reason: participant.fee_review_reason || null,
        amount_due: Number(participant.amount_due || 0),
        amount_paid: Number(participant.amount_paid || 0),
      })),
    });
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'Не удалось загрузить оплаты вечера' });
  }
});

export default router;
