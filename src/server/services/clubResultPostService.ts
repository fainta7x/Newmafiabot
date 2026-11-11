import { TOURNAMENT_PLAYER_CAPACITY } from './tournamentEveningService.ts';
import { importLegacyPublicationHolds } from './publicationDeliveryService.ts';
import { sendPublicTelegram } from './publicationTelegramService.ts';
import { type PublicationContext, type PublicationResult, ensurePublicationDeliverySchema } from './publicationDeliveryService.ts';
import {loadMvpRunoff,startMvpRunoff,ensureRunoffSchema,type MvpRunoff} from './eveningVoteRounds.ts';
import { round2 } from '../../shared/numbers.ts';
import { GAME_ROLE_LABELS } from '../../shared/gameRoles.ts';
import type { DatabaseWrapper } from '../../db/index.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { isEveningPublishingPaused } from './eveningPublishingPause.ts';
import { loadEveningPlayerResults, loadEveningSummary, loadGameBlank, loadSeasonTable, loadSeasonTableForPeriod, loadTournamentAnnouncement, loadTournamentGameBlank } from './clubResultData.ts';
import { queueTournamentGameSeatMessages, runTournamentFirstSeatMessages } from './tournamentSeatNotificationService.ts';
import { appUrl, inviteFriendUrl } from './gameResultCardService.ts';
import { shortCabinetLink } from './announcementShortLinks.ts';
import { getPublicAppBaseUrl } from '../runtimeConfig.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { telegramBotUsername } from './playerClaimLinkService.ts';
import { queueEveningVoteMessages, voteCallbackData } from './eveningVoteMessageService.ts';
import { eveningVotingSchedule, isVotingOpen } from '../../shared/eveningVotingSchedule.ts';
import { mvpDecisionCallbackData, mvpReasonText, resolveEveningMvp } from './eveningMvpService.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../../db/ensureOrganizerPlayerAccessSchema.ts';
import { sendVk } from './eveningTodayPostService.ts';
import { runEveningPaymentReminders } from './eveningPaymentReminderService.ts';
import { buildMvpResultCard, buildMvpVoteCard } from './mvpCardService.ts';
import { timeBackgroundJob } from '../../lib/performanceProbe.ts';
import { eveningSummarySvg, gameBlankSvg, renderPngAsync, seasonTableSvg, tournamentAnnounceSvg, tournamentNominationsSvg, tournamentTableSvg } from './clubResultImages.ts';
import { russianPlural } from '../../lib/russianPlural.ts';
import { clubGameCompletedSql, tournamentGameCompletedSql } from './gameService.ts';

/**
 * Club chat results (owner, 2026-10-01): after each completed game the bot posts the game blank,
 * and when the evening is closed it posts the evening summary. Both go to the evening's Telegram
 * group (the same place as «Мы собрались»). Each post goes out once.
 */

// 12 attempts with a growing pause (30 s doubling to 15 min) keep a result post alive for about two hours, so a Telegram
// confirmed rejection can recover without losing the game blank or evening summary. Durable network attempts
// hold an unknown outcome; an expired preparation lease can recover only through that same network guard.
const MAX_ATTEMPTS = 12;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 15 * 60_000;
const STALE_SENDING_MS = 15 * 60_000;
const retryPauseMs = (attempts: number) => Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** Math.max(0, attempts - 1)));
const WINDOW_MS = 36 * 60 * 60 * 1000;
const CLOSED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ENABLED_KEY = 'enabled';
const PUBLIC_ENABLED_KEY = 'enabled-public';

export async function ensureClubResultPostSchema(db: DatabaseWrapper) {
  await ensurePublicationDeliverySchema(db);
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
  return normalized === 'NOVICE' ? 'novice_chat' : normalized === 'CASUAL' ? 'club_chat' : 'rating_chat';
};

export type ClubPostKind = 'vote' | 'mvp-result' | 'other';

/** The kind of a post from its delivery key: the vote itself, the MVP result, or any other result post. */
export const clubPostKind = (key: string | undefined): ClubPostKind => {
  if (/^club:(vote-|mvp-ask|mvp-runoff)/.test(String(key || ''))) return 'vote';
  if (/^club:mvp-result/.test(String(key || ''))) return 'mvp-result';
  return 'other';
};

/**
 * Where a Telegram post goes (owner, 2026-11-10). The MVP of a club evening lives in the main group's «Новости» topic, the MVP of a
 * novice evening in the novice group's «История» topic; their results also go to the entry channel. Rating evenings and tournaments:
 * results go to the entry channel, the closed rating channel and the main group's «Новости» topic; the vote itself only to the rating channel.
 */
export const clubResultTargets = (format: unknown, kind: ClubPostKind): string[] => {
  const normalized = normalizeEveningFormat(format);
  if (normalized === 'NOVICE') return kind === 'vote' ? ['novice_mvp'] : kind === 'mvp-result' ? ['novice_mvp', 'public'] : ['novice_chat'];
  if (normalized === 'CASUAL') return kind === 'vote' ? ['club_mvp'] : kind === 'mvp-result' ? ['club_mvp', 'public'] : ['club_chat'];
  return kind === 'vote' ? ['rating'] : ['rating', 'public', 'club_mvp'];
};

/** Destinations whose topic the result posts use (the MVP topics); the other result chats stay the group's main chat. */
const TOPIC_RESULT_DESTINATIONS = new Set(['club_mvp', 'novice_mvp']);

/** Sends one post to every target; the first keeps the original delivery key, the others get `@destination`. */
async function fanOut(targets: string[], context: PublicationContext | undefined, send: (destinationId: string, context: PublicationContext | undefined) => Promise<PublicationResult>): Promise<PublicationResult> {
  const results: PublicationResult[] = [];
  for (const [index, destination] of targets.entries()) {
    results.push(await send(destination, context && index > 0 ? { ...context, key: `${context.key}@${destination}` } : context));
  }
  const [primary, ...mirrors] = results;
  if (!primary.ok) return primary;
  return mirrors.find((result) => !result.ok && result.temporary) || primary;
}

export async function sendPhotos(db: DatabaseWrapper, format: unknown, photos: Buffer[], caption: string, fetchImpl: typeof fetch, destinationId?: string, mime = 'image/png', replyMarkup?: unknown, context?: PublicationContext, announcement = false): Promise<PublicationResult> {
  const targets = destinationId ? [destinationId] : clubResultTargets(format, clubPostKind(context?.key));
  return fanOut(targets, context, (destination, ctx) => sendPhotosTo(db, photos, caption, fetchImpl, destination, mime, replyMarkup, ctx, announcement));
}


