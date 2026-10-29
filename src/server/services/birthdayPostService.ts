import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePlayerProfileIntegritySchema } from '../../db/ensurePlayerProfileIntegritySchema.ts';
import { birthdayCardSvg, renderPng } from './clubResultImages.ts';
import { loadAvatars } from './clubResultData.ts';
import { sendPhotos } from './clubResultPostService.ts';
import { sendVk } from './eveningTodayPostService.ts';
import { appUrl } from './gameResultCardService.ts';

export class BirthdayPostError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const moscow = (value: string, options: Intl.DateTimeFormatOptions) => new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', ...options });

/** The owner-approved wording (2026-10-29): a plain congratulation, then the invitation to the evening she is signed up for. */
export function birthdayPostText(input: { nickname: string; firstName?: string | null; day: number; month: number; eveningStartsAt: string | null; venue: string | null; link: string | null; genitive?: string | null; pronoun?: string | null }) {
  const when = input.eveningStartsAt ? `${moscow(input.eveningStartsAt, { weekday: 'long', day: 'numeric', month: 'long' })}, в ${moscow(input.eveningStartsAt, { hour: '2-digit', minute: '2-digit' })}` : null;
  // Use nominative first name throughout, avoiding unreliable automatic
  // Russian case inflection of names, nicknames and foreign names.
  const name = input.firstName?.trim() || input.nickname;
  const lines = [
    `🎂 ${input.day} ${MONTHS[input.month - 1]} — день рождения! ${name}, поздравляем!`,
    '',
    `${name}, желаем побольше счастливых моментов, тёплых встреч и ярких побед. Пусть задуманное сбывается! 🎉`,
  ];
  if (when) lines.push('', `Приходите отметить этот день вместе с нами: ${when}${input.venue ? ` («${input.venue}»)` : ''}.${input.link ? `\nЗапись на вечер: ${input.link}` : ''}`);
  return lines.join('\n');
}

type Wording = { genitive?: string | null; pronoun?: string | null };

async function loadContext(db: DatabaseWrapper, playerId: string, eveningId: string | null, wording: Wording = {}) {
  await ensurePlayerProfileIntegritySchema(db);
  const columns = new Set((await db.all<{ name: string }>('PRAGMA table_info(players)')).map(row => row.name));
  const firstNameColumn = ['first_name', 'full_name', 'real_name', 'name', 'given_name'].find(col => columns.has(col));
  const player = await db.get<any>(`SELECT id, nickname, birth_day, birth_month, birthday_visibility${firstNameColumn ? `, "${firstNameColumn}" AS profile_first_name` : ''} FROM players WHERE id = ?`, [playerId]);
  if (!player) throw new BirthdayPostError('Игрок не найден', 404);
  if (!player.birth_day || !player.birth_month) throw new BirthdayPostError('У игрока не указана дата рождения', 409);
  if (player.birthday_visibility === 'hidden' || player.birthday_visibility === 'private') throw new BirthdayPostError('Игрок скрыл дату рождения — публиковать нельзя', 409);
  let evening: any = null;
  if (eveningId) {
    evening = await db.get<any>(
      `SELECT e.id, e.starts_at, e.venue FROM game_evenings e JOIN evening_participants ep ON ep.evening_id = e.id
        WHERE e.id = ? AND ep.player_id = ? AND ep.registration_status <> 'declined' AND e.status <> 'cancelled'`, [eveningId, playerId]);
    if (!evening) throw new BirthdayPostError('Игрок не записан на этот вечер', 409);
  }
  if (!evening && !eveningId) {
    // Prepare the next real evening the birthday player is attending, rather
    // than requiring the organizer to guess or manually copy an event URL.
    evening = await db.get<any>(
      `SELECT e.id, e.starts_at, e.venue FROM game_evenings e
       JOIN evening_participants ep ON ep.evening_id=e.id
       WHERE ep.player_id=? AND ep.registration_status <> 'declined'
         AND e.status <> 'cancelled' AND datetime(e.starts_at)>=datetime('now')
       ORDER BY e.starts_at ASC LIMIT 1`, [playerId],
    );
  }
  const link = evening ? appUrl(`/player/events/${encodeURIComponent(String(evening.id))}`) : null;
  const text = birthdayPostText({ nickname: String(player.nickname), firstName: String(player.profile_first_name || '').trim().split(/\s+/)[0] || null, day: Number(player.birth_day), month: Number(player.birth_month), eveningStartsAt: evening?.starts_at ?? null, venue: evening?.venue ?? null, link, ...wording });
  const avatar = (await loadAvatars(db, [playerId])).get(playerId) || null;
  const card = renderPng(birthdayCardSvg({ nickname: String(player.nickname), avatar, dateLabel: `${player.birth_day} ${MONTHS[Number(player.birth_month) - 1]}` }));
  return { player, evening, text, card, hasAvatar: Boolean(avatar) };
}

export async function previewBirthdayPost(db: DatabaseWrapper, playerId: string, eveningId: string | null, wording: Wording = {}) {
  const { text, card, hasAvatar, evening } = await loadContext(db, playerId, eveningId, wording);
  return { text, has_avatar: hasAvatar, card_png_base64: card.toString('base64'), evening_id: evening?.id || null };
}

/** Publishes the approved post to the entry Telegram channel and the VK community. Deliveries are keyed per player and year, so a repeat never double-posts. */
export async function publishBirthdayPost(db: DatabaseWrapper, playerId: string, eveningId: string | null, wording: Wording = {}, fetchImpl: typeof fetch = fetch, editedText?: string | null) {
  const { text: generatedText, card, player, evening } = await loadContext(db, playerId, eveningId, wording);
  if (editedText !== undefined && (typeof editedText !== 'string' || !editedText.trim() || editedText.length > 1024)) throw new BirthdayPostError('Текст должен содержать от 1 до 1024 символов');
  const text = editedText?.trim() || generatedText;
  const year = moscow(new Date().toISOString(), { year: 'numeric' });
  const key = `birthday:${playerId}:${year}`;
  // Owner 2026-10-29: «публиковать во всех пабликах и группах» — every active Telegram destination (entry channel, novice group, club group, rating channel).
  const destinations = await db.all<{ id: string }>("SELECT id FROM telegram_destinations WHERE active = 1 AND COALESCE(chat_id, '') <> '' ORDER BY id");
  const telegram: Array<{ destination: string; ok: boolean; error: string | null }> = [];
  for (const destination of destinations) {
    const result = await sendPhotos(db, null, [card], text, fetchImpl, destination.id, 'image/png', undefined, { key: `${key}:telegram:${destination.id}`, entityId: playerId, kind: 'birthday' });
    telegram.push({ destination: destination.id, ok: result.ok, error: result.error || null });
  }
  const vk = await sendVk(text, { db, eveningId: String(evening?.id || ''), format: null, image: { bytes: card, mime: 'image/png' }, context: { key: `${key}:vk`, entityId: playerId, kind: 'birthday' } });
  return { nickname: String(player.nickname), telegram, vk: { ok: Boolean(vk.status === 'published'), status: vk.status, error: vk.error || null } };
}
