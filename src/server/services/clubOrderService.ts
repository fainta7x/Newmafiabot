import type { DatabaseWrapper } from '../../db/index.ts';
import { isUnfinishedEveningGame } from './eveningCloseoutService.ts';
import { loadGatheredPost } from './eveningGatheredPostService.ts';

/**
 * «Порядок в клубе» (user-approved 2026-09-24): an automatic list of things that need the organizer.
 * Every item has one action that opens the place where it is fixed, and it disappears once fixed.
 * Novices are never suggested for a transfer — that stays the organizer's own decision.
 */
export type ClubOrderCategory = 'evenings' | 'statuses' | 'profiles' | 'money';
export type ClubOrderAction =
  | { type: 'evening'; evening_id: string; section: 'overview' | 'participants' | 'games' | 'management' | 'closeout' }
  | { type: 'player'; player_id: string }
  | { type: 'create_evening' };
export type ClubOrderPerson = { player_id: string; nickname: string; detail?: string };
export type ClubOrderItem = {
  id: string;
  category: ClubOrderCategory;
  title: string;
  detail: string;
  action: ClubOrderAction;
  action_label: string;
  people?: ClubOrderPerson[];
  /** How many people the item is about; `people` shows only the first few. */
  people_total?: number;
  /** A second button that confirms nothing needs fixing (only for items the app cannot check itself). */
  dismiss_label?: string;
};

