import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { loadClubOrder, type ClubOrderAction, type ClubOrderItem } from './clubOrderService.ts';
import { calculateProfileCompleteness } from './playerProfileIntegrityService.ts';
import { closeTasksOfEndedEvenings } from './eveningCloseoutService.ts';
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
export type ContactReason = 'absent_regular' | 'absent_sometimes' | 'stopped' | 'profile' | 'novice_feedback';

export const AGENDA_GROUP_LABELS: Record<AgendaGroup, string> = {
  now: 'Сейчас',
  week: 'На этой неделе',
  later: 'Когда будет время',
};

const DAY = 86_400_000;
const PEOPLE_LIMIT = 30;
export const ABSENCE_DAYS = { regular: 14, sometimes: 28, stopped: 60 } as const;
const CONTACT_QUIET_DAYS: Record<ContactReason, number> = {
  absent_regular: ABSENCE_DAYS.regular,
  absent_sometimes: ABSENCE_DAYS.sometimes,
  stopped: ABSENCE_DAYS.stopped,
  profile: 14,
  novice_feedback: 365,
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
const MEMBER_SQL = `COALESCE(p.lifecycle_status, 'normal') NOT IN ('archived', 'blocked', 'guest_placeholder', 'legacy_guest_migrated')
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
           MAX(e.starts_at) AS last_visit
      FROM players p
      JOIN evening_participants ep ON ep.player_id = p.id AND ep.attendance_status = 'attended'
      JOIN game_evenings e ON e.id = ep.evening_id
     WHERE ${MEMBER_SQL} AND COALESCE(p.contact_status, 'normal') <> 'blocked'
     GROUP BY p.id
    HAVING datetime(MAX(e.starts_at)) < datetime(?)`, [iso(now - ABSENCE_DAYS.regular * DAY)]);
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
       AND EXISTS (SELECT 1 FROM evening_participants ep JOIN game_evenings e ON e.id = ep.evening_id
                    WHERE ep.player_id = p.id AND ep.attendance_status = 'attended' AND datetime(e.starts_at) >= datetime(?))
     ORDER BY p.nickname COLLATE NOCASE`, [iso(now - 120 * DAY)]);
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

// Where each «Порядок в клубе» check goes, and in which order inside its group.
const ORDER_PLACE: Array<[RegExp, AgendaGroup, number]> = [
  [/^shortfall:/, 'now', 10], [/^unclosed:/, 'now', 20], [/^gathered:/, 'now', 25], [/^organizer:/, 'now', 30],
  [/^draft:/, 'week', 10], [/^no-evening$/, 'week', 15], [/^debts:/, 'week', 20], [/^protocols:/, 'week', 25],
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
const PEOPLE_RANK: Record<string, number> = { novice_feedback: 35, absent_regular: 40, absent_sometimes: 20, stopped: 25, profile: 50 };

export async function loadAgenda(db: DatabaseWrapper, nowMs = Date.now()) {
  await ensureAgendaSchema(db);
  await closeTasksOfEndedEvenings(db);
  const order = await loadClubOrder(db, nowMs);
  const candidates: Array<AgendaItem & { rank: number }> = [
    // «Не приходят 90 дней» is replaced by the owner's finer absence lists.
    ...order.items.filter((item) => item.id !== 'inactive').map(fromClubOrder),
    ...await taskItems(db, nowMs),
    ...(await absenceItems(db, nowMs)).map((item) => ({ ...item, rank: PEOPLE_RANK[item.kind] ?? 60 })),
    ...(await profileItem(db, nowMs)).map((item) => ({ ...item, rank: PEOPLE_RANK.profile })),
    ...(await noviceFeedbackItem(db, nowMs)).map((item) => ({ ...item, rank: PEOPLE_RANK.novice_feedback })),
  ];
  const snoozed = new Set((await db.all<any>('SELECT item_id FROM organizer_agenda_snoozes WHERE datetime(until) > datetime(?)', [iso(nowMs)]))
    .map((row: any) => String(row.item_id)));
  const visible = candidates.filter((item) => !snoozed.has(item.id));
  visible.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.rank - b.rank
    || String(a.due_at || '').localeCompare(String(b.due_at || '')));
  const items: AgendaItem[] = visible.map(({ rank: _rank, ...item }) => item);
  const counts = Object.fromEntries(GROUP_ORDER.map((group) => [group, items.filter((item) => item.group === group).length])) as Record<AgendaGroup, number>;
  return { items, counts, total: items.length, snoozed: snoozed.size, groups: AGENDA_GROUP_LABELS, generated_at: iso(nowMs) };
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
