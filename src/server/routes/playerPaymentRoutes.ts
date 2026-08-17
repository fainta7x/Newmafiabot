import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { isAttendingResponse } from '../../lib/eveningResponse.ts';
import { getPlayerSessionId } from '../auth.ts';

const router = Router();

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

const isPaymentExpected = (row: any): boolean =>
  String(row.attendance_status || '') === 'attended' || isAttendingResponse(row.registration_status);

const normalizePaymentStatus = (amountDue: number, amountPaid: number, stored: unknown) => {
  if (amountDue <= 0) return 'waived';
  if (amountPaid >= amountDue) return 'paid';
  if (amountPaid > 0) return 'partial';
  return ['unpaid', 'partial', 'paid', 'waived'].includes(String(stored)) ? String(stored) : 'unpaid';
};

const serializePayment = (row: any) => {
  const paymentExpected = isPaymentExpected(row);
  const storedAmountDue = Math.max(0, Number(row.amount_due || 0));
  const amountDue = paymentExpected ? storedAmountDue : 0;
  const amountPaid = Math.max(0, Number(row.amount_paid || 0));
  const outstanding = Math.max(0, amountDue - amountPaid);
  return {
    participant_id: String(row.participant_id),
    evening_id: String(row.evening_id),
    title: String(row.title || 'Игровой вечер'),
    starts_at: row.starts_at || null,
    venue: row.venue || null,
    evening_status: String(row.evening_status || ''),
    attendance_status: String(row.attendance_status || 'pending'),
    payment_expected: paymentExpected,
    amount_due: amountDue,
    amount_paid: amountPaid,
    outstanding,
    payment_status: paymentExpected ? normalizePaymentStatus(amountDue, amountPaid, row.payment_status) : 'waived',
    updated_at: row.updated_at || null,
  };
};

const serializeIntent = (row: any) => ({
  id: String(row.id),
  purpose: String(row.purpose),
  participant_id: row.participant_id ? String(row.participant_id) : null,
  token_package_id: row.token_package_id ? String(row.token_package_id) : null,
  campaign_id: row.campaign_id ? String(row.campaign_id) : null,
  amount_rub: Math.max(0, Number(row.amount_rub || 0)),
  token_amount: row.token_amount == null ? null : Math.max(0, Number(row.token_amount || 0)),
  provider: String(row.provider || 'unconfigured'),
  status: String(row.status || 'draft'),
  description: String(row.description || ''),
  confirmation_url: row.confirmation_url || null,
  created_at: row.created_at || null,
  updated_at: row.updated_at || null,
  paid_at: row.paid_at || null,
});

