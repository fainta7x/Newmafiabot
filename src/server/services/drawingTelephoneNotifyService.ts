import type { DatabaseWrapper } from '../../db/index.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { appUrl } from './gameResultCardService.ts';
import { claim, finish, sendPhotos, sendText } from './clubResultPostService.ts';
import { ensureClubResultPostSchema } from './clubResultPostService.ts';
import { isEveningPublishingPaused } from './eveningPublishingPause.ts';
import { markTelephonePublished, runTelephoneTimers, telephoneChainsToPublish, telephonePost, type TelephoneNotice } from './drawingTelephoneService.ts';

const NEWS_DESTINATION = 'club_mvp';

/** «Твой ход», «ход вернулся», «цепочка готова» — личным сообщением с кнопкой в игру. A failed queue never undoes a move. */
export async function deliverTelephoneNotices(db: DatabaseWrapper, notices: TelephoneNotice[]) {
  let queued = 0;
  for (const item of notices) {
    try {
      const path = `/player/telephone/${encodeURIComponent(item.chainId)}`;
      const link = appUrl(path);
      await queuePersonalNotification(db, {
        notificationKey: item.key, playerId: item.playerId, eventType: 'drawing_telephone', entityId: item.chainId, text: item.text, actionPath: path,
        telegramReplyMarkup: link ? { inline_keyboard: [[{ text: '🎨 Открыть', url: link }]] } : null,
      });
      queued += 1;
    } catch (error) { console.error('[TELEPHONE] notice failed:', error); }
  }
  return queued;
}

/** The minute scan: reminders and returns, then each finished chain once to «Новости» (owner: «Всем в приложении + пост в Новости»). */
export async function runDrawingTelephone(db: DatabaseWrapper, fetchImpl: typeof fetch = fetch, now = new Date()) {
  let done = await deliverTelephoneNotices(db, await runTelephoneTimers(db, now));
  if (isEveningPublishingPaused()) return done;
  await ensureClubResultPostSchema(db);
  for (const { id } of await telephoneChainsToPublish(db)) {
    const key = `telephone-chain:${id}`;
    if (!(await claim(db, key, 'telephone-chain', '', null))) { await markTelephonePublished(db, id); continue; }
    try {
      const { caption, photos } = await telephonePost(db, id);
      const link = appUrl(`/player/telephone/${encodeURIComponent(id)}`);
      const markup = link ? { inline_keyboard: [[{ text: '🎨 Смотреть цепочку', url: link }]] } : undefined;
      const result = photos.length
        ? await sendPhotos(db, null, photos, caption, fetchImpl, NEWS_DESTINATION, 'image/png', photos.length > 1 ? undefined : markup, { key: `club:${key}`, kind: 'club-result' })
        : await sendText(db, NEWS_DESTINATION, caption, fetchImpl, undefined, markup, { key: `club:${key}`, kind: 'club-result' });
      await finish(db, key, result);
      if (result.ok) { await markTelephonePublished(db, id); done += 1; }
    } catch (error: any) {
      await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    }
  }
  return done;
}
