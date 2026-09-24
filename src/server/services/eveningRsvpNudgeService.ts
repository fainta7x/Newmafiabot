import type { DatabaseWrapper } from '../../db/index.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';

/**
 * Personal evening messages driven by the player's answer (user-approved 2026-09-24):
 * - no answer  -> invitation with answer buttons, asked again within 24 h of the start;
 * - «иду»      -> only a reminder 24 h before;
 * - «не иду»   -> nothing until the next announcement;
 * - «думаю»    -> from 24 h before: «что решил?» with buttons and a choice when to ask again;
 * - «позже»    -> asked to pick the games they will make.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
export const RSVP_FOLLOWUP_OPTIONS = ['morning', '3h'] as const;
export type RsvpFollowupOption = (typeof RSVP_FOLLOWUP_OPTIONS)[number];

type Button = { text: string; callback_data?: string; web_app?: { url: string }; url?: string };

export async function ensureEveningRsvpFollowupSchema(db: DatabaseWrapper) {
  const columns = await db.all<any>('PRAGMA table_info(evening_participants)');
  if (columns.length && !columns.some((column: any) => String(column.name) === 'rsvp_followup_at')) {
    await db.run('ALTER TABLE evening_participants ADD COLUMN rsvp_followup_at TEXT');
  }
}

const eveningPath = (eveningId: string) => `/player/events/${encodeURIComponent(eveningId)}`;
const appUrl = (path: string) => {
  const base = String(process.env.PLAYER_APP_URL || process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '').replace(/\/player$/, '');
  return base ? `${base}${path}` : null;
};
const appButton = (eveningId: string, text: string): Button[] => {
  const url = appUrl(eveningPath(eveningId));
  return url ? [{ text, web_app: { url } }] : [];
};
// Same callback contract as the bot's crm_evening_keyboard.py («evr:<evening>:<status>»).
const answerRows = (eveningId: string, statuses: Array<[string, string]>) => {
  const buttons = statuses.map(([status, text]) => ({ text, callback_data: `evr:${eveningId}:${status}` }));
  const rows: Button[][] = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return rows;
};
const ALL_ANSWERS: Array<[string, string]> = [['going', '✅ Буду'], ['late', '⏳ Приду позже'], ['thinking', '🤔 Пока думаю'], ['declined', '❌ Не буду']];
const DECISION_ANSWERS: Array<[string, string]> = [['going', '✅ Буду'], ['late', '⏳ Приду позже'], ['declined', '❌ Не буду']];

const moscowTime = (ms: number) => new Date(ms).toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const moscowHourStart = (startsAtMs: number, hour: number) => {
  const day = new Date(startsAtMs).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
  return new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+03:00`).getTime();
};

/** When to ask a «думаю» player again; the morning option falls back to 3 h before if the morning has passed. */
export function rsvpFollowupAt(startsAt: string, option: RsvpFollowupOption, now = Date.now()): string | null {
  const start = new Date(startsAt).getTime();
  if (!Number.isFinite(start)) return null;
  const threeHours = start - 3 * HOUR_MS;
  const morning = moscowHourStart(start, 10);
  // «Утром» falls back to 3 h before once the morning has passed; a choice whose time is gone is rejected
  // (the bot then asks for an answer now) instead of firing an immediate «you asked me to remind you».
  const at = option === 'morning' && morning > now && morning < threeHours ? morning : threeHours;
  return at > now ? new Date(at).toISOString() : null;
}

