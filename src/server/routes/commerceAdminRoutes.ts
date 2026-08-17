import crypto from 'crypto';
import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';

const router = Router();

const positiveInteger = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const nullablePositiveInteger = (value: unknown): number | null | undefined => {
  if (value === null || value === '' || value === undefined) return null;
  const parsed = positiveInteger(value);
  return parsed == null ? undefined : parsed;
};

router.get('/overview', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db as DatabaseWrapper;
    const [packages, campaigns, intents, totals] = await Promise.all([
      db.all<any>(`
        SELECT id, title, token_amount, price_rub, active, sort_order, created_at, updated_at
          FROM token_packages
         ORDER BY active DESC, sort_order ASC, price_rub ASC, id ASC
      `),
      db.all<any>(`
        SELECT c.id, c.title, c.description, c.target_amount_rub, c.status, c.starts_at, c.ends_at,
               c.created_at, c.updated_at,
               COALESCE(SUM(CASE WHEN pi.status = 'paid' THEN pi.amount_rub ELSE 0 END), 0) AS collected_amount_rub
          FROM fundraising_campaigns c
          LEFT JOIN payment_intents pi ON pi.campaign_id = c.id
         GROUP BY c.id
         ORDER BY CASE c.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
                  COALESCE(c.starts_at, c.created_at) DESC
      `),
      db.all<any>(`
        SELECT pi.id, pi.player_id, p.nickname, pi.purpose, pi.amount_rub, pi.token_amount,
               pi.provider, pi.status, pi.description, pi.created_at, pi.updated_at, pi.paid_at
          FROM payment_intents pi
          LEFT JOIN players p ON p.id = pi.player_id
         ORDER BY pi.created_at DESC, pi.id DESC
         LIMIT 100
      `),
      db.all<any>(`
        SELECT purpose, status, COUNT(*) AS count, COALESCE(SUM(amount_rub), 0) AS amount_rub
          FROM payment_intents
         GROUP BY purpose, status
      `),
    ]);

    res.json({
      online_payment: { available: false, provider: null, setup_required: true },
      token_packages: packages.map((item: any) => ({
        ...item,
        token_amount: Number(item.token_amount || 0),
        price_rub: Number(item.price_rub || 0),
        active: Boolean(item.active),
        sort_order: Number(item.sort_order || 0),
      })),
      campaigns: campaigns.map((item: any) => ({
        ...item,
        target_amount_rub: item.target_amount_rub == null ? null : Number(item.target_amount_rub),
        collected_amount_rub: Number(item.collected_amount_rub || 0),
      })),
      recent_intents: intents.map((item: any) => ({
        ...item,
        amount_rub: Number(item.amount_rub || 0),
        token_amount: item.token_amount == null ? null : Number(item.token_amount),
      })),
      totals: totals.map((item: any) => ({
        purpose: String(item.purpose),
        status: String(item.status),
        count: Number(item.count || 0),
        amount_rub: Number(item.amount_rub || 0),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось загрузить настройки оплаты' });
  }
});

router.post('/token-packages', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db as DatabaseWrapper;
    const id = String(req.body?.id || '').trim() || `tokens_${crypto.randomUUID()}`;
    const title = String(req.body?.title || '').trim();
    const tokenAmount = positiveInteger(req.body?.token_amount);
    const priceRub = positiveInteger(req.body?.price_rub);
    const sortOrder = Number.isInteger(Number(req.body?.sort_order)) ? Number(req.body.sort_order) : 0;
    const active = req.body?.active === false ? 0 : 1;
    if (!title) return res.status(400).json({ error: 'Название пакета обязательно' });
    if (!tokenAmount) return res.status(400).json({ error: 'Количество жетонов должно быть положительным целым числом' });
    if (!priceRub) return res.status(400).json({ error: 'Цена должна быть положительным целым числом рублей' });

    const now = new Date().toISOString();
    const existing = await db.get<any>('SELECT id, created_at FROM token_packages WHERE id = ? LIMIT 1', [id]);
    if (existing) {
      await db.run(
        `UPDATE token_packages
            SET title = ?, token_amount = ?, price_rub = ?, active = ?, sort_order = ?, updated_at = ?
          WHERE id = ?`,
        [title, tokenAmount, priceRub, active, sortOrder, now, id],
      );
    } else {
      await db.run(
        `INSERT INTO token_packages (id, title, token_amount, price_rub, active, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, title, tokenAmount, priceRub, active, sortOrder, now, now],
      );
    }

    const item = await db.get<any>('SELECT * FROM token_packages WHERE id = ?', [id]);
    res.status(existing ? 200 : 201).json({ ...item, active: Boolean(item?.active) });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось сохранить пакет жетонов' });
  }
});

router.post('/campaigns', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db as DatabaseWrapper;
    const id = String(req.body?.id || '').trim() || `campaign_${crypto.randomUUID()}`;
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim() || null;
    const targetAmount = nullablePositiveInteger(req.body?.target_amount_rub);
    const status = String(req.body?.status || 'draft').trim();
    const startsAt = String(req.body?.starts_at || '').trim() || null;
    const endsAt = String(req.body?.ends_at || '').trim() || null;
    if (!title) return res.status(400).json({ error: 'Название сбора обязательно' });
    if (targetAmount === undefined) return res.status(400).json({ error: 'Цель должна быть положительной суммой в рублях' });
    if (!['draft', 'active', 'closed'].includes(status)) return res.status(400).json({ error: 'Некорректный статус сбора' });

    const now = new Date().toISOString();
    const existing = await db.get<any>('SELECT id FROM fundraising_campaigns WHERE id = ? LIMIT 1', [id]);
    if (existing) {
      await db.run(
        `UPDATE fundraising_campaigns
            SET title = ?, description = ?, target_amount_rub = ?, status = ?, starts_at = ?, ends_at = ?, updated_at = ?
          WHERE id = ?`,
        [title, description, targetAmount, status, startsAt, endsAt, now, id],
      );
    } else {
      await db.run(
        `INSERT INTO fundraising_campaigns (
           id, title, description, target_amount_rub, status, starts_at, ends_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, title, description, targetAmount, status, startsAt, endsAt, now, now],
      );
    }

    const item = await db.get<any>('SELECT * FROM fundraising_campaigns WHERE id = ?', [id]);
    res.status(existing ? 200 : 201).json(item);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось сохранить сбор' });
  }
});

export default router;
