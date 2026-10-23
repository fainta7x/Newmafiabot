import type { DatabaseWrapper } from '../../db/index.ts';
import { eveningPriceLabel } from '../../lib/eveningPrices.ts';
import { loadEveningPrices } from './eveningPriceSettingsService.ts';
import { loadPostTemplate, renderPostTemplate } from './postTemplateService.ts';
/** One plain-text announcement for VK and Telegram; transport-specific escaping happens at the boundary. */
export async function buildEveningPostText(db: DatabaseWrapper, evening: { id: string; starts_at: string; timezone?: string | null; venue?: string | null; title: string; format?: unknown; judge_nickname?: string | null }, signupUrl: string): Promise<string> {
  const prices = await loadEveningPrices(db, evening.id);
  const date = new Date(evening.starts_at);
  let when = 'Скоро', clock = '';
  if (Number.isFinite(date.getTime())) {
    const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('ru-RU', { timeZone: evening.timezone || 'Europe/Moscow', ...options }).format(date);
    const weekdays = ['В воскресенье', 'В понедельник', 'Во вторник', 'В среду', 'В четверг', 'В пятницу', 'В субботу'];
    const day = new Intl.DateTimeFormat('en-US', { timeZone: evening.timezone || 'Europe/Moscow', weekday: 'short' }).format(date);
    when = `${weekdays[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(day)]}, ${part({ day: 'numeric', month: 'long' })}`;
    clock = part({ hour: '2-digit', minute: '2-digit' });
  }
  const venue = String(evening.venue || '').trim();
  const price = eveningPriceLabel(evening.format, prices);
  const hasStaff = await db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'evening_staff_assignments'");
  const host = evening.judge_nickname || (hasStaff ? (await db.get<{nickname: string}>('SELECT p.nickname FROM evening_staff_assignments s JOIN players p ON p.id = s.judge_player_id WHERE s.evening_id = ? LIMIT 1', [evening.id]))?.nickname : '') || '';
  const template = await loadPostTemplate(db, 'vk_club_evening');
  const text = renderPostTemplate(template, { 'когда': when, 'время': clock, 'место': venue, 'где_и_когда': [venue, clock].filter(Boolean).join(', '), 'цена': price, 'ссылка': signupUrl, 'название': evening.title, 'ведущий': host });
  return host && !template.includes('{ведущий}') ? `${text}\n🎙 Ведущий вечера: ${host}` : text;
}
