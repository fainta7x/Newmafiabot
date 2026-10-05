import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { loadClubOrder, type ClubOrderAction, type ClubOrderItem } from './clubOrderService.ts';
import { calculateProfileCompleteness } from './playerProfileIntegrityService.ts';
import { closeTasksOfEndedEvenings } from './eveningCloseoutService.ts';
import { PLAYER_VISITS_SQL, PLAYER_VISIT_STATS_SQL } from './playerVisitsService.ts';
import { loadEveningShortfall } from './eveningShortfallService.ts';
import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';
import { CURATOR_AREAS, curatorAreaLabel, normalizeCuratorAreas, type CuratorArea } from '../../lib/curatorAreas.ts';
import { getPlayerStatusSegment } from '../../lib/playerActivitySegments.ts';
import { membershipOfPlayer } from '../../lib/playerAccess.ts';
import { getRepositoryPlayerAvatarAsset } from '../../lib/playerAvatarManifest.ts';

/**
 * «Дела» (owner, 2026-09-30: «возьми полностью в проработку логику, навигацию, задачи, интерфейс»).
 * One list instead of «Задачи» + «Порядок в клубе». Every item says why it matters and has one action;
 * the order is computed from time and impact, not from a hand-set priority. Work about many players is
 * one item with a list (no task per player per field). An item disappears when the problem is fixed,
 * a person disappears once the organizer marks «Написал», and any item can be put off.
 *
 * Owner thresholds (2026-09-30): write to a regular after 14 days without a visit (2 Fridays), to an
 * occasional player after 28 days (4 Fridays), to someone who stopped coming once in 60 days, and ask a
 * novice about the first evening. Profile gaps are the ones the player sees on their own profile banner.
 */
export type AgendaGroup = 'now' | 'week' | 'later';
export type AgendaPerson = {
  player_id: string;
  nickname: string;
  detail?: string;
  telegram_url?: string | null;
  vk_url?: string | null;
};
export type AgendaAction = ClubOrderAction | { type: 'task'; task_id: string };
export type AgendaItem = {
  id: string;
  group: AgendaGroup;
  kind: string;
  title: string;
  why: string;
  action?: AgendaAction;
  action_label?: string;
  people?: AgendaPerson[];
  people_total?: number;
  /** A person item: «Написал» records the contact under this reason. */
  contact_reason?: ContactReason;
  task_id?: string;
  due_at?: string | null;
  can_complete?: boolean;
  dismiss_label?: string;
};
export type ContactReason = 'absent_regular' | 'absent_sometimes' | 'stopped' | 'profile' | 'novice_feedback' | 'fill' | 'thinking' | 'curator';

export const AGENDA_GROUP_LABELS: Record<AgendaGroup, string> = {
  now: 'Срочно',
  week: 'На этой неделе',
  later: 'Гигиена клуба',
};

const DAY = 86_400_000;
const PEOPLE_LIMIT = 30;
export const ABSENCE_DAYS = { regular: 14, sometimes: 28, stopped: 60 } as const;
/** «Добор» starts this many days before the evening (owner, 2026-09-30). */
export const FILL_DAYS = 3;
/** A curator's direction counts as quiet after this many days without anything done or a talk. */
export const CURATOR_QUIET_DAYS = 14;
const CONTACT_QUIET_DAYS: Record<ContactReason, number> = {
  absent_regular: ABSENCE_DAYS.regular,
  absent_sometimes: ABSENCE_DAYS.sometimes,
  stopped: ABSENCE_DAYS.stopped,
  profile: 14,
  novice_feedback: 365,
  fill: 3,
  thinking: 2,
  curator: CURATOR_QUIET_DAYS,
};
const iso = (ms: number) => new Date(ms).toISOString();
const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10; const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};
const players = (n: number) => `${n} ${plural(n, 'игрок', 'игрока', 'игроков')}`;
const dayLabel = (value: unknown) => {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
};
export const MEMBER_SQL = `COALESCE(p.lifecycle_status, 'normal') NOT IN ('archived', 'merged', 'blocked', 'guest_placeholder', 'legacy_guest_migrated')
  AND COALESCE(p.source, '') <> 'legacy_guest_migrated'`;
// Automation tasks replaced by grouped items; they are no longer created and old open ones are closed once.
const REPLACED_TASK_PREFIXES = ['profile-missing:', 'lapsed-return:'];
const REPLACED_MIGRATION = '2026-09-agenda-replaces-player-tasks';

