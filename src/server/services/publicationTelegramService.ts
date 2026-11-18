import type { DatabaseWrapper } from '../../db/index.ts';
import { publicTelegramResult } from './messageDeliveryCertainty.ts';
import { deliverPublication, type PublicationContext, type PublicationResult } from './publicationDeliveryService.ts';

type Request = { method: string; fields: Record<string, unknown>; photos?: { data: string; mime: string; name: string; field: string }[]; expectedMessages?: number };
/** Errors raised before a connection exists: the request cannot have reached Telegram. */
export const CONNECT_FAILURES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT']);
/** `fetch failed` hides the reason in `cause` (sometimes one level deeper). */
export const networkErrorCode = (error: any): string | null => {
  for (let current = error, depth = 0; current && depth < 4; current = current.cause, depth += 1) {
    if (typeof current.code === 'string' && current.code) return current.code;
  }
  return null;
};

export async function sendPublicTelegram(db: DatabaseWrapper, request: Request, fetchImpl: typeof fetch, context?: PublicationContext): Promise<PublicationResult> {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return { ok: false, certainty: 'rejected', temporary: true, error: 'Telegram-бот не настроен' };
  const send = async (stored: Request): Promise<PublicationResult> => {
    let started=false;
    try {
    let body: string | FormData;
    if (stored.photos?.length) {
      body = new FormData();
      for (const [key,value] of Object.entries(stored.fields)) if (value != null) body.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      for (const photo of stored.photos) body.set(photo.field, new Blob([new Uint8Array(Buffer.from(photo.data,'base64'))], { type: photo.mime }), photo.name);
    } else body = JSON.stringify(stored.fields);
      started=true;
      const response = await fetchImpl(`https://api.telegram.org/bot${token}/${stored.method}`, { method:'POST', ...(typeof body === 'string' ? { headers:{'Content-Type':'application/json'} } : {}), body });
      return publicTelegramResult(response.status, await response.json().catch(() => null), stored.expectedMessages || 1);
    } catch (error: any) {
      const code = networkErrorCode(error);
      // The connection to Telegram was never made (2026-11-18: the daily-word post at 10:00 hit a server restart):
      // nothing reached Telegram, so the post is retried by itself in 30 s instead of waiting for a manual check.
      if (started && code && CONNECT_FAILURES.has(code)) {
        console.warn(`[PUBLICATION] Telegram ${stored.method} not sent (${code}), will retry`);
        return { ok:false, certainty:'rejected', temporary:true, retryAfter:30, error:`Telegram недоступен (${code}), повтор` };
      }
      if (started) console.warn(`[PUBLICATION] Telegram ${stored.method} result unknown: ${error?.message || error}${code ? ` (${code})` : ''}`);
      return { ok:false, certainty:started?'uncertain':'rejected',temporary:false, error:`${error?.message || 'Telegram недоступен'}${code ? ` (${code})` : ''}` };
    }
  };
  return context ? deliverPublication(db, context, 'telegram', JSON.stringify({ chat_id: request.fields.chat_id, topic_id: request.fields.message_thread_id || null }), request, send) : send(request);
}
