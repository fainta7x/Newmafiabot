import { importLegacyPublicationHolds } from './publicationDeliveryService.ts';
import { sendPublicTelegram } from './publicationTelegramService.ts';
import { deliverPublication, type PublicationContext, type PublicationResult } from './publicationDeliveryService.ts';
import { isOpenEvening } from '../../lib/eveningStatus.ts';
import { ensureGuestPlayerPlaceholderSchema } from '../../db/ensureGuestPlayerPlaceholderSchema.ts';
import { escapeTelegramHtml } from './personalNotificationText.ts';
import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { getEveningResponse } from '../../lib/eveningResponse.ts';
import { loadEveningSlotPlan } from './eveningSlotPlanningService.ts';
import { telegramBotUsername } from './playerClaimLinkService.ts';
import { canEditVkWallPosts, createVkWallPost, getVkDestinations } from './vkPublishingService.ts';
import { announcementCoverUrl, pickAnnouncementPhotoId, uploadAnnouncementPhotoToVk, uploadVkWallPhotoBytes } from './announcementPhotoService.ts';
import { getPublicAppBaseUrl } from '../runtimeConfig.ts';
import { enqueueOrganizerNotification } from './organizerNotificationService.ts';
import { loadEveningShortfall } from './eveningShortfallService.ts';
import { isEveningPublishingPaused } from './eveningPublishingPause.ts';
import { russianPlural } from '../../lib/russianPlural.ts';
import { generateEveningSeatingPlan } from './eveningSeatingGenerationService.ts';
import { queueEveningSeatingJudgeSummary, queueEveningSeatingNotifications } from './eveningSeatingNotificationsService.ts';