export async function ensureAgendaSchema(db: DatabaseWrapper) {
  await db.exec(`CREATE TABLE IF NOT EXISTS organizer_agenda_snoozes (item_id TEXT PRIMARY KEY, until TEXT NOT NULL, created_at TEXT NOT NULL)`);
  await db.run('CREATE TABLE IF NOT EXISTS app_data_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  if (!(await db.get('SELECT id FROM app_data_migrations WHERE id = ?', [REPLACED_MIGRATION]))) {
    const now = new Date().toISOString();
    for (const prefix of REPLACED_TASK_PREFIXES) {
      await db.run(
        `UPDATE organizer_tasks SET status = 'cancelled', updated_at = ? WHERE status NOT IN ('done', 'cancelled') AND automation_key LIKE ?`,
        [now, `${prefix}%`],
      );
    }
    await db.run('INSERT OR IGNORE INTO app_data_migrations (id, applied_at) VALUES (?, ?)', [REPLACED_MIGRATION, now]);
  }
}

async function contactLinks(db: DatabaseWrapper, ids: string[]) {
  const links = new Map<string, { telegram_url: string | null; vk_url: string | null }>();
  if (!ids.length) return links;
  const marks = ids.map(() => '?').join(',');
  const rows = await db.all<any>(`SELECT id, telegram_username FROM players WHERE id IN (${marks})`, ids);
  const vkTable = await db.get<any>("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'player_external_identities'");
  const vk = vkTable
    ? new Map((await db.all<any>(`SELECT player_id, external_user_id, screen_name FROM player_external_identities WHERE platform = 'vk' AND player_id IN (${marks})`, ids))
      .map((row: any) => [String(row.player_id), `https://vk.com/${row.screen_name || `id${row.external_user_id}`}`]))
    : new Map<string, string>();
  for (const row of rows) {
    const username = String(row.telegram_username || '').replace(/^@/, '').trim();
    links.set(String(row.id), { telegram_url: username ? `https://t.me/${username}` : null, vk_url: vk.get(String(row.id)) || null });
  }
  return links;
}

async function withLinks(db: DatabaseWrapper, people: AgendaPerson[]) {
  const links = await contactLinks(db, people.map((person) => person.player_id));
  return people.map((person) => ({ ...person, ...(links.get(person.player_id) || { telegram_url: null, vk_url: null }) }));
}

/** Players written to about this reason recently are left out of the list. */
async function recentlyContacted(db: DatabaseWrapper, reason: ContactReason, now: number) {
  const rows = await db.all<any>(
    `SELECT DISTINCT player_id FROM player_activities WHERE type = 'contact' AND outcome = ? AND datetime(occurred_at) >= datetime(?)`,
    [`agenda:${reason}`, iso(now - CONTACT_QUIET_DAYS[reason] * DAY)],
  );
  return new Set(rows.map((row: any) => String(row.player_id)));
}

