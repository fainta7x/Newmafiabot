import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getRepositoryPlayerAvatarAsset } from '../../lib/playerAvatarManifest.ts';

export type ProfileFieldKey = 'avatar' | 'nickname' | 'full_name' | 'telegram' | 'phone' | 'birthday' | 'preferred_format';
export type ProfileFieldState = 'provided' | 'missing' | 'not_requested' | 'declined';

export type ProfileCompleteness = {
  percentage: number;
  complete: boolean;
  missing_fields: ProfileFieldKey[];
  important_missing_fields: ProfileFieldKey[];
  next_missing_field: ProfileFieldKey | null;
  fields: Record<ProfileFieldKey, { weight: number; complete: boolean; state: ProfileFieldState; label: string }>;
  updated_at: string | null;
  checked_at: string | null;
};

const FIELD_META: Record<ProfileFieldKey, { weight: number; label: string; sensitive?: boolean }> = {
  avatar: { weight: 20, label: 'Фото профиля' },
  nickname: { weight: 10, label: 'Игровое имя' },
  full_name: { weight: 15, label: 'Имя и фамилия' },
  telegram: { weight: 20, label: 'Связанный Telegram' },
  birthday: { weight: 20, label: 'Дата рождения', sensitive: true },
  phone: { weight: 10, label: 'Телефон', sensitive: true },
  preferred_format: { weight: 5, label: 'Предпочтительный формат' },
};

const IMPORTANT_FIELDS = new Set<ProfileFieldKey>(['avatar', 'full_name', 'telegram', 'birthday']);

const safeStatuses = (value: unknown): Partial<Record<ProfileFieldKey, ProfileFieldState>> => {
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Partial<Record<ProfileFieldKey, ProfileFieldState>>;
  } catch {
    return {};
  }
};

const normalizedState = (key: ProfileFieldKey, hasValue: boolean, saved: ProfileFieldState | undefined): ProfileFieldState => {
  if (hasValue) return 'provided';
  if (saved === 'declined' && FIELD_META[key].sensitive) return 'declined';
  if (saved === 'not_requested') return 'not_requested';
  return 'missing';
};

const fieldSatisfied = (key: ProfileFieldKey, hasValue: boolean, state: ProfileFieldState) => {
  if (hasValue) return true;
  // A privacy choice for sensitive data is respected and must not keep nagging the player forever.
  if (FIELD_META[key].sensitive && state === 'declined') return true;
  return false;
};

export function calculateProfileCompleteness(player: any): ProfileCompleteness {
  const statuses = safeStatuses(player?.profile_field_status_json);
  const hasAvatar = Boolean(player?.has_db_avatar || player?.avatar_updated_at || player?.has_repository_avatar || player?.avatar_url);
  const hasBirthday = Number(player?.birth_day) >= 1 && Number(player?.birth_month) >= 1;
  const values: Record<ProfileFieldKey, boolean> = {
    avatar: hasAvatar,
    nickname: Boolean(String(player?.nickname || '').trim()),
    full_name: Boolean(String(player?.full_name || '').trim()),
    telegram: Boolean(String(player?.telegram_user_id || '').trim() || String(player?.telegram_username || '').trim()),
    phone: Boolean(String(player?.phone || '').trim()),
    birthday: hasBirthday,
    preferred_format: Boolean(String(player?.preferred_format || '').trim()),
  };

  const fields = {} as ProfileCompleteness['fields'];
  let earned = 0;
  const missing: ProfileFieldKey[] = [];
  for (const key of Object.keys(FIELD_META) as ProfileFieldKey[]) {
    const state = normalizedState(key, values[key], statuses[key]);
    const complete = fieldSatisfied(key, values[key], state);
    fields[key] = { weight: FIELD_META[key].weight, label: FIELD_META[key].label, state, complete };
    if (complete) earned += FIELD_META[key].weight;
    else missing.push(key);
  }

  const percentage = Math.max(0, Math.min(100, Math.round(earned)));
  const importantMissing = missing.filter((key) => IMPORTANT_FIELDS.has(key));
  return {
    percentage,
    complete: percentage >= 100,
    missing_fields: missing,
    important_missing_fields: importantMissing,
    next_missing_field: importantMissing[0] || missing[0] || null,
    fields,
    updated_at: player?.profile_updated_at || player?.updated_at || null,
    checked_at: player?.profile_checked_at || null,
  };
}

