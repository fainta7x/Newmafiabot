import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { isEveningPublishingPaused } from './eveningPublishingPause.ts';
import { loadEveningPlayerResults, loadEveningSummary, loadGameBlank, loadSeasonTable, loadSeasonTableForPeriod, loadTournamentAnnouncement, loadTournamentGameBlank } from './clubResultData.ts';
import { queueTournamentGameSeatMessages, runTournamentFirstSeatMessages } from './tournamentSeatNotificationService.ts';
import { appUrl, inviteFriendUrl } from './gameResultCardService.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { telegramBotUsername } from './playerClaimLinkService.ts';
import { eveningSummarySvg, gameBlankSvg, renderPng, seasonTableSvg, tournamentAnnounceSvg } from './clubResultImages.ts';

/**
 * Club chat results (owner, 2026-10-01): after each completed game the bot posts the game blank,
 * and when the evening is closed it posts the evening summary. Both go to the evening's Telegram
 * group (the same place as «Мы собрались»). Each post goes out once.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 36 * 60 * 60 * 1000;
const CLOSED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ENABLED_KEY = 'enabled';
const PUBLIC_ENABLED_KEY = 'enabled-public';

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
async function sendPhotos(db: DatabaseWrapper, format: unknown, photos: Buffer[], caption: string, fetchImpl: typeof fetch, destinationId = clubResultDestination(format), mime = 'image/png') {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return { ok: false, temporary: true, error: 'Telegram-бот не настроен' };
  const destination = await db.get<any>(
    'SELECT chat_id, topic_id, active FROM telegram_destinations WHERE id = ? LIMIT 1',
    [destinationId],
  ).catch(() => null);
  if (!destination?.chat_id || Number(destination.active ?? 1) === 0) {
    return { ok: false, temporary: false, error: destinationId === 'public' ? 'Не настроен входной Telegram-канал' : 'Не настроена Telegram-группа для этого вечера' };
  }
  const form = new FormData();
  form.set('chat_id', String(destination.chat_id));
  if (destination.topic_id) form.set('message_thread_id', String(destination.topic_id));
  let method = 'sendPhoto';
  if (photos.length > 1) {
    method = 'sendMediaGroup';
    form.set('media', JSON.stringify(photos.map((_, index) => ({ type: 'photo', media: `attach://p${index}`, ...(index === 0 ? { caption } : {}) }))));
    photos.forEach((photo, index) => form.set(`p${index}`, new Blob([new Uint8Array(photo)], { type: mime }), `result-${index}.png`));
  } else {
    form.set('caption', caption);
    form.set('photo', new Blob([new Uint8Array(photos[0])], { type: mime }), mime === 'image/png' ? 'result.png' : 'photo.jpg');
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
  // The entry channel has its own switch-on: an upgrade from the chat-only release must not post
  // the evenings closed before it (they never had entry-channel records).
  await db.run(
    `INSERT OR IGNORE INTO club_result_posts (post_key, kind, status, created_at, updated_at) VALUES (?, 'marker', 'sent', ?, ?)`,
    [PUBLIC_ENABLED_KEY, stamp, stamp],
  );
  const publicMarker = await db.get<any>('SELECT created_at FROM club_result_posts WHERE post_key = ?', [PUBLIC_ENABLED_KEY]);
  const publicSince = String(publicMarker?.created_at || stamp);
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
    SELECT e.id, e.format, e.starts_at FROM game_evenings e
     WHERE e.status = 'completed'
       AND datetime(e.starts_at) >= datetime(?)
       AND datetime(COALESCE(e.settled_at, e.updated_at)) >= datetime(?)
       AND (NOT EXISTS (SELECT 1 FROM club_result_posts p WHERE p.post_key = 'cards:' || e.id AND p.status = 'sent')
         OR NOT EXISTS (SELECT 1 FROM club_result_posts p WHERE p.post_key = 'evening:' || e.id AND p.status IN ('sent', 'failed', 'sending'))
         OR (datetime(e.starts_at) >= datetime(?)
           AND NOT EXISTS (SELECT 1 FROM club_result_posts p WHERE p.post_key = 'public-evening:' || e.id AND p.status IN ('sent', 'failed', 'sending'))))
  `, [String(marker?.created_at || stamp), new Date(now - CLOSED_WINDOW_MS).toISOString(), publicSince]);
  for (const evening of closed) {
    if (await postEveningSummary(db, String(evening.id), evening.format, fetchImpl)) posted += 1;
    if (new Date(String(evening.starts_at)).getTime() >= new Date(publicSince).getTime()
      && await postPublicEveningSummary(db, String(evening.id), fetchImpl)) posted += 1;
    await queueEveningPlayerCards(db, String(evening.id)).catch((error) => console.error('[CLUB RESULTS] personal cards failed:', error));
  }

  // The entry channel (owner, 2026-10-01): «Мы собрались» photos and a weekly season table.
  const gathered = await db.all<any>(`
    SELECT gp.evening_id FROM evening_gathered_posts gp JOIN game_evenings e ON e.id = gp.evening_id
     WHERE gp.telegram_status = 'published' AND gp.image_data IS NOT NULL
       AND datetime(e.starts_at) >= datetime(?) AND datetime(e.starts_at) >= datetime(?)
       AND NOT EXISTS (SELECT 1 FROM club_result_posts p WHERE p.post_key = 'public-gathered:' || gp.evening_id AND p.status IN ('sent', 'failed', 'sending'))
  `, [publicSince, new Date(now - CLOSED_WINDOW_MS).toISOString()]).catch(() => []);
  for (const row of gathered) {
    if (await postPublicGathered(db, String(row.evening_id), fetchImpl)) posted += 1;
  }
  if (await postWeeklySeasonTables(db, fetchImpl, now)) posted += 1;
  posted += await runTournamentAnnouncements(db, fetchImpl, now);
  posted += await runTournamentGameFollowUps(db, fetchImpl, now, String(marker?.created_at || stamp));
  return posted;
}

const botLink = async () => {
  const bot = await telegramBotUsername().catch(() => null);
  return bot ? `\n\nХочешь сыграть с нами? Пиши боту: https://t.me/${bot}` : '';
};

/** The evening summary picture in the entry channel, for evenings of every format. */
export async function postPublicEveningSummary(db: DatabaseWrapper, eveningId: string, fetchImpl: typeof fetch = fetch) {
  const key = `public-evening:${eveningId}`;
  if (!(await claim(db, key, 'public-evening', eveningId, null))) return false;
  try {
    const summary = await loadEveningSummary(db, eveningId);
    if (!summary) { await finish(db, key, { ok: false, temporary: false, error: 'В вечере нет сыгранных игр' }); return false; }
    const caption = `🏁 Итоги вечера «${summary.eveningTitle}»${summary.dateLabel ? `, ${summary.dateLabel}` : ''}${await botLink()}`;
    const result = await sendPhotos(db, null, [renderPng(eveningSummarySvg(summary))], caption, fetchImpl, 'public');
    await finish(db, key, result);
    return result.ok;
  } catch (error: any) {
    await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    return false;
  }
}