router.get('/payments', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;

  try {
    const db = req.db as DatabaseWrapper;
    const player = await db.get<any>('SELECT id FROM players WHERE id = ? LIMIT 1', [playerId]);
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });

    const [rows, tokenPackages, campaigns, intents] = await Promise.all([
      db.all<any>(`
        SELECT ep.id AS participant_id, ep.evening_id, ep.registration_status, ep.payment_status,
               ep.amount_due, ep.amount_paid, ep.attendance_status, ep.updated_at,
               e.title, e.starts_at, e.venue, e.status AS evening_status
          FROM evening_participants ep
          JOIN game_evenings e ON e.id = ep.evening_id
         WHERE ep.player_id = ? AND e.status <> 'cancelled'
         ORDER BY COALESCE(e.starts_at, ep.created_at) DESC, ep.created_at DESC
         LIMIT 200
      `, [playerId]),
      db.all<any>(`
        SELECT id, title, token_amount, price_rub, sort_order
          FROM token_packages
         WHERE active = 1
         ORDER BY sort_order ASC, price_rub ASC, id ASC
      `),
      db.all<any>(`
        SELECT c.id, c.title, c.description, c.target_amount_rub, c.starts_at, c.ends_at,
               COALESCE(SUM(CASE WHEN pi.status = 'paid' THEN pi.amount_rub ELSE 0 END), 0) AS collected_amount_rub
          FROM fundraising_campaigns c
          LEFT JOIN payment_intents pi ON pi.campaign_id = c.id
         WHERE c.status = 'active'
         GROUP BY c.id
         ORDER BY COALESCE(c.starts_at, c.created_at) DESC, c.created_at DESC
      `),
      db.all<any>(`
        SELECT id, purpose, participant_id, token_package_id, campaign_id, amount_rub, token_amount,
               provider, status, description, confirmation_url, created_at, updated_at, paid_at
          FROM payment_intents
         WHERE player_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 50
      `, [playerId]),
    ]);

    const items = rows
      .map(serializePayment)
      .filter((item) => item.payment_expected || item.amount_paid > 0);
    const current = items.filter((item) => item.evening_status !== 'completed' || item.outstanding > 0);
    const history = items.filter((item) => item.evening_status === 'completed' && item.outstanding === 0);
    const summary = items.reduce((acc, item) => {
      acc.amount_due += item.amount_due;
      acc.amount_paid += item.amount_paid;
      acc.outstanding += item.outstanding;
      if (item.payment_status === 'paid' || item.payment_status === 'waived') acc.closed += 1;
      else acc.open += 1;
      return acc;
    }, { amount_due: 0, amount_paid: 0, outstanding: 0, open: 0, closed: 0 });

    const freeEvening = await db.get<any>(`
      SELECT COUNT(*) AS count
        FROM shop_purchases
       WHERE player_id = ? AND item_type_snapshot = 'free_evening' AND status = 'purchased'
    `, [playerId]);

    return res.json({
      summary,
      current,
      history,
      free_evening_credits: Number(freeEvening?.count || 0),
      online_payment_available: false,
      online_payment: {
        available: false,
        provider: null,
        setup_required: true,
        purposes: [
          {
            id: 'evening',
            title: 'Участие в вечере',
            description: 'Оплата конкретного игрового вечера по фактической сумме к оплате.',
            configured: current.some((item) => item.outstanding > 0),
          },
          {
            id: 'token_topup',
            title: 'Пополнить жетоны',
            description: 'Покупка фиксированного пакета внутренней валюты без обратного вывода в деньги.',
            configured: tokenPackages.length > 0,
          },
          {
            id: 'support',
            title: 'Поддержать клуб',
            description: 'Добровольная поддержка 2LA Noire без влияния на спортивный результат.',
            configured: true,
          },
          {
            id: 'fundraiser',
            title: 'Сбор на цель',
            description: 'Взнос в конкретный активный сбор клуба с видимым прогрессом.',
            configured: campaigns.length > 0,
          },
        ],
        token_packages: tokenPackages.map((item: any) => ({
          id: String(item.id),
          title: String(item.title),
          token_amount: Math.max(0, Number(item.token_amount || 0)),
          price_rub: Math.max(0, Number(item.price_rub || 0)),
        })),
        campaigns: campaigns.map((item: any) => ({
          id: String(item.id),
          title: String(item.title),
          description: item.description || null,
          target_amount_rub: item.target_amount_rub == null ? null : Math.max(0, Number(item.target_amount_rub || 0)),
          collected_amount_rub: Math.max(0, Number(item.collected_amount_rub || 0)),
          starts_at: item.starts_at || null,
          ends_at: item.ends_at || null,
        })),
        recent_intents: intents.map(serializeIntent),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить оплату' });
  }
});

router.post('/payments/:participantId/use-free-evening', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;

  try {
    const db = req.db as DatabaseWrapper;
    const participantId = String(req.params.participantId || '').trim();
    if (!participantId) return res.status(400).json({ error: 'Не выбран вечер' });

    const result = await db.transaction(async (tx) => {
      const participant = await tx.get<any>(`
        SELECT ep.id, ep.player_id, ep.registration_status, ep.attendance_status,
               ep.amount_due, ep.amount_paid, ep.payment_status,
               e.id AS evening_id, e.title, e.status AS evening_status
          FROM evening_participants ep
          JOIN game_evenings e ON e.id = ep.evening_id
         WHERE ep.id = ? AND ep.player_id = ?
         LIMIT 1
      `, [participantId, playerId]);
      if (!participant) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
      if (String(participant.evening_status) === 'cancelled') throw Object.assign(new Error('Отменённый вечер оплачивать не нужно'), { statusCode: 409 });
      if (!isPaymentExpected(participant)) throw Object.assign(new Error('Для этого вечера оплата не ожидается'), { statusCode: 409 });
      if (Number(participant.amount_paid || 0) > 0) throw Object.assign(new Error('Бесплатный вечер нельзя применить после частичной оплаты'), { statusCode: 409 });
      if (Number(participant.amount_due || 0) <= 0 || ['paid', 'waived'].includes(String(participant.payment_status))) {
        throw Object.assign(new Error('Этот вечер уже закрыт по оплате'), { statusCode: 409 });
      }

      const credit = await tx.get<any>(`
        SELECT id
          FROM shop_purchases
         WHERE player_id = ? AND item_type_snapshot = 'free_evening' AND status = 'purchased'
         ORDER BY purchased_at ASC, id ASC
         LIMIT 1
      `, [playerId]);
      if (!credit) throw Object.assign(new Error('Нет доступного бесплатного вечера'), { statusCode: 409 });

      const now = new Date().toISOString();
      await tx.run(
        `UPDATE evening_participants
            SET amount_due = 0, payment_status = 'waived', updated_at = ?
          WHERE id = ?`,
        [now, participantId],
      );
      await tx.run(
        `UPDATE shop_purchases
            SET status = 'redeemed', redeemed_at = ?, notes = ?
          WHERE id = ?`,
        [now, `Использовано на вечер: ${String(participant.title || participant.evening_id)}`, String(credit.id)],
      );
      return { participant_id: participantId, purchase_id: String(credit.id) };
    });

    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось применить бесплатный вечер' });
  }
});

export default router;
