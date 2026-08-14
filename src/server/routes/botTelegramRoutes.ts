import { Router } from 'express';
import { isTelegramDestinationId } from '../../db/ensureTelegramPublishingSchema.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { botServiceAuth } from '../botServiceAuth.ts';
import { CLUB_EVENING_MAX_PRICE, loadEveningSlotPlan } from '../services/eveningSlotPlanningService.ts';

const router = Router();
router.use(botServiceAuth);

const destinationOrder = ['public', 'novice', 'club', 'rating'];

const listDestinations = async (db: any) => {
  const rows = await db.all(
    `SELECT id, name, description, chat_id, topic_id, invite_url, active, router_message_id, updated_at
       FROM telegram_destinations`,
  );
  rows.sort((a: any, b: any) => destinationOrder.indexOf(String(a.id)) - destinationOrder.indexOf(String(b.id)));
  return rows.map((row: any) => ({ ...row, active: Boolean(row.active) }));
};

const desiredDestinationIds = (formatRaw: unknown, statusRaw: unknown, settledAt: unknown): string[] => {
  const status = String(statusRaw || '');
  if (!['published', 'active'].includes(status) || settledAt) return [];
  const format = normalizeEveningFormat(formatRaw);
  if (format === 'NOVICE') return ['public', 'novice'];
  if (format === 'CASUAL') return ['public', 'club'];
  return ['rating'];
};

router.get('/telegram/settings', async (req, res) => {
  try {
    res.json({ destinations: await listDestinations((req as any).db) });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось загрузить Telegram-направления' });
  }
});