/** The «Мы собрались» photo, once it reached the evening's group, also goes to the entry channel. */
export async function postPublicGathered(db: DatabaseWrapper, eveningId: string, fetchImpl: typeof fetch = fetch) {
  const key = `public-gathered:${eveningId}`;
  if (!(await claim(db, key, 'public-gathered', eveningId, null))) return false;
  try {
    const row = await db.get<any>(`
      SELECT gp.image_data, gp.mime_type, gp.caption, e.title FROM evening_gathered_posts gp JOIN game_evenings e ON e.id = gp.evening_id
       WHERE gp.evening_id = ? LIMIT 1`, [eveningId]);
    if (!row?.image_data) { await finish(db, key, { ok: false, temporary: false, error: 'Нет фото' }); return false; }
    const caption = `${String(row.caption || `📸 Мы собрались! ${String(row.title || 'Игровой вечер')} начинается.`)}${await botLink()}`;
    const result = await sendPhotos(db, null, [Buffer.from(String(row.image_data), 'base64')], caption, fetchImpl, 'public', String(row.mime_type || 'image/jpeg'));
    await finish(db, key, result);
    return result.ok;
  } catch (error: any) {
    await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    return false;
  }
}

const moscowParts = (now: number) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short' })
    .formatToParts(new Date(now));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24, weekday: get('weekday') };
};