/** One picture, or an album (the evening summary with the season table) in one message. */
async function sendPhotosTo(db: DatabaseWrapper, photos: Buffer[], caption: string, fetchImpl: typeof fetch, destinationId: string, mime = 'image/png', replyMarkup?: unknown, context?: PublicationContext, announcement = false): Promise<PublicationResult> {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return { ok: false, certainty: 'rejected', temporary: true, error: 'Telegram-бот не настроен' };
  const destination = await db.get<any>(
    'SELECT chat_id, topic_id, active FROM telegram_destinations WHERE id = ? LIMIT 1',
    [destinationId],
  ).catch(() => null);
  if (!destination?.chat_id || Number(destination.active ?? 1) === 0) {
    return { ok: false, certainty: 'rejected', temporary: false, error: destinationId === 'public' ? 'Не настроен входной Telegram-канал' : 'Не настроена Telegram-группа для этого вечера' };
  }
  return sendPublicTelegram(db, {
    method: photos.length > 1 ? 'sendMediaGroup' : 'sendPhoto',
    // Results, blanks, votes, season tables, digests, birthdays go to the group's main chat, never to its announcements topic
    // (owner, 2026-11-03: «кроме анонсов и сбора вечера — только в чат внутри группы с основным столом»).
    fields: { chat_id: destination.chat_id, ...((announcement || TOPIC_RESULT_DESTINATIONS.has(destinationId)) && destination.topic_id ? { message_thread_id: destination.topic_id } : {}),
      ...(photos.length > 1 ? { media: photos.map((_, index) => ({ type:'photo', media:`attach://p${index}`, ...(index === 0 ? { caption } : {}) })) }
        : { caption, ...(replyMarkup ? { reply_markup:replyMarkup } : {}) }) },
    photos: photos.map((photo,index) => ({ data:photo.toString('base64'), mime, name:mime === 'image/png' ? 'result.png' : 'photo.jpg', field:photos.length > 1 ? `p${index}` : 'photo' })),
    expectedMessages:photos.length,
  }, fetchImpl, context);
}

/** Claims the post before sending, so two scans or a lost reply cannot post it twice. */
export async function claim(db: DatabaseWrapper, key: string, kind: string, eveningId: string, gameId: string | null) {
  await importLegacyPublicationHolds(db);
  const now = new Date().toISOString();
  await db.run(
    `INSERT OR IGNORE INTO club_result_posts (post_key, kind, evening_id, game_id, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)`,
    [key, kind, eveningId, gameId, now, now],
  );
  // Recover preparation leases through the durable HTTP outcome, never by assuming an unacknowledged send failed.
  await db.run(
    `UPDATE club_result_posts SET status = CASE
        WHEN EXISTS (SELECT 1 FROM publication_deliveries d WHERE d.delivery_key='club:'||post_key AND d.status='accepted') THEN 'sent'
        WHEN EXISTS (SELECT 1 FROM publication_deliveries d WHERE d.delivery_key IN ('club:'||post_key,'club:'||post_key||':text') AND d.status IN ('sending','uncertain')) THEN 'uncertain'
        ELSE 'retry' END
      WHERE post_key = ? AND status = 'sending' AND datetime(updated_at) <= datetime(?)`,
    [key, new Date(Date.now() - STALE_SENDING_MS).toISOString()],
  );
  const current = await db.get<any>('SELECT status, attempts, updated_at FROM club_result_posts WHERE post_key = ?', [key]);
  if (current?.status === 'retry' && Date.now() - new Date(String(current.updated_at)).getTime() < retryPauseMs(Number(current.attempts || 0))) return false;
  const claimed = await db.run(
    `UPDATE club_result_posts SET status = 'sending', attempts = attempts + 1, updated_at = ?
      WHERE post_key = ? AND status IN ('pending', 'retry') AND attempts < ?`,
    [now, key, MAX_ATTEMPTS],
  );
  return Number(claimed.changes || 0) > 0;
}

export async function finish(db: DatabaseWrapper, key: string, result: { ok: boolean; certainty?: PublicationResult['certainty']; temporary?: boolean; error?: string }) {
  const now = new Date().toISOString();
  const held = await db.get<any>("SELECT 1 FROM publication_deliveries WHERE delivery_key IN (?,?) AND status IN ('sending','uncertain')", ['club:'+key, 'club:'+key+':text']);
  if (held || result.certainty === 'uncertain') {
    await db.run("UPDATE club_result_posts SET status='uncertain',last_error=?,updated_at=? WHERE post_key=? AND status='sending'", [result.error || 'Пост мог выйти',now,key]);
    return;
  }
  await db.run(
    `UPDATE club_result_posts SET status = CASE WHEN ? THEN 'sent' WHEN ? AND attempts < ? THEN 'retry' ELSE 'failed' END,
            last_error = ?, sent_at = ?, updated_at = ? WHERE post_key = ? AND status='sending'`,
    [result.ok ? 1 : 0, result.temporary ? 1 : 0, MAX_ATTEMPTS, result.ok ? null : String(result.error || '').slice(0, 500), result.ok ? now : null, now, key],
  );
}

