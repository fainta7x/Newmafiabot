import type { DatabaseWrapper } from '../../db/index.ts';
import { ensurePokerTournamentSchema } from '../../db/ensurePokerTournamentSchema.ts';
import type { PokerTournamentConfig } from '../../shared/pokerTournament.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { createVkWallPost, getVkIntegrationStatus } from './vkPublishingService.ts';

/**
 * Poker tournament announcements (owner, 2026-10-11): the organizer picks where a new tournament is announced
 * (club Telegram group, public channel, VK, personal messages to club players), and everyone registered gets a
 * reminder shortly before the start. Every send has its own record, so a retry never posts anything twice.
 */
export const POKER_TOURNAMENT_REMINDER_MINUTES = 30;

export type PokerTournamentAnnounce = { telegram_channel: boolean; club_group: boolean; vk: boolean; bot_dm: boolean };
type Channel = keyof PokerTournamentAnnounce;
type Row = {
  id: string; title: string; description: string; organizer_player_id: string | null; status: string; start_at: string;
  config_json: string; announce_json: string | null; announced_at: string | null;
};
type Dependencies = { fetchImpl?: typeof fetch; createVkPost?: typeof createVkWallPost; queueNotification?: typeof queuePersonalNotification };

export const POKER_ANNOUNCE_CHANNELS: Channel[] = ['telegram_channel', 'club_group', 'vk', 'bot_dm'];

export function parsePokerTournamentAnnounce(raw: unknown): PokerTournamentAnnounce | null {
  const source = (typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw) as Record<string, unknown> | null;
  if (!source || typeof source !== 'object') return null;
  const result = Object.fromEntries(POKER_ANNOUNCE_CHANNELS.map((channel) => [channel, source[channel] === true || source[channel] === 1])) as PokerTournamentAnnounce;
  return POKER_ANNOUNCE_CHANNELS.some((channel) => result[channel]) ? result : null;
}

