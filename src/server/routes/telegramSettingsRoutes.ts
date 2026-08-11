import { Router } from 'express';
import { isTelegramDestinationId } from '../../db/ensureTelegramPublishingSchema.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { requireOrganizerAuth } from '../auth.ts';
import {
  requestBotDestinationTest,
  requestBotEveningTelegramSync,
  requestBotPublicRouterSync,
} from '../services/botTelegramSyncService.ts';

const router = Router();
router.use(requireOrganizerAuth);

const destinationOrder = ['public', 'novice', 'club', 'rating'];

const sanitizeChatId = (value: unknown): string | null => {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^-?\d+$/.test(text) || /^@[A-Za-z0-9_]{5,}$/.test(text)) return text;
  throw new Error('Chat ID должен быть числом вида -100… или публичным @username');
};

const sanitizeInviteUrl = (value: unknown): string | null => {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (!/^https:\/\/t\.me\//i.test(text)) throw new Error('Ссылка должна начинаться с https://t.me/');
  return text.slice(0, 500);
};

const routingForFormat = (format: unknown): string[] => {
  const normalized = normalizeEveningFormat(format);
  if (normalized === 'NOVICE') return ['public', 'novice'];
  if (normalized === 'CASUAL') return ['public', 'club'];
  return ['rating'];
};

router.get('/', async (req, res) => {
  try {
    const db = (req as any).db;
    const rows = await db.all(
      `SELECT id, name, description, chat_id, topic_id, invite_url, active,
              router_message_id, created_at, updated_at
         FROM telegram_destinations`,
    );
    rows.sort((a: any, b: any) => destinationOrder.indexOf(String(a.id)) - destinationOrder.indexOf(String(b.id)));
    res.json({
      destinations: rows.map((row: any) => ({
        ...row,
        active: Boolean(row.active),
        configured: Boolean(String(row.chat_id || '').trim()),
      })),
      routing: {
        NOVICE: ['public', 'novice'],
        CASUAL: ['public', 'club'],
        RATING: ['rating'],
        TOURNAMENT: ['rating'],
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось загрузить Telegram-настройки' });
  }
});

router.get('/evenings/:eveningId', async (req, res) => {
  try {
    const db = (req as any).db;
    const evening = await db.get('SELECT id, format, status, settled_at FROM game_evenings WHERE id = ?', [req.params.eveningId]);
    if (!evening) return res.status(404).json({ error: 'Игровой вечер не найден' });
    const desiredIds = ['published', 'active'].includes(String(evening.status)) && !evening.settled_at
      ? routingForFormat(evening.format)
      : [];
    const destinations = await db.all(
      `SELECT id, name, chat_id, topic_id, active FROM telegram_destinations`,
    );
    const publications = await db.all(
      `SELECT destination_id, chat_id, topic_id, message_id, sent_at, updated_at
         FROM evening_telegram_publications WHERE evening_id = ?`,
      [req.params.eveningId],
    );
    const pubById = new Map(publications.map((item: any) => [String(item.destination_id), item]));
    res.json({
      canonical_format: normalizeEveningFormat(evening.format),
      desired_destination_ids: desiredIds,
      destinations: desiredIds.map((id) => {
        const config = destinations.find((item: any) => String(item.id) === id) || {};
        const publication = pubById.get(id) || null;
        return {
          id,
          name: config.name || id,
          active: Boolean(config.active),
          configured: Boolean(String(config.chat_id || '').trim()),
          published: Boolean(publication),
          message_id: publication?.message_id || null,
          updated_at: publication?.updated_at || null,
        };
      }),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось загрузить статус Telegram-публикации' });
  }
});

router.patch('/:destinationId', async (req, res) => {
  try {
    const db = (req as any).db;
    const destinationId = String(req.params.destinationId || '');
    if (!isTelegramDestinationId(destinationId)) return res.status(404).json({ error: 'Неизвестное Telegram-направление' });

    const existing = await db.get('SELECT * FROM telegram_destinations WHERE id = ?', [destinationId]);
    if (!existing) return res.status(404).json({ error: 'Telegram-направление не найдено' });

    const chatId = Object.prototype.hasOwnProperty.call(req.body || {}, 'chat_id')
      ? sanitizeChatId(req.body.chat_id)
      : existing.chat_id;
    const inviteUrl = Object.prototype.hasOwnProperty.call(req.body || {}, 'invite_url')
      ? sanitizeInviteUrl(req.body.invite_url)
      : existing.invite_url;

    let topicId = existing.topic_id;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'topic_id')) {
      const raw = req.body.topic_id;
      if (raw === null || raw === '' || raw === undefined) topicId = null;
      else {
        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed <= 0) return res.status(400).json({ error: 'Topic ID должен быть положительным целым числом' });
        topicId = parsed;
      }
    }

    const active = Object.prototype.hasOwnProperty.call(req.body || {}, 'active')
      ? (req.body.active ? 1 : 0)
      : Number(existing.active || 0);

    if (active && !chatId) return res.status(400).json({ error: 'Чтобы включить направление, сначала укажи Chat ID' });
    if ((destinationId === 'public' || destinationId === 'rating') && topicId) {
      return res.status(400).json({ error: 'Для канала Topic ID не используется' });
    }

    const now = new Date().toISOString();
    await db.run(
      `UPDATE telegram_destinations
          SET chat_id = ?, topic_id = ?, invite_url = ?, active = ?, updated_at = ?
        WHERE id = ?`,
      [chatId, topicId, inviteUrl, active, now, destinationId],
    );

    const updated = await db.get(
      `SELECT id, name, description, chat_id, topic_id, invite_url, active,
              router_message_id, created_at, updated_at
         FROM telegram_destinations WHERE id = ?`,
      [destinationId],
    );
    res.json({ ...updated, active: Boolean(updated.active), configured: Boolean(String(updated.chat_id || '').trim()) });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Не удалось сохранить Telegram-настройки' });
  }
});

router.post('/:destinationId/test', async (req, res) => {
  const destinationId = String(req.params.destinationId || '');
  if (!isTelegramDestinationId(destinationId)) return res.status(404).json({ error: 'Неизвестное Telegram-направление' });
  const result = await requestBotDestinationTest(destinationId);
  res.status(result.success ? 200 : result.status || 502).json(result.success ? result.data : { error: result.error, bot: result.data || null });
});

router.post('/actions/sync-public', async (_req, res) => {
  const result = await requestBotPublicRouterSync();
  res.status(result.success ? 200 : result.status || 502).json(result.success ? result.data : { error: result.error, bot: result.data || null });
});

router.post('/actions/sync-evening/:eveningId', async (req, res) => {
  const result = await requestBotEveningTelegramSync(String(req.params.eveningId || ''));
  res.status(result.success ? 200 : result.status || 502).json(result.success ? result.data : { error: result.error, bot: result.data || null });
});

export default router;