export async function postGameBlank(db: DatabaseWrapper, gameId: string, format: unknown, eveningId: string, fetchImpl: typeof fetch = fetch) {
  const key = `game:${gameId}`;
  if (!(await claim(db, key, 'game', eveningId, gameId))) return false;
  try {
    const blank = await loadGameBlank(db, gameId);
    if (!blank) { await finish(db, key, { ok: false, temporary: false, error: 'Игра не завершена' }); return false; }
    const winner = blank.winnerTeam === 'red' ? 'победа красных' : blank.winnerTeam === 'black' ? 'победа чёрных' : 'игра завершена';
    const result = await sendPhotos(db, format, [await renderPngAsync(gameBlankSvg(blank))], `🎭 Игра №${blank.gameNumber} · ${winner}`, fetchImpl, undefined, undefined, undefined, { key: 'club:' + key, kind: 'club-result' });
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
    const photos = [await renderPngAsync(eveningSummarySvg(summary)), ...(season ? [await renderPngAsync(seasonTableSvg(season))] : [])];
    const caption = `🏁 Итоги вечера «${summary.eveningTitle}»${season ? ` и промежуточная таблица «${season.periodTitle}»` : ''}`;
    const result = await sendPhotos(db, format, photos, caption, fetchImpl, undefined, undefined, undefined, { key: 'club:' + key, kind: 'club-result' });
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
// Each part of the minute scan is timed on its own (personal_notifications/club_results/<part>): the scan takes ~1.5 s
// of synchronous work a minute on production, and only ~0.2 s of it is SQLite (stall audit, 2026-10-22).
const part = <T>(name: string, run: () => Promise<T>) => timeBackgroundJob(`personal_notifications/club_results/${name}`, run, 100);

export async function runClubResultPosts(db: DatabaseWrapper, fetchImpl: typeof fetch = fetch, now = Date.now()) {
  if (isEveningPublishingPaused()) return 0;
  await ensureClubResultPostSchema(db);
  const stamp = new Date(now).toISOString();
  // A switch-on marker is written once; reading it first keeps the minute scan from taking the write lock for nothing.
  const switchOnMarker = async (key: string) => {
    const existing = await db.get<any>('SELECT created_at FROM club_result_posts WHERE post_key = ?', [key]);
    if (existing) return existing;
    await db.run(
      `INSERT OR IGNORE INTO club_result_posts (post_key, kind, status, created_at, updated_at) VALUES (?, 'marker', 'sent', ?, ?)`,
      [key, stamp, stamp],
    );
    return db.get<any>('SELECT created_at FROM club_result_posts WHERE post_key = ?', [key]);
  };
  const marker = await switchOnMarker(ENABLED_KEY);
  // The entry channel has its own switch-on: an upgrade from the chat-only release must not post
  // the evenings closed before it (they never had entry-channel records).
  const publicMarker = await switchOnMarker(PUBLIC_ENABLED_KEY);
  const publicSince = String(publicMarker?.created_at || stamp);
  // Strictly after the switch-on: an evening already running at deploy time is not posted retroactively.
  const since = Math.max(now - WINDOW_MS, new Date(String(marker?.created_at || stamp)).getTime());
  const evenings = await db.all<any>(`
    SELECT id, format, status FROM game_evenings
     WHERE datetime(starts_at) >= datetime(?) AND datetime(starts_at) <= datetime(?)
       AND status IN ('active', 'completed')
  `, [new Date(since).toISOString(), stamp]);

  let posted = 0;
  await part('game_blanks', async () => { for (const evening of evenings) {
    // Only the two fields that say «a completed club game» are read: parsing the whole protocol (with its replay frames,
    // ~1.4 MB a game) every minute was most of this scan's ~1.5 s of synchronous work (2026-10-26).
    const games = await db.all<any>(`
      SELECT g.id
        FROM games g
       WHERE g.evening_id = ? AND g.archived_at IS NULL
         -- «completed» is the «Игра» layer's rule, as light SQL (no protocol is parsed every minute).
         AND ${clubGameCompletedSql('g')}
         AND NOT EXISTS (SELECT 1 FROM club_result_posts p WHERE p.post_key = 'game:' || g.id AND (p.status IN ('sent', 'failed', 'uncertain') OR (p.status = 'sending' AND datetime(p.updated_at) > datetime('now', '-15 minutes'))))
       ORDER BY g.global_game_number, g.id
    `, [evening.id]);
    for (const game of games) {
      if (await postGameBlank(db, String(game.id), evening.format, String(evening.id), fetchImpl)) posted += 1;
    }
  } });

  // Closed evenings by their closing time, not their start: an evening closed days later (or after a
  // long publishing pause) still gets its summary and the personal messages.
  const closed = await db.all<any>(`
    SELECT e.id, e.format, e.starts_at FROM game_evenings e
     WHERE e.status = 'completed'
       AND datetime(e.starts_at) >= datetime(?)
       AND datetime(COALESCE(e.settled_at, e.updated_at)) >= datetime(?)
       AND (NOT EXISTS (SELECT 1 FROM club_result_posts p WHERE p.post_key = 'cards:' || e.id AND p.status = 'sent')
         OR NOT EXISTS (SELECT 1 FROM club_result_posts p WHERE p.post_key = 'evening:' || e.id AND (p.status IN ('sent', 'failed', 'uncertain') OR (p.status = 'sending' AND datetime(p.updated_at) > datetime('now', '-15 minutes')))))
  `, [String(marker?.created_at || stamp), new Date(now - CLOSED_WINDOW_MS).toISOString()]);
  await part('closed_evenings', async () => { for (const evening of closed) {
    if (await postEveningSummary(db, String(evening.id), evening.format, fetchImpl)) posted += 1;
    await queueEveningPlayerCards(db, String(evening.id)).catch((error) => console.error('[CLUB RESULTS] personal cards failed:', error));
  } });

  // «MVP вечера» (owner, 2026-11-09): the poll — a post of its own and the personal buttons — goes out when the vote opens
  // (the day after the evening at 12:00, right after a late closing) and stays open to the evening's end hour; one reminder
  // for those who have not voted a day after the poll.
  const voting = await db.all<any>(`
    SELECT e.id, e.title, e.starts_at, e.settled_at, e.updated_at FROM game_evenings e
     WHERE e.status = 'completed' AND datetime(e.starts_at) >= datetime(?) AND datetime(e.starts_at) >= datetime(?)
       AND EXISTS (SELECT 1 FROM club_result_posts p WHERE p.post_key = 'cards:' || e.id AND p.status = 'sent')
  `, [publicSince, new Date(now - VOTE_SCAN_DAYS * 24 * 60 * 60 * 1000).toISOString()]).catch(() => []);
  await part('mvp_vote', async () => { for (const evening of voting) {
    const schedule = eveningVotingSchedule(evening);
    if (!schedule || !isVotingOpen(schedule, now)) continue;
    if (await postVotePrompt(db, String(evening.id), fetchImpl)) posted += 1;
    await sendPersonalVoteMessages(db, String(evening.id), String(evening.title || 'Игровой вечер'));
    if (now - schedule.openAtMs >= 24 * 60 * 60 * 1000) await remindUnvotedPlayers(db, String(evening.id)).catch((error) => console.error('[CLUB RESULTS] vote reminder failed:', error));
  } });

  // The result of the vote, when its window is over (and for a few days after: a missed run is caught up, a tie waits for the owner).
  await ensureRunoffSchema(db);
  const voted = (await db.all<any>(`
    SELECT e.id, e.starts_at, e.settled_at, e.updated_at FROM game_evenings e
     WHERE e.status = 'completed' AND datetime(e.starts_at) >= datetime(?) AND datetime(e.starts_at) >= datetime(?)
       AND EXISTS (SELECT 1 FROM club_result_posts p WHERE p.post_key = 'cards:' || e.id AND p.status = 'sent')
  `, [publicSince, new Date(now - (VOTE_SCAN_DAYS + 7) * 24 * 60 * 60 * 1000).toISOString()]).catch(() => []))
    .filter((evening: any) => { const schedule = eveningVotingSchedule(evening); return Boolean(schedule) && schedule!.deadlineMs <= now; });
  await part('mvp_result', async () => { for (const evening of voted) {
    if (await postMvpResult(db, String(evening.id), fetchImpl).catch((error) => { console.error('[CLUB RESULTS] MVP result failed:', error); return false; })) posted += 1;
  } });

  // The entry channel («Анонсы») gets only announcements (owner, 2026-11-02): «Мы собрались» photos (a table exists). The weekly season table goes to the club chat.
  const gathered = await db.all<any>(`
    SELECT gp.evening_id FROM evening_gathered_posts gp JOIN game_evenings e ON e.id = gp.evening_id
     WHERE gp.telegram_status = 'published' AND gp.image_data IS NOT NULL
       AND datetime(e.starts_at) >= datetime(?) AND datetime(e.starts_at) >= datetime(?)
       AND NOT EXISTS (SELECT 1 FROM club_result_posts p WHERE p.post_key = 'public-gathered:' || gp.evening_id AND (p.status IN ('sent', 'failed', 'uncertain') OR (p.status = 'sending' AND datetime(p.updated_at) > datetime('now', '-15 minutes'))))
  `, [publicSince, new Date(now - CLOSED_WINDOW_MS).toISOString()]).catch(() => []);
  await part('public_gathered', async () => { for (const row of gathered) {
    if (await postPublicGathered(db, String(row.evening_id), fetchImpl)) posted += 1;
  } });
  if (await part('weekly_season', () => postWeeklySeasonTables(db, fetchImpl, now))) posted += 1;
  posted += await part('tournament_announcements', () => runTournamentAnnouncements(db, fetchImpl, now));
  posted += await part('tournament_results', () => runTournamentResultPosts(db, fetchImpl, now));
  posted += await part('payment_reminders', () => runEveningPaymentReminders(db, now)).catch((error) => { console.error('[PAYMENT REMINDERS] scan failed:', error); return 0; });
  posted += await part('tournament_follow_ups', () => runTournamentGameFollowUps(db, fetchImpl, now, String(marker?.created_at || stamp)));
  return posted;
}

const botLink = async () => {
  const bot = await telegramBotUsername().catch(() => null);
  return bot ? `\n\nХочешь сыграть с нами? Пиши боту: https://t.me/${bot}` : '';
};

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
    const result = await sendPhotos(db, null, [Buffer.from(String(row.image_data), 'base64')], caption, fetchImpl, 'public', String(row.mime_type || 'image/jpeg'), undefined, { key: 'club:' + key, kind: 'club-result' });
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
  if (await db.get("SELECT 1 FROM club_result_posts WHERE post_key = ? AND (status IN ('sent', 'failed', 'uncertain') OR (status = 'sending' AND datetime(updated_at) > datetime('now', '-15 minutes')))", [key])) return false;
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
    const result = await sendPhotos(db, null, await Promise.all(tables.map((table) => renderPngAsync(seasonTableSvg(table)))), caption, fetchImpl, 'club_chat', undefined, undefined, { key: 'club:' + key, kind: 'club-result' });
    await finish(db, key, result);
    return result.ok;
  } catch (error: any) {
    await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    return false;
  }
}

