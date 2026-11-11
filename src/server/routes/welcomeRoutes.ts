import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getDb } from '../../db/index.ts';
import { novicePromoParts, organizerContactLinks, clubVkGroupUrl, noviceTelegramGroupFallback } from '../../lib/novicePromo.ts';
import { noviceScheduleLine } from '../../lib/eveningFormat.ts';
import { venueDetails } from '../../lib/venues.ts';
import { getPublicAppBaseUrl } from '../runtimeConfig.ts';
import { telegramBotUsername } from '../services/playerClaimLinkService.ts';
import { loadPriceSettings } from '../services/eveningPriceSettingsService.ts';
import { LeadError, createWelcomeLead, recordWelcomeVisit } from '../services/newcomerFunnelService.ts';

/** The public page for newcomers (owner, 2026-11-11): what the game is, the nearest novice evening, a contact or a sign-in. */
const router = Router();
const limit = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

router.get('/welcome', limit, async (req, res) => {
  try {
    const db = req.db || await getDb();
    const evening = await db.get<any>(
      `SELECT id, title, starts_at, venue FROM game_evenings
        WHERE UPPER(COALESCE(format, '')) = 'NOVICE' AND status IN ('published', 'active') AND datetime(starts_at) >= datetime('now', '-3 hours')
        ORDER BY datetime(starts_at) ASC LIMIT 1`);
    const prices = await loadPriceSettings(db);
    const bot = await telegramBotUsername().catch(() => null);
    const base = getPublicAppBaseUrl().replace(/\/+$/, '');
    res.set('Cache-Control', 'no-store');
    return res.json({
      promo: novicePromoParts(),
      evening: evening ? {
        id: String(evening.id), title: String(evening.title || 'Вечер для новичков'), starts_at: evening.starts_at,
        venue: venueDetails(evening.venue), schedule: noviceScheduleLine(evening.starts_at),
        price: `${prices.novice_game} ₽ за игру${prices.novice_cap == null ? '' : `, не больше ${prices.novice_cap} ₽ за вечер`}`,
        join_url: `${base}/join/${encodeURIComponent(String(evening.id))}?source=welcome`,
        telegram_url: bot ? `https://t.me/${bot}?start=event_${encodeURIComponent(String(evening.id))}` : null,
      } : null,
      contacts: organizerContactLinks(), vk_group: clubVkGroupUrl(), telegram_group: noviceTelegramGroupFallback(),
    });
  } catch { return res.status(500).json({ error: 'Не удалось загрузить страницу' }); }
});

router.post('/welcome/visit', limit, async (req, res) => {
  try { await recordWelcomeVisit(req.db || await getDb(), { visitorId: req.body?.visitor_id, source: req.body?.source }); return res.json({ ok: true }); }
  catch { return res.json({ ok: false }); }
});

const leadLimit = rateLimit({ windowMs: 10 * 60_000, limit: 6, standardHeaders: 'draft-7', legacyHeaders: false });
router.post('/welcome/lead', leadLimit, async (req, res) => {
  // A hidden field only a script fills in: the answer looks like success so a bot learns nothing.
  if (String(req.body?.website || '').trim()) return res.json({ ok: true });
  try {
    const lead = await createWelcomeLead(req.db || await getDb(), { name: req.body?.name, contactKind: req.body?.contact_kind, contactValue: req.body?.contact_value, source: req.body?.source, referredBy: req.body?.referred_by });
    return res.status(lead.created ? 201 : 200).json({ ok: true, created: lead.created });
  } catch (error: any) {
    if (error instanceof LeadError) return res.status(error.statusCode).json({ error: error.message });
    return res.status(500).json({ error: 'Не удалось сохранить. Попробуйте ещё раз' });
  }
});

export default router;
