import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getDb } from '../../db/index.ts';
import { openEveningSql } from '../../lib/eveningStatus.ts';
import { organizerContactLinks, clubVkGroupUrl, noviceTelegramGroupFallback } from '../../lib/novicePromo.ts';
import { noviceScheduleLine } from '../../lib/eveningFormat.ts';
import { venueDetails } from '../../lib/venues.ts';
import { getPublicAppBaseUrl, getWelcomeSiteOrigins } from '../runtimeConfig.ts';
import { telegramBotUsername } from '../services/playerClaimLinkService.ts';
import { loadPriceSettings } from '../services/eveningPriceSettingsService.ts';
import { announcementPhotoPath } from '../services/announcementPhotoService.ts';
import { loadEveningSlotPlan } from '../services/eveningSlotPlanningService.ts';
import { createHash } from 'node:crypto';
import { LeadError, createWelcomeLead, recordWelcomeVisit } from '../services/newcomerFunnelService.ts';
import { notifyOrganizerAboutLead } from '../services/leadNotificationService.ts';

/**
 * The text of the page is the owner's current recruitment post «Школа спортивной мафии | Тула» (2026-11-11), cut into parts the page folds.
 * Facts that live in the data (the evening, its time, the price) come from the evening and the price settings.
 */
export const WELCOME_CONTENT = {
  title: 'Школа спортивной мафии | Тула',
  lead: 'Любишь азарт соревнований, сложные стратегии и интеллектуальные вызовы? Тогда тебе к нам!',
  about: 'Спортивная мафия — это интеллектуальная соревновательная дисциплина, сочетающая командное противостояние и индивидуальное мастерство. Здесь решают логика, стратегия, аргументация и умение анализировать соперников. По спортивной мафии проводятся турниры и чемпионаты.',
  sections: [
    { title: '🎯 Кому к нам?', items: ['🎮 Любителям Dota 2, CS2 и других соревновательных игр.', '♟️ Поклонникам шахмат, стратегий и сложных настолок.', '🃏 Любителям покера, блефа и психологических игр.', '🏆 Тем, кто любит соревноваться, побеждать и совершенствовать свои навыки.'] },
    { title: '🧠 Что ждёт за столом?', items: ['Проверка на логику, внимательность и умение разбираться в людях. Психологические манипуляции, блеф, напряжённые споры и попытки убедить других в своей правоте.', 'Здесь придётся быстро соображать, принимать непростые решения, справляться с давлением и сохранять хладнокровие.'] },
    { title: '🎲 Как проходит обучение?', items: ['Опыт не нужен! Объясним правила, познакомим с основами игры и поможем сыграть первые партии.'] },
  ],
} as const;

/** The public page for newcomers (owner, 2026-11-11): what the game is, the nearest novice evening, a contact or a sign-in. */
const router = Router();

/** The club's site asks these routes from another address: only the welcome routes answer it, and only that address. */
router.use('/welcome', (req, res, next) => {
  const origin = String(req.headers.origin || '');
  if (origin && getWelcomeSiteOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
});
const limit = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

const NOVICE_EVENING_SQL = `UPPER(COALESCE(format, '')) = 'NOVICE' AND ${openEveningSql()} AND datetime(starts_at) >= datetime('now', '-3 hours')`;

/** Up to four club photos for the top of the page: the club's own pictures from «Публикации клуба», a stable choice per evening. */
async function heroPhotos(db: any, seed: string): Promise<string[]> {
  const rows = await db.all("SELECT id FROM announcement_photos WHERE audience IN ('all', 'NOVICE') ORDER BY created_at ASC, rowid ASC").catch(() => []);
  if (!rows.length) return [];
  const start = createHash('sha256').update(seed).digest().readUInt32BE(0) % rows.length;
  return Array.from({ length: Math.min(4, rows.length) }, (_, index) => announcementPhotoPath(String(rows[(start + index) % rows.length].id)));
}

router.get('/welcome', limit, async (req, res) => {
  try {
    const db = req.db || await getDb();
    const evening = await db.get<any>(
      `SELECT id, title, starts_at, venue FROM game_evenings
        WHERE ${NOVICE_EVENING_SQL}
        ORDER BY datetime(starts_at) ASC LIMIT 1`);
    const prices = await loadPriceSettings(db);
    const bot = await telegramBotUsername().catch(() => null);
    const base = getPublicAppBaseUrl().replace(/\/+$/, '');
    res.set('Cache-Control', 'no-store');
    return res.json({
      content: WELCOME_CONTENT,
      evening: evening ? {
        id: String(evening.id), title: String(evening.title || 'Вечер для новичков'), starts_at: evening.starts_at,
        venue: venueDetails(evening.venue), schedule: noviceScheduleLine(evening.starts_at),
        price: `Первые 2 вечера бесплатно, дальше — ${prices.novice_game} ₽ за игру${prices.novice_cap == null ? '' : `, не больше ${prices.novice_cap} ₽ за вечер`}`,
        join_url: `${base}/join/${encodeURIComponent(String(evening.id))}?source=welcome`,
        telegram_url: bot ? `https://t.me/${bot}?start=event_${encodeURIComponent(String(evening.id))}` : null,
      } : null,
      hero_photos: await heroPhotos(db, String(evening?.id || 'welcome')),
      contacts: organizerContactLinks(), vk_group: clubVkGroupUrl(), telegram_group: noviceTelegramGroupFallback(),
    });
  } catch { return res.status(500).json({ error: 'Не удалось загрузить страницу' }); }
});

/** Who has taken seats at the nearest novice evening, read again every few seconds by the page. */
router.get('/welcome/seats', rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }), async (req, res) => {
  try {
    const db = req.db || await getDb();
    const evening = await db.get<any>(`SELECT id FROM game_evenings WHERE ${NOVICE_EVENING_SQL} ORDER BY datetime(starts_at) ASC LIMIT 1`);
    res.set('Cache-Control', 'no-store');
    if (!evening) return res.json({ evening_id: null, games: [], going: 0, updated_at: new Date().toISOString() });
    const plan = await loadEveningSlotPlan(db, String(evening.id));
    const games = plan.slots.filter((slot) => slot.status === 'open').map((slot) => ({
      number: slot.slot_number, starts_at: slot.starts_at, target: slot.target_players, taken: slot.registered_count,
      people: slot.participants.slice(0, 14).map((person) => String(person.nickname || 'Игрок').slice(0, 24)),
    }));
    const going = new Set(plan.slots.flatMap((slot) => slot.participants.map((person) => String(person.id)))).size;
    return res.json({ evening_id: String(evening.id), games, going, updated_at: new Date().toISOString() });
  } catch { return res.status(500).json({ error: 'Не удалось загрузить места' }); }
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
    if (lead.created) await notifyOrganizerAboutLead(req.db || await getDb(), lead.playerId, 'self').catch((error) => console.warn('[LEAD] Organizer notification failed:', error instanceof Error ? error.message : String(error)));
    return res.status(lead.created ? 201 : 200).json({ ok: true, created: lead.created });
  } catch (error: any) {
    if (error instanceof LeadError) return res.status(error.statusCode).json({ error: error.message });
    return res.status(500).json({ error: 'Не удалось сохранить. Попробуйте ещё раз' });
  }
});

export default router;
