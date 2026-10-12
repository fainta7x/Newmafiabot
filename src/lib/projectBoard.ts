/**
 * «Проект» in the CRM (owner request 2026-10-12): `docs/PROJECT_STATE.md` is the single source; this turns it into cards by
 * direction and status for a read-only screen. The file is free prose, so the split is by its own structure (the
 * «Waiting on the owner» bullets, «ACTIVE» sections, the numbered queue) and a keyword guess for the direction. Pure.
 */

export type BoardDirection = 'game' | 'profile' | 'poker' | 'evenings' | 'bot' | 'broadcast' | 'infra' | 'other';
export type BoardStatus = 'waiting' | 'active' | 'done' | 'info';
export type BoardStage = 'idea' | 'in_pr' | 'check' | 'merged' | null;
export interface BoardCard { id: string; title: string; summary: string; body: string; direction: BoardDirection; status: BoardStatus; stage: BoardStage; section: string }

export const DIRECTION_LABELS: Record<BoardDirection, string> = {
  game: 'Игра и движок', profile: 'Профиль и рейтинги', poker: 'Покер', evenings: 'Вечера и CRM', bot: 'Бот и уведомления', broadcast: 'Эфир', infra: 'Инфраструктура и аудит', other: 'Прочее',
};
export const DIRECTION_ORDER: BoardDirection[] = ['game', 'profile', 'poker', 'evenings', 'bot', 'broadcast', 'infra', 'other'];

const RULES: Array<[BoardDirection, RegExp]> = [
  ['poker', /покер|poker/i],
  ['broadcast', /эфир|broadcast|\bOBS\b|twitch/i],
  ['game', /live game|вскрыт|reveal|движок|судь|протокол|хронолог|chronolog|реплей|replay|попил|тренажёр|trainer|школ/i],
  ['profile', /профил|рейтинг|статистик|\belo\b|сезон|ачивк|achievement|player app|страниц[аы] игры/i],
  ['bot', /\bбот|\bbot\b|telegram|\bvk\b|уведомл|анонс|notif/i],
  ['evenings', /вечер|\bcrm\b|организатор|регистрац|оплат|payment|турнир|маршрут/i],
  ['infra', /amvera|deploy|\bci\b|database|sqlite|архитектур|architecture|аудит|audit|checkpoint|runtime/i],
];

export const classifyDirection = (text: string): BoardDirection => RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? 'other';

export const detectStage = (text: string): BoardStage => {
  if (/in a pr\b|coded in a pr|built in a pr|needs merge|не слит|not yet merged/i.test(text)) return 'in_pr';
  if (/phone check|проверк\w* на телефоне|deploy\w* pending|merge\/deploy|runtime verification/i.test(text)) return 'check';
  if (/\bmerged\b|\bслито\b|#\d{3}\b.*merged/i.test(text)) return 'merged';
  if (/not built|не строил|не сделан|nothing is built|waits for the owner|\bidea\b|идея/i.test(text)) return 'idea';
  return null;
};

const clean = (text: string) => text.replace(/\*\*/g, '').replace(/~~/g, '').replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
const clip = (text: string, limit: number) => (text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`);

/** The full lead of an item (its bold part or its first sentence); the card shows it clipped and does not repeat it in the summary. */
const leadOf = (raw: string) => {
  const text = raw.replace(/^\s*(?:[-*]\s+|\d+\.\s+)/, '');
  const bold = text.match(/^(?:~~)?\*\*(.+?)\*\*/);
  if (bold) return clean(bold[1]).replace(/[.:]+$/, '');
  const first = clean(text).split(/(?<=[.!?])\s|:\s| — /)[0] || clean(text);
  return first.replace(/[.:]+$/, '');
};

let counter = 0;
const makeCard = (section: string, raw: string, status: BoardStatus, forced?: Partial<BoardCard>): BoardCard => {
  const body = clean(raw.replace(/^\s*(?:[-*]\s+|\d+\.\s+)/, ''));
  const lead = leadOf(raw);
  const title = clip(lead, 90);
  const rest = body.startsWith(lead) ? body.slice(lead.length).replace(/^[\s.:—)-]+/, '') : body;
  counter += 1;
  return {
    id: `c${counter}`, title, summary: clip(rest || body, 170), body, direction: classifyDirection(`${title} ${body.slice(0, 600)}`),
    status, stage: detectStage(body), section, ...forced,
  };
};

/** Splits one section into its top-level list items (a bullet or a numbered item with its indented continuation). */
const topItems = (lines: string[]) => {
  const items: string[] = [];
  for (const line of lines) {
    if (/^(?:[-*]\s|\d+\.\s)/.test(line)) items.push(line);
    else if (items.length && /^\s+\S/.test(line)) items[items.length - 1] += ` ${line.trim()}`;
    else if (items.length && line.trim() === '') continue;
  }
  return items;
};

export function parseProjectState(markdown: string): BoardCard[] {
  counter = 0;
  const cards: BoardCard[] = [];
  const sections: Array<{ level: number; title: string; lines: string[] }> = [];
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^(#{2,3})\s+(.*)$/);
    if (heading) sections.push({ level: heading[1].length, title: heading[2].trim(), lines: [] });
    else sections.at(-1)?.lines.push(line);
  }
  for (const section of sections) {
    const title = clean(section.title);
    if (/^Нужен ваш ответ$/i.test(title)) {
      for (const item of topItems(section.lines)) cards.push(makeCard(title, item, 'waiting'));
    } else if (/^В работе$/i.test(title)) {
      for (const item of topItems(section.lines)) cards.push(makeCard(title, item, 'active'));
    } else if (/^Планируем$/i.test(title)) {
      for (const item of topItems(section.lines)) cards.push(makeCard(title, item, 'info', { stage: 'idea' }));
    } else if (/^Уже сделано$/i.test(title)) {
      for (const item of topItems(section.lines)) cards.push(makeCard(title, item, 'done', { stage: 'merged' }));
    } else if (/^waiting on the owner/i.test(title)) {
      for (const item of topItems(section.lines)) cards.push(makeCard(title, item, 'waiting'));
    } else if (/^current queue/i.test(title)) {
      for (const item of topItems(section.lines)) cards.push(makeCard(title, item, /^\s*\d+\.\s+~~/.test(item) || /^\s*\d+\.\s+[^.]{0,80}?(?:built|done|implemented)\b/i.test(item.replace(/\*\*|~~/g, '')) ? 'done' : 'active'));
    } else if (/player-facing changes not yet announced/i.test(title)) {
      for (const item of topItems(section.lines)) cards.push(makeCard(title, item, 'info', { stage: 'merged' }));
    } else if (/\bactive\b/i.test(title) && !/^source-of-truth/i.test(title)) {
      const text = section.lines.join(' ').trim();
      if (text) cards.push(makeCard(title, `**${title.replace(/\s+—.*$/, '')}.** ${text}`, 'active'));
    }
  }
  return cards;
}

export const groupByDirection = (cards: BoardCard[]) => DIRECTION_ORDER
  .map((direction) => ({ direction, label: DIRECTION_LABELS[direction], cards: cards.filter((card) => card.direction === direction) }))
  .filter((group) => group.cards.length > 0);