async function absenceItems(db: DatabaseWrapper, now: number): Promise<AgendaItem[]> {
  const rows = await db.all<any>(`
    SELECT p.id, p.nickname, p.club_role, p.attends_sometimes, p.stopped_attending, p.from_other_city, p.contact_status, p.pause_reason,
           v.last_visit
      FROM players p
      JOIN (${PLAYER_VISIT_STATS_SQL}) v ON v.player_id = CAST(p.id AS TEXT)
     WHERE ${MEMBER_SQL} AND COALESCE(p.contact_status, 'normal') <> 'blocked'
       AND datetime(v.last_visit) < datetime(?)`, [iso(now - ABSENCE_DAYS.regular * DAY)]);
  // Someone already signed up for a coming evening needs no message.
  const coming = new Set((await db.all<any>(
    `SELECT DISTINCT ep.player_id FROM evening_participants ep JOIN game_evenings e ON e.id = ep.evening_id
      WHERE datetime(e.starts_at) >= datetime(?) AND e.status IN ('published', 'active')
        AND (ep.response_status IN ('going', 'late') OR ep.registration_status IN ('going', 'late', 'registered', 'confirmed'))`,
    [iso(now - 6 * 3_600_000)],
  )).map((row: any) => String(row.player_id)));
  const buckets: Record<'absent_regular' | 'absent_sometimes' | 'stopped', AgendaPerson[]> = { absent_regular: [], absent_sometimes: [], stopped: [] };
  const quiet = {
    absent_regular: await recentlyContacted(db, 'absent_regular', now),
    absent_sometimes: await recentlyContacted(db, 'absent_sometimes', now),
    stopped: await recentlyContacted(db, 'stopped', now),
  };
  for (const row of rows) {
    const id = String(row.id);
    if (coming.has(id) || Number(row.from_other_city || 0) === 1) continue;
    const days = Math.floor((now - new Date(String(row.last_visit)).getTime()) / DAY);
    const stopped = Number(row.stopped_attending || 0) === 1;
    // Someone paused by the organizer for another reason is not written to.
    if (!stopped && String(row.contact_status || 'normal') === 'paused') continue;
    const bucket = stopped ? 'stopped'
      : membershipOfPlayer(row) === 'guest' ? (days >= ABSENCE_DAYS.sometimes ? 'absent_sometimes' : null)
        : 'absent_regular';
    if (!bucket || quiet[bucket].has(id)) continue;
    buckets[bucket].push({ player_id: id, nickname: String(row.nickname || 'Без ника'), detail: `не был ${days} дн. · ${dayLabel(row.last_visit)}` });
  }
  const items: AgendaItem[] = [];
  const add = async (reason: 'absent_regular' | 'absent_sometimes' | 'stopped', group: AgendaGroup, title: string, why: string) => {
    const people = buckets[reason];
    if (!people.length) return;
    items.push({
      id: `people:${reason}`, group, kind: reason, title: `${title} · ${people.length}`, why,
      people: await withLinks(db, people.slice(0, PEOPLE_LIMIT)), people_total: people.length, contact_reason: reason,
    });
  };
  await add('absent_regular', 'week', 'Давно не были: постоянные', `${players(buckets.absent_regular.length)} пропустили больше двух вечеров подряд. Напиши и позови на ближайший — после «Написал» игрок уйдёт из списка на ${ABSENCE_DAYS.regular} дней.`);
  await add('absent_sometimes', 'later', 'Давно не были: приходят иногда', `Не были больше четырёх вечеров. Короткое приглашение раз в месяц держит их в клубе.`);
  await add('stopped', 'later', 'Перестали ходить: позвать вернуться', `Раз в два месяца можно пригласить снова — вдруг планы поменялись. Бот им сам не пишет.`);
  return items;
}

async function profileItem(db: DatabaseWrapper, now: number): Promise<AgendaItem[]> {
  const rows = await db.all<any>(`
    SELECT p.*,
           EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = p.id) AS has_db_avatar,
           EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = p.id) AS avatar_suppressed
      FROM players p
     WHERE ${MEMBER_SQL} AND COALESCE(p.contact_status, 'normal') NOT IN ('blocked', 'paused')
       AND COALESCE(p.stopped_attending, 0) = 0
     ORDER BY p.nickname COLLATE NOCASE`);
  // Every club player (owner, 2026-09-30), regular players first.
  rows.sort((left: any, right: any) => (SEGMENT_ORDER[getPlayerStatusSegment(left)] ?? 9) - (SEGMENT_ORDER[getPlayerStatusSegment(right)] ?? 9));
  const quiet = await recentlyContacted(db, 'profile', now);
  const people: AgendaPerson[] = [];
  for (const row of rows) {
    if (quiet.has(String(row.id))) continue;
    // The same check as the player's own profile banner (repository avatars count as a photo).
    row.has_repository_avatar = !Number(row.avatar_suppressed || 0) && Boolean(getRepositoryPlayerAvatarAsset(String(row.id)));
    const completeness = calculateProfileCompleteness(row);
    const missing = completeness.important_missing_fields.filter((field) => completeness.fields[field].state !== 'declined');
    if (!missing.length) continue;
    people.push({
      player_id: String(row.id), nickname: String(row.nickname || 'Без ника'),
      detail: `нет: ${missing.map((field) => completeness.fields[field].label.toLowerCase()).join(', ')} · ${completeness.percentage}%`,
    });
  }
  if (!people.length) return [];
  return [{
    id: 'people:profile', group: 'later', kind: 'profile', title: `Профили не заполнены · ${people.length}`,
    why: 'Попроси дозаполнить профиль — то же, что игрок видит на плашке у себя в профиле. Можно заполнить и самому в карточке.',
    people: await withLinks(db, people.slice(0, PEOPLE_LIMIT)), people_total: people.length, contact_reason: 'profile',
  }];
}

