import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { reconcileRegularEveningPayments } from './eveningPaymentPricingService.ts';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

async function addAdjustment(
  db: DatabaseWrapper,
  input: {
    type: 'income' | 'debt_created' | 'debt_paid';
    amount: number;
    eveningId: string;
    playerId: string;
    participantId: string;
    description: string;
  },
) {
  if (!Number.isFinite(input.amount) || Math.abs(input.amount) < 0.0001) return;
  const category = input.type === 'debt_paid'
    ? 'Погашение долга за вечер'
    : input.type === 'debt_created'
      ? 'Корректировка долга за вечер'
      : 'Корректировка оплаты за вечер';
  await db.run(`
    INSERT INTO financial_transactions (
      id, type, amount, category, description, player_id, evening_id,
      source_type, source_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'evening_payment_adjustment', ?, ?)
  `, [
    crypto.randomUUID(), input.type, input.amount, category, input.description,
    input.playerId, input.eveningId, input.participantId, new Date().toISOString(),
  ]);
}

export async function setClosedEveningParticipantPaid(
  db: DatabaseWrapper,
  participantId: string,
  paid: boolean,
) {
  let participant = await db.get<any>(`
    SELECT ep.*, p.nickname, p.club_role, p.judge_level,
           e.title AS evening_title, e.status AS evening_status, e.settled_at
      FROM evening_participants ep
      JOIN players p ON p.id = ep.player_id
      JOIN game_evenings e ON e.id = ep.evening_id
     WHERE ep.id = ?
     LIMIT 1
  `, [participantId]);
  if (!participant) throw Object.assign(new Error('Участник не найден'), { statusCode: 404 });
  if (!(participant.evening_status === 'completed' || participant.settled_at)) {
    throw Object.assign(new Error('Вечер ещё не закрыт'), { statusCode: 409 });
  }
  if (participant.attendance_status !== 'attended') {
    throw Object.assign(new Error('Оплата отмечается только для фактически пришедших игроков'), { statusCode: 400 });
  }

  await reconcileRegularEveningPayments(db, String(participant.evening_id));
  participant = await db.get<any>(`
    SELECT ep.*, p.nickname, p.club_role, p.judge_level,
           e.title AS evening_title, e.status AS evening_status, e.settled_at
      FROM evening_participants ep
      JOIN players p ON p.id = ep.player_id
      JOIN game_evenings e ON e.id = ep.evening_id
     WHERE ep.id = ?
     LIMIT 1
  `, [participantId]);

  const due = Math.max(0, Number(participant.amount_due || 0));
  const feeExempt = participant.club_role === 'organizer'
    || participant.judge_level === 'host'
    || participant.judge_level === 'judge'
    || due === 0;
  if (feeExempt) throw Object.assign(new Error('Для этого игрока взнос за вечер не требуется'), { statusCode: 400 });

  const totals = await db.get<any>(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN type = 'debt_created' THEN amount ELSE 0 END), 0) AS debt_created,
      COALESCE(SUM(CASE WHEN type = 'debt_paid' THEN amount ELSE 0 END), 0) AS debt_paid
      FROM financial_transactions
     WHERE evening_id = ? AND player_id = ? AND source_id = ?
  `, [participant.evening_id, participant.player_id, participantId]);

  const income = Number(totals?.income || 0);
  const debtCreated = Number(totals?.debt_created || 0);
  const debtPaid = Number(totals?.debt_paid || 0);
  const financialPaid = clamp(income + debtPaid, 0, due);
  const outstandingDebt = clamp(debtCreated - debtPaid, 0, due);
  const now = new Date().toISOString();

  await db.transaction(async (tx: DatabaseWrapper) => {
    if (paid) {
      const amount = Math.max(0, Math.min(due, outstandingDebt || (due - financialPaid)));
      await addAdjustment(tx, {
        type: 'debt_paid', amount,
        eveningId: String(participant.evening_id), playerId: String(participant.player_id), participantId,
        description: `Оплата долга за вечер ${participant.evening_title}: ${participant.nickname}`,
      });
      await tx.run(
        "UPDATE evening_participants SET amount_paid = ?, payment_status = 'paid', updated_at = ? WHERE id = ?",
        [due, now, participantId],
      );
    } else {
      if (financialPaid > 0) {
        await addAdjustment(tx, {
          type: 'income', amount: -financialPaid,
          eveningId: String(participant.evening_id), playerId: String(participant.player_id), participantId,
          description: `Отмена подтверждения оплаты за вечер ${participant.evening_title}: ${participant.nickname}`,
        });
        await addAdjustment(tx, {
          type: 'debt_created', amount: financialPaid,
          eveningId: String(participant.evening_id), playerId: String(participant.player_id), participantId,
          description: `Возврат долга после отмены оплаты за вечер ${participant.evening_title}: ${participant.nickname}`,
        });
      }
      await tx.run(
        "UPDATE evening_participants SET amount_paid = 0, payment_status = 'unpaid', updated_at = ? WHERE id = ?",
        [now, participantId],
      );
    }
  });

  return db.get<any>(`
    SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo
      FROM evening_participants ep
      JOIN players p ON p.id = ep.player_id
     WHERE ep.id = ?
  `, [participantId]);
}