/**
 * «Сегодня играем» (owner, 2026-10-02): on the evening day the organizer posts a bright invitation
 * with the start time of the chosen game, the roster and a call to join. The organizer picks the
 * game everyone is expected at, checks or edits the text, and it goes to the evening's Telegram
 * group and the VK group. Each channel gets the post once; a failed channel can be retried.
 *
 * At 17:00 Moscow time on the evening day the post goes out by itself when the evening is gathered
 * (the slot plan's `assembled`: 4 games with a full table by default). With no full game at all and fewer
 * players than the minimum the evening is cancelled by itself. In between (e.g. 3 of 4) the organizer gets a
 * Telegram message and a highlighted task «Играем сегодня?»: publish the post, decide not to, or cancel.
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
  // The text the app generated itself: a post whose text still equals it is kept in step with the roster.
  const columns = await db.all<any>('PRAGMA table_info(evening_today_posts)');
  if (!columns.some((column: any) => column.name === 'auto_text')) {
    // Two concurrent first calls may both see the column missing; the loser's duplicate-column error is harmless.
    await db.run('ALTER TABLE evening_today_posts ADD COLUMN auto_text TEXT').catch((error: any) => { if (!/duplicate column/i.test(String(error?.message))) throw error; });
  }
}

const time = (value: unknown) => new Date(String(value)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
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
  // Guests without a profile (leads) come too; «+N» are the people they bring.
  await ensureGuestPlayerPlaceholderSchema(db);
  const guests = await db.all<any>(
    "SELECT id, display_name AS nickname, response_status FROM guest_player_placeholders WHERE evening_id = ? AND replaced_at IS NULL AND response_status IN ('going', 'late') ORDER BY created_at",
    [eveningId],
  );
  // A legacy RSVP `late` alone does not establish arrival after the announced game time.
  const guestLines = guests.map((guest: any) => String(guest.nickname || 'Гость без профиля'));
  const comingTotal = coming.length + guests.length;
  const roster = coming.map((item: any, index: number) => {
    const from = firstGame.get(String(item.player_id));
    // Show an arrival qualifier only when the slot plan proves a later first game.
    // Stale `late` response flags must not contradict the 21:00 attendance schedule.
    const note = from && chosen && from > chosen.slot_number ? ` (с ${from}-й игры)` : '';
    return `${index + 1}. ${String(item.nickname || 'Игрок')}${note}`;
  });

  const lines: string[] = ['🎭 Всем привет! Сегодня играем в мафию!', ''];
  if (chosen) lines.push(`🕘 Ждём всех к ${chosen.slot_number}-й игре — в ${time(chosen.starts_at)}`);
  if (evening.venue) lines.push(`📍 ${String(evening.venue)}`);
  const judge = await db.get<{ nickname: string }>(
    'SELECT p.nickname FROM evening_staff_assignments s JOIN players p ON p.id = s.judge_player_id WHERE s.evening_id = ? LIMIT 1',
    [eveningId],
  );
  if (judge?.nickname) lines.push(`🎙 Ведущий вечера: ${judge.nickname}`);
  const fullRoster = [...roster, ...guestLines.map((line, index) => `${roster.length + index + 1}. ${line}`)];
  lines.push('', `👥 Состав (${comingTotal}):`, ...(fullRoster.length ? fullRoster : ['Пока пусто — стань первым!']));
  if (slots.length) {
    lines.push('', `🎲 Игры: ${slots.map((slot: any) => slot.registered_count >= perSlot ? `${slot.slot_number}-я ✓` : `${slot.slot_number}-я ${slot.registered_count}/${perSlot}`).join(' · ')}`);
    const short = slots.find((slot: any) => slot.registered_count < perSlot && (!chosen || slot.slot_number >= chosen.slot_number));
    if (short) {
      const missing = perSlot - short.registered_count;
      lines.push(`🔥 На ${short.slot_number}-ю игру не хватает ${missing} ${russianPlural(missing, 'человека', 'человек', 'человек')} — присоединяйся, будет жарко!`);
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
  await importLegacyPublicationHolds(db);
  const row = await db.get<any>('SELECT * FROM evening_today_posts WHERE evening_id = ? LIMIT 1', [eveningId]);
  if (!row) return { evening_id: eveningId, state: 'pending' as const, decision_prompt_at: null, skipped_at: null };
  const legs = [row.telegram_status, row.vk_status];
  const state = legs.every((leg) => leg === 'published') ? 'published' as const : legs.some((leg) => leg === 'published') ? 'partial' as const : 'pending' as const;
  return { evening_id: eveningId, state, text: row.text, game_number: row.game_number, telegram_status: row.telegram_status, telegram_error: row.telegram_error, vk_status: row.vk_status, vk_error: row.vk_error, vk_url: row.vk_url, published_at: row.published_at, decision_prompt_at: row.decision_prompt_at || null, skipped_at: row.skipped_at || null };
}

async function telegramTarget(db: DatabaseWrapper, evening: any) {
  const format = normalizeEveningFormat(evening.format);
  const destination = await db.get<any>(
    'SELECT chat_id, topic_id FROM telegram_destinations WHERE id = ? LIMIT 1',
    [format === 'NOVICE' ? 'novice' : format === 'CASUAL' ? 'club' : 'rating'],
  ).catch(() => null);
  const cover = destination?.chat_id ? await announcementCoverUrl(db, getPublicAppBaseUrl(), String(evening.id), evening.format).catch(() => null) : null;
  return { destination, cover };
}

export async function sendTelegram(db: DatabaseWrapper, evening: any, text: string, fetchImpl: typeof fetch, context?: PublicationContext) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return { certainty: 'rejected' as const, status: 'failed', error: 'Telegram-бот не настроен' };
  const { destination, cover } = await telegramTarget(db, evening);
  if (!destination?.chat_id) return { certainty: 'rejected' as const, status: 'failed', error: 'Не настроена Telegram-группа для этого вечера' };
  const result = await sendPublicTelegram(db, { method:'sendMessage', fields: {
    chat_id:destination.chat_id, ...(destination.topic_id ? { message_thread_id:Number(destination.topic_id) } : {}), text,
    ...(cover ? { link_preview_options:{ url:cover, prefer_large_media:true, show_above_text:true } } : { disable_web_page_preview:true }),
  } }, fetchImpl, context);
  return { ...result, status: result.ok ? 'published' : result.certainty === 'uncertain' ? 'uncertain' : 'failed', error:result.error || null };
}

export async function sendVk(text: string, photo?: { db: DatabaseWrapper; eveningId: string; format: unknown; image?: { bytes: Buffer; mime: string }; context?: PublicationContext; noPhoto?: boolean; requireImage?: boolean }) {
  const groupId = getVkDestinations().find((destination) => destination.key === 'public' && destination.supported)?.groupId;
  if (!groupId) return { certainty: 'rejected' as const, status: 'failed', error: 'Группа ВК не настроена', url: null };
  try {
    // The club photo on the wall post, as in the evening announcement; without the photo the text post still goes out.
    let attachments: string[] | undefined;
    if (photo && !photo.noPhoto && canEditVkWallPosts()) {
      try {
        // A picture made for this post (the MVP cards) goes instead of the club photo.
        if (photo.image) attachments = [await uploadVkWallPhotoBytes(photo.image.bytes, photo.image.mime, groupId)];
        else {
          const photoId = await pickAnnouncementPhotoId(photo.db, photo.eveningId, photo.format);
          if (photoId) attachments = [await uploadAnnouncementPhotoToVk(photo.db, photoId, groupId)];
        }
      } catch (error) {
        if (photo.requireImage) {
          return { certainty: 'rejected' as const, temporary: true, status: 'failed' as const,
            error: `Не удалось прикрепить фото к публикации: ${error instanceof Error ? error.message : String(error)}`, url: null };
        }
        console.warn('[VK TODAY POST] Photo upload failed; the text post goes out:', error instanceof Error ? error.message : String(error));
      }
    }
    if (photo?.requireImage && (!photo.image || !attachments?.length)) {
      return { certainty: 'rejected' as const, temporary: true, status: 'failed' as const,
        error: 'Публикация требует карточку MVP с аватаркой; пост без изображения не отправлен', url: null };
    }
    const send = async (payload: { groupId:string; message:string; attachments?:string[] }): Promise<PublicationResult> => {
      try { const post = await createVkWallPost(payload); return {ok:true,certainty:'accepted',ids:[String(post.postId)],url:post.externalUrl}; }
      catch(error:any) { return {ok:false,certainty:error?.vkDefinite === true ? 'rejected' : 'uncertain',temporary:error?.vkDefinite === true,error:error?.message || 'ВК недоступен'}; }
    };
    const payload = { groupId, message:text, attachments };
    const result = photo?.context ? await deliverPublication(photo.db,photo.context,'vk',groupId,payload,send) : await send(payload);
    return {...result,status:result.ok ? 'published' : result.certainty === 'uncertain' ? 'uncertain' : 'failed',error:result.error || null,url:result.url || null};
  } catch (error: any) {
    return { certainty: 'uncertain' as const, temporary:false, status: 'uncertain', error: `${error?.message || 'ВК недоступен'} — если пост всё же появился на стене, повторять не нужно`, url: null };
  }
}

export async function publishTodayPost(db: DatabaseWrapper, eveningId: string, input: { text?: unknown; game_number?: unknown }, fetchImpl: typeof fetch = fetch) {
  await ensureEveningTodayPostSchema(db);
  await importLegacyPublicationHolds(db);
  const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
  if (!isOpenEvening(evening)) {
    throw Object.assign(new Error('Пост «Сегодня играем» можно выложить только для открытого вечера'), { statusCode: 409 });
  }
  const now = new Date().toISOString();
  await db.run('INSERT OR IGNORE INTO evening_today_posts (evening_id, created_at, updated_at) VALUES (?, ?, ?)', [eveningId, now, now]);
  const existing = await db.get<any>('SELECT * FROM evening_today_posts WHERE evening_id = ?', [eveningId]);
  const draft = await buildTodayPostDraft(db, eveningId, input.game_number);
  const proposed = String(input.text || '').trim().slice(0,3500) || String(existing?.text || '') || draft.text;
  // Freeze the payload before either channel starts; a second request reads the winning text.
  await db.run('UPDATE evening_today_posts SET text=COALESCE(text,?),auto_text=COALESCE(auto_text,?),game_number=COALESCE(game_number,?),updated_at=? WHERE evening_id=?', [proposed,draft.text,Number(input.game_number)||draft.game_number||null,now,eveningId]);
  const row = await db.get<any>('SELECT * FROM evening_today_posts WHERE evening_id=?',[eveningId]);
  await Promise.all((['telegram','vk'] as const).map(async channel => {
    if (row[channel+'_status'] === 'published') return;
    const context = {key:`today:${eveningId}:${channel}`,entityId:eveningId,kind:'today'};
    const result = channel === 'telegram' ? await sendTelegram(db,evening,row.text,fetchImpl,context) : await sendVk(row.text,{db,eveningId,format:evening.format,context});
    if ('inFlight' in result && result.inFlight) return;
    await db.run(`UPDATE evening_today_posts SET ${channel}_status=?,${channel}_error=?,${channel === 'vk' ? 'vk_url=?,' : ''}
      published_at=COALESCE(published_at,?),updated_at=? WHERE evening_id=?`, [result.status,result.error,...(channel === 'vk' ? [(result as any).url || null] : []),result.status === 'published' ? new Date().toISOString() : null,new Date().toISOString(),eveningId]);
  }));
  // Publishing confirms the evening. Preserve early seat reservations and fill remaining seats once.
  // Do not create a plan when both channels have definitely failed.
  const publication = await loadTodayPost(db, eveningId);
  if (publication.state === 'published' || publication.state === 'partial') {
    await generateEveningSeatingPlan(db, eveningId);
    await queueEveningSeatingNotifications(db, eveningId);
    await queueEveningSeatingJudgeSummary(db, eveningId);
  }
  return publication;
}

const REFRESH_MIN_GAP_MS = 2 * 60_000;
const publishedMessageId = async (db: DatabaseWrapper, eveningId: string, channel: 'telegram') => {
  const delivery = await db.get<any>('SELECT result FROM publication_deliveries WHERE delivery_key = ? AND status = ?', [`today:${eveningId}:${channel}`, 'accepted']).catch(() => null);
  try { return String(JSON.parse(delivery?.result || '{}').ids?.[0] || '') || null; } catch { return null; }
};

/**
 * Players who sign up after «Сегодня играем» went out (owner, 2026-11-03) must appear in it: the published
 * Telegram message is edited to the current roster (Telegram only, owner 2026-11-03: VK is not touched). A post the organizer edited by hand is left alone.
 * Returns the number of posts whose text changed.
 */
