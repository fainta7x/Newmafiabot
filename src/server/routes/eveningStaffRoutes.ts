import crypto from 'crypto';
import { Router } from 'express';
import { getDb, type DatabaseWrapper } from '../../db/index.ts';
import { ensureClubOperationsSchema } from '../../db/ensureClubOperationsSchema.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { reconcileRegularEveningPayments } from '../services/eveningPaymentPricingService.ts';

const router = Router();

async function loadStaff(db: DatabaseWrapper, eveningId: string) {
  await ensureClubOperationsSchema(db);
  const evening = await db.get<any>('SELECT id, title, status FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening) return null;

  const assignment = await db.get<any>(`
    SELECT s.evening_id, s.organizer_player_id, s.assigned_at, s.updated_at,
           p.nickname AS organizer_nickname
      FROM evening_staff_assignments s
      LEFT JOIN players p ON p.id = s.organizer_player_id
     WHERE s.evening_id = ?
     LIMIT 1
  `, [eveningId]);

  const organizers = await db.all<any>(`
    SELECT id, nickname, club_role, judge_level
      FROM players
     WHERE COALESCE(club_role, 'member') = 'organizer'
       AND COALESCE(contact_status, 'normal') != 'blocked'
     ORDER BY nickname COLLATE NOCASE
  `);

  const judges = await db.all<any>(`
    SELECT id, nickname, club_role, judge_level
      FROM players
     WHERE COALESCE(judge_level, 'none') != 'none'
       AND COALESCE(contact_status, 'normal') != 'blocked'
     ORDER BY nickname COLLATE NOCASE
  `);

  const gameJudges = await db.all<any>(`
    SELECT g.id AS game_id, g.global_game_number, g.judge_player_id, g.judge_name,
           p.nickname AS linked_judge_nickname
      FROM games g
      LEFT JOIN players p ON p.id = g.judge_player_id
     WHERE g.evening_id = ? AND g.archived_at IS NULL
     ORDER BY g.global_game_number ASC
  `, [eveningId]);

  return {
    evening,
    organizer: assignment ? {
      player_id: assignment.organizer_player_id || null,
      nickname: assignment.organizer_nickname || null,
      assigned_at: assignment.assigned_at,
      updated_at: assignment.updated_at,
    } : null,
    organizers,
    judges,
    game_judges: gameJudges.map((game: any) => ({
      game_id: game.game_id,
      game_number: game.global_game_number,
      player_id: game.judge_player_id || null,
      nickname: game.linked_judge_nickname || game.judge_name || null,
      linked: Boolean(game.judge_player_id),
    })),
  };
}

async function loadPayments(db: DatabaseWrapper, eveningId: string) {
  const evening = await db.get<any>(
    'SELECT id, title, status, settled_at, default_price FROM game_evenings WHERE id = ? LIMIT 1',
    [eveningId],
  );
  if (!evening) return null;

  const participants = await db.all<any>(`
    SELECT ep.id, ep.player_id, p.nickname, ep.attendance_status,
           ep.payment_status, ep.amount_due, ep.amount_paid,
           p.club_role, p.judge_level
      FROM evening_participants ep
      JOIN players p ON p.id = ep.player_id
     WHERE ep.evening_id = ?
       AND ep.attendance_status = 'attended'
     ORDER BY p.nickname COLLATE NOCASE
  `, [eveningId]);

  return {
    evening: {
      id: evening.id,
      title: evening.title,
      status: evening.status,
      settled_at: evening.settled_at || null,
      closed: evening.status === 'completed' || Boolean(evening.settled_at),
    },
    participants: participants.map((participant: any) => ({
      ...participant,
      amount_due: Number(participant.amount_due || 0),
      amount_paid: Number(participant.amount_paid || 0),
    })),
  };
}

async function addFinancialAdjustment(
  db: DatabaseWrapper,
  input: {
    type: 'income' | 'debt_created' | 'debt_paid';
    amount: number;
    eveningId: string;
    playerId: string;
    participantId: string;
    eveningTitle: string;
    description: string;
  },
) {
  if (!input.amount) return;
  await db.run(`
    INSERT INTO financial_transactions (
      id, type, amount, category, description, player_id, evening_id,
      source_type, source_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'evening_payment_adjustment', ?, ?)
  `, [
    crypto.randomUUID(),
    input.type,
    input.amount,
    input.type === 'debt_paid' ? 'Погашение долга за вечер' : input.type === 'debt_created' ? 'Корректировка долга за вечер' : 'Корректировка оплаты за вечер',
    input.description,
    input.playerId,
    input.eveningId,
    input.participantId,
    new Date().toISOString(),
  ]);
}

router.get('/:id/staff', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const staff = await loadStaff(db, String(req.params.id));
    if (!staff) return res.status(404).json({ error: 'Вечер не найден' });
    return res.json(staff);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить команду вечера' });
  }
});

