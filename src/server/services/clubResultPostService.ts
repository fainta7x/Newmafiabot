import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { isEveningPublishingPaused } from './eveningPublishingPause.ts';
import { loadEveningPlayerResults, loadEveningSummary, loadGameBlank, loadSeasonTable } from './clubResultData.ts';
import { appUrl, inviteFriendUrl } from './gameResultCardService.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { telegramBotUsername } from './playerClaimLinkService.ts';
import { eveningSummarySvg, gameBlankSvg, renderPng, seasonTableSvg } from './clubResultImages.ts';

/**
 * Club chat results (owner, 2026-10-01): after each completed game the bot posts the game blank,
 * and when the evening is closed it posts the evening summary. Both go to the evening's Telegram
 * group (the same place as «Мы собрались»). Each post goes out once.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 36 * 60 * 60 * 1000;
const CLOSED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ENABLED_KEY = 'enabled';

export async function ensureClubResultPostSchema(db: DatabaseWrapper) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS club_result_posts (
      post_key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      evening_id TEXT,
      game_id TEXT,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      sent_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

export const clubResultDestination = (format: unknown) => {
  const normalized = normalizeEveningFormat(format);
  return normalized === 'NOVICE' ? 'novice' : normalized === 'CASUAL' ? 'club' : 'rating';
};

/** One picture, or an album (the evening summary with the season table) in one message. */
async function sendPhotos(db: DatabaseWrapper, format: unknown, photos: Buffer[], caption: string, fetchImpl: typeof fetch) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return { ok: false, temporary: true, error: 'Telegram-бот не настроен' };
  const destination = await db.get<any>(
    'SELECT chat_id, topic_id, active FROM telegram_destinations WHERE id = ? LIMIT 1',
    [clubResultDestination(format)],
  ).catch(() => null);
  if (!destination?.chat_id || Number(destination.active ?? 1) === 0) return { ok: false, temporary: false, error: 'Не настроена Telegram-группа для этого вечера' };
  const form = new FormData();
  form.set('chat_id', String(destination.chat_id));
  if (destination.topic_id) form.set('message_thread_id', String(destination.topic_id));
  let method = 'sendPhoto';
  if (photos.length > 1) {
    method = 'sendMediaGroup';
    form.set('media', JSON.stringify(photos.map((_, index) => ({ type: 'photo', media: `attach://p${index}`, ...(index === 0 ? { caption } : {}) }))));
    photos.forEach((photo, index) => form.set(`p${index}`, new Blob([new Uint8Array(photo)], { type: 'image/png' }), `result-${index}.png`));
  } else {
    form.set('caption', caption);
    form.set('photo', new Blob([new Uint8Array(photos[0])], { type: 'image/png' }), 'result.png');
  }
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', body: form });
    const payload: any = await response.json().catch(() => null);
    if (response.ok && payload?.ok !== false) return { ok: true };
    const temporary = response.status === 429 || response.status >= 500;
    return { ok: false, temporary, error: String(payload?.description || `Telegram HTTP ${response.status}`) };
  } catch (error: any) {
    return { ok: false, temporary: true, error: error?.message || 'Telegram недоступен' };
  }
}

/** Claims the post before sending, so two scans or a lost reply cannot post it twice. */
async function claim(db: DatabaseWrapper, key: string, kind: string, eveningId: string, gameId: string | null) {
  const now = new Date().toISOString();
  await db.run(
    `INSERT OR IGNORE INTO club_result_posts (post_key, kind, evening_id, game_id, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)`,
    [key, kind, eveningId, gameId, now, now],
  );
  const claimed = await db.run(
    `UPDATE club_result_posts SET status = 'sending', attempts = attempts + 1, updated_at = ?
      WHERE post_key = ? AND status IN ('pending', 'retry') AND attempts < ?`,
    [now, key, MAX_ATTEMPTS],
  );
  return Number(claimed.changes || 0) > 0;
}

async function finish(db: DatabaseWrapper, key: string, result: { ok: boolean; temporary?: boolean; error?: string }) {
  const now = new Date().toISOString();
  await db.run(
    `UPDATE club_result_posts SET status = ?, last_error = ?, sent_at = ?, updated_at = ? WHERE post_key = ?`,
    [result.ok ? 'sent' : result.temporary ? 'retry' : 'failed', result.ok ? null : String(result.error || '').slice(0, 500), result.ok ? now : null, now, key],
  );
}