async function noviceFeedbackItem(db: DatabaseWrapper, now: number): Promise<AgendaItem[]> {
  const rows = await db.all<any>(`
    SELECT t.id AS task_id, t.player_id, p.nickname, e.title, e.starts_at
      FROM organizer_tasks t
      JOIN players p ON p.id = t.player_id
      LEFT JOIN game_evenings e ON e.id = t.evening_id
     WHERE t.status NOT IN ('done', 'cancelled') AND t.automation_key LIKE 'feedback-first-visit:%'
     ORDER BY e.starts_at DESC`);
  const quiet = await recentlyContacted(db, 'novice_feedback', now);
  const people = rows.filter((row: any) => !quiet.has(String(row.player_id)))
    .map((row: any) => ({ player_id: String(row.player_id), nickname: String(row.nickname || 'Без ника'), detail: `первый вечер ${dayLabel(row.starts_at)}` }));
  if (!people.length) return [];
  return [{
    id: 'people:novice_feedback', group: 'week', kind: 'novice_feedback', title: `Спросить новичков о первом вечере · ${people.length}`,
    why: 'Пара слов после первого вечера сильно повышает шанс, что человек придёт снова.',
    people: await withLinks(db, people.slice(0, PEOPLE_LIMIT)), people_total: people.length, contact_reason: 'novice_feedback',
  }];
}

const SEGMENT_ORDER: Record<string, number> = { regular: 0, sometimes: 1, novice: 2, other_city: 3, stopped: 4 };
const eveningLabel = (row: any) => `${String(row.title || 'Игровой вечер')}${dayLabel(row.starts_at) ? ` · ${dayLabel(row.starts_at)}` : ''}`;

/**
 * «Добор» and «Думают» (owner, 2026-09-30: few players answer the announcement). From FILL_DAYS before a published
 * evening: when fewer than the minimum said «Иду», list club players who may come and have not answered;
 * separately list those who answered «Думаю». Regular players first.
 */
async function fillItems(db: DatabaseWrapper, now: number): Promise<Array<AgendaItem & { rank: number }>> {
  const evenings = await db.all<any>(
    `SELECT id, title, starts_at, format FROM game_evenings
      WHERE status = 'published' AND settled_at IS NULL AND UPPER(COALESCE(format, '')) <> 'TOURNAMENT'
        AND datetime(starts_at) > datetime(?) AND datetime(starts_at) <= datetime(?)
      ORDER BY starts_at`,
    [iso(now), iso(now + FILL_DAYS * DAY)],
  );
  if (!evenings.length) return [];
  const quietFill = await recentlyContacted(db, 'fill', now);
  const quietThinking = await recentlyContacted(db, 'thinking', now);
  const club = await db.all<any>(`
    SELECT p.id, p.nickname, p.game_level, p.club_role, p.attends_sometimes, p.stopped_attending, p.from_other_city,
           p.contact_status, p.pause_reason, v.last_visit
      FROM players p
      LEFT JOIN (${PLAYER_VISIT_STATS_SQL}) v ON v.player_id = CAST(p.id AS TEXT)
     WHERE ${MEMBER_SQL} AND COALESCE(p.contact_status, 'normal') = 'normal'
       AND COALESCE(p.stopped_attending, 0) = 0`);
  const items: Array<AgendaItem & { rank: number }> = [];
  for (const evening of evenings) {
    const eveningId = String(evening.id);
    const answers = await db.all<any>(
      'SELECT player_id, response_status FROM evening_participants WHERE evening_id = ? AND player_id IS NOT NULL', [eveningId]);
    // A row without an answer (e.g. «unanswered», added by the organizer) still counts as not answered.
    const answered = new Map(answers.filter((row: any) => ['going', 'late', 'thinking', 'declined'].includes(String(row.response_status || '')))
      .map((row: any) => [String(row.player_id), String(row.response_status || '')]));
    const thinking = club.filter((row: any) => answered.get(String(row.id)) === 'thinking' && !quietThinking.has(String(row.id)));
    if (thinking.length) {
      items.push({
        id: `people:thinking:${eveningId}`, group: 'now', rank: 16, kind: 'thinking',
        title: `Думают · ${thinking.length} · ${eveningLabel(evening)}`,
        why: 'Ответили «Думаю». Короткое личное сообщение — главный способ превратить «думаю» в «иду». Список — внутри вечера, «Личные приглашения» → «Думают».',
        // The answer work happens inside the evening (owner, 2026-10-01): the task only points there.
        action: { type: 'evening', evening_id: eveningId, section: 'overview' }, action_label: 'Открыть ответы',
      });
    }
    const shortfall = await loadEveningShortfall(db, eveningId);
    if (!shortfall?.short) continue;
    const invite = club
      .filter((row: any) => !answered.has(String(row.id)) && !quietFill.has(String(row.id)))
      .filter((row: any) => Number(row.from_other_city || 0) !== 1 || String(evening.format || '').toUpperCase() === 'RATING')
      .filter((row: any) => playerLevelAllowsEveningFormat(row.game_level, evening.format))
      .sort((left: any, right: any) => (SEGMENT_ORDER[getPlayerStatusSegment(left)] ?? 9) - (SEGMENT_ORDER[getPlayerStatusSegment(right)] ?? 9)
        || String(right.last_visit || '').localeCompare(String(left.last_visit || '')));
    items.push({
      id: `people:fill:${eveningId}`, group: 'now', rank: 15, kind: 'fill',
      title: `Добор: ${shortfall.confirmed} из ${shortfall.minimum} · ${eveningLabel(evening)}`,
      why: `До вечера меньше ${FILL_DAYS} дней, а «Иду» меньше минимума. Позови тех, кто ещё не ответил: сначала постоянных — список внутри вечера, «Личные приглашения» → «Ждём ответа». Через час до начала вечер с недобором предложит отменить.`,
      people_total: invite.length,
      action: { type: 'evening', evening_id: eveningId, section: 'overview' }, action_label: 'Открыть ответы',
    });
  }
  return items;
}

