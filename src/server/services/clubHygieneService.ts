import type { DatabaseWrapper } from '../../db/index.ts';
import { getRepositoryPlayerAvatarAsset } from '../../lib/playerAvatarManifest.ts';
import { MEMBER_SQL, recentlyContacted, withLinks } from './organizerAgendaService.ts';
import { calculateProfileCompleteness } from './playerProfileIntegrityService.ts';

/**
 * «Гигиена клуба» (owner, 2026-10-29): the club roster checked by category, each category a list the organizer walks through
 * like tasks. Every check reads the same profile data the player sees; nothing here changes a profile.
 */
export type HygieneKey = 'avatar' | 'birthday' | 'birthday_private' | 'full_name' | 'phone' | 'telegram' | 'no_contact' | 'preferred_format';

export const HYGIENE_CATEGORIES: Array<{ key: HygieneKey; label: string; hint: string }> = [
  { key: 'avatar', label: 'Нет аватарки', hint: 'Без фото человека не видно в карточках, постах и голосовании.' },
  { key: 'birthday', label: 'Нет дня рождения', hint: 'Без даты не придёт напоминание о сборе и не будет поздравления.' },
  { key: 'birthday_private', label: 'Дата рождения скрыта', hint: 'Дата есть, но скрыта: сбор на подарок и поздравление для этого игрока не запускаются.' },
  { key: 'full_name', label: 'Нет имени', hint: 'Нужно, чтобы понимать, кто скрывается за ником.' },
  { key: 'phone', label: 'Нет телефона', hint: 'Для связи, если не отвечает в мессенджере.' },
  { key: 'telegram', label: 'Нет Telegram', hint: 'Бот не напишет в личку сам: опросы и напоминания пойдут только через ВК (или никак).' },
  { key: 'no_contact', label: 'Нет ни Telegram, ни ВК', hint: 'Игрока не получится позвать автоматически — только лично.' },
  { key: 'preferred_format', label: 'Не выбран любимый формат', hint: 'Помогает звать на подходящие вечера.' },
];

const MISSING_FIELD: Partial<Record<HygieneKey, 'avatar' | 'birthday' | 'full_name' | 'phone' | 'preferred_format'>> = {
  avatar: 'avatar', birthday: 'birthday', full_name: 'full_name', phone: 'phone', preferred_format: 'preferred_format',
};

export async function loadClubHygiene(db: DatabaseWrapper, now = Date.now()) {
  const rows = await db.all<any>(`
    SELECT p.*,
           EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = p.id) AS has_db_avatar,
           EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = p.id) AS avatar_suppressed,
           EXISTS(SELECT 1 FROM player_external_identities x WHERE x.platform = 'vk' AND x.player_id = p.id) AS has_vk
      FROM players p
     WHERE ${MEMBER_SQL} AND COALESCE(p.contact_status, 'normal') NOT IN ('blocked', 'paused') AND COALESCE(p.stopped_attending, 0) = 0
     ORDER BY p.nickname COLLATE NOCASE`).catch(async () => db.all<any>(`
    SELECT p.*, EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = p.id) AS has_db_avatar,
           EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = p.id) AS avatar_suppressed, 0 AS has_vk
      FROM players p
     WHERE ${MEMBER_SQL} AND COALESCE(p.contact_status, 'normal') NOT IN ('blocked', 'paused') AND COALESCE(p.stopped_attending, 0) = 0
     ORDER BY p.nickname COLLATE NOCASE`));
  const quiet = await recentlyContacted(db, 'profile', now);
  const buckets = new Map<HygieneKey, any[]>(HYGIENE_CATEGORIES.map((c) => [c.key, []]));
  const hidden = new Map<HygieneKey, number>(HYGIENE_CATEGORIES.map((c) => [c.key, 0]));
  for (const row of rows) {
    row.has_repository_avatar = !Number(row.avatar_suppressed || 0) && Boolean(getRepositoryPlayerAvatarAsset(String(row.id)));
    const completeness = calculateProfileCompleteness(row);
    const hasTelegram = Boolean(String(row.telegram_user_id || '').trim() || String(row.telegram_username || '').trim());
    const hasVk = Boolean(Number(row.has_vk || 0));
    const hasBirthday = Number(row.birth_day) >= 1 && Number(row.birth_month) >= 1;
    const flags: Record<HygieneKey, boolean> = {
      avatar: false, birthday: false, full_name: false, phone: false, preferred_format: false,
      birthday_private: hasBirthday && String(row.birthday_visibility || 'private') === 'private',
      telegram: !hasTelegram, no_contact: !hasTelegram && !hasVk,
    };
    for (const [key, field] of Object.entries(MISSING_FIELD) as Array<[HygieneKey, string]>) {
      // A field the player declined on purpose is not a gap.
      flags[key] = completeness.missing_fields.includes(field as any) && (completeness.fields as any)[field]?.state !== 'declined';
    }
    for (const category of HYGIENE_CATEGORIES) {
      if (!flags[category.key]) continue;
      if (quiet.has(String(row.id))) { hidden.set(category.key, (hidden.get(category.key) || 0) + 1); continue; }
      buckets.get(category.key)!.push({ player_id: String(row.id), nickname: String(row.nickname || 'Без ника') });
    }
  }
  const categories = [];
  for (const category of HYGIENE_CATEGORIES) {
    const people = buckets.get(category.key)!;
    categories.push({ ...category, total: people.length, hidden: hidden.get(category.key) || 0, people: await withLinks(db, people) });
  }
  return { categories, checked: rows.length, quiet_days: 14, generated_at: new Date(now).toISOString() };
}