export async function loadProfileCompleteness(db: DatabaseWrapper, playerId: string): Promise<ProfileCompleteness | null> {
  const player = await db.get<any>(`
    SELECT p.*,
           EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = p.id) AS has_db_avatar,
           EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = p.id) AS avatar_suppressed
      FROM players p WHERE p.id = ? LIMIT 1
  `, [playerId]);
  if (!player) return null;
  player.has_repository_avatar = !Number(player.avatar_suppressed || 0) && Boolean(getRepositoryPlayerAvatarAsset(playerId));
  return calculateProfileCompleteness(player);
}

export function validateBirthday(day: unknown, month: unknown, year: unknown): { day: number | null; month: number | null; year: number | null } {
  const hasAny = day !== undefined || month !== undefined || year !== undefined;
  if (!hasAny) return { day: null, month: null, year: null };
  if (day === null || month === null || day === '' || month === '') {
    if ((day === null || day === '') && (month === null || month === '') && (year === null || year === '' || year === undefined)) {
      return { day: null, month: null, year: null };
    }
    throw new Error('Укажи день и месяц рождения вместе');
  }
  const d = Number(day);
  const m = Number(month);
  const y = year === null || year === '' || year === undefined ? null : Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || d < 1 || d > 31 || m < 1 || m > 12) throw new Error('Некорректная дата рождения');
  if (y !== null && (!Number.isInteger(y) || y < 1900 || y > new Date().getFullYear())) throw new Error('Некорректный год рождения');
  const validationYear = y || (m === 2 && d === 29 ? 2024 : 2000);
  const date = new Date(Date.UTC(validationYear, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) throw new Error('Некорректная дата рождения');
  return { day: d, month: m, year: y };
}

export function validatePhone(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const text = String(value).trim();
  if (!/^[+\d][\d\s().-]{6,24}$/.test(text)) throw new Error('Некорректный номер телефона');
  const digits = text.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) throw new Error('Некорректный номер телефона');
  return text;
}

const timezoneDateParts = (now: Date, timeZone = 'Europe/Moscow') => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
};

const isLeap = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

export function nextBirthdayOccurrence(
  birthDay: number,
  birthMonth: number,
  now = new Date(),
  timeZone = 'Europe/Moscow',
): { date: string; days_until: number; effective_day: number; effective_month: number } {
  const today = timezoneDateParts(now, timeZone);
  const occurrenceFor = (year: number) => {
    const effectiveDay = birthMonth === 2 && birthDay === 29 && !isLeap(year) ? 28 : birthDay;
    const target = Date.UTC(year, birthMonth - 1, effectiveDay);
    const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
    return { year, effectiveDay, target, todayUtc };
  };
  let candidate = occurrenceFor(today.year);
  if (candidate.target < candidate.todayUtc) candidate = occurrenceFor(today.year + 1);
  return {
    date: new Date(candidate.target).toISOString().slice(0, 10),
    days_until: Math.round((candidate.target - candidate.todayUtc) / 86_400_000),
    effective_day: candidate.effectiveDay,
    effective_month: birthMonth,
  };
}

export async function listUpcomingBirthdays(db: DatabaseWrapper, windowDays = 30, now = new Date()) {
  const safeWindow = Math.max(1, Math.min(366, Math.trunc(windowDays || 30)));
  const players = await db.all<any>(`
    SELECT id, nickname, full_name, birth_day, birth_month, birth_year, birthday_visibility, contact_status, lifecycle_status
      FROM players
     WHERE birth_day IS NOT NULL AND birth_month IS NOT NULL
       AND COALESCE(contact_status, 'normal') NOT IN ('blocked', 'paused')
     ORDER BY nickname COLLATE NOCASE ASC
  `);
  return players
    .map((player: any) => ({ ...player, ...nextBirthdayOccurrence(Number(player.birth_day), Number(player.birth_month), now) }))
    .filter((player: any) => player.days_until <= safeWindow)
    .sort((a: any, b: any) => a.days_until - b.days_until || String(a.nickname).localeCompare(String(b.nickname), 'ru'));
}

