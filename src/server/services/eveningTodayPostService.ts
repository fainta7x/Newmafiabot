import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { getEveningResponse } from '../../lib/eveningResponse.ts';
import { loadEveningSlotPlan } from './eveningSlotPlanningService.ts';
import { telegramBotUsername } from './playerClaimLinkService.ts';
import { createVkWallPost, getVkDestinations } from './vkPublishingService.ts';
import { enqueueOrganizerNotification } from './organizerNotificationService.ts';
import { isEveningPublishingPaused } from './eveningPublishingPause.ts';

/**
 * «Сегодня играем» (owner, 2026-10-02): on the evening day the organizer posts a bright invitation
 * with the start time of the chosen game, the roster and a call to join. The organizer picks the
 * game everyone is expected at, checks or edits the text, and it goes to the evening's Telegram
 * group and the VK group. Each channel gets the post once; a failed channel can be retried.
 *
 * At 17:00 Moscow time on the evening day the post goes out by itself when the evening is gathered
 * (the slot plan's `assembled`: 4 games with a full table by default). Otherwise the organizer gets a
 * Telegram message and a highlighted task «Играем сегодня?»: publish the post or decide not to.
 */
export const TODAY_POST_HOUR_MSK = 17;

export async function ensureEveningTodayPostSchema(db: DatabaseWrapper) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS evening_today_posts (
      evening_id TEXT PRIMARY KEY REFERENCES game_evenings(id) ON DELETE CASCADE,
      text TEXT,
      game_number INTEGER,
      telegram_status TEXT,
      telegram_error TEXT,
      vk_status TEXT,
      vk_error TEXT,
      vk_url TEXT,
      published_at TEXT,
      sending_until TEXT,
      decision_prompt_at TEXT,
      skipped_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

const time = (value: unknown) => new Date(String(value)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10; const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

/** The default text for the chosen game; the organizer may edit it before publishing. */
export async function buildTodayPostDraft(db: DatabaseWrapper, eveningId: string, gameNumber?: unknown) {
  const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
  const plan = await loadEveningSlotPlan(db, eveningId).catch(() => null);
  const slots = plan?.slots || [];
  const perSlot = Number(plan?.event.required_players_per_slot || 11);
  const chosen = slots.find((slot: any) => slot.slot_number === Number(gameNumber)) || slots[0] || null;

  const participants = await db.all<any>(
    `SELECT ep.id, ep.response_status, ep.registration_status, p.id AS player_id, p.nickname
       FROM evening_participants ep JOIN players p ON p.id = ep.player_id
      WHERE ep.evening_id = ? ORDER BY p.nickname COLLATE NOCASE`,
    [eveningId],
  );
  // The first game each player is registered for («Иду» without a plan counts from the first game).
  const firstGame = new Map<string, number>();
  for (const slot of slots) {
    for (const person of slot.participants || []) {
      if (!firstGame.has(String(person.id))) firstGame.set(String(person.id), slot.slot_number);
    }
  }
  const coming = participants.filter((item: any) => ['going', 'late'].includes(getEveningResponse(item)));
  const roster = coming.map((item: any, index: number) => {
    const from = firstGame.get(String(item.player_id));
    const note = getEveningResponse(item) === 'late' ? ' (подойдёт позже)' : from && chosen && from > chosen.slot_number ? ` (с ${from}-й игры)` : '';
    return `${index + 1}. ${String(item.nickname || 'Игрок')}${note}`;
  });

  const lines: string[] = ['🎭 Всем привет! Сегодня играем в мафию!', ''];
  if (chosen) lines.push(`🕘 Ждём всех к ${chosen.slot_number}-й игре — в ${time(chosen.starts_at)}`);
  if (evening.venue) lines.push(`📍 ${String(evening.venue)}`);
  lines.push('', `👥 Состав (${coming.length}):`, ...(roster.length ? roster : ['Пока пусто — стань первым!']));
  if (slots.length) {
    lines.push('', `🎲 Игры: ${slots.map((slot: any) => slot.registered_count >= perSlot ? `${slot.slot_number}-я ✓` : `${slot.slot_number}-я ${slot.registered_count}/${perSlot}`).join(' · ')}`);
    const short = slots.find((slot: any) => slot.registered_count < perSlot && (!chosen || slot.slot_number >= chosen.slot_number));
    if (short) {
      const missing = perSlot - short.registered_count;
      lines.push(`🔥 На ${short.slot_number}-ю игру не хватает ${missing} ${plural(missing, 'человека', 'человек', 'человек')} — присоединяйся, будет жарко!`);
    } else {
      lines.push('🔥 Столы собраны — но место для новых лиц всегда найдём. Зови друзей!');
    }
  }
  const bot = await telegramBotUsername().catch(() => null);
  lines.push('', bot ? `👉 Записаться: https://t.me/${bot}` : '👉 Записаться можно в приложении клуба', 'До встречи за столом! 🖤');

  return {
    evening_id: eveningId,
    game_number: chosen?.slot_number ?? null,
    games: slots.map((slot: any) => ({ number: slot.slot_number, starts_at: slot.starts_at, registered: slot.registered_count, target: perSlot })),
    text: lines.join('\n'),
  };
}

export async function loadTodayPost(db: DatabaseWrapper, eveningId: string) {
  await ensureEveningTodayPostSchema(db);
  const row = await db.get<any>('SELECT * FROM evening_today_posts WHERE evening_id = ? LIMIT 1', [eveningId]);
  if (!row) return { evening_id: eveningId, state: 'pending' as const, decision_prompt_at: null, skipped_at: null };
  const legs = [row.telegram_status, row.vk_status];
  const state = legs.every((leg) => leg === 'published') ? 'published' as const : legs.some((leg) => leg === 'published') ? 'partial' as const : 'pending' as const;
  return { evening_id: eveningId, state, text: row.text, game_number: row.game_number, telegram_status: row.telegram_status, telegram_error: row.telegram_error, vk_status: row.vk_status, vk_error: row.vk_error, vk_url: row.vk_url, published_at: row.published_at, decision_prompt_at: row.decision_prompt_at || null, skipped_at: row.skipped_at || null };
}

export async function sendTelegram(db: DatabaseWrapper, evening: any, text: string, fetchImpl: typeof fetch) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return { status: 'failed', error: 'Telegram-бот не настроен' };
  const format = normalizeEveningFormat(evening.format);
  const destination = await db.get<any>(
    'SELECT chat_id, topic_id FROM telegram_destinations WHERE id = ? LIMIT 1',
    [format === 'NOVICE' ? 'novice' : format === 'CASUAL' ? 'club' : 'rating'],
  ).catch(() => null);
  if (!destination?.chat_id) return { status: 'failed', error: 'Не настроена Telegram-группа для этого вечера' };
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: destination.chat_id, ...(destination.topic_id ? { message_thread_id: Number(destination.topic_id) } : {}), text, disable_web_page_preview: true }),
    });
    const payload: any = await response.json().catch(() => null);
    if (response.ok && payload?.ok !== false) return { status: 'published', error: null };
    return { status: 'failed', error: String(payload?.description || `Telegram HTTP ${response.status}`) };
  } catch (error: any) {
    return { status: 'failed', error: error?.message || 'Telegram недоступен' };
  }
}