/**
 * Curators (owner, 2026-09-30): a direction is quiet when nothing of it happened in the app and nobody talked
 * with its curator for CURATOR_QUIET_DAYS. What the app can see: novice evenings run or judged («Новички»),
 * tournaments organized («Турниры»), own events organized («Ивенты»). Learning, discipline and SMM leave no
 * trace in the app yet, so for them only the last talk («Написал») counts. A curator task marked done
 * counts for its direction in every case.
 */
async function curatorItems(db: DatabaseWrapper, now: number): Promise<AgendaItem[]> {
  const curators = (await db.all<any>(`SELECT p.id, p.nickname, p.curator_areas FROM players p
    WHERE ${MEMBER_SQL} AND COALESCE(p.curator_areas, '') <> '' ORDER BY p.nickname COLLATE NOCASE`))
    .map((row: any) => ({ ...row, areas: normalizeCuratorAreas(row.curator_areas) }))
    .filter((row: any) => row.areas.length);
  if (!curators.length) return [];
  const since = iso(now - CURATOR_QUIET_DAYS * DAY);
  const talked = await recentlyContacted(db, 'curator', now);
  const lastTalk = new Map((await db.all<any>(
    "SELECT player_id, MAX(occurred_at) AS at FROM player_activities WHERE type = 'contact' AND outcome = 'agenda:curator' GROUP BY player_id",
  )).map((row: any) => [String(row.player_id), String(row.at)]));
  const tableExists = async (name: string) => Boolean(await db.get("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?", [name]));
  const hasColumn = async (table: string, column: string) => (await db.all<any>(`PRAGMA table_info(${table})`)).some((row: any) => row.name === column);
  const lastDone = async (area: CuratorArea, playerId: string): Promise<string | null> => {
    if (area === 'NOVICES') {
      const staff = await tableExists('evening_staff_assignments')
        ? await db.get<any>(`SELECT MAX(e.starts_at) AS at FROM evening_staff_assignments s JOIN game_evenings e ON e.id = s.evening_id
            WHERE (s.organizer_player_id = ? OR s.judge_player_id = ?) AND UPPER(COALESCE(e.format, '')) = 'NOVICE' AND e.status NOT IN ('cancelled', 'draft') AND datetime(e.starts_at) <= datetime(?)`, [playerId, playerId, iso(now)])
        : null;
      const judged = await db.get<any>(`SELECT MAX(e.starts_at) AS at FROM games g JOIN game_evenings e ON e.id = g.evening_id
          WHERE g.judge_player_id = ? AND g.archived_at IS NULL AND UPPER(COALESCE(e.format, '')) = 'NOVICE'`, [playerId]);
      return [staff?.at, judged?.at].filter(Boolean).sort().pop() || null;
    }
    if (area === 'TOURNAMENTS' && await tableExists('tournaments') && await hasColumn('tournaments', 'organizer_player_id')) {
      return (await db.get<any>("SELECT MAX(COALESCE(date, created_at)) AS at FROM tournaments WHERE organizer_player_id = ? AND COALESCE(status, '') <> 'cancelled'", [playerId]))?.at || null;
    }
    if (area === 'EVENTS' && await tableExists('custom_events')) {
      return (await db.get<any>("SELECT MAX(created_at) AS at FROM custom_events WHERE organizer_player_id = ? AND status <> 'cancelled'", [playerId]))?.at || null;
    }
    return null;
  };
  // A curator task marked done counts for its direction (or for every direction when it has none).
  const taskTable = await tableExists('curator_tasks');
  const lastTask = async (area: CuratorArea, playerId: string): Promise<string | null> => (taskTable
    ? (await db.get<any>(`SELECT MAX(completed_at) AS at FROM curator_tasks WHERE curator_player_id = ? AND status = 'done' AND (area = ? OR area IS NULL)`, [playerId, area]))?.at || null
    : null);
  const people: AgendaPerson[] = [];
  for (const curator of curators) {
    const id = String(curator.id);
    if (talked.has(id)) continue;
    const quiet: string[] = [];
    for (const area of CURATOR_AREAS.filter((item) => curator.areas.includes(item))) {
      const done = [await lastDone(area, id), await lastTask(area, id)].filter(Boolean).sort().pop() || null;
      if (done && String(done) >= since) continue;
      quiet.push(`${curatorAreaLabel(area).toLowerCase()}: ${done ? `последнее ${dayLabel(done)}` : 'в приложении нет следов'}`);
    }
    if (!quiet.length) continue;
    const talk = lastTalk.get(id);
    people.push({ player_id: id, nickname: String(curator.nickname || 'Без ника'), detail: `${quiet.join('; ')}${talk ? ` · говорили ${dayLabel(talk)}` : ' · ещё не говорили'}` });
  }
  if (!people.length) return [];
  return [{
    id: 'people:curators', group: 'later', kind: 'curator', title: `Кураторы: узнать, как дела · ${people.length}`,
    why: `По направлению ничего не было больше ${CURATOR_QUIET_DAYS} дней. Спроси, что сделано и нужна ли помощь; после «Написал» куратор уйдёт из списка на ${CURATOR_QUIET_DAYS} дней.`,
    people: await withLinks(db, people.slice(0, PEOPLE_LIMIT)), people_total: people.length, contact_reason: 'curator',
  }];
}

