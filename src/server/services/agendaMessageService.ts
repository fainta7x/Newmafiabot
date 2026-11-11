import type { DatabaseWrapper } from '../../db/index.ts';
import { getPublicAppBaseUrl } from '../runtimeConfig.ts';
import { eveningShortCode } from './announcementShortLinks.ts';
import { loadPostTemplate, renderPostTemplate, type AgendaMessageKey } from './postTemplateService.ts';
import type { AgendaItem } from './organizerAgendaService.ts';

/**
 * A ready message next to every person in «Дела» (owner, 2026-11-11: «чтобы само приложение говорило, что писать»): the organizer copies
 * it and opens the chat. The wording is the club's own template (CRM «Текст постов»); the evening is the nearest open one that fits the person.
 */
const KEY_OF: Record<string, AgendaMessageKey> = {
  lead: 'msg_lead', novice_feedback: 'msg_novice_feedback', absent_regular: 'msg_absent_regular', absent_sometimes: 'msg_absent_sometimes',
  stopped: 'msg_stopped', profile: 'msg_profile', fill: 'msg_fill', thinking: 'msg_thinking',
};
const NOVICE_REASONS = new Set(['lead', 'novice_feedback']);

const whenLabel = (startsAt: string) => {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return 'скоро объявим дату';
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', ...options }).format(date);
  return `${part({ weekday: 'long' })}, ${part({ day: 'numeric', month: 'long' })}, ${part({ hour: '2-digit', minute: '2-digit' })}`;
};

async function nearestEvening(db: DatabaseWrapper, novice: boolean) {
  const rows = await db.all<{ id: string; starts_at: string; venue: string | null; format: string | null }>(
    `SELECT id, starts_at, venue, format FROM game_evenings
      WHERE status IN ('published', 'active') AND datetime(starts_at) >= datetime('now', '-3 hours') ORDER BY datetime(starts_at) ASC LIMIT 20`).catch(() => []);
  const isNovice = (row: { format: string | null }) => String(row.format || '').toUpperCase() === 'NOVICE';
  return rows.find((row) => (novice ? isNovice(row) : !isNovice(row))) || rows.find((row) => novice === isNovice(row)) || null;
}

export async function withAgendaMessages(db: DatabaseWrapper, items: AgendaItem[]): Promise<AgendaItem[]> {
  const needed = items.filter((item) => item.contact_reason && item.people?.length && KEY_OF[item.contact_reason]);
  if (!needed.length) return items;
  const base = getPublicAppBaseUrl().replace(/\/+$/, '');
  const evenings = { novice: await nearestEvening(db, true), club: await nearestEvening(db, false) };
  const cache = new Map<string, string>();
  const out: AgendaItem[] = [];
  for (const item of items) {
    const reason = item.contact_reason;
    const key = reason ? KEY_OF[reason] : null;
    if (!reason || !key || !item.people?.length) { out.push(item); continue; }
    const template = cache.get(key) ?? await loadPostTemplate(db, key);
    cache.set(key, template);
    const evening = NOVICE_REASONS.has(reason) ? evenings.novice : evenings.club;
    const link = reason === 'profile' ? `${base}/player` : evening ? `${base}/e/${encodeURIComponent(eveningShortCode(evening.id))}` : reason === 'lead' ? `${base}/welcome` : `${base}/player`;
    out.push({ ...item, people: item.people.map((person) => ({ ...person, message: renderPostTemplate(template, {
      'имя': person.nickname, 'когда': evening ? whenLabel(evening.starts_at) : 'скоро объявим дату', 'место': String(evening?.venue || 'уточним в приглашении'), 'ссылка': link,
    }) })) });
  }
  return out;
}