export async function postGameBlank(db: DatabaseWrapper, gameId: string, format: unknown, eveningId: string, fetchImpl: typeof fetch = fetch) {
  const key = `game:${gameId}`;
  if (!(await claim(db, key, 'game', eveningId, gameId))) return false;
  try {
    const blank = await loadGameBlank(db, gameId);
    if (!blank) { await finish(db, key, { ok: false, temporary: false, error: 'Игра не завершена' }); return false; }
    const winner = blank.winnerTeam === 'red' ? 'победа красных' : blank.winnerTeam === 'black' ? 'победа чёрных' : 'игра завершена';
    const result = await sendPhotos(db, format, [renderPng(gameBlankSvg(blank))], `🎭 Игра №${blank.gameNumber} · ${winner}`, fetchImpl);
    await finish(db, key, result);
    return result.ok;
  } catch (error: any) {
    await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    return false;
  }
}

export async function postEveningSummary(db: DatabaseWrapper, eveningId: string, format: unknown, fetchImpl: typeof fetch = fetch) {
  const key = `evening:${eveningId}`;
  if (!(await claim(db, key, 'evening', eveningId, null))) return false;
  try {
    const summary = await loadEveningSummary(db, eveningId);
    if (!summary) { await finish(db, key, { ok: false, temporary: false, error: 'В вечере нет сыгранных игр' }); return false; }
    // The season so far rides as the second picture of the same message (owner: less spam).
    const season = await loadSeasonTable(db, eveningId).catch((error) => { console.error('[CLUB RESULTS] season table failed:', error); return null; });
    const photos = [renderPng(eveningSummarySvg(summary)), ...(season ? [renderPng(seasonTableSvg(season))] : [])];
    const caption = `🏁 Итоги вечера «${summary.eveningTitle}»${season ? ` и промежуточная таблица «${season.periodTitle}»` : ''}`;
    const result = await sendPhotos(db, format, photos, caption, fetchImpl);
    await finish(db, key, result);
    return result.ok;
  } catch (error: any) {
    await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    return false;
  }
}

/**
 * The worker's scan: completed games of recent in-app evenings, then closed evenings. Only evenings
 * that started after this feature was switched on are posted, so old games never flood the chat.
 * Tournaments run through their own tables and their own result export, not this scan.
 */
export async function runClubResultPosts(db: DatabaseWrapper, fetchImpl: typeof fetch = fetch, now = Date.now()) {
  if (isEveningPublishingPaused()) return 0;
  await ensureClubResultPostSchema(db);
  const stamp = new Date(now).toISOString();
  await db.run(
    `INSERT OR IGNORE INTO club_result_posts (post_key, kind, status, created_at, updated_at) VALUES (?, 'marker', 'sent', ?, ?)`,
    [ENABLED_KEY, stamp, stamp],
  );
  const marker = await db.get<any>('SELECT created_at FROM club_result_posts WHERE post_key = ?', [ENABLED_KEY]);
  // Strictly after the switch-on: an evening already running at deploy time is not posted retroactively.
  const since = Math.max(now - WINDOW_MS, new Date(String(marker?.created_at || stamp)).getTime());
  const evenings = await db.all<any>(`
    SELECT id, format, status FROM game_evenings
     WHERE datetime(starts_at) >= datetime(?) AND datetime(starts_at) <= datetime(?)
       AND status IN ('active', 'completed')
  `, [new Date(since).toISOString(), stamp]);

  let posted = 0;
  for (const evening of evenings) {
    const games = await db.all<any>(`
      SELECT g.id, g.protocol_text FROM games g
       WHERE g.evening_id = ? AND g.archived_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM club_result_posts p WHERE p.post_key = 'game:' || g.id AND p.status IN ('sent', 'failed', 'sending'))
       ORDER BY g.global_game_number, g.id
    `, [evening.id]);
    for (const game of games) {
      let envelope: any = null;
      try { envelope = JSON.parse(String(game.protocol_text || '')); } catch { envelope = null; }
      if (envelope?.kind !== 'club_evening_protocol' || envelope?.protocol?.status !== 'completed') continue;
      if (await postGameBlank(db, String(game.id), evening.format, String(evening.id), fetchImpl)) posted += 1;
    }
  }

  // Closed evenings by their closing time, not their start: an evening closed days later (or after a
  // long publishing pause) still gets its summary and the personal messages.
  const closed = await db.all<any>(`
    SELECT e.id, e.format FROM game_evenings e
     WHERE e.status = 'completed'
       AND datetime(e.starts_at) >= datetime(?)
       AND datetime(COALESCE(e.settled_at, e.updated_at)) >= datetime(?)
       AND (NOT EXISTS (SELECT 1 FROM club_result_posts p WHERE p.post_key = 'cards:' || e.id AND p.status = 'sent')
         OR NOT EXISTS (SELECT 1 FROM club_result_posts p WHERE p.post_key = 'evening:' || e.id AND p.status IN ('sent', 'failed', 'sending')))
  `, [String(marker?.created_at || stamp), new Date(now - CLOSED_WINDOW_MS).toISOString()]);
  for (const evening of closed) {
    if (await postEveningSummary(db, String(evening.id), evening.format, fetchImpl)) posted += 1;
    await queueEveningPlayerCards(db, String(evening.id)).catch((error) => console.error('[CLUB RESULTS] personal cards failed:', error));
  }
  return posted;
}