// Where each «Порядок в клубе» check goes, and in which order inside its group.
const ORDER_PLACE: Array<[RegExp, AgendaGroup, number]> = [
  [/^shortfall:/, 'now', 10], [/^unclosed:/, 'now', 20], [/^gathered:/, 'now', 25], [/^debts:/, 'now', 26], [/^protocols:/, 'now', 27], [/^organizer:/, 'now', 30],
  [/^draft:/, 'week', 10], [/^no-evening$/, 'week', 15],
  [/^level-missing$/, 'later', 10], [/^no-contact$/, 'later', 30], [/^duplicates:/, 'later', 40],
];
const orderPlace = (id: string): [AgendaGroup, number] => {
  const match = ORDER_PLACE.find(([pattern]) => pattern.test(id));
  return match ? [match[1], match[2]] : ['later', 90];
};

function fromClubOrder(item: ClubOrderItem): AgendaItem & { rank: number } {
  const [group, rank] = orderPlace(item.id);
  return {
    id: `check:${item.id}`, group, rank, kind: item.id.split(':')[0], title: item.title, why: item.detail,
    action: item.action, action_label: item.action_label,
    people: item.people, people_total: item.people_total, dismiss_label: item.dismiss_label,
  };
}

async function taskItems(db: DatabaseWrapper, now: number): Promise<Array<AgendaItem & { rank: number }>> {
  const rows = await db.all<any>(`
    SELECT t.*, p.nickname AS player_nickname, e.title AS evening_title, e.starts_at AS evening_starts_at
      FROM organizer_tasks t
      LEFT JOIN players p ON p.id = t.player_id
      LEFT JOIN game_evenings e ON e.id = t.evening_id
     WHERE t.status NOT IN ('done', 'cancelled')
       -- «Вечер прошёл, но не закрыт» comes from the checks and leaves once the evening is closed.
       AND COALESCE(t.automation_key, '') NOT LIKE 'evening-close:%'
       AND COALESCE(t.automation_key, '') NOT LIKE 'feedback-first-visit:%'
       AND COALESCE(t.automation_key, '') NOT LIKE 'profile-missing:%'
       AND COALESCE(t.automation_key, '') NOT LIKE 'lapsed-return:%'
       AND COALESCE(t.automation_key, '') NOT LIKE 'clarify-participation:%'
       AND COALESCE(t.automation_key, '') NOT LIKE 'invite-followup:%'
       AND COALESCE(t.automation_key, '') NOT LIKE 'reminder-confirmed:%'
       AND COALESCE(t.automation_key, '') NOT LIKE 'reinvite-second-visit:%'`);
  const endOfToday = (() => {
    const moscow = new Date(now + 3 * 3_600_000);
    return Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth(), moscow.getUTCDate() + 1) - 3 * 3_600_000;
  })();
  return rows.map((row: any) => {
    const key = String(row.automation_key || '');
    const due = row.due_at ? new Date(String(row.due_at)).getTime() : Number.NaN;
    let group: AgendaGroup = 'later';
    let rank = 60;
    if (key.startsWith('verified-onboarding:')) { group = 'now'; rank = 40; }
    else if (Number.isFinite(due) && due < endOfToday) { group = 'now'; rank = 50; }
    else if (Number.isFinite(due) && due < now + 7 * DAY) { group = 'week'; rank = key.startsWith('birthday:') ? 30 : 50; }
    const overdue = Number.isFinite(due) && due < now;
    const whyParts = [
      row.description ? String(row.description) : '',
      row.due_at ? `${overdue ? 'срок прошёл' : 'срок'}: ${dayLabel(row.due_at)}` : '',
    ].filter(Boolean);
    const action: AgendaAction | undefined = row.player_id ? { type: 'player', player_id: String(row.player_id) }
        : row.evening_id ? { type: 'evening', evening_id: String(row.evening_id), section: 'overview' } : undefined;
    return {
      id: `task:${row.id}`, group, rank, kind: key ? key.split(':')[0] : 'manual', title: String(row.title || 'Задача'),
      why: whyParts.join(' · ') || 'Задача без описания', task_id: String(row.id), due_at: row.due_at || null, can_complete: true,
      action, action_label: action ? (action.type === 'player' ? 'Открыть игрока' : 'Открыть вечер') : undefined,
    };
  });
}