const ROLE_LABELS: Record<string, string> = GAME_ROLE_LABELS;
const comma = (value: number) => {
  const rounded = round2(value);
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
    lines.push(`Сыграно: ${player.games.length} ${russianPlural(player.games.length, 'игра', 'игры', 'игр')} · ${player.wins} ${russianPlural(player.wins, 'победа', 'победы', 'побед')}`);
    for (const game of player.games) {
      lines.push(`№${game.number} ${game.role ? ROLE_LABELS[game.role] || game.role : 'роль не указана'} — ${game.won ? 'победа' : 'поражение'}`);
    }
    if (evening.scored && player.points != null) {
      lines.push(`Баллы за вечер: ${comma(player.points)}`);
    }
    if (player.eloDelta != null) lines.push(`Эло: ${comma(Math.round(player.eloDelta))} · теперь ${Math.round(player.eloAfter || 0)}`);
    // The vote's own times (owner, 2026-11-09): the poll with the buttons comes when it opens, not with this card.
    const voteTimes = await db.get<any>('SELECT starts_at, settled_at, updated_at FROM game_evenings WHERE id = ?', [eveningId]);
    const voteSchedule = voteTimes ? eveningVotingSchedule(voteTimes) : null;
    lines.push(voteSchedule
      ? `🏆 Кто сыграл лучше всех? «MVP вечера»: опрос с кнопками придёт ${moscowDayTime(Math.max(voteSchedule.openAtMs, Date.now()))}, голосовать можно до ${moscowDayTime(voteSchedule.deadlineMs)} — кнопками или в приложении (Клуб → Истории).`
      : '🏆 Кто сыграл лучше всех? Отдай свой голос за «MVP вечера» в приложении (Клуб → Истории).');
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
  // The «MVP вечера» vote buttons go out on the vote's own schedule (Saturday 12:00 for a Friday evening), not with the card.
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO club_result_posts (post_key, kind, evening_id, status, attempts, sent_at, created_at, updated_at)
     VALUES (?, 'cards', ?, 'sent', 1, ?, ?, ?) ON CONFLICT(post_key) DO UPDATE SET status = 'sent', sent_at = excluded.sent_at, updated_at = excluded.updated_at`,
    [key, eveningId, now, now, now],
  );
  return queued;
}

const moscowDayTime = (ms: number) => new Date(ms).toLocaleString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/** When voting for an evening ends (the schedule the app and the bot use too). */
const votingDeadlineMs = (evening: any) => eveningVotingSchedule(evening)?.deadlineMs ?? 0;

/** How many days after its start an evening is still looked at by the vote scan (voting ends by day 6 at the latest). */
const VOTE_SCAN_DAYS = 10;

/** The personal «Кто сыграл лучше всех?» buttons, once per evening, when the vote has opened. */
async function sendPersonalVoteMessages(db: DatabaseWrapper, eveningId: string, title: string) {
  const key = `vote-messages:${eveningId}`;
  if (!(await claim(db, key, 'vote-messages', eveningId, null))) return;
  try {
    await queueEveningVoteMessages(db, eveningId, title);
    await finish(db, key, { ok: true });
  } catch (error) {
    console.error('[CLUB RESULTS] vote messages failed:', error);
    await finish(db, key, { ok: false, temporary: true, error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * «MVP вечера» was hidden (owner, 2026-10-13: people did not vote): a post of its own in the evening's Telegram group and
 * on the VK wall once the results are out, naming the deadline and where to vote. Each channel is claimed separately.
 */
export async function postVotePrompt(db: DatabaseWrapper, eveningId: string, fetchImpl: typeof fetch = fetch) {
  const evening = await db.get<any>('SELECT id, title, format, status, starts_at, settled_at, updated_at FROM game_evenings WHERE id = ?', [eveningId]);
  if (!evening || evening.status !== 'completed') return false;
  const attendees = Number((await db.get<any>("SELECT COUNT(*) AS n FROM evening_participants WHERE evening_id = ? AND attendance_status = 'attended'", [eveningId]))?.n || 0);
  const deadline = votingDeadlineMs(evening);
  const voteSchedule = eveningVotingSchedule(evening);
  if (attendees < 2 || deadline <= Date.now() || !voteSchedule || Date.now() < voteSchedule.openAtMs) return false;
  const title = String(evening.title || 'Игровой вечер');
  const base = appUrl('/player');
  // The candidates are buttons right under the post (owner, 2026-10-13: «кнопки в боте» led nowhere): a tap is the vote.
  const nominees = await db.all<any>(`
    SELECT p.id, p.nickname FROM evening_participants ep JOIN players p ON p.id = ep.player_id
     WHERE ep.evening_id = ? AND ep.attendance_status = 'attended' ORDER BY p.nickname COLLATE NOCASE ASC
  `, [eveningId]);
  const voteButtons = nominees.flatMap((nominee: any) => {
    const data = voteCallbackData(eveningId, String(nominee.id));
    const name = String(nominee.nickname || '').trim() || 'Игрок';
    return data ? [{ text: name.length > 24 ? `${name.slice(0, 23)}…` : name, callback_data: data }] : [];
  });
  const voteRows: Array<typeof voteButtons> = [];
  for (let index = 0; index < voteButtons.length; index += 2) voteRows.push(voteButtons.slice(index, index + 2));
  const telegramText = [
    `🏆 MVP вечера «${title}» — голосуем!`,
    'Кто сыграл лучше всех? Нажми на игрока под этим постом — это твой голос. Голосовать могут те, кто был за столом; за себя нельзя. Передумал — нажми на другого, голос заменится.',
    `⏳ Голосование до ${moscowDayTime(deadline)}.`,
  ].join('\n');
  // The short link is made only once the VK post is claimed: this scan runs every minute of the voting window.
  const buildVkText = async () => {
    const cabinetLink = await shortCabinetLink(db, getPublicAppBaseUrl()).catch(() => base || '');
    return [
    `🏆 Выбираем MVP вечера «${title}»`,
    'Кто сыграл сильнее всех? Голосуют участники вечера: за себя — нельзя, свой голос можно изменить.',
    cabinetLink ? `👉 Проголосовать: ${cabinetLink} (на главной — карточка «MVP вечера»)` : '👉 Проголосовать: приложение клуба, на главной — карточка «MVP вечера»',
    `⏳ Голосование до ${moscowDayTime(deadline)}`,
    ].join('\n');
  };
  let posted = false;
  // The card with the photo of every candidate (owner, 2026-10-14: the polls were only text); without it the text post still goes out.
  // It is drawn only when a post is actually claimed: drawing it on every minute scan of the three-day window blocked the
  // server for ~0.75 s a minute (CPU profile, 2026-10-23).
  let cardDrawing: Promise<Buffer | null> | null = null;
  const voteCard = () => (cardDrawing ??= buildMvpVoteCard(db, eveningId));
  const voteMarkup = voteRows.length ? { inline_keyboard: voteRows } : undefined;
  const telegramKey = `vote-prompt:${eveningId}`;
  if (await claim(db, telegramKey, 'vote-prompt', eveningId, null)) {
    const card = await voteCard();
    let result = card ? await sendPhotos(db, evening.format, [card], telegramText, fetchImpl, undefined, 'image/png', voteMarkup, { key: 'club:' + telegramKey, kind: 'club-result' }) : { ok: false, certainty: 'rejected', temporary: false, error: 'no card' } as PublicationResult;
    // A refused photo falls back to text; a temporary failure is retried by the claim, so the post is not duplicated.
    if (!result.ok && result.certainty === 'rejected' && !result.temporary) result = await sendTextForFormat(db, evening.format, telegramText, fetchImpl, undefined, voteMarkup, { key: 'club:' + telegramKey + ':text', kind: 'club-result' });
    await finish(db, telegramKey, result);
    posted = posted || result.ok;
  }
  const vkKey = `vote-prompt-vk:${eveningId}`;
  if (await claim(db, vkKey, 'vote-prompt', eveningId, null)) {
    const card = await voteCard();
    const result = await sendVk(await buildVkText(), { db, eveningId, format: evening.format, context: { key: 'club:' + vkKey, kind: 'club-result', entityId: eveningId }, ...(card ? { image: { bytes: card, mime: 'image/png' } } : {}) });
    await finish(db, vkKey, { ok: result.status === 'published', certainty: result.certainty, temporary: result.temporary, error: result.error || undefined });
    posted = posted || result.status === 'published';
  }
  return posted;
}

const votesWord = (count: number) => {
  const mod10 = count % 10; const mod100 = count % 100;
  return mod10 === 1 && mod100 !== 11 ? 'голос' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'голоса' : 'голосов';
};

/**
 * The result of the «MVP вечера» vote (owner, 2026-10-14: «нигде не выложился итог»). Once the voting window is over, one
 * winner is announced in the group, on the VK wall and personally to everyone who was at the evening. A tie that neither the
 * wins nor the Дон/Шериф wins separate goes to the owner as a question with a button per player; the result follows his answer.
 * Nothing is posted for an evening nobody voted on.
 */
async function postMvpRunoff(db:DatabaseWrapper,evening:any,round:MvpRunoff,fetchImpl:typeof fetch){
  const attendees=await db.all<any>("SELECT p.id,p.nickname FROM evening_participants ep JOIN players p ON p.id=ep.player_id WHERE ep.evening_id=? AND ep.attendance_status='attended'",[evening.id]);
  const finalists=attendees.filter(p=>round.nominees.includes(String(p.id)));
  const text=`🏅 «${evening.title}»: дополнительное голосование за MVP.\nВ первом туре несколько игроков набрали одинаковое число голосов. Выбираем только между ними: ${finalists.map(p=>p.nickname).join(', ')}.\nПервый тур не переносится: голосуем заново до ${moscowDayTime(Date.parse(round.deadline_at))}.`;
  const buttons=finalists.flatMap(p=>{const callback=voteCallbackData(String(evening.id),String(p.id),true);return callback?[[{text:String(p.nickname),callback_data:callback}]]:[];});
  let posted=false;
  const key=`mvp-runoff:${evening.id}`;
  if(await claim(db,key,'mvp-runoff',String(evening.id),null)){const result=await sendTextForFormat(db,evening.format,text,fetchImpl,undefined,{inline_keyboard:buttons}, { key: 'club:' + key, kind: 'club-result' });await finish(db,key,result);posted=result.ok;}
  const vkKey=`mvp-runoff-vk:${evening.id}`;
  if(await claim(db,vkKey,'mvp-runoff',String(evening.id),null)){const result=await sendVk(`🏅 «${evening.title}»: решающее голосование за MVP\nВ первом туре несколько игроков набрали поровну голосов. Выбираем между ними: ${finalists.map(p=>p.nickname).join(', ')}.\nПервый тур не переносится — голосуем заново до ${moscowDayTime(Date.parse(round.deadline_at))}.\n👉 Проголосовать: ${await shortCabinetLink(db,getPublicAppBaseUrl()).catch(()=>'приложение клуба, карточка «MVP вечера»')}`,{db,eveningId:String(evening.id),format:evening.format,context:{key:'club:'+vkKey,kind:'club-result',entityId:String(evening.id)}});await finish(db,vkKey,{ok:result.status==='published',certainty:result.certainty,temporary:result.temporary,error:result.error||undefined});posted=posted||result.status==='published';}
  await queueEveningVoteMessages(db,String(evening.id),String(evening.title),{runoff:round});
  return posted;
}

export async function postMvpResult(db: DatabaseWrapper, eveningId: string, fetchImpl: typeof fetch = fetch) {
  const evening = await db.get<any>('SELECT id, title, format, status, starts_at, settled_at, updated_at FROM game_evenings WHERE id = ?', [eveningId]);
  if (!evening || evening.status !== 'completed') return false;
  const deadline = votingDeadlineMs(evening);
  if (!deadline || deadline > Date.now()) return false;
  const resolution = await resolveEveningMvp(db, eveningId);
  if (resolution.status === 'none') return false;
  if(resolution.status==='runoff'){const round=await loadMvpRunoff(db,eveningId);return round?postMvpRunoff(db,evening,round,fetchImpl):false;}
  if(resolution.status==='tie'&&!(await loadMvpRunoff(db,eveningId))){const round=await startMvpRunoff(db,eveningId,resolution.candidates.map(c=>c.player_id),Date.now(),eveningVotingSchedule(evening)?.runoffDeadlineMs);return round?postMvpRunoff(db,evening,round,fetchImpl):false;}
  const title = String(evening.title || 'Игровой вечер');

  if (resolution.status === 'tie') {
    const askKey = `mvp-ask:${eveningId}`;
    if (!(await claim(db, askKey, 'mvp-ask', eveningId, null))) return false;
    try {
      const rows = resolution.candidates.flatMap((candidate) => {
        const data = mvpDecisionCallbackData(eveningId, candidate.player_id);
        return data ? [[{ text: `${candidate.nickname} · ${candidate.votes} ${votesWord(candidate.votes)}, побед ${candidate.wins}`.slice(0, 60), callback_data: data }]] : [];
      });
      const result = await queuePersonalNotification(db, {
        notificationKey: askKey,
        playerId: PRIMARY_ORGANIZER_PLAYER_ID,
        eventType: 'evening_mvp_decision',
        entityId: eveningId,
        text: `🏅 «${title}»: дополнительное голосование за MVP завершилось без единственного победителя (у лидеров по ${resolution.candidates[0].votes} голосов). Кого объявить MVP? Нажми на игрока.`,
        telegramReplyMarkup: rows.length ? { inline_keyboard: rows } : null,
      });
      await finish(db, askKey, { ok: true });
      return Boolean(result.created);
    } catch (error: any) {
      await finish(db, askKey, { ok: false, temporary: true, error: error?.message || String(error) });
      return false;
    }
  }

  const winner = resolution.winner;
  const reason = mvpReasonText(resolution);
  const headline = `🏅 MVP вечера «${title}» — ${winner.nickname}!`;
  const body = [`Голосов: ${winner.votes} из ${resolution.total_votes}.`, reason, 'Поздравляем! 🖤'].filter(Boolean).join('\n');
  const groupText = `${headline}\n${body}`;
  let posted = false;

  // The card with the winner's photo and the others who got votes; without it the text post still goes out.
  // Drawn only once a post is claimed (see postVotePrompt).
  let cardDrawing: Promise<Buffer | null> | null = null;
  const resultCard = () => (cardDrawing ??= buildMvpResultCard(db, eveningId, winner, resolution.total_votes, reason));

  const telegramKey = `mvp-result:${eveningId}`;
  if (await claim(db, telegramKey, 'mvp-result', eveningId, null)) {
    const card = await resultCard();
    let result = card ? await sendPhotos(db, evening.format, [card], groupText, fetchImpl, undefined, undefined, undefined, { key: 'club:' + telegramKey, kind: 'club-result' }) : { ok: false, certainty: 'rejected', temporary: false, error: 'no card' } as PublicationResult;
    if (!result.ok && result.certainty === 'rejected' && !result.temporary) result = await sendTextForFormat(db, evening.format, groupText, fetchImpl, undefined, undefined, { key: 'club:' + telegramKey + ':text', kind: 'club-result' });
    await finish(db, telegramKey, result);
    posted = posted || result.ok;
  }
  const vkKey = `mvp-result-vk:${eveningId}`;
  if (await claim(db, vkKey, 'mvp-result', eveningId, null)) {
    const card = await resultCard();
    // The card goes to «Фото для постов ВК» when VK cannot take it by itself.
    const result = await sendVk(groupText, { db, eveningId, format: evening.format,
      context: { key: 'club:' + vkKey, kind: 'club-result', entityId: eveningId },
      ...(card ? { image: { bytes: card, mime: 'image/png' } } : {}) });
    await finish(db, vkKey, { ok: result.status === 'published', certainty: result.certainty, temporary: result.temporary, error: result.error || undefined });
    posted = posted || result.status === 'published';
  }
  const dmKey = `mvp-result-dm:${eveningId}`;
  if (await claim(db, dmKey, 'mvp-result', eveningId, null)) {
    try {
      const attendees = await db.all<any>(
        "SELECT DISTINCT player_id FROM evening_participants WHERE evening_id = ? AND attendance_status = 'attended' AND player_id IS NOT NULL",
        [eveningId],
      );
      const card = await resultCard();
      for (const attendee of attendees) {
        const playerId = String(attendee.player_id);
        const text = playerId === winner.player_id
          ? `🏅 Ты — MVP вечера «${title}»! Голосов: ${winner.votes} из ${resolution.total_votes}. Поздравляем! 🖤`
          : groupText;
        await queuePersonalNotification(db, {
          notificationKey: `mvp-result:${eveningId}:${playerId}`,
          playerId, eventType: 'evening_mvp_result', entityId: eveningId, text, actionPath: '/player', telegramPhotoPng: card,
        }).catch((error) => console.warn('[MVP RESULT] personal message failed:', error instanceof Error ? error.message : String(error)));
      }
      await finish(db, dmKey, { ok: true });
    } catch (error: any) {
      await finish(db, dmKey, { ok: false, temporary: true, error: error?.message || String(error) });
    }
  }
  return posted;
}

/** One reminder, a day after the evening was closed, to attendees who have not voted yet. */
export async function remindUnvotedPlayers(db: DatabaseWrapper, eveningId: string) {
  const key = `vote-nudge:${eveningId}`;
  const evening = await db.get<any>('SELECT id, title, status, starts_at, settled_at, updated_at FROM game_evenings WHERE id = ?', [eveningId]);
  if (!evening || evening.status !== 'completed' || votingDeadlineMs(evening) <= Date.now()) return 0;
  if (!(await claim(db, key, 'vote-nudge', eveningId, null))) return 0;
  try {
    const queued = await queueEveningVoteMessages(db, eveningId, String(evening.title || 'Игровой вечер'), { nudge: true });
    await finish(db, key, { ok: true });
    return queued;
  } catch (error: any) {
    await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    return 0;
  }
}

/** 36 hours before the start (owner, 2026-10-02) the tournament announcement goes to the rating group. */
export const TOURNAMENT_ANNOUNCE_HOURS = 36;

// The club's Twitch channel (owner, 2026-10-02: chagintv); TWITCH_CHANNEL_URL overrides it.
const broadcastLink = () => String(process.env.TWITCH_CHANNEL_URL || 'https://www.twitch.tv/chagintv').trim().replace(/\/$/, '');

async function tournamentAnnouncementMedia(announcement: NonNullable<Awaited<ReturnType<typeof loadTournamentAnnouncement>>>) {
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
  return { caption, photo: await renderPngAsync(tournamentAnnounceSvg(announcement, link ? link.replace(/^https?:\/\//, '') : 'Twitch клуба')) };
}

export async function syncTournamentAnnouncementPhoto(db: DatabaseWrapper, tournamentId: string, fetchImpl: typeof fetch = fetch) {
  await ensureClubResultPostSchema(db);
  const key = `tournament-announce:${tournamentId}`;
  const post = await db.get<{ status: string }>('SELECT status FROM club_result_posts WHERE post_key = ?', [key]);
  if (post?.status !== 'sent') return 'not_published';
  const delivery = await db.get<{ target: string; result: string }>(
    "SELECT target, result FROM publication_deliveries WHERE delivery_key = ? AND status = 'accepted'",
    ['club:' + key],
  );
  const chatId = delivery && JSON.parse(delivery.target)?.chat_id;
  const messageId = delivery && JSON.parse(delivery.result)?.ids?.[0];
  if (!chatId || !messageId) throw new Error('У старого анонса не сохранился номер сообщения. Картинку нужно заменить в Telegram.');
  const announcement = await loadTournamentAnnouncement(db, tournamentId);
  if (!announcement?.players.length) throw new Error('В турнире нет подтверждённых участников');
  const { caption, photo } = await tournamentAnnouncementMedia(announcement);
  const result = await sendPublicTelegram(db, {
    method: 'editMessageMedia',
    fields: { chat_id: chatId, message_id: messageId, media: { type: 'photo', media: 'attach://photo', caption } },
    photos: [{ data: photo.toString('base64'), mime: 'image/png', name: 'tournament.png', field: 'photo' }],
  }, fetchImpl);
  if (!result.ok && !result.error?.includes('message is not modified')) throw new Error(result.error || 'Telegram не обновил картинку анонса');
  return 'updated';
}

export async function postTournamentAnnouncement(db: DatabaseWrapper, tournamentId: string, fetchImpl: typeof fetch = fetch) {
  await ensureClubResultPostSchema(db);
  const key = `tournament-announce:${tournamentId}`;
  const announcement = await loadTournamentAnnouncement(db, tournamentId);
  const tournament = await db.get<{ tournament_evening_flow: number; published_at: string | null }>(
    'SELECT tournament_evening_flow, published_at FROM tournaments WHERE id = ?', [tournamentId],
  );
  // Managed tournaments may have confirmed registrations while still being prepared.
  if (!announcement || announcement.players.length < TOURNAMENT_PLAYER_CAPACITY) return false;
  if (tournament?.tournament_evening_flow && !tournament.published_at) return false;
  if (!(await claim(db, key, 'tournament-announce', '', null))) return false;
  try {
    const { caption, photo } = await tournamentAnnouncementMedia(announcement);
    const result = await sendPhotos(db, 'TOURNAMENT', [photo], caption, fetchImpl, 'rating', undefined, undefined, { key: 'club:' + key, kind: 'club-result' }, true);
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
        AND NOT EXISTS (SELECT 1 FROM club_result_posts p WHERE p.post_key = 'tournament-announce:' || tournaments.id AND (p.status IN ('sent', 'failed', 'uncertain') OR (p.status = 'sending' AND datetime(p.updated_at) > datetime('now', '-15 minutes'))))`,
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
    const result = await sendPhotos(db, 'TOURNAMENT', [await renderPngAsync(gameBlankSvg(blank))], `🎭 «${blank.eveningTitle}» · игра №${blank.gameNumber} · ${winner}`, fetchImpl, 'rating_chat', undefined, undefined, { key: 'club:' + key, kind: 'club-result' });
    await finish(db, key, result);
    return result.ok;
  } catch (error: any) {
    await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    return false;
  }
}