const taskOpen = async (db: DatabaseWrapper, automationKey: string) => db.get<any>(
  `SELECT id FROM organizer_tasks WHERE automation_key = ? AND status NOT IN ('done','cancelled') LIMIT 1`,
  [automationKey],
);

async function ensureTask(db: DatabaseWrapper, input: { automationKey: string; playerId: string; title: string; description: string; dueAt?: string | null; priority?: string }) {
  if (await taskOpen(db, input.automationKey)) return false;
  const now = new Date().toISOString();
  await db.run(
    `INSERT OR IGNORE INTO organizer_tasks
      (id, title, description, type, status, priority, due_at, automation_key, player_id, created_at, updated_at)
     VALUES (?, ?, ?, 'reminder', 'todo', ?, ?, ?, ?, ?, ?)`,
    [`task_${crypto.randomUUID()}`, input.title, input.description, input.priority || 'medium', input.dueAt || null, input.automationKey, input.playerId, now, now],
  );
  return true;
}

export async function reconcileProfileIntegrityTasks(db: DatabaseWrapper, now = new Date()) {
  const players = await db.all<any>(`
    SELECT p.*,
           EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = p.id) AS has_db_avatar,
           EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = p.id) AS avatar_suppressed,
           (SELECT MAX(e.starts_at)
              FROM evening_participants ep JOIN game_evenings e ON e.id = ep.evening_id
             WHERE ep.player_id = p.id AND ep.attendance_status = 'attended') AS last_visit
      FROM players p
     WHERE COALESCE(p.contact_status, 'normal') NOT IN ('blocked','paused')
  `);
  let created = 0;
  for (const player of players) {
    if (player.last_visit && now.getTime() - new Date(player.last_visit).getTime() > 120 * 86_400_000) continue;
    player.has_repository_avatar = !Number(player.avatar_suppressed || 0) && Boolean(getRepositoryPlayerAvatarAsset(String(player.id)));
    const completeness = calculateProfileCompleteness(player);
    for (const field of completeness.important_missing_fields) {
      if (completeness.fields[field].state === 'declined') continue;
      const didCreate = await ensureTask(db, {
        automationKey: `profile-missing:${player.id}:${field}`,
        playerId: String(player.id),
        title: `Профиль: ${completeness.fields[field].label.toLowerCase()} — ${player.nickname}`,
        description: `Профиль заполнен на ${completeness.percentage}%. Нужно уточнить: ${completeness.fields[field].label}.`,
        priority: field === 'telegram' ? 'high' : 'medium',
      });
      if (didCreate) created += 1;
    }
    const checkedAt = player.profile_checked_at ? new Date(player.profile_checked_at).getTime() : null;
    if (checkedAt && now.getTime() - checkedAt > 365 * 86_400_000) {
      if (await ensureTask(db, {
        automationKey: `profile-stale:${player.id}:${new Date(now).getUTCFullYear()}`,
        playerId: String(player.id),
        title: `Проверить профиль — ${player.nickname}`,
        description: 'Профиль не проверялся организатором больше 12 месяцев.',
        priority: 'low',
      })) created += 1;
    }
    if (Number(player.birth_day) && Number(player.birth_month)) {
      const birthday = nextBirthdayOccurrence(Number(player.birth_day), Number(player.birth_month), now);
      if (birthday.days_until <= 5) {
        if (await ensureTask(db, {
          automationKey: `birthday:${player.id}:${birthday.date}`,
          playerId: String(player.id),
          title: `День рождения через ${birthday.days_until} дн. — ${player.nickname}`,
          description: `Подготовить поздравление. Дата: ${String(player.birth_day).padStart(2, '0')}.${String(player.birth_month).padStart(2, '0')}.`,
          dueAt: `${birthday.date}T09:00:00.000Z`,
          priority: 'medium',
        })) created += 1;
      }
    }
  }
  return { created, scanned: players.length };
}

let profileWorker: ReturnType<typeof setInterval> | null = null;
export function startProfileIntegrityWorker(db: DatabaseWrapper) {
  if (profileWorker) return;
  const run = () => void reconcileProfileIntegrityTasks(db).catch((error) => console.error('[PROFILE] task reconciliation failed:', error));
  setTimeout(run, 5_000).unref?.();
  profileWorker = setInterval(run, 6 * 60 * 60 * 1000);
  profileWorker.unref?.();
}