export async function refreshPublishedTodayPosts(db: DatabaseWrapper, now = Date.now(), fetchImpl: typeof fetch = fetch) {
  if (isEveningPublishingPaused()) return 0;
  await ensureEveningTodayPostSchema(db);
  const rows = await db.all<any>(
    `SELECT p.* FROM evening_today_posts p JOIN game_evenings e ON e.id = p.evening_id
      WHERE p.telegram_status = 'published' AND p.auto_text IS NOT NULL AND p.text = p.auto_text
        AND e.status = 'published' AND e.settled_at IS NULL AND datetime(e.starts_at) > datetime(?) AND p.updated_at <= ?`,
    [new Date(now - 6 * 3_600_000).toISOString(), new Date(now - REFRESH_MIN_GAP_MS).toISOString()],
  );
  let changed = 0;
  for (const row of rows) {
    const eveningId = String(row.evening_id);
    try {
      const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
      if (!evening || !isOpenEvening(evening)) continue;
      const draft = await buildTodayPostDraft(db, eveningId, row.game_number);
      if (draft.text === row.text) continue;
      let failed = false;
      if (row.telegram_status === 'published') {
        const messageId = await publishedMessageId(db, eveningId, 'telegram');
        const { destination, cover } = await telegramTarget(db, evening);
        const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
        if (messageId && destination?.chat_id && token) {
          const response = await fetchImpl(`https://api.telegram.org/bot${token}/editMessageText`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: destination.chat_id, message_id: Number(messageId), text: draft.text,
              ...(cover ? { link_preview_options: { url: cover, prefer_large_media: true, show_above_text: true } } : { disable_web_page_preview: true }) }) }).catch(() => null);
          const body: any = response ? await response.json().catch(() => null) : null;
          if (!response?.ok && !String(body?.description || '').includes('message is not modified')) { failed = true; console.error('[TODAY POST] Telegram edit failed:', body?.description || response?.status); }
        }
      }
      const stamp = new Date(now).toISOString();
      // On a failed edit only the retry clock moves, so the next scan (after the gap) tries the same roster again.
      if (failed) await db.run('UPDATE evening_today_posts SET updated_at = ? WHERE evening_id = ?', [stamp, eveningId]);
      else { await db.run('UPDATE evening_today_posts SET text = ?, auto_text = ?, updated_at = ? WHERE evening_id = ?', [draft.text, draft.text, stamp, eveningId]); changed += 1; }
    } catch (error) {
      console.error('[TODAY POST] refresh failed:', error);
    }
  }
  return changed;
}