export const CLUB_ORDER_CATEGORIES: Record<ClubOrderCategory, string> = {
  evenings: 'Вечера и сбор',
  statuses: 'Статусы игроков',
  profiles: 'Профили',
  money: 'Игры и деньги',
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PEOPLE_LIMIT = 6;
const INACTIVE_DAYS = 90;
// Old history is not a to-do: only recent evenings are checked for closing, protocols and debts.
const LOOKBACK_DAYS = 60;

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
const eveningName = (row: any) => `${String(row.title || 'Игровой вечер')}${dayLabel(row.starts_at) ? ` · ${dayLabel(row.starts_at)}` : ''}`;
const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;
const person = (row: any, detail?: string): ClubOrderPerson => ({ player_id: String(row.player_id ?? row.id), nickname: String(row.nickname || 'Без ника'), ...(detail ? { detail } : {}) });
// Placeholder, archived and blocked profiles are not club members to look after.
const MEMBER_SQL = `COALESCE(p.lifecycle_status, 'normal') NOT IN ('archived', 'blocked', 'guest_placeholder', 'legacy_guest_migrated')`;

export async function ensureClubOrderSchema(db: DatabaseWrapper) {
  await db.exec(`CREATE TABLE IF NOT EXISTS club_order_dismissals (item_id TEXT PRIMARY KEY, dismissed_at TEXT NOT NULL)`);
}

async function loadDismissedKeys(db: DatabaseWrapper) {
  await ensureClubOrderSchema(db);
  return new Set((await db.all<any>('SELECT item_id FROM club_order_dismissals')).map((row: any) => String(row.item_id)));
}

/** Only questions the app cannot answer itself may be dismissed; real problems disappear when fixed. */
export async function dismissClubOrderItem(db: DatabaseWrapper, itemId: unknown) {
  const id = String(itemId || '').trim();
  if (!/^duplicates:[^,]+(,[^,]+)+$/.test(id) || id.length > 2000) {
    throw Object.assign(new Error('Этот пункт нельзя скрыть — он исчезнет, когда будет исправлен'), { statusCode: 400 });
  }
  await ensureClubOrderSchema(db);
  await db.run('INSERT OR IGNORE INTO club_order_dismissals (item_id, dismissed_at) VALUES (?, ?)', [id, new Date().toISOString()]);
}

async function tableSet(db: DatabaseWrapper) {
  return new Set((await db.all<any>("SELECT name FROM sqlite_master WHERE type = 'table'")).map((row: any) => String(row.name)));
}

async function eveningItems(db: DatabaseWrapper, tables: Set<string>, now: number): Promise<ClubOrderItem[]> {
  const items: ClubOrderItem[] = [];
  const since = iso(now - LOOKBACK_DAYS * DAY);

  // A past evening that was never closed keeps payments, tokens and ratings unsettled.
  const unclosed = await db.all<any>(`
    SELECT id, title, starts_at FROM game_evenings
     WHERE status IN ('published', 'active') AND settled_at IS NULL
       AND datetime(starts_at) < datetime(?) AND datetime(starts_at) >= datetime(?)
     ORDER BY starts_at ASC LIMIT 5`, [iso(now - 12 * HOUR), since]);
  for (const row of unclosed) {
    items.push({
      id: `unclosed:${row.id}`, category: 'evenings', title: 'Вечер прошёл, но не закрыт',
      detail: `${eveningName(row)} — закрой вечер, чтобы посчитались оплаты и жетоны`,
      action: { type: 'evening', evening_id: String(row.id), section: 'closeout' }, action_label: 'Закрыть вечер',
    });
  }

  const upcoming = await db.all<any>(`
    SELECT id, title, starts_at, status FROM game_evenings
     WHERE status IN ('draft', 'published') AND datetime(starts_at) >= datetime(?) AND datetime(starts_at) < datetime(?)
     ORDER BY starts_at ASC`, [iso(now), iso(now + 7 * DAY)]);
  for (const row of upcoming) {
    const startsIn = new Date(String(row.starts_at)).getTime() - now;
    if (row.status === 'draft' && startsIn < 3 * DAY) {
      items.push({
        id: `draft:${row.id}`, category: 'evenings', title: 'Вечер скоро, а анонса нет',
        detail: `${eveningName(row)} — ещё черновик, игроки о нём не знают`,
        action: { type: 'evening', evening_id: String(row.id), section: 'overview' }, action_label: 'Открыть маршрут',
      });
    }
    if (startsIn < 2 * DAY && tables.has('evening_staff_assignments')) {
      const staff = await db.get<any>('SELECT organizer_player_id FROM evening_staff_assignments WHERE evening_id = ? LIMIT 1', [row.id]);
      if (!staff?.organizer_player_id) {
        items.push({
          id: `organizer:${row.id}`, category: 'evenings', title: 'Нет организатора вечера',
          detail: `${eveningName(row)} — без организатора вечер нельзя начать`,
          action: { type: 'evening', evening_id: String(row.id), section: 'management' }, action_label: 'Назначить',
        });
      }
    }
  }

  const planned = await db.get<any>(`
    SELECT COUNT(*) AS count FROM game_evenings
     WHERE status IN ('draft', 'published', 'active') AND datetime(starts_at) >= datetime(?) AND datetime(starts_at) < datetime(?)`,
  [iso(now - 12 * HOUR), iso(now + 7 * DAY)]);
  if (!Number(planned?.count || 0)) {
    items.push({
      id: 'no-evening', category: 'evenings', title: 'На ближайшую неделю вечеров нет',
      detail: 'Создай следующий вечер, чтобы игроки могли записаться заранее',
      action: { type: 'create_evening' }, action_label: 'Создать вечер',
    });
  }

  // A skipped «Мы собрались» post stays as a reminder while it can still be published.
  for (const row of await db.all<any>("SELECT id, title, starts_at FROM game_evenings WHERE status = 'active' AND settled_at IS NULL")) {
    const post = await loadGatheredPost(db, String(row.id));
    if (post.state === 'skipped') {
      items.push({
        id: `gathered:${row.id}`, category: 'evenings', title: 'Пост «Мы собрались» пропущен',
        detail: `${eveningName(row)} — фото ещё можно выложить, пока идёт вечер`,
        action: { type: 'evening', evening_id: String(row.id), section: 'overview' }, action_label: 'Сделать фото',
      });
    }
  }
  return items;
}

async function statusItems(db: DatabaseWrapper): Promise<ClubOrderItem[]> {
  // Someone who already played but has no level can land in the wrong evenings.
  const rows = await db.all<any>(`
    SELECT p.id, p.nickname FROM players p
     WHERE ${MEMBER_SQL} AND p.game_level = 'unrated'
       AND EXISTS (SELECT 1 FROM evening_participants ep WHERE ep.player_id = p.id AND ep.attendance_status = 'attended')
     ORDER BY p.nickname COLLATE NOCASE`);
  if (!rows.length) return [];
  return [{
    id: 'level-missing', category: 'statuses', title: 'Уровень игрока не определён',
    detail: `${players(rows.length)} уже играли, но уровень (новичок / клуб / турнир) не определён`,
    action: { type: 'player', player_id: String(rows[0].id) }, action_label: 'Указать уровень',
    people: rows.slice(0, PEOPLE_LIMIT).map((row: any) => person(row)), people_total: rows.length,
  }];
}

async function profileItems(db: DatabaseWrapper, tables: Set<string>, now: number): Promise<ClubOrderItem[]> {
  const items: ClubOrderItem[] = [];

  // SQLite LOWER() ignores Cyrillic, so nicknames are compared here: case, spaces and «ё» do not matter.
  const nickKey = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  const groups = new Map<string, any[]>();
  for (const row of await db.all<any>(`SELECT p.id, p.nickname FROM players p WHERE ${MEMBER_SQL} ORDER BY p.created_at`)) {
    const key = nickKey(row.nickname);
    if (key) groups.set(key, [...(groups.get(key) || []), row]);
  }
  for (const [key, rows] of groups) if (rows.length < 2) groups.delete(key);
  const dismissed = await loadDismissedKeys(db);
  let shown = 0;
  for (const rows of groups.values()) {
    // The key lists the exact profiles, so a new namesake brings the question back.
    const id = `duplicates:${rows.map((row: any) => String(row.id)).sort().join(',')}`;
    if (dismissed.has(id) || shown >= 5) continue;
    shown += 1;
    const visits = new Map((await db.all<any>(
      `SELECT player_id, COUNT(*) AS count FROM evening_participants
        WHERE attendance_status = 'attended' AND player_id IN (${rows.map(() => '?').join(',')}) GROUP BY player_id`,
      rows.map((row: any) => row.id),
    )).map((row: any) => [String(row.player_id), Number(row.count || 0)]));
    items.push({
      id, category: 'profiles', title: `Двойной профиль? «${String(rows[0].nickname).trim()}»`,
      detail: `${rows.length} ${plural(rows.length, 'профиль', 'профиля', 'профилей')} с одним ником. Если это один человек — архивируй пустой; если разные — нажми «Это разные игроки»`,
      action: { type: 'player', player_id: String(rows[0].id) }, action_label: 'Проверить',
      people: rows.slice(0, PEOPLE_LIMIT).map((row: any) => {
        const count = visits.get(String(row.id)) || 0;
        return person(row, count ? `визитов: ${count}` : 'не приходил');
      }),
      people_total: rows.length,
      dismiss_label: 'Это разные игроки',
    });
  }

  const vkSql = tables.has('player_external_identities')
    ? "NOT EXISTS (SELECT 1 FROM player_external_identities x WHERE x.player_id = p.id AND x.platform = 'vk')"
    : '1';
  const noContact = await db.all<any>(`
    SELECT p.id, p.nickname FROM players p
     WHERE ${MEMBER_SQL} AND COALESCE(TRIM(p.telegram_user_id), '') = '' AND ${vkSql}
       AND EXISTS (SELECT 1 FROM evening_participants ep JOIN game_evenings e ON e.id = ep.evening_id
                    WHERE ep.player_id = p.id AND ep.attendance_status = 'attended' AND datetime(e.starts_at) >= datetime(?))
     ORDER BY p.nickname COLLATE NOCASE`, [iso(now - INACTIVE_DAYS * DAY)]);
  if (noContact.length) {
    items.push({
      id: 'no-contact', category: 'profiles', title: 'Нет Telegram и ВК',
      detail: `${players(noContact.length)} ходят на вечера, но им не приходят приглашения — попроси привязать Telegram или ВК`,
      action: { type: 'player', player_id: String(noContact[0].id) }, action_label: 'Открыть',
      people: noContact.slice(0, PEOPLE_LIMIT).map((row: any) => person(row)), people_total: noContact.length,
    });
  }

  // Players who stopped coming still get invitations until they are marked as inactive.
  const inactive = await db.all<any>(`
    SELECT p.id, p.nickname, MAX(e.starts_at) AS last_visit FROM players p
      JOIN evening_participants ep ON ep.player_id = p.id AND ep.attendance_status = 'attended'
      JOIN game_evenings e ON e.id = ep.evening_id
     WHERE ${MEMBER_SQL} AND COALESCE(p.contact_status, 'normal') NOT IN ('inactive', 'paused', 'blocked', 'archived')
       AND COALESCE(p.lifecycle_status, 'normal') NOT IN ('inactive', 'paused')
     GROUP BY p.id, p.nickname
    HAVING datetime(MAX(e.starts_at)) < datetime(?)
     ORDER BY last_visit DESC`, [iso(now - INACTIVE_DAYS * DAY)]);
  if (inactive.length) {
    items.push({
      id: 'inactive', category: 'profiles', title: `Не приходят больше ${INACTIVE_DAYS} дней`,
      detail: `${players(inactive.length)} — позови вернуться или поставь паузу, чтобы не слать лишних приглашений`,
      action: { type: 'player', player_id: String(inactive[0].id) }, action_label: 'Открыть',
      people: inactive.slice(0, PEOPLE_LIMIT).map((row: any) => person(row, `был ${dayLabel(row.last_visit)}`)), people_total: inactive.length,
    });
  }
  return items;
}

async function moneyItems(db: DatabaseWrapper, now: number): Promise<ClubOrderItem[]> {
  const items: ClubOrderItem[] = [];
  const since = iso(now - LOOKBACK_DAYS * DAY);

  const games = await db.all<any>(`
    SELECT g.id, g.winner_team, g.protocol_text, g.archived_at, e.id AS evening_id, e.title, e.starts_at
      FROM games g JOIN game_evenings e ON e.id = g.evening_id
     WHERE g.archived_at IS NULL AND datetime(e.starts_at) >= datetime(?) AND datetime(e.starts_at) < datetime(?)
       AND (e.status <> 'active' OR datetime(e.starts_at) < datetime(?))`,
  [since, iso(now), iso(now - 12 * HOUR)]);
  const unfinished = new Map<string, { row: any; count: number }>();
  for (const game of games.filter(isUnfinishedEveningGame)) {
    const entry = unfinished.get(String(game.evening_id)) || { row: game, count: 0 };
    entry.count += 1;
    unfinished.set(String(game.evening_id), entry);
  }
  for (const [eveningId, { row, count }] of unfinished) {
    items.push({
      id: `protocols:${eveningId}`, category: 'money', title: 'Протоколы игр не завершены',
      detail: `${eveningName(row)} — ${count} ${plural(count, 'игра', 'игры', 'игр')} без итога, баллы и жетоны за них не начислены`,
      action: { type: 'evening', evening_id: eveningId, section: 'games' }, action_label: 'Открыть игры',
    });
  }

  const debts = await db.all<any>(`
    SELECT ep.player_id, p.nickname, e.id AS evening_id, e.title, e.starts_at, ep.amount_due - ep.amount_paid AS debt
      FROM evening_participants ep
      JOIN players p ON p.id = ep.player_id
      JOIN game_evenings e ON e.id = ep.evening_id
     WHERE ep.attendance_status = 'attended' AND COALESCE(ep.payment_status, '') <> 'waived'
       AND ep.amount_due > ep.amount_paid
       AND (e.settled_at IS NOT NULL OR e.status = 'completed')
       AND datetime(e.starts_at) >= datetime(?)
     ORDER BY e.starts_at DESC, p.nickname COLLATE NOCASE`, [since]);
  const byEvening = new Map<string, any[]>();
  for (const row of debts) byEvening.set(String(row.evening_id), [...(byEvening.get(String(row.evening_id)) || []), row]);
  for (const [eveningId, rows] of byEvening) {
    const total = rows.reduce((sum, row) => sum + Number(row.debt || 0), 0);
    items.push({
      id: `debts:${eveningId}`, category: 'money', title: 'Долги за вечер',
      detail: `${eveningName(rows[0])} — ${players(rows.length)} должны ${money(total)}`,
      action: { type: 'evening', evening_id: eveningId, section: 'management' }, action_label: 'К оплатам',
      people: rows.slice(0, PEOPLE_LIMIT).map((row: any) => person(row, money(Number(row.debt || 0)))), people_total: rows.length,
    });
  }
  return items;
}

export async function loadClubOrder(db: DatabaseWrapper, now = Date.now()) {
  const tables = await tableSet(db);
  const items = [
    ...await eveningItems(db, tables, now),
    ...await statusItems(db),
    ...await profileItems(db, tables, now),
    ...await moneyItems(db, now),
  ];
  return { items, count: items.length, categories: CLUB_ORDER_CATEGORIES, generated_at: iso(now) };
}