export async function queueEveningRsvpNudges(db: DatabaseWrapper, now = Date.now()) {
  await ensureEveningRsvpFollowupSchema(db);
  // Older databases may not have the announcement tracking or slot tables yet.
  const tables = new Set((await db.all<any>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((table: any) => String(table.name)));
  const announcedSql = tables.has('evening_announcement_dm_tracking')
    ? 'EXISTS(SELECT 1 FROM evening_announcement_dm_tracking t WHERE t.evening_id = e.id AND t.player_id = ep.player_id AND t.first_message_id IS NOT NULL)'
    : '0';
  const gamesSql = tables.has('evening_slot_registrations')
    ? '(SELECT COUNT(*) FROM evening_slot_registrations r WHERE r.participant_id = ep.id)'
    : '0';
  const rows = await db.all<any>(`
    SELECT ep.id AS participant_id, ep.player_id, ep.response_status, ep.rsvp_followup_at,
           e.id AS evening_id, e.title, e.starts_at, e.venue,
           ${announcedSql} AS announced_by_bot,
           ${gamesSql} AS selected_games
      FROM evening_participants ep
      JOIN players p ON p.id = ep.player_id
      JOIN game_evenings e ON e.id = ep.evening_id
     WHERE e.status IN ('published', 'active') AND e.settled_at IS NULL
       AND COALESCE(p.contact_status, p.lifecycle_status, 'normal') NOT IN ('blocked', 'archived', 'inactive')
       AND COALESCE(ep.attendance_status, 'pending') = 'pending'
       AND datetime(e.starts_at) > datetime(?)
       AND datetime(e.starts_at) <= datetime(?)
  `, [new Date(now).toISOString(), new Date(now + 7 * DAY_MS).toISOString()]);

  let queued = 0;
  for (const row of rows) {
    const playerId = String(row.player_id);
    const eveningId = String(row.evening_id);
    const response = String(row.response_status || 'unanswered');
    const startsAt = new Date(String(row.starts_at)).getTime();
    if (!Number.isFinite(startsAt)) continue;
    const untilStart = startsAt - now;
    const title = String(row.title || 'Игровой вечер');
    const header = `${title}${row.venue ? ` · ${String(row.venue)}` : ''}\n${moscowTime(startsAt)}`;
    const send = async (key: string, eventType: string, text: string, rows: Button[][]) => {
      const result = await queuePersonalNotification(db, {
        notificationKey: key, playerId, eventType, entityId: eveningId, text,
        actionPath: eveningPath(eveningId),
        telegramReplyMarkup: { inline_keyboard: rows.filter((items) => items.length) },
      });
      if (result.created) queued += 1;
    };

    if (response === 'unanswered') {
      if (!Number(row.announced_by_bot)) {
        await send(`invite:${eveningId}:${playerId}`, 'invitation',
          `💬 Ты приглашён на игровой вечер\n${header}\nОтветь, пожалуйста, — так мы соберём столы.`,
          [...answerRows(eveningId, ALL_ANSWERS), appButton(eveningId, '🎯 Выбрать игры')]);
      }
      if (untilStart <= DAY_MS) {
        await send(`rsvp-nudge:24h:${eveningId}:${playerId}`, 'invitation_nudge',
          `⏳ Вечер уже скоро, а ответа от тебя нет\n${header}\nНажми, как получится — это займёт секунду.`,
          [...answerRows(eveningId, ALL_ANSWERS)]);
      }
      continue;
    }

    if ((response === 'going' || response === 'late') && untilStart <= DAY_MS) {
      const needsGames = response === 'late' && !Number(row.selected_games);
      await send(`reminder:24h:${eveningId}:${playerId}`, 'evening_reminder',
        `⏰ Напоминаем: ${response === 'late' ? 'ты придёшь позже' : 'ты идёшь'} на игровой вечер\n${header}${needsGames ? '\nВыбери игры, на которые успеешь, — так мы правильно соберём столы.' : ''}`,
        [appButton(eveningId, needsGames ? '🎯 Выбрать игры' : '📍 Открыть вечер')]);
    }

    if (response === 'late' && !Number(row.selected_games)) {
      await send(`late-games:${eveningId}:${playerId}`, 'evening_pick_games',
        `🎯 Ты придёшь позже — выбери игры, на которые успеешь\n${header}\nТак организатор поймёт, в какие столы тебя ждать.`,
        [appButton(eveningId, '🎯 Выбрать игры')]);
    }

    if (response === 'thinking') {
      if (untilStart <= DAY_MS) {
        await send(`rsvp-thinking:24h:${eveningId}:${playerId}`, 'thinking_followup',
          `🤔 Что решил насчёт вечера?\n${header}\nЕсли пока не знаешь — выбери, когда спросить ещё раз.`,
          [...answerRows(eveningId, DECISION_ANSWERS),
            [{ text: '⏰ Спроси утром', callback_data: `evq:${eveningId}:morning` }, { text: '⏰ Спроси за 3 часа', callback_data: `evq:${eveningId}:3h` }]]);
      }
      const followupAt = row.rsvp_followup_at ? new Date(String(row.rsvp_followup_at)).getTime() : NaN;
      if (Number.isFinite(followupAt) && followupAt <= now) {
        await send(`rsvp-thinking:followup:${eveningId}:${playerId}:${String(row.rsvp_followup_at)}`, 'thinking_followup',
          `🤔 Ты просил напомнить: идёшь на вечер?\n${header}`,
          [...answerRows(eveningId, DECISION_ANSWERS)]);
      }
    }
  }
  return queued;
}