const ROLE_LABELS: Record<string, string> = { citizen: 'Мирный', sheriff: 'Шериф', mafia: 'Мафия', don: 'Дон' };
const plural = (count: number, one: string, few: string, many: string) => {
  const tens = count % 100; const ones = count % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (ones === 1) return one;
  if (ones >= 2 && ones <= 4) return few;
  return many;
};
const comma = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${String(Math.abs(rounded)).replace('.', ',')}`;
};

/**
 * One personal message per evening (owner, 2026-10-01) instead of one after each game: the
 * player's games with role and result, points on rating evenings, the evening's Elo change,
 * and buttons for their games and «Позвать друга». Sent once per player and evening.
 */
export async function queueEveningPlayerCards(db: DatabaseWrapper, eveningId: string) {
  await ensureClubResultPostSchema(db);
  const key = `cards:${eveningId}`;
  if (await db.get("SELECT 1 FROM club_result_posts WHERE post_key = ? AND status = 'sent'", [key])) return 0;
  const evening = await loadEveningPlayerResults(db, eveningId);
  if (!evening) return 0;
  const botUsername = await telegramBotUsername().catch(() => null);
  const gamesUrl = appUrl('/player/games');
  let queued = 0;
  for (const player of evening.players) {
    const lines = [`🏁 Твой вечер · ${evening.title}${evening.dateLabel ? `, ${evening.dateLabel}` : ''}`];
    lines.push(`Сыграно: ${player.games.length} ${plural(player.games.length, 'игра', 'игры', 'игр')} · ${player.wins} ${plural(player.wins, 'победа', 'победы', 'побед')}`);
    for (const game of player.games) {
      lines.push(`№${game.number} ${game.role ? ROLE_LABELS[game.role] || game.role : 'роль не указана'} — ${game.won ? 'победа' : 'поражение'}`);
    }
    if (evening.scored && player.points != null) {
      lines.push(`Баллы за вечер: ${comma(player.points)} · в среднем ${comma(player.points / player.games.length)}`);
    }
    if (player.eloDelta != null) lines.push(`Эло: ${comma(Math.round(player.eloDelta))} · теперь ${Math.round(player.eloAfter || 0)}`);
    const invite = await inviteFriendUrl(player.playerId, botUsername);
    const row = [
      ...(gamesUrl ? [{ text: '📋 Мои игры', web_app: { url: gamesUrl } }] : []),
      ...(invite ? [{ text: '🤝 Позвать друга', url: invite }] : []),
    ];
    const result = await queuePersonalNotification(db, {
      notificationKey: `evening-result:${eveningId}:${player.playerId}`,
      playerId: player.playerId,
      eventType: 'evening_result',
      entityId: eveningId,
      text: lines.join('\n'),
      actionPath: '/player/games',
      telegramReplyMarkup: row.length ? { inline_keyboard: [row] } : null,
    });
    if (result.created) queued += 1;
  }
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO club_result_posts (post_key, kind, evening_id, status, attempts, sent_at, created_at, updated_at)
     VALUES (?, 'cards', ?, 'sent', 1, ?, ?, ?) ON CONFLICT(post_key) DO UPDATE SET status = 'sent', sent_at = excluded.sent_at, updated_at = excluded.updated_at`,
    [key, eveningId, now, now, now],
  );
  return queued;
}