const GROUP_ORDER: AgendaGroup[] = ['now', 'week', 'later'];
const PEOPLE_RANK: Record<string, number> = { novice_feedback: 35, absent_regular: 40, absent_sometimes: 20, stopped: 25, profile: 10, curator: 5 };

export async function loadAgenda(db: DatabaseWrapper, nowMs = Date.now()) {
  await ensureAgendaSchema(db);
  // Each source stands on its own: one failing check must not empty the whole list (owner report 2026-09-30).
  const errors: string[] = [];
  const safely = async <T,>(label: string, work: () => Promise<T[]>): Promise<T[]> => {
    try { return await work(); } catch (error: any) {
      console.error(`[AGENDA] ${label} failed:`, error);
      errors.push(`${label}: ${String(error?.message || error).slice(0, 200)}`);
      return [];
    }
  };
  await safely('закрытие вечеров', async () => { await closeTasksOfEndedEvenings(db); return []; });
  const sources = {
    checks: await safely('проверки клуба', async () => (await loadClubOrder(db, nowMs)).items
      // «Не приходят 90 дней» is replaced by the owner's finer absence lists.
      .filter((item) => item.id !== 'inactive').map(fromClubOrder)),
    tasks: await safely('задачи', () => taskItems(db, nowMs)),
    absence: await safely('давно не были', async () => (await absenceItems(db, nowMs)).map((item) => ({ ...item, rank: PEOPLE_RANK[item.kind] ?? 60 }))),
    profiles: await safely('профили', async () => (await profileItem(db, nowMs)).map((item) => ({ ...item, rank: PEOPLE_RANK.profile }))),
    novices: await safely('новички', async () => (await noviceFeedbackItem(db, nowMs)).map((item) => ({ ...item, rank: PEOPLE_RANK.novice_feedback }))),
    fill: await safely('добор на вечер', () => fillItems(db, nowMs)),
    curators: await safely('кураторы', async () => (await curatorItems(db, nowMs)).map((item) => ({ ...item, rank: PEOPLE_RANK.curator }))),
  };
  const candidates: Array<AgendaItem & { rank: number }> = Object.values(sources).flat();
  const snoozed = new Set((await safely('отложенные', () => db.all<any>('SELECT item_id FROM organizer_agenda_snoozes WHERE datetime(until) > datetime(?)', [iso(nowMs)])))
    .map((row: any) => String(row.item_id)));
  const visible = candidates.filter((item) => !snoozed.has(item.id));
  visible.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.rank - b.rank
    || String(a.due_at || '').localeCompare(String(b.due_at || '')));
  const items: AgendaItem[] = visible.map(({ rank: _rank, ...item }) => item);
  const counts = Object.fromEntries(GROUP_ORDER.map((group) => [group, items.filter((item) => item.group === group).length])) as Record<AgendaGroup, number>;
  return {
    items, counts, total: items.length, snoozed: snoozed.size, groups: AGENDA_GROUP_LABELS, generated_at: iso(nowMs),
    errors,
    checked: await safely('сводка', async () => [await agendaCoverage(db)]).then((rows) => rows[0] || null),
  };
}