/** A plain text message to a Telegram destination (the rating group, the entry channel), with the same error contract as `sendPhotos`. */
export async function sendText(db: DatabaseWrapper, destinationId: string, text: string, fetchImpl: typeof fetch, parseMode?: 'HTML', replyMarkup?: unknown, context?: PublicationContext): Promise<PublicationResult> {
  return sendTextTo(db, destinationId, text, fetchImpl, parseMode, replyMarkup, context);
}

/** Text post for an evening format: goes to every target of its kind (see clubResultTargets). */
export async function sendTextForFormat(db: DatabaseWrapper, format: unknown, text: string, fetchImpl: typeof fetch, parseMode?: 'HTML', replyMarkup?: unknown, context?: PublicationContext): Promise<PublicationResult> {
  return fanOut(clubResultTargets(format, clubPostKind(context?.key)), context, (destination, ctx) => sendTextTo(db, destination, text, fetchImpl, parseMode, replyMarkup, ctx));
}

async function sendTextTo(db: DatabaseWrapper, destinationId: string, text: string, fetchImpl: typeof fetch, parseMode?: 'HTML', replyMarkup?: unknown, context?: PublicationContext): Promise<PublicationResult> {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return { ok: false, certainty: 'rejected', temporary: true, error: 'Telegram-бот не настроен' };
  const destination = await db.get<any>('SELECT chat_id, topic_id, active FROM telegram_destinations WHERE id = ? LIMIT 1', [destinationId]).catch(() => null);
  if (!destination?.chat_id || Number(destination.active ?? 1) === 0) {
    return { ok: false, certainty: 'rejected', temporary: false, error: destinationId === 'public' ? 'Не настроен входной Telegram-канал' : 'Не настроена Telegram-группа рейтинга' };
  }
  // Markup is never cut: a slice could break a tag or an entity and Telegram would reject the whole message.
  if (parseMode && text.length > 4000) return { ok: false, certainty: 'rejected', temporary: false, error: 'Сообщение слишком длинное для Telegram' };
  const body: Record<string, unknown> = { chat_id: String(destination.chat_id), text: parseMode ? text : text.slice(0, 4000), disable_web_page_preview: true, ...(parseMode ? { parse_mode: parseMode } : {}) };
  if (TOPIC_RESULT_DESTINATIONS.has(destinationId) && destination.topic_id) body.message_thread_id = destination.topic_id;
  // The main chat of the group, not its announcements topic (owner, 2026-11-03).
  if (replyMarkup) body.reply_markup = replyMarkup;
  return sendPublicTelegram(db, { method:'sendMessage', fields:body }, fetchImpl, context);
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** The text of the official results: the top of the table (up to ten places) and the link to the full results. */
export const tournamentResultsText = (title: string, dateLabel: string, rows: Array<{ place: number; name: string; points: number }>, link: string | null) => {
  const lines = [`🏆 Итоги турнира «${title}»${dateLabel ? ` — ${dateLabel}` : ''}`, ''];
  for (const row of rows.slice(0, 10)) {
    const mark = MEDALS[row.place - 1] || `${row.place}.`;
    const points = Number.isInteger(row.points) ? String(row.points) : String(round2(row.points));
    lines.push(`${mark} ${row.name} — ${points}`);
  }
  if (rows.length > 10) lines.push(`… и ещё ${rows.length - 10}`);
  if (link) lines.push('', `Полные результаты: ${link}`);
  lines.push('', 'Поздравляем победителей и всех участников! 🖤');
  return lines.join('\n');
};

const TOURNAMENT_RESULTS_DESTINATIONS = clubResultTargets('TOURNAMENT', 'other');
const tournamentResultsKey = (tournamentId: string, destination: string) => `tournament-results:${tournamentId}:${destination}`;

/** The table and nominations pictures of a finished tournament; a failure in one never blocks the other or the text. */
async function loadTournamentPictures(db: DatabaseWrapper, tournamentId: string, title: string, dateLabel: string, empty: Set<string>): Promise<Array<['table' | 'nominations', Buffer, string]>> {
  const out: Array<['table' | 'nominations', Buffer, string]> = [];
  try {
    const { getFlexibleTournamentStandings } = await import('./flexibleTournamentStandingsService.ts');
    const { loadAvatars } = await import('./clubResultData.ts');
    const standings = (await getFlexibleTournamentStandings(db, tournamentId)).standings || [];
    const ids = standings.map((row: any) => String(row.player_id || '')).filter(Boolean);
    const avatars = await loadAvatars(db, ids).catch(() => new Map<string, string>());
    const rows = standings
      .map((row: any) => ({ place: Number(row.place || row.official_place || row.calculated_place || 0), nickname: String(row.display_name || 'Участник'), avatar: (row.player_id && avatars.get(String(row.player_id))) || null,
        value: String(round2(Number(row.total_points || 0))).replace('.', ','), detail: `игр ${Number(row.games_played || 0)} · побед ${Number(row.wins || 0)}` }))
      .filter((row: { place: number }) => row.place > 0)
      .sort((a: { place: number }, b: { place: number }) => a.place - b.place);
    if (!rows.length) empty.add('table');
    if (rows.length) out.push(['table', await renderPngAsync(tournamentTableSvg({ title, dateLabel, rows })), `📊 Итоговая таблица турнира «${title}»`]);
  } catch (error) { console.error('[TOURNAMENT RESULTS] table picture failed:', error); }
  try {
    const { internalGetNominations } = await import('./tournamentStandingsService.ts');
    const { loadAvatars } = await import('./clubResultData.ts');
    const data = await internalGetNominations(db, tournamentId);
    const nominations = data.nominations || [];
    const ids = nominations.flatMap((item: any) => (item.candidates || []).map((candidate: any) => String(candidate.player_id || ''))).filter(Boolean);
    const avatars = await loadAvatars(db, ids).catch(() => new Map<string, string>());
    const points = (candidate: any) => Number(candidate.nomination_points ?? candidate.points ?? 0);
    const items = nominations.map((item: any) => {
      const candidates = item.candidates || [];
      const winner = candidates.find((candidate: any) => String(candidate.participant_id) === String(item.winner_participant_id)) || candidates[0] || null;
      return {
        title: String(item.title || item.category), tie: Boolean(item.has_tie),
        winner: winner ? { nickname: String(winner.display_name || 'Участник'), avatar: (winner.player_id && avatars.get(String(winner.player_id))) || null, value: String(round2(points(winner))).replace('.', ',') } : null,
        others: candidates.filter((candidate: any) => candidate !== winner).slice(0, 3).map((candidate: any) => `${String(candidate.display_name || 'Участник')} ${String(round2(points(candidate))).replace('.', ',')}`),
      };
    }).filter((item: { winner: unknown }) => item.winner);
    if (!items.length) empty.add('nominations');
    if (items.length) out.push(['nominations', await renderPngAsync(tournamentNominationsSvg({ title, dateLabel, items })), `🏅 Номинации турнира «${title}»`]);
  } catch (error) { console.error('[TOURNAMENT RESULTS] nominations picture failed:', error); }
  return out;
}

/**
 * The official results of a tournament go to the rating group only (owner, 2026-11-02: the entry channel «Анонсы» is for announcements; before that, 2026-10-05, they also went there) once the organizer has published them. Each destination is claimed on its own, so a retry never posts twice.
 */
export async function postTournamentResults(db: DatabaseWrapper, tournamentId: string, fetchImpl: typeof fetch = fetch) {
  await ensureClubResultPostSchema(db);
  const tournament = await db.get<any>('SELECT id, title, date, status, public_token, results_published_at FROM tournaments WHERE id = ?', [tournamentId]);
  if (!tournament || tournament.status !== 'completed' || !tournament.results_published_at) return false;
  const { getFlexibleTournamentStandings } = await import('./flexibleTournamentStandingsService.ts');
  const standings = await getFlexibleTournamentStandings(db, tournamentId);
  const rows = (standings.standings || [])
    .map((row: any) => ({ place: Number(row.place || row.official_place || row.calculated_place || 0), name: String(row.display_name || 'Участник'), points: Number(row.total_points || 0) }))
    .filter((row: { place: number }) => row.place > 0)
    .sort((a: { place: number }, b: { place: number }) => a.place - b.place);
  if (!rows.length) return false;
  let link: string | null = null;
  if (tournament.public_token) {
    try { link = (await import('./publicAppOriginService.ts')).buildTrustedPublicAppUrl(`/tournaments/results/${encodeURIComponent(String(tournament.public_token))}`); } catch { link = null; }
  }
  const dateLabel = tournament.date ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }).format(new Date(String(tournament.date))) : '';
  const text = tournamentResultsText(String(tournament.title || 'Турнир 2LA Noire'), dateLabel.replace(/\s*г\.?$/, ''), rows, link);
  let posted = false;
  for (const destination of TOURNAMENT_RESULTS_DESTINATIONS) {
    const key = tournamentResultsKey(tournamentId, destination);
    if (!(await claim(db, key, 'tournament-results', '', null))) continue;
    try {
      const result = await sendText(db, destination, text, fetchImpl, undefined, undefined, { key: 'club:' + key, kind: 'club-result' });
      await finish(db, key, result);
      if (result.ok) posted = true;
    } catch (error: any) {
      await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    }
  }
  // The full table and the nominations as pictures (owner, 2026-11-10), to the same places, after the text.
  const empty = new Set<string>();
  const pictures = await loadTournamentPictures(db, tournamentId, String(tournament.title || 'Турнир 2LA Noire'), dateLabel.replace(/\s*г\.?$/, ''), empty);
  // Nothing to draw (no games yet): recorded as done, so the scan does not look again every minute.
  for (const kind of empty) for (const destination of TOURNAMENT_RESULTS_DESTINATIONS) {
    const key = `tournament-${kind}:${tournamentId}:${destination}`;
    if (await claim(db, key, `tournament-${kind}`, '', null)) await finish(db, key, { ok: true });
  }
  for (const [kind, png, caption] of pictures) {
    for (const destination of TOURNAMENT_RESULTS_DESTINATIONS) {
      const key = `tournament-${kind}:${tournamentId}:${destination}`;
      if (!(await claim(db, key, `tournament-${kind}`, '', null))) continue;
      try {
        const result = await sendPhotos(db, null, [png], caption, fetchImpl, destination, 'image/png', undefined, { key: 'club:' + key, kind: 'club-result' });
        await finish(db, key, result);
        if (result.ok) posted = true;
      } catch (error: any) {
        await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
      }
    }
  }
  return posted;
}