const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const appBase = () => String(process.env.PLAYER_APP_URL || process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
export const pokerTournamentActionPath = (id: string) => `/player/events?event=${encodeURIComponent(id)}`;
const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

export function pokerTournamentAnnouncementText(row: Pick<Row, 'id' | 'title' | 'description' | 'start_at' | 'config_json'>, html = false) {
  const e = html ? escapeHtml : (value: unknown) => String(value ?? '');
  const config = JSON.parse(row.config_json) as PokerTournamentConfig;
  const lines = [`🃏 ${e(row.title)}`, '', `Старт: ${when(row.start_at)} (МСК)`, 'Участие бесплатное, фишки выдаёт клуб'];
  if (config.prizeTokens.length) lines.push(`🏆 Призы жетонами: ${config.prizeTokens.map((value, index) => `${index + 1} место — ${value}`).join(', ')}`);
  lines.push(config.maxPlayers ? `👥 От ${config.minPlayers} до ${config.maxPlayers} игроков` : `👥 От ${config.minPlayers} игроков`);
  if (row.description) lines.push('', e(row.description));
  const link = appBase() ? `${appBase()}${pokerTournamentActionPath(row.id)}` : '';
  if (link) lines.push('', `Записаться: ${link}`);
  return lines.join('\n');
}

export const pokerTournamentReminderText = (row: Pick<Row, 'title' | 'start_at'>) =>
  `Покерный турнир «${row.title}» начнётся в ${new Date(row.start_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })} по Москве. Заходить в приложение за пару минут до старта.`;

async function claim(db: DatabaseWrapper, id: string, channel: Channel, targetKey: string) {
  const existing = await db.get<{ status: string }>('SELECT status FROM poker_tournament_publications WHERE tournament_id = ? AND channel = ? AND target_key = ?', [id, channel, targetKey]);
  if (existing && ['sending', 'sent', 'uncertain'].includes(existing.status)) return false;
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO poker_tournament_publications (tournament_id, channel, target_key, status, attempted_at) VALUES (?, ?, ?, 'sending', ?)
     ON CONFLICT(tournament_id, channel, target_key) DO UPDATE SET status = 'sending', last_error = NULL, attempted_at = excluded.attempted_at`,
    [id, channel, targetKey, now],
  );
  return true;
}

async function finish(db: DatabaseWrapper, id: string, channel: Channel, targetKey: string, status: 'sent' | 'failed' | 'uncertain', externalId?: string | null, error?: string | null) {
  const now = new Date().toISOString();
  await db.run(
    'UPDATE poker_tournament_publications SET status = ?, external_id = ?, last_error = ?, sent_at = ?, attempted_at = ? WHERE tournament_id = ? AND channel = ? AND target_key = ?',
    [status, externalId || null, error ? String(error).slice(0, 1000) : null, status === 'sent' ? now : null, now, id, channel, targetKey],
  );
}

type Outcome = 'sent' | 'skipped' | 'failed' | 'uncertain' | 'not_configured';

async function postToTelegram(db: DatabaseWrapper, row: Row, destinationId: 'public' | 'club', channel: Channel, fetchImpl: typeof fetch): Promise<Outcome> {
  const destination = await db.get<{ id: string; chat_id: string | null; topic_id: string | number | null; active: number }>('SELECT id, chat_id, topic_id, active FROM telegram_destinations WHERE id = ?', [destinationId]);
  if (!destination?.active || !destination.chat_id) return 'not_configured';
  const key = String(destination.id);
  if (!(await claim(db, row.id, channel, key))) return 'skipped';
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) { await finish(db, row.id, channel, key, 'failed', null, 'TELEGRAM_BOT_TOKEN is not configured'); return 'failed'; }
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: String(destination.chat_id), message_thread_id: destination.topic_id || undefined, text: pokerTournamentAnnouncementText(row, true), parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const body: any = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) { await finish(db, row.id, channel, key, 'failed', null, body.description || `Telegram HTTP ${response.status}`); return 'failed'; }
    await finish(db, row.id, channel, key, 'sent', String(body.result?.message_id || ''));
    return 'sent';
  } catch (error: any) {
    await finish(db, row.id, channel, key, 'uncertain', null, error?.message || String(error));
    return 'uncertain';
  }
}

async function postToVk(db: DatabaseWrapper, row: Row, deps: Dependencies): Promise<Outcome> {
  const status = getVkIntegrationStatus();
  const groupId = status.group_id || '';
  if (!status.configured || !groupId) return 'not_configured';
  if (!(await claim(db, row.id, 'vk', groupId))) return 'skipped';
  try {
    const post = await (deps.createVkPost || createVkWallPost)({ groupId, message: pokerTournamentAnnouncementText(row, false) });
    await finish(db, row.id, 'vk', groupId, 'sent', String(post.postId));
    return 'sent';
  } catch (error: any) {
    const state = error?.vkDefinite === true ? 'failed' : 'uncertain';
    await finish(db, row.id, 'vk', groupId, state, null, error?.message || String(error));
    return state;
  }
}

async function clubAudience(db: DatabaseWrapper): Promise<string[]> {
  const rows = await db.all<{ id: string }>("SELECT id FROM players WHERE club_stage = 'CLUB_PLAYER' AND COALESCE(contact_status, lifecycle_status, 'normal') NOT IN ('blocked', 'archived', 'inactive', 'paused') AND COALESCE(from_other_city, 0) = 0");
  return rows.map((row) => String(row.id));
}

async function messagePlayers(db: DatabaseWrapper, row: Row, deps: Dependencies): Promise<Outcome> {
  const queue = deps.queueNotification || queuePersonalNotification;
  let failed = false;
  for (const playerId of await clubAudience(db)) {
    if (playerId === String(row.organizer_player_id)) continue;
    if (!(await claim(db, row.id, 'bot_dm', playerId))) continue;
    try {
      await queue(db, {
        notificationKey: `poker-tournament:announce:${row.id}:${playerId}`, playerId, eventType: 'poker_tournament_announcement',
        entityId: row.id, text: pokerTournamentAnnouncementText(row, false), actionPath: pokerTournamentActionPath(row.id),
      });
      await finish(db, row.id, 'bot_dm', playerId, 'sent');
    } catch (error: any) {
      failed = true;
      await finish(db, row.id, 'bot_dm', playerId, 'failed', null, error?.message || String(error));
    }
  }
  return failed ? 'failed' : 'sent';
}

/** Posts the announcement to the chosen channels. Safe to repeat: finished channels are skipped, failed ones are tried again. */
export async function announcePokerTournament(db: DatabaseWrapper, tournamentId: string, deps: Dependencies = {}) {
  await ensurePokerTournamentSchema(db);
  const row = await db.get<Row>('SELECT * FROM poker_tournaments WHERE id = ?', [tournamentId]);
  const announce = row ? parsePokerTournamentAnnounce(row.announce_json) : null;
  if (!row || !announce || row.status !== 'registration' || row.announced_at) return null;
  const fetchImpl = deps.fetchImpl || fetch;
  const results: Partial<Record<Channel, Outcome>> = {};
  if (announce.telegram_channel) results.telegram_channel = await postToTelegram(db, row, 'public', 'telegram_channel', fetchImpl);
  if (announce.club_group) results.club_group = await postToTelegram(db, row, 'club', 'club_group', fetchImpl);
  if (announce.vk) results.vk = await postToVk(db, row, deps);
  if (announce.bot_dm) results.bot_dm = await messagePlayers(db, row, deps);
  // Done once no channel is waiting for a retry; a channel that is not configured yet is retried too.
  if (!Object.values(results).some((outcome) => outcome === 'failed' || outcome === 'not_configured')) {
    await db.run('UPDATE poker_tournaments SET announced_at = ? WHERE id = ? AND announced_at IS NULL', [new Date().toISOString(), row.id]);
  }
  return results;
}

/**
 * Everyone registered gets one reminder shortly before the start. There is no tournament-wide "done" mark: the
 * per-player notification key makes a repeat harmless, so a player who registers inside the window is reminded too.
 */
export async function remindPokerTournament(db: DatabaseWrapper, row: Row, nowMs = Date.now(), deps: Dependencies = {}) {
  if (row.status !== 'registration') return false;
  const untilStart = Date.parse(row.start_at) - nowMs;
  if (untilStart > POKER_TOURNAMENT_REMINDER_MINUTES * 60_000 || untilStart <= 0) return false;
  const queue = deps.queueNotification || queuePersonalNotification;
  const players = await db.all<{ player_id: string }>("SELECT player_id FROM poker_tournament_entries WHERE tournament_id = ? AND status = 'registered'", [row.id]);
  for (const { player_id } of players) {
    await queue(db, {
      notificationKey: `poker-tournament:reminder:${row.id}:${player_id}`, playerId: String(player_id), eventType: 'poker_tournament_reminder',
      entityId: row.id, text: pokerTournamentReminderText(row), actionPath: '/player',
    });
  }
  return true;
}

const ANNOUNCE_RETRY_MS = 5 * 60_000;
const lastAnnounceAttempt = new Map<string, number>();

/** Called by the tournament scheduler: retries announcements that did not get out (not more often than every five minutes) and sends due reminders. */
export async function runPokerTournamentAnnouncements(db: DatabaseWrapper, nowMs = Date.now(), deps: Dependencies = {}) {
  await ensurePokerTournamentSchema(db);
  const rows = await db.all<Row>("SELECT * FROM poker_tournaments WHERE status = 'registration'");
  for (const row of rows) {
    if (row.announce_json && !row.announced_at && nowMs - (lastAnnounceAttempt.get(row.id) ?? 0) >= ANNOUNCE_RETRY_MS) {
      lastAnnounceAttempt.set(row.id, nowMs);
      await announcePokerTournament(db, row.id, deps);
    }
    await remindPokerTournament(db, row, nowMs, deps);
  }
}