/** The organizer decided not to publish today (the evening may still be cancelled separately). */
export async function skipTodayPost(db: DatabaseWrapper, eveningId: string) {
  await ensureEveningTodayPostSchema(db);
  await importLegacyPublicationHolds(db);
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
  await importLegacyPublicationHolds(db);
  const refreshed = await refreshPublishedTodayPosts(db, now, fetchImpl);
  const clock = moscowParts(now);
  if (clock.hour < TODAY_POST_HOUR_MSK) return refreshed;
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
    // Anything already sent or skipped is the organizer's decision.
    if (evening.telegram_status || evening.vk_status || evening.skipped_at) continue;
    const id = String(evening.id);
    const plan = await loadEveningSlotPlan(db, id).catch(() => null);
    if (!plan?.slots.length) continue;
    // No game has a full table and the evening is under its player minimum: cancel by itself (owner, 2026-10-02).
    if (plan.event.assembled_slots === 0 && (await loadEveningShortfall(db, id))?.short) {
      try {
        const { cancelEveningByOrganizer } = await import('./eveningCancelService.ts');
        await cancelEveningByOrganizer(db, id, { reason: 'shortfall' }, fetchImpl);
        actions += 1;
      } catch (error) {
        console.error('[TODAY POST] automatic cancellation failed:', error);
      }
      continue;
    }
    // A decision already asked for is not asked twice.
    if (evening.decision_prompt_at) continue;
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
      text: `🤔 «${escapeTelegramHtml(String(evening.title || 'Игровой вечер'))}»: набрано ${plan.event.assembled_slots} из ${plan.event.required_slots} нужных игр. Играем сегодня? Пост «Сегодня играем» сам не ушёл — опубликуй его или реши, что не публикуем: кабинет организатора → вечер → «Сбор».`,
    });
    actions += 1;
  }
  return actions + refreshed;
}