router.patch('/:id/staff', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    await ensureClubOperationsSchema(db);
    const eveningId = String(req.params.id);
    const evening = await db.get<any>('SELECT id FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
    if (!evening) return res.status(404).json({ error: 'Вечер не найден' });

    const organizerPlayerId = String(req.body?.organizer_player_id || '').trim();
    if (!organizerPlayerId) return res.status(400).json({ error: 'Выбери организатора вечера' });

    const organizer = await db.get<any>(`
      SELECT id, nickname, club_role
        FROM players
       WHERE id = ? AND COALESCE(club_role, 'member') = 'organizer'
       LIMIT 1
    `, [organizerPlayerId]);
    if (!organizer) return res.status(400).json({ error: 'Организатор вечера должен иметь роль «Организатор» в профиле' });

    const now = new Date().toISOString();
    await db.run(`
      INSERT INTO evening_staff_assignments (evening_id, organizer_player_id, assigned_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(evening_id) DO UPDATE SET
        organizer_player_id = excluded.organizer_player_id,
        updated_at = excluded.updated_at
    `, [eveningId, organizerPlayerId, now, now]);

    return res.json(await loadStaff(db, eveningId));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось назначить организатора вечера' });
  }
});

router.get('/:id/payments', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const eveningId = String(req.params.id);
    await reconcileRegularEveningPayments(db, eveningId);
    const payments = await loadPayments(db, eveningId);
    if (!payments) return res.status(404).json({ error: 'Вечер не найден' });
    return res.json(payments);
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'Не удалось загрузить оплаты вечера' });
  }
});

router.patch('/:id/payments/:participantId', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const eveningId = String(req.params.id);
    const participantId = String(req.params.participantId);
    const paid = req.body?.paid;
    if (typeof paid !== 'boolean') return res.status(400).json({ error: 'Передай paid=true или paid=false' });

    await reconcileRegularEveningPayments(db, eveningId);
    const evening = await db.get<any>(
      'SELECT id, title, status, settled_at FROM game_evenings WHERE id = ? LIMIT 1',
      [eveningId],
    );
    if (!evening) return res.status(404).json({ error: 'Вечер не найден' });

    const participant = await db.get<any>(`
      SELECT ep.*, p.nickname, p.club_role, p.judge_level
        FROM evening_participants ep
        JOIN players p ON p.id = ep.player_id
       WHERE ep.id = ? AND ep.evening_id = ?
       LIMIT 1
    `, [participantId, eveningId]);
    if (!participant) return res.status(404).json({ error: 'Игрок не найден в этом вечере' });
    if (participant.attendance_status !== 'attended') return res.status(400).json({ error: 'Оплата отмечается только для фактически пришедших игроков' });

    const due = Math.max(0, Number(participant.amount_due || 0));
    const feeExempt = participant.club_role === 'organizer' || participant.judge_level === 'host' || participant.judge_level === 'judge' || due === 0;
    if (feeExempt) return res.status(400).json({ error: 'Для этого игрока взнос за вечер не требуется' });

    const closed = evening.status === 'completed' || Boolean(evening.settled_at);
    const now = new Date().toISOString();

    if (closed) {
      const totals = await db.get<any>(`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN type = 'debt_created' THEN amount ELSE 0 END), 0) AS debt_created,
          COALESCE(SUM(CASE WHEN type = 'debt_paid' THEN amount ELSE 0 END), 0) AS debt_paid
        FROM financial_transactions
        WHERE evening_id = ? AND player_id = ? AND source_id = ?
      `, [eveningId, participant.player_id, participantId]);
      const income = Number(totals?.income || 0);
      const debtCreated = Number(totals?.debt_created || 0);
      const debtPaid = Number(totals?.debt_paid || 0);
      const financialPaid = Math.max(0, Math.min(due, income + debtPaid));
      const outstandingDebt = Math.max(0, Math.min(due, debtCreated - debtPaid));

      await db.transaction(async (tx) => {
        if (paid) {
          const amount = Math.max(0, Math.min(due, outstandingDebt || (due - financialPaid)));
          await addFinancialAdjustment(tx, {
            type: 'debt_paid', amount, eveningId, playerId: participant.player_id, participantId,
            eveningTitle: evening.title,
            description: `Оплата долга за вечер ${evening.title}: ${participant.nickname}`,
          });
          await tx.run(
            "UPDATE evening_participants SET amount_paid = ?, payment_status = 'paid', updated_at = ? WHERE id = ?",
            [due, now, participantId],
          );
        } else {
          const amount = financialPaid;
          if (amount > 0) {
            await addFinancialAdjustment(tx, {
              type: 'income', amount: -amount, eveningId, playerId: participant.player_id, participantId,
              eveningTitle: evening.title,
              description: `Отмена подтверждения оплаты за вечер ${evening.title}: ${participant.nickname}`,
            });
            await addFinancialAdjustment(tx, {
              type: 'debt_created', amount, eveningId, playerId: participant.player_id, participantId,
              eveningTitle: evening.title,
              description: `Возврат долга после отмены оплаты за вечер ${evening.title}: ${participant.nickname}`,
            });
          }
          await tx.run(
            "UPDATE evening_participants SET amount_paid = 0, payment_status = 'unpaid', updated_at = ? WHERE id = ?",
            [now, participantId],
          );
        }
      });
    } else {
      await db.run(
        'UPDATE evening_participants SET amount_paid = ?, payment_status = ?, updated_at = ? WHERE id = ?',
        [paid ? due : 0, paid ? 'paid' : 'unpaid', now, participantId],
      );
    }

    const payments = await loadPayments(db, eveningId);
    return res.json(payments);
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'Не удалось изменить оплату игрока' });
  }
});

export default router;