/** Retries the results of tournaments published in the last day whose posts are not yet sent (or never tried). */
async function runTournamentResultPosts(db: DatabaseWrapper, fetchImpl: typeof fetch, now: number) {
  const candidates = await db.all<any>(
    `SELECT id FROM tournaments WHERE status = 'completed' AND results_published_at IS NOT NULL AND datetime(results_published_at) >= datetime(?)`,
    [new Date(now - 24 * 3_600_000).toISOString()],
  ).catch(() => []);
  let posted = 0;
  for (const row of candidates) {
    const done = await db.get<any>(
      `SELECT COUNT(*) AS c FROM club_result_posts WHERE post_key IN (${TOURNAMENT_RESULTS_DESTINATIONS.map(() => '?').join(', ')}) AND status IN ('sent', 'failed', 'uncertain')`,
      TOURNAMENT_RESULTS_DESTINATIONS.map((destination) => tournamentResultsKey(String(row.id), destination)),
    );
    const picturesDone = await db.get<any>(
      `SELECT COUNT(*) AS c FROM club_result_posts WHERE post_key IN (${['table', 'nominations'].flatMap(() => TOURNAMENT_RESULTS_DESTINATIONS.map(() => '?')).join(', ')}) AND status IN ('sent', 'failed', 'uncertain')`,
      ['table', 'nominations'].flatMap((kind) => TOURNAMENT_RESULTS_DESTINATIONS.map((destination) => `tournament-${kind}:${String(row.id)}:${destination}`)),
    );
    if (Number(done?.c || 0) >= TOURNAMENT_RESULTS_DESTINATIONS.length && Number(picturesDone?.c || 0) >= 2 * TOURNAMENT_RESULTS_DESTINATIONS.length) continue;
    try { if (await postTournamentResults(db, String(row.id), fetchImpl)) posted += 1; } catch (error) { console.error('[TOURNAMENT RESULTS] post failed:', row.id, error); }
  }
  return posted;
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
     WHERE ${tournamentGameCompletedSql('g')} AND t.status IN ('active', 'correction', 'completed')
       AND g.completed_at IS NOT NULL AND datetime(g.completed_at) >= datetime(?)
     ORDER BY g.completed_at
  `, [since]).catch(() => []);
  for (const game of games) {
    try {
      if (await postTournamentGameBlank(db, String(game.id), fetchImpl)) handled += 1;
      const post = await db.get<any>('SELECT status FROM club_result_posts WHERE post_key = ?', [`tournament-game:${game.id}`]);
      const waited = now - new Date(String(game.completed_at)).getTime();
      if (!['sent', 'failed', 'uncertain'].includes(String(post?.status || '')) && waited < SEAT_MESSAGE_WAIT_MS) continue;
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
