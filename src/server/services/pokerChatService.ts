import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePokerChatSchema } from '../../db/ensurePokerChatSchema.ts';
import { pokerEmoteById } from '../../shared/pokerEmotes.ts';

export class PokerChatError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const POKER_CHAT_TEXT_MAX = 140;
/** One message per person every 1.5 seconds: a table must not turn into a flood. */
export const POKER_CHAT_MIN_GAP_MS = 1500;
const KEEP_PER_TABLE = 100;
const KEEP_MS = 24 * 60 * 60 * 1000;
const RECENT = 40;

export type PokerChatMessage = { id: number; player_id: string; nickname: string; kind: 'text' | 'emote'; body: string; age_ms: number };

/** Plain text only: no links (a table is not a place to advertise), no control characters, one line. */
// Links are found word by word with simple, non-nested patterns (a long hostile string cannot make them slow).
const LINK_SCHEME = /^[("']?(?:https?|tg|ftp):\/\//i;
const LINK_HOST = /^[("']?(?:www\.|t\.me\/|telegram\.me\/|vk\.com\/|wa\.me\/)/i;
const LINK_HANDLE = /^[("']?@\w{4,}/;
const LINK_DOMAIN = /\.(?:com|ru|net|org|me|io|ly|su|рф|info|biz|xyz|site|online|app|dev|gg|tv|cc|co|by|ua|kz|pro|club|shop|store|link)(?:[/?#:!,.)'"]|$)/iu;
const isLinkWord = (word: string) => LINK_SCHEME.test(word) || LINK_HOST.test(word) || LINK_HANDLE.test(word) || LINK_DOMAIN.test(word);
export const cleanPokerChatText = (value: unknown): string =>
  [...String(value ?? '').slice(0, 1000)].map((char) => (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char)).join('')
    .split(/\s+/).filter(Boolean).map((word) => (isLinkWord(word) ? '…' : word)).join(' ').slice(0, POKER_CHAT_TEXT_MAX);

export async function postPokerChat(
  db: DatabaseWrapper,
  input: { lobbyId: string; playerId: string; nickname: string; text?: unknown; emote?: unknown },
  nowMs = Date.now(),
) {
  await ensurePokerChatSchema(db);
  let kind: 'text' | 'emote';
  let body: string;
  if (input.emote !== undefined && input.emote !== null && input.emote !== '') {
    const emote = pokerEmoteById(input.emote);
    if (!emote) throw new PokerChatError(400, 'Такой эмоции нет');
    kind = 'emote'; body = emote.id;
  } else {
    body = cleanPokerChatText(input.text);
    if (!body) throw new PokerChatError(400, 'Напишите сообщение');
    kind = 'text';
  }
  const last = await db.get<{ created_at: number }>('SELECT created_at FROM poker_table_chat WHERE player_id = ? ORDER BY id DESC LIMIT 1', [input.playerId]);
  if (last && nowMs - Number(last.created_at) < POKER_CHAT_MIN_GAP_MS) throw new PokerChatError(429, 'Слишком часто, секунду');
  await db.run('INSERT INTO poker_table_chat (lobby_id, player_id, nickname, kind, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [input.lobbyId, input.playerId, input.nickname.slice(0, 40), kind, body, nowMs]);
  await db.run('DELETE FROM poker_table_chat WHERE created_at < ?', [nowMs - KEEP_MS]);
  await db.run('DELETE FROM poker_table_chat WHERE lobby_id = ? AND id NOT IN (SELECT id FROM poker_table_chat WHERE lobby_id = ? ORDER BY id DESC LIMIT ?)', [input.lobbyId, input.lobbyId, KEEP_PER_TABLE]);
}

/** The newest messages of a table, oldest first, each with how old it is now (the client's clock may differ). */
export async function listPokerChat(db: DatabaseWrapper, lobbyId: string, nowMs = Date.now()): Promise<PokerChatMessage[]> {
  await ensurePokerChatSchema(db);
  const rows = await db.all<{ id: number; player_id: string; nickname: string; kind: 'text' | 'emote'; body: string; created_at: number }>(
    'SELECT id, player_id, nickname, kind, body, created_at FROM poker_table_chat WHERE lobby_id = ? AND created_at >= ? ORDER BY id DESC LIMIT ?', [lobbyId, nowMs - KEEP_MS, RECENT]);
  return rows.reverse().map((row) => ({ id: Number(row.id), player_id: row.player_id, nickname: row.nickname, kind: row.kind, body: row.body, age_ms: Math.max(0, nowMs - Number(row.created_at)) }));
}