/**
 * Once a week (Monday, 12:00–21:00 Moscow) the tables of the running seasons go to the entry
 * channel in one message. Seasons without games are skipped.
 */
export async function postWeeklySeasonTables(db: DatabaseWrapper, fetchImpl: typeof fetch = fetch, now = Date.now()) {
  const moscow = moscowParts(now);
  if (moscow.weekday !== 'Mon' || moscow.hour < 12 || moscow.hour >= 21) return false;
  const key = `public-season:${moscow.date}`;
  if (await db.get("SELECT 1 FROM club_result_posts WHERE post_key = ? AND status IN ('sent', 'failed', 'sending')", [key])) return false;
  const stamp = new Date(now).toISOString();
  const periods = await db.all<any>(`
    SELECT * FROM rating_periods
     WHERE status = 'active' AND datetime(starts_at) <= datetime(?) AND datetime(ends_at) >= datetime(?)
     ORDER BY CASE UPPER(type) WHEN 'RATING' THEN 0 WHEN 'CASUAL' THEN 1 ELSE 2 END, starts_at DESC
  `, [stamp, stamp]).catch(() => []);
  const tables = [];
  for (const period of periods) {
    const table = await loadSeasonTableForPeriod(db, period).catch(() => null);
    if (table) tables.push(table);
    if (tables.length >= 10) break;
  }
  if (!tables.length) return false;
  if (!(await claim(db, key, 'public-season', null as any, null))) return false;
  try {
    const caption = `🏆 Таблица сезона на эту неделю: ${tables.map((table) => `«${table.periodTitle}»`).join(', ')}${await botLink()}`;
    const result = await sendPhotos(db, null, tables.map((table) => renderPng(seasonTableSvg(table))), caption, fetchImpl, 'public');
    await finish(db, key, result);
    return result.ok;
  } catch (error: any) {
    await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    return false;
  }
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
    lines.push('🏆 Кто сыграл лучше всех? Отдай свой голос за «Игрока вечера»: Клуб → Истории (голосование открыто 3 дня, до понедельника).');
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

/** 36 hours before the start (owner, 2026-10-02) the tournament announcement goes to the rating group. */
export const TOURNAMENT_ANNOUNCE_HOURS = 36;

// The club's Twitch channel (owner, 2026-10-02: chagintv); TWITCH_CHANNEL_URL overrides it.
const broadcastLink = () => String(process.env.TWITCH_CHANNEL_URL || 'https://www.twitch.tv/chagintv').trim().replace(/\/$/, '');

export async function postTournamentAnnouncement(db: DatabaseWrapper, tournamentId: string, fetchImpl: typeof fetch = fetch) {
  await ensureClubResultPostSchema(db);
  const key = `tournament-announce:${tournamentId}`;
  const announcement = await loadTournamentAnnouncement(db, tournamentId);
  // Without a confirmed roster there is nothing to announce yet; the scan tries again later.
  if (!announcement?.players.length) return false;
  if (!(await claim(db, key, 'tournament-announce', '', null))) return false;
  try {
    const link = broadcastLink();
    const caption = [
      `🏆 Турнир «${announcement.title}» — ${announcement.dateLabel}${announcement.timeLabel ? `, начало в ${announcement.timeLabel}` : ''}!`,
      announcement.venue ? `📍 ${announcement.venue}` : '',
      announcement.judge ? `⚖️ Главный судья: ${announcement.judge}` : '',
      `📺 Прямой эфир со старта игр${announcement.timeLabel ? ` (с ${announcement.timeLabel})` : ''}${link ? `: ${link}` : ' — на Twitch клуба'}`,
      '',
      `Играют (${announcement.players.length}): ${announcement.players.map((player) => player.nickname).join(', ')}`,
      '',
      'Приходите болеть за любимчиков и смотрите в эфире! 🖤',
    ].filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n').slice(0, 1020);
    const result = await sendPhotos(db, 'TOURNAMENT', [renderPng(tournamentAnnounceSvg(announcement, link ? link.replace(/^https?:\/\//, '') : 'Twitch клуба'))], caption, fetchImpl, 'rating');
    await finish(db, key, result);
    return result.ok;
  } catch (error: any) {
    await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    return false;
  }
}

async function runTournamentAnnouncements(db: DatabaseWrapper, fetchImpl: typeof fetch, now: number) {
  const rows = await db.all<any>(
    `SELECT id FROM tournaments
      WHERE status IN ('draft', 'active') AND datetime(date) > datetime(?) AND datetime(date) <= datetime(?)
        AND NOT EXISTS (SELECT 1 FROM club_result_posts p WHERE p.post_key = 'tournament-announce:' || tournaments.id AND p.status IN ('sent', 'failed', 'sending'))`,
    [new Date(now).toISOString(), new Date(now + TOURNAMENT_ANNOUNCE_HOURS * 3_600_000).toISOString()],
  ).catch(() => []);
  let posted = 0;
  for (const row of rows) if (await postTournamentAnnouncement(db, String(row.id), fetchImpl)) posted += 1;
  return posted;
}

/** One completed tournament game's blank goes to the rating group (owner, 2026-10-03). */
export async function postTournamentGameBlank(db: DatabaseWrapper, tournamentGameId: string, fetchImpl: typeof fetch = fetch) {
  await ensureClubResultPostSchema(db);
  const key = `tournament-game:${tournamentGameId}`;
  if (!(await claim(db, key, 'tournament-game', '', tournamentGameId))) return false;
  try {
    const blank = await loadTournamentGameBlank(db, tournamentGameId);
    if (!blank) { await finish(db, key, { ok: false, temporary: false, error: 'Игра турнира не завершена' }); return false; }
    const winner = blank.winnerTeam === 'red' ? 'победа красных' : blank.winnerTeam === 'black' ? 'победа чёрных' : 'игра завершена';
    const result = await sendPhotos(db, 'TOURNAMENT', [renderPng(gameBlankSvg(blank))], `🎭 «${blank.eveningTitle}» · игра №${blank.gameNumber} · ${winner}`, fetchImpl, 'rating');
    await finish(db, key, result);
    return result.ok;
  } catch (error: any) {
    await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    return false;
  }
}

const SEAT_MESSAGE_WAIT_MS = 5 * 60_000;
const TOURNAMENT_GAME_WINDOW_MS = 36 * 60 * 60 * 1000;

/**
 * Every minute: the first game's seat messages 30 minutes before the start; for each recently completed
 * tournament game its result post, and then — once the result was posted (or gave up, or five minutes
 * passed) — the seat messages for the next game.
 */
async function runTournamentGameFollowUps(db: DatabaseWrapper, fetchImpl: typeof fetch, now: number, enabledSince: string) {
  let handled = 0;
  handled += await runTournamentFirstSeatMessages(db, now).catch((error) => { console.error('[TOURNAMENT SEATS] first game failed:', error); return 0; });
  const since = new Date(Math.max(now - TOURNAMENT_GAME_WINDOW_MS, new Date(enabledSince).getTime())).toISOString();
  const games = await db.all<any>(`
    SELECT g.id, g.tournament_id, g.game_number, g.completed_at FROM tournament_games g
      JOIN tournaments t ON t.id = g.tournament_id
     WHERE g.status = 'completed' AND t.status IN ('active', 'correction', 'completed')
       AND g.completed_at IS NOT NULL AND datetime(g.completed_at) >= datetime(?)
     ORDER BY g.completed_at
  `, [since]).catch(() => []);
  for (const game of games) {
    try {
      if (await postTournamentGameBlank(db, String(game.id), fetchImpl)) handled += 1;
      const post = await db.get<any>('SELECT status FROM club_result_posts WHERE post_key = ?', [`tournament-game:${game.id}`]);
      const waited = now - new Date(String(game.completed_at)).getTime();
      if (!['sent', 'failed'].includes(String(post?.status || '')) && waited < SEAT_MESSAGE_WAIT_MS) continue;
      const next = await db.get<any>(
        "SELECT id FROM tournament_games WHERE tournament_id = ? AND game_number = ? AND status != 'completed' LIMIT 1",
        [game.tournament_id, Number(game.game_number) + 1],
      );
      if (next) handled += await queueTournamentGameSeatMessages(db, String(next.id), 'next');
    } catch (error) {
      console.error('[TOURNAMENT RESULTS] follow-up failed:', game.id, error);
    }
  }
  return handled;
}
