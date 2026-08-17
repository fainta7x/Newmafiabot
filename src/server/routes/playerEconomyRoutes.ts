import crypto from 'crypto';
import { Router } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getPlayerSessionId } from '../auth.ts';
import { reconcileAllBettingPools } from '../services/bettingPoolService.ts';
import {
  getTokenLedgerPage,
  mutateTokenBalance,
  TokenIdempotencyConflictError,
  TokenInsufficientFundsError,
  TokenPlayerNotFoundError,
  TokenValidationError,
} from '../services/tokenLedgerService.ts';

const router = Router();

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

const sendTokenError = (res: any, error: any) => {
  if (error instanceof TokenPlayerNotFoundError) return res.status(404).json({ error: 'Игрок не найден' });
  if (error instanceof TokenInsufficientFundsError) return res.status(409).json({ error: 'Недостаточно жетонов' });
  if (error instanceof TokenIdempotencyConflictError) return res.status(409).json({ error: 'Покупка уже была обработана с другими данными' });
  if (error instanceof TokenValidationError) return res.status(400).json({ error: error.message });
  return res.status(500).json({ error: error?.message || 'Не удалось выполнить операцию с жетонами' });
};

const loadPurchase = async (db: DatabaseWrapper, playerId: string, requestId: string) => db.get<any>(`
  SELECT id, player_id, item_id, item_name_snapshot, item_type_snapshot, price_snapshot,
         status, request_id, token_ledger_entry_id, purchased_at, redeemed_at, notes
    FROM shop_purchases
   WHERE player_id = ? AND request_id = ?
   LIMIT 1
`, [playerId, requestId]);

router.get('/economy', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;

  try {
    const db = req.db as DatabaseWrapper;
    await reconcileAllBettingPools(db);
    const [wallet, items, purchases] = await Promise.all([
      getTokenLedgerPage(db, playerId, 50, 0),
      db.all<any>(`
        SELECT id, name, description, price, icon, item_type, sort_order
          FROM shop_items
         WHERE active = 1
         ORDER BY sort_order ASC, id ASC
      `),
      db.all<any>(`
        SELECT id, item_id, item_name_snapshot, item_type_snapshot, price_snapshot,
               status, purchased_at, redeemed_at, notes
          FROM shop_purchases
         WHERE player_id = ?
         ORDER BY purchased_at DESC, id DESC
         LIMIT 100
      `, [playerId]),
    ]);

    return res.json({
      balance: Number(wallet.balance || 0),
      shop_items: items.map((item: any) => ({
        ...item,
        price: Number(item.price || 0),
        sort_order: Number(item.sort_order || 0),
      })),
      purchases,
      ledger: wallet.ledger,
    });
  } catch (error: any) {
    return sendTokenError(res, error);
  }
});

router.post('/shop/purchase', async (req, res) => {
  const playerId = requirePlayerId(req, res);
  if (!playerId) return;

  const itemId = String(req.body?.item_id || '').trim();
  const requestId = String(req.body?.request_id || '').trim();
  if (!itemId) return res.status(400).json({ error: 'Не выбран товар' });
  if (!requestId || requestId.length > 160) return res.status(400).json({ error: 'Некорректный идентификатор покупки' });

  try {
    const db = req.db as DatabaseWrapper;
    const alreadyPurchased = await loadPurchase(db, playerId, requestId);
    if (alreadyPurchased) {
      const player = await db.get<any>('SELECT tokens FROM players WHERE id = ?', [playerId]);
      return res.json({ success: true, idempotent: true, balance: Number(player?.tokens || 0), purchase: alreadyPurchased });
    }

    const item = await db.get<any>(`
      SELECT id, name, description, price, icon, item_type
        FROM shop_items
       WHERE id = ? AND active = 1
       LIMIT 1
    `, [itemId]);
    if (!item) return res.status(404).json({ error: 'Товар не найден или недоступен' });

    const price = Number(item.price);
    if (!Number.isInteger(price) || price <= 0) return res.status(500).json({ error: 'У товара некорректная цена' });

    const result = await db.transaction(async (tx: DatabaseWrapper) => {
      const duplicate = await loadPurchase(tx, playerId, requestId);
      if (duplicate) {
        const player = await tx.get<any>('SELECT tokens FROM players WHERE id = ?', [playerId]);
        return { purchase: duplicate, balance: Number(player?.tokens || 0), idempotent: true };
      }

      const purchaseId = `shop_${crypto.randomUUID()}`;
      const ledgerEntry = await mutateTokenBalance(tx, {
        playerId,
        delta: -price,
        reasonType: 'shop_purchase',
        description: `Покупка: ${String(item.name)}`,
        sourceType: 'shop_purchase',
        sourceId: purchaseId,
        idempotencyKey: `shop-purchase:${playerId}:${requestId}`,
        debitPolicy: 'prevent_negative',
        actorType: 'player',
        actorId: playerId,
        metadata: {
          item_id: String(item.id),
          item_type: String(item.item_type),
          item_name: String(item.name),
          price,
        },
      });

      const purchasedAt = new Date().toISOString();
      await tx.run(
        `INSERT INTO shop_purchases (
           id, player_id, item_id, item_name_snapshot, item_type_snapshot, price_snapshot,
           status, request_id, token_ledger_entry_id, purchased_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'purchased', ?, ?, ?)`,
        [
          purchaseId,
          playerId,
          String(item.id),
          String(item.name),
          String(item.item_type),
          price,
          requestId,
          ledgerEntry.id,
          purchasedAt,
        ],
      );

      const purchase = await tx.get<any>('SELECT * FROM shop_purchases WHERE id = ?', [purchaseId]);
      return { purchase, balance: ledgerEntry.balance_after, idempotent: false };
    });

    return res.status(result.idempotent ? 200 : 201).json({ success: true, ...result });
  } catch (error: any) {
    return sendTokenError(res, error);
  }
});

export default router;