/** What the list was built from, shown under an empty list so «нет дел» can be trusted or questioned. */
async function agendaCoverage(db: DatabaseWrapper) {
  const visits = await db.get<any>(`
    SELECT COUNT(DISTINCT v.player_id) AS players, MAX(v.starts_at) AS last_visit, COUNT(*) AS marks
      FROM (${PLAYER_VISITS_SQL}) v
      JOIN players p ON CAST(p.id AS TEXT) = v.player_id
     WHERE ${MEMBER_SQL}`);
  const members = await db.get<any>(`SELECT COUNT(*) AS count FROM players p WHERE ${MEMBER_SQL}`);
  const openTasks = await db.get<any>("SELECT COUNT(*) AS count FROM organizer_tasks WHERE status NOT IN ('done', 'cancelled')");
  return {
    players: Number(members?.count || 0),
    players_with_visits: Number(visits?.players || 0),
    visit_marks: Number(visits?.marks || 0),
    last_visit: visits?.last_visit || null,
    open_tasks: Number(openTasks?.count || 0),
  };
}

/** «Отложить»: the item leaves the list for a day or a week and then comes back if still true. */
export async function snoozeAgendaItem(db: DatabaseWrapper, itemId: unknown, days: unknown) {
  await ensureAgendaSchema(db);
  const id = String(itemId || '').trim();
  const span = Number(days);
  if (!id || id.length > 300 || !/^(check|task|people):/.test(id)) throw Object.assign(new Error('Неизвестное дело'), { statusCode: 400 });
  if (![1, 3, 7, 30].includes(span)) throw Object.assign(new Error('Отложить можно на 1, 3, 7 или 30 дней'), { statusCode: 400 });
  const until = iso(Date.now() + span * DAY);
  await db.run(
    `INSERT INTO organizer_agenda_snoozes (item_id, until, created_at) VALUES (?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET until = excluded.until, created_at = excluded.created_at`,
    [id, until, new Date().toISOString()],
  );
  return { item_id: id, until };
}

const CONTACT_LABELS: Record<ContactReason, string> = {
  absent_regular: 'позвал вернуться (давно не был)',
  absent_sometimes: 'позвал на вечер (приходит иногда)',
  stopped: 'позвал вернуться (перестал ходить)',
  profile: 'попросил дозаполнить профиль',
  novice_feedback: 'спросил о первом вечере',
  fill: 'позвал на ближайший вечер (добор)',
  thinking: 'уточнил, придёт ли на вечер',
  curator: 'поговорил с куратором о его направлении',
};

/** «Написал»: recorded in the player's history; the person leaves this list for its quiet period. */
export async function recordAgendaContact(db: DatabaseWrapper, input: { playerId: unknown; reason: unknown }) {
  const playerId = String(input.playerId || '').trim();
  const reason = String(input.reason || '') as ContactReason;
  if (!(reason in CONTACT_LABELS)) throw Object.assign(new Error('Неизвестная причина'), { statusCode: 400 });
  const player = await db.get<any>('SELECT id FROM players WHERE id = ? LIMIT 1', [playerId]);
  if (!player) throw Object.assign(new Error('Игрок не найден'), { statusCode: 404 });
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO player_activities (id, player_id, evening_id, task_id, type, outcome, description, occurred_at, created_at)
     VALUES (?, ?, NULL, NULL, 'contact', ?, ?, ?, ?)`,
    [`act_${crypto.randomUUID()}`, playerId, `agenda:${reason}`, `Организатор ${CONTACT_LABELS[reason]}`, now, now],
  );
  if (reason === 'novice_feedback') {
    await db.run(
      `UPDATE organizer_tasks SET status = 'done', completed_at = ?, updated_at = ?
        WHERE player_id = ? AND automation_key LIKE 'feedback-first-visit:%' AND status NOT IN ('done', 'cancelled')`,
      [now, now, playerId],
    );
  }
  return { player_id: playerId, reason };
}