export async function sendVk(text: string) {
  const groupId = getVkDestinations().find((destination) => destination.key === 'public' && destination.supported)?.groupId;
  if (!groupId) return { status: 'failed', error: 'Группа ВК не настроена', url: null };
  try {
    const post = await createVkWallPost({ groupId, message: text });
    return { status: 'published', error: null, url: post.externalUrl || null };
  } catch (error: any) {
    return { status: 'failed', error: error?.message || 'ВК недоступен', url: null };
  }
}

export async function publishTodayPost(db: DatabaseWrapper, eveningId: string, input: { text?: unknown; game_number?: unknown }, fetchImpl: typeof fetch = fetch) {
  await ensureEveningTodayPostSchema(db);
  const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
  if (!['published', 'active'].includes(String(evening.status)) || evening.settled_at) {
    throw Object.assign(new Error('Пост «Сегодня играем» можно выложить только для открытого вечера'), { statusCode: 409 });
  }
  const now = new Date().toISOString();
  await db.run('INSERT OR IGNORE INTO evening_today_posts (evening_id, created_at, updated_at) VALUES (?, ?, ?)', [eveningId, now, now]);
  const existing = await db.get<any>('SELECT * FROM evening_today_posts WHERE evening_id = ? LIMIT 1', [eveningId]);
  const text = String(input.text || '').trim().slice(0, 3500) || String(existing?.text || '') || (await buildTodayPostDraft(db, eveningId, input.game_number)).text;

  // Reserve the attempt so a double tap or a lost response cannot post twice.
  const reserved = await db.run(
    `UPDATE evening_today_posts SET sending_until = ?, updated_at = ?
      WHERE evening_id = ? AND (sending_until IS NULL OR sending_until < ?)`,
    [new Date(Date.now() + 90_000).toISOString(), now, eveningId, now],
  );
  if (!reserved.changes) throw Object.assign(new Error('Пост уже отправляется — подождите минуту'), { statusCode: 409 });
  try {
    // Channels that already have the post are never posted to again.
    const [telegram, vk] = await Promise.all([
      existing?.telegram_status === 'published' ? { status: 'published', error: null } : sendTelegram(db, evening, text, fetchImpl),
      existing?.vk_status === 'published' ? { status: 'published', error: null, url: existing.vk_url || null } : sendVk(text),
    ]);
    const done = new Date().toISOString();
    const reached = telegram.status === 'published' || vk.status === 'published';
    await db.run(
      `UPDATE evening_today_posts
          SET text = ?, game_number = ?, telegram_status = ?, telegram_error = ?, vk_status = ?, vk_error = ?, vk_url = ?,
              published_at = COALESCE(published_at, ?), sending_until = NULL, updated_at = ?
        WHERE evening_id = ?`,
      [text, Number(input.game_number) || existing?.game_number || null, telegram.status, telegram.error, vk.status, vk.error, (vk as any).url || null,
        reached ? done : null, done, eveningId],
    );
  } catch (error) {
    await db.run('UPDATE evening_today_posts SET sending_until = NULL WHERE evening_id = ?', [eveningId]);
    throw error;
  }
  return loadTodayPost(db, eveningId);
}

