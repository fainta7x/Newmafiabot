import type { DatabaseWrapper } from '../../db/index.ts';

/**
 * «Рассадка для игроков» picture sent by the server (owner, 2026-10-03). Inside the Telegram app the
 * browser's save/share menu often does not exist, so the organizer's phone cannot save the PNG; the bot
 * sends it instead: to the rating group, or to the organizer's own Telegram to save or forward anywhere.
 */
export const MAX_SEATING_IMAGE_BYTES = 1_400_000;
export type SeatingShareTarget = 'group' | 'me';

export class SeatingShareError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export function decodeSeatingImage(value: unknown): Buffer {
  const text = String(value || '').replace(/^data:image\/png;base64,/, '').trim();
  if (!text) throw new SeatingShareError('Нет картинки рассадки');
  const bytes = Buffer.from(text, 'base64');
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (!isPng) throw new SeatingShareError('Картинка рассадки должна быть PNG');
  if (bytes.length > MAX_SEATING_IMAGE_BYTES) throw new SeatingShareError('Картинка слишком большая', 413);
  return bytes;
}

async function postPhoto(chatId: string, topicId: string | null, photo: Buffer, caption: string, fetchImpl: typeof fetch) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) throw new SeatingShareError('Telegram-бот не настроен', 503);
  const form = new FormData();
  form.set('chat_id', chatId);
  if (topicId) form.set('message_thread_id', topicId);
  form.set('caption', caption);
  form.set('photo', new Blob([new Uint8Array(photo)], { type: 'image/png' }), 'seating.png');
  let response: Response;
  try {
    response = await fetchImpl(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: form });
  } catch {
    throw new SeatingShareError('Telegram недоступен, попробуйте ещё раз', 502);
  }
  const payload: any = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new SeatingShareError(String(payload?.description || `Telegram HTTP ${response.status}`), 502);
  }
}

export async function sendSeatingImage(db: DatabaseWrapper, input: {
  tournamentId: string;
  target: SeatingShareTarget;
  image: Buffer;
  actorPlayerId?: string | null;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl || fetch;
  const tournament = await db.get<any>('SELECT id, title FROM tournaments WHERE id = ? LIMIT 1', [input.tournamentId]);
  if (!tournament) throw new SeatingShareError('Турнир не найден', 404);
  const caption = `🏆 Рассадка турнира «${String(tournament.title || 'Турнир')}»: кто на каком месте в каждой игре.`.slice(0, 1020);

  if (input.target === 'group') {
    const destination = await db.get<any>("SELECT chat_id, topic_id, active FROM telegram_destinations WHERE id = 'rating' LIMIT 1").catch(() => null);
    if (!destination?.chat_id || Number(destination.active ?? 1) === 0) {
      throw new SeatingShareError('Не настроена Telegram-группа «Рейтинг» (Ещё → Telegram)', 409);
    }
    await postPhoto(String(destination.chat_id), destination.topic_id ? String(destination.topic_id) : null, input.image, caption, fetchImpl);
    return { target: 'group' as const };
  }

  // «Мне»: only the acting organizer's own Telegram. Never another organizer's chat: without a linked
  // Telegram (for example the password-only session) the request is refused.
  let chatId = '';
  if (input.actorPlayerId) {
    const player = await db.get<any>('SELECT telegram_user_id FROM players WHERE id = ? LIMIT 1', [input.actorPlayerId]).catch(() => null);
    chatId = /^-?\d+$/.test(String(player?.telegram_user_id || '')) ? String(player.telegram_user_id) : '';
  }
  if (!chatId) throw new SeatingShareError('Не найден ваш Telegram: войдите через Telegram или привяжите его в профиле', 409);
  await postPhoto(chatId, null, input.image, caption, fetchImpl);
  return { target: 'me' as const };
}