router.get('/evenings/:eveningId/telegram-plan', async (req, res) => {
  try {
    const db = (req as any).db;
    const evening = await db.get(
      `SELECT id, title, starts_at, ends_at, timezone, venue, format, status,
              capacity, default_price, notes, settled_at, updated_at
         FROM game_evenings WHERE id = ?`,
      [req.params.eveningId],
    );
    if (!evening) return res.status(404).json({ error: 'Вечер не найден' });

    const slotPlan = await loadEveningSlotPlan(db, req.params.eveningId);
    const canonicalFormat = normalizeEveningFormat(evening.format);
    const participants = await db.all(
      `SELECT ep.player_id, ep.response_status, ep.registration_status,
              ep.attendance_status, ep.arrival_status, p.nickname
         FROM evening_participants ep
         JOIN players p ON p.id = ep.player_id
        WHERE ep.evening_id = ?
        ORDER BY ep.created_at ASC`,
      [req.params.eveningId],
    );
    const destinations = await listDestinations(db);
    const publications = await db.all(
      `SELECT evening_id, destination_id, chat_id, topic_id, message_id, sent_at, updated_at
         FROM evening_telegram_publications
        WHERE evening_id = ?`,
      [req.params.eveningId],
    );

    res.json({
      evening: {
        ...evening,
        canonical_format: canonicalFormat,
        price_per_game: Number(slotPlan.event.price_per_game || slotPlan.slots[0]?.price || 0),
        max_price: canonicalFormat === 'CASUAL' ? CLUB_EVENING_MAX_PRICE : null,
      },
      slots: slotPlan.slots,
      participants,
      destinations,
      desired_destination_ids: desiredDestinationIds(evening.format, evening.status, evening.settled_at),
      publications,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось собрать план Telegram-публикации' });
  }
});

router.put('/evenings/:eveningId/telegram-publications/:destinationId', async (req, res) => {
  try {
    const db = (req as any).db;
    const destinationId = String(req.params.destinationId || '');
    if (!isTelegramDestinationId(destinationId)) return res.status(404).json({ error: 'Неизвестное Telegram-направление' });

    const evening = await db.get('SELECT id FROM game_evenings WHERE id = ?', [req.params.eveningId]);
    const destination = await db.get('SELECT id FROM telegram_destinations WHERE id = ?', [destinationId]);
    if (!evening || !destination) return res.status(404).json({ error: 'Вечер или Telegram-направление не найдены' });

    const chatId = String(req.body?.chat_id ?? '').trim();
    const messageId = Number(req.body?.message_id || 0);
    const topicRaw = req.body?.topic_id;
    const topicId = topicRaw === null || topicRaw === '' || topicRaw === undefined ? null : Number(topicRaw);
    if (!chatId || !Number.isInteger(messageId) || messageId <= 0) {
      return res.status(400).json({ error: 'Некорректные данные Telegram-публикации' });
    }
    if (topicId !== null && (!Number.isInteger(topicId) || topicId <= 0)) {
      return res.status(400).json({ error: 'Некорректный Topic ID' });
    }

    const now = new Date().toISOString();
    const existing = await db.get(
      'SELECT sent_at FROM evening_telegram_publications WHERE evening_id = ? AND destination_id = ?',
      [req.params.eveningId, destinationId],
    );
    await db.run(
      `INSERT OR REPLACE INTO evening_telegram_publications
         (evening_id, destination_id, chat_id, topic_id, message_id, sent_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.eveningId, destinationId, chatId, topicId, messageId, existing?.sent_at || now, now],
    );

    res.json({ success: true, updated_at: now });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось сохранить Telegram-публикацию' });
  }
});

router.get('/tournaments/:tournamentId/telegram-plan', async (req, res) => {
  try {
    const db = (req as any).db;
    const tournament = await db.get(
      `SELECT id, title, date, venue, stage, status, chief_judge_name, notes, game_count, updated_at
         FROM tournaments WHERE id = ?`,
      [req.params.tournamentId],
    );
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
    const participants = await db.all(
      `SELECT tp.player_id, tp.display_name, tp.participant_number, p.nickname
         FROM tournament_participants tp
         LEFT JOIN players p ON p.id = tp.player_id
        WHERE tp.tournament_id = ?
        ORDER BY tp.participant_number ASC`,
      [req.params.tournamentId],
    );
    const destinations = await listDestinations(db);
    const publications = await db.all(
      `SELECT tournament_id, destination_id, chat_id, message_id, sent_at, updated_at
         FROM tournament_telegram_publications
        WHERE tournament_id = ?`,
      [req.params.tournamentId],
    );
    res.json({
      tournament,
      participants,
      destinations,
      desired_destination_ids: String(tournament.status || '') === 'completed' ? [] : ['rating'],
      publications,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось собрать план Telegram-публикации турнира' });
  }
});

router.put('/tournaments/:tournamentId/telegram-publications/:destinationId', async (req, res) => {
  try {
    const db = (req as any).db;
    const destinationId = String(req.params.destinationId || '');
    if (!isTelegramDestinationId(destinationId)) return res.status(404).json({ error: 'Неизвестное Telegram-направление' });
    const tournament = await db.get('SELECT id FROM tournaments WHERE id = ?', [req.params.tournamentId]);
    const destination = await db.get('SELECT id FROM telegram_destinations WHERE id = ?', [destinationId]);
    if (!tournament || !destination) return res.status(404).json({ error: 'Турнир или Telegram-направление не найдены' });

    const chatId = String(req.body?.chat_id ?? '').trim();
    const messageId = Number(req.body?.message_id || 0);
    if (!chatId || !Number.isInteger(messageId) || messageId <= 0) {
      return res.status(400).json({ error: 'Некорректные данные Telegram-публикации турнира' });
    }
    const now = new Date().toISOString();
    const existing = await db.get(
      'SELECT sent_at FROM tournament_telegram_publications WHERE tournament_id = ? AND destination_id = ?',
      [req.params.tournamentId, destinationId],
    );
    await db.run(
      `INSERT OR REPLACE INTO tournament_telegram_publications
         (tournament_id, destination_id, chat_id, message_id, sent_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.tournamentId, destinationId, chatId, messageId, existing?.sent_at || now, now],
    );
    res.json({ success: true, updated_at: now });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось сохранить Telegram-публикацию турнира' });
  }
});

router.get('/telegram/public-router', async (req, res) => {
  try {
    const db = (req as any).db;
    const destinations = await listDestinations(db);
    const publicDestination = destinations.find((item: any) => item.id === 'public') || null;
    const noviceDestination = destinations.find((item: any) => item.id === 'novice') || null;
    const clubDestination = destinations.find((item: any) => item.id === 'club') || null;

    const novice = await db.get(
      `SELECT id, title, starts_at, venue, default_price, format
         FROM game_evenings
        WHERE status IN ('published', 'active') AND settled_at IS NULL
          AND format = 'NOVICE' AND datetime(starts_at) >= datetime('now')
        ORDER BY datetime(starts_at) ASC LIMIT 1`,
    );
    const club = await db.get(
      `SELECT id, title, starts_at, venue, default_price, format
         FROM game_evenings
        WHERE status IN ('published', 'active') AND settled_at IS NULL
          AND format IN ('CASUAL', 'STANDARD') AND datetime(starts_at) >= datetime('now')
        ORDER BY datetime(starts_at) ASC LIMIT 1`,
    );

    res.json({
      public_destination: publicDestination,
      novice_destination: noviceDestination,
      club_destination: clubDestination,
      novice_evening: novice || null,
      club_evening: club || null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось собрать публичный маршрутизатор' });
  }
});

router.patch('/telegram/public-router-state', async (req, res) => {
  try {
    const db = (req as any).db;
    const raw = req.body?.router_message_id;
    const messageId = raw === null || raw === '' || raw === undefined ? null : Number(raw);
    if (messageId !== null && (!Number.isInteger(messageId) || messageId <= 0)) {
      return res.status(400).json({ error: 'router_message_id должен быть положительным числом или null' });
    }
    const now = new Date().toISOString();
    await db.run(
      'UPDATE telegram_destinations SET router_message_id = ?, updated_at = ? WHERE id = ?',
      [messageId, now, 'public'],
    );
    res.json({ success: true, router_message_id: messageId, updated_at: now });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось сохранить состояние публичного маршрутизатора' });
  }
});

export default router;