/** The organizer decided not to publish today (the evening may still be cancelled separately). */
export async function skipTodayPost(db: DatabaseWrapper, eveningId: string) {
  await ensureEveningTodayPostSchema(db);
  const now = new Date().toISOString();
  await db.run('INSERT OR IGNORE INTO evening_today_posts (evening_id, created_at, updated_at) VALUES (?, ?, ?)', [eveningId, now, now]);
  await db.run('UPDATE evening_today_posts SET skipped_at = ?, updated_at = ? WHERE evening_id = ?', [now, now, eveningId]);
  return loadTodayPost(db, eveningId);
}

const moscowParts = (ms: number) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
};

/** The worker's minute scan: from 17:00 Moscow time on the evening day, post or ask the organizer. */
export async function runTodayPostSchedule(db: DatabaseWrapper, now = Date.now(), fetchImpl: typeof fetch = fetch) {
  if (isEveningPublishingPaused()) return 0;
  await ensureEveningTodayPostSchema(db);
  const clock = moscowParts(now);
  if (clock.hour < TODAY_POST_HOUR_MSK) return 0;
  const evenings = await db.all<any>(
    `SELECT e.id, e.title, e.starts_at, p.telegram_status, p.vk_status, p.decision_prompt_at, p.skipped_at
       FROM game_evenings e LEFT JOIN evening_today_posts p ON p.evening_id = e.id
      WHERE e.status = 'published' AND e.settled_at IS NULL AND UPPER(COALESCE(e.format, '')) <> 'TOURNAMENT'
        AND datetime(e.starts_at) > datetime(?) AND datetime(e.starts_at) <= datetime(?)`,
    [new Date(now).toISOString(), new Date(now + 24 * 3_600_000).toISOString()],
  );
  let actions = 0;
  for (const evening of evenings) {
    if (moscowParts(new Date(String(evening.starts_at)).getTime()).date !== clock.date) continue;
    // Anything already sent, skipped or asked about is left to the organizer.
    if (evening.telegram_status || evening.vk_status || evening.skipped_at || evening.decision_prompt_at) continue;
    const id = String(evening.id);
    const plan = await loadEveningSlotPlan(db, id).catch(() => null);
    if (!plan?.slots.length) continue;
    if (plan.event.assembled) {
      try {
        await publishTodayPost(db, id, {}, fetchImpl);
        actions += 1;
      } catch (error) {
        console.error('[TODAY POST] automatic post failed:', error);
      }
      continue;
    }
    const nowIso = new Date(now).toISOString();
    await db.run('INSERT OR IGNORE INTO evening_today_posts (evening_id, created_at, updated_at) VALUES (?, ?, ?)', [id, nowIso, nowIso]);
    const claimed = await db.run('UPDATE evening_today_posts SET decision_prompt_at = ?, updated_at = ? WHERE evening_id = ? AND decision_prompt_at IS NULL', [nowIso, nowIso, id]);
    if (!claimed.changes) continue;
    await enqueueOrganizerNotification(db, {
      messageKey: `evening-today-post:${id}`,
      eventType: 'evening_today_post',
      entityId: id,
      text: `🤔 «${String(evening.title || 'Игровой вечер')}»: набрано ${plan.event.assembled_slots} из ${plan.event.required_slots} нужных игр. Играем сегодня? Пост «Сегодня играем» сам не ушёл — опубликуй его или реши, что не публикуем: кабинет организатора → вечер → «Сбор».`,
    });
    actions += 1;
  }
  return actions;
}
