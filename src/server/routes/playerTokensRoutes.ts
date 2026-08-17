import crypto from 'crypto';
import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import { createPlayerSchema } from '../validation.ts';
import { requireOrganizerAuth } from '../auth.ts';
import {
  getTokenLedgerPage,
  mutateTokenBalance,
  TokenIdempotencyConflictError,
  TokenInsufficientFundsError,
  TokenPlayerNotFoundError,
  TokenValidationError,
} from '../services/tokenLedgerService.ts';

const router = Router();

const sendTokenError = (res: any, error: any) => {
  if (error instanceof TokenPlayerNotFoundError) return res.status(404).json({ error: 'Игрок не найден' });
  if (error instanceof TokenInsufficientFundsError) return res.status(409).json({ error: 'Недостаточно жетонов' });
  if (error instanceof TokenIdempotencyConflictError) return res.status(409).json({ error: 'Конфликт idempotency key' });
  if (error instanceof TokenValidationError) return res.status(400).json({ error: error.message });
  return res.status(500).json({ error: 'Database error', message: error?.message || String(error) });
};

// Canonical player creation path. A non-zero starting balance is journaled atomically.
router.post('/', requireOrganizerAuth, async (req, res) => {
  try {
    const data = createPlayerSchema.parse(req.body);
    const db = req.db || (await getDb());
    const existingNick = await db.get('SELECT id FROM players WHERE nickname = ?', [data.nickname]);
    if (existingNick) return res.status(400).json({ error: 'Игрок с таким никнеймом уже существует' });

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const normalizedTg = data.telegram_username ? data.telegram_username.replace('@', '').trim() || null : null;
    const contactStatus = data.contact_status || (data.lifecycle_status === 'blocked' ? 'blocked' : data.lifecycle_status === 'paused' ? 'paused' : 'normal');

    await db.transaction(async (tx: any) => {
      await tx.run(
        `INSERT INTO players (id, telegram_user_id, nickname, full_name, telegram_username, phone, contact_status, lifecycle_status, source, notes, elo, tokens, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          id, data.telegram_user_id || null, data.nickname, data.full_name || null,
          normalizedTg, data.phone || null, contactStatus, contactStatus,
          data.source || 'crm_manual', data.notes || null, data.elo, now, now,
        ],
      );
      if (data.tokens !== 0) {
        await mutateTokenBalance(tx, {
          playerId: id,
          delta: data.tokens,
          reasonType: 'initial_balance',
          description: 'Начальный баланс при создании игрока',
          sourceType: 'player_creation',
          sourceId: id,
          idempotencyKey: `player-create:${id}:tokens`,
          debitPolicy: 'allow_negative',
          actorType: 'organizer',
        });
      }
    });

    const created = await db.get('SELECT * FROM players WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (error: any) {
    if (error?.name === 'ZodError') return res.status(400).json({ error: 'Validation error', details: error.errors || error.message });
    return sendTokenError(res, error);
  }
});

// Raw balance replacement is retired. Metadata edits continue to the existing players router.
router.patch('/:id', requireOrganizerAuth, (req, res, next) => {
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'tokens')) {
    return res.status(400).json({
      error: 'Прямая замена баланса жетонов отключена',
      adjustment_endpoint: `/api/players/${String(req.params.id)}/tokens/adjustments`,
    });
  }
  next();
});

router.get('/:id/tokens', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const limit = Number(req.query.limit || 20);
    const offset = Number(req.query.offset || 0);
    res.json(await getTokenLedgerPage(db, String(req.params.id), limit, offset));
  } catch (error: any) {
    return sendTokenError(res, error);
  }
});

router.post('/:id/tokens/adjustments', requireOrganizerAuth, async (req, res) => {
  try {
    const delta = Number(req.body?.delta);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    const idempotencyKey = typeof req.body?.idempotency_key === 'string' ? req.body.idempotency_key.trim() : '';
    if (!Number.isInteger(delta) || delta === 0) return res.status(400).json({ error: 'delta должен быть ненулевым целым числом' });
    if (!reason) return res.status(400).json({ error: 'Причина корректировки обязательна' });
    if (!idempotencyKey) return res.status(400).json({ error: 'idempotency_key обязателен' });

    const db = req.db || (await getDb());
    const entry = await mutateTokenBalance(db, {
      playerId: String(req.params.id),
      delta,
      reasonType: 'manual_adjustment',
      description: reason,
      sourceType: 'organizer',
      sourceId: String(req.params.id),
      idempotencyKey,
      debitPolicy: 'prevent_negative',
      actorType: 'organizer',
      metadata: { route: 'player_token_adjustment' },
    });
    res.json({ success: true, balance: entry.balance_after, entry });
  } catch (error: any) {
    return sendTokenError(res, error);
  }
});

export default router;
