import type { DatabaseWrapper } from '../../db/index.ts';
import { publicTelegramResult } from './messageDeliveryCertainty.ts';
import { deliverPublication, type PublicationContext, type PublicationResult } from './publicationDeliveryService.ts';

type Request = { method: string; fields: Record<string, unknown>; photos?: { data: string; mime: string; name: string; field: string }[]; expectedMessages?: number };
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
    } catch (error: any) { return { ok:false, certainty:started?'uncertain':'rejected',temporary:false, error:error?.message || 'Telegram недоступен' }; }
  };
  return context ? deliverPublication(db, context, 'telegram', JSON.stringify({ chat_id: request.fields.chat_id, topic_id: request.fields.message_thread_id || null }), request, send) : send(request);
}
