import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import { loadPriceSettings, savePriceSettings } from '../services/eveningPriceSettingsService.ts';
import { reconcileRegularEveningPayments } from '../services/eveningPaymentPricingService.ts';
import { reconcileNoviceEveningCharges } from '../services/eveningSlotPlanningService.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import type { DatabaseWrapper } from '../../db/index.ts';

/**
 * A new price reaches the amounts due of every evening that is not closed (owner, 2026-10-23). A club evening is
 * recounted from the games played, so a running one is safe; a novice or rating evening is recounted from the sign-ups
 * only before it starts — while it runs, the seating and the closeout recount it as before.
 */
async function applyPricesToOpenEvenings(db: DatabaseWrapper, eveningIds: string[]) {
  for (const id of eveningIds) {
    try {
      const evening = await db.get<{ format: string; starts_at: string }>('SELECT format, starts_at FROM game_evenings WHERE id = ?', [id]);
      if (!evening) continue;
      const format = normalizeEveningFormat(evening.format);
      if (format === 'CASUAL') await reconcileRegularEveningPayments(db, id);
      else if ((format === 'NOVICE' || format === 'RATING') && Date.parse(evening.starts_at) > Date.now()) await reconcileNoviceEveningCharges(db, id);
    } catch (error) {
      console.warn('[EVENING PRICES] Recount failed for evening', id, error);
    }
  }
}

const router = Router();
router.use(requireOrganizerAuth);
router.get('/', async (req, res) => { try { res.json(await loadPriceSettings(req.db)); } catch { res.status(500).json({ error: 'Не удалось загрузить цены' }); } });
router.put('/', async (req, res) => {
  try {
    const { prices, openEveningIds } = await savePriceSettings(req.db, req.body);
    await applyPricesToOpenEvenings(req.db, openEveningIds);
    res.json(prices);
  } catch (error: any) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Не удалось сохранить цены' }); }
});
export default router;
