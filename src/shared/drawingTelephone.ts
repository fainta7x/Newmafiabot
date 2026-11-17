import { russianStem } from './russianStem.ts';

/**
 * «Испорченный телефон с рисунками» (owner, 2026-11-16). Rules agreed with the owner are in docs/BUSINESS_RULES.md.
 * A chain: the author's phrase → drawing → caption → drawing → … (5–20 links, each link a different player chosen by the
 * previous one) → the guesser, chosen by the author at the start, sees the last drawing and the last caption and writes
 * what the starting phrase was. Then the whole chain opens for everybody.
 */
export const TELEPHONE_MIN_LINKS = 5;
export const TELEPHONE_MAX_LINKS = 20;
export const TELEPHONE_TURN_HOURS = 8;
export const TELEPHONE_REWARD = 50;
export const TELEPHONE_TEXT_MAX = 120;
export const TELEPHONE_COLORS = ['#111111', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#8d6e63'];
/** Night by Moscow time, 00:00–08:00, does not count in the 8 hours (owner, 2026-11-17: a turn passed in the evening to
 * someone asleep must not come back by itself). Moscow is UTC+3 all year. */
export const TELEPHONE_NIGHT_FROM_HOUR = 0;
export const TELEPHONE_NIGHT_TO_HOUR = 8;
const MOSCOW_OFFSET_MS = 3 * 3_600_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Next moment after `at` that is the start or the end of a night (Moscow). */
const nextNightEdge = (at: number) => {
  const local = at + MOSCOW_OFFSET_MS;
  const dayStart = Math.floor(local / DAY_MS) * DAY_MS;
  const nightEnd = dayStart + TELEPHONE_NIGHT_TO_HOUR * HOUR_MS;
  const nextNight = dayStart + DAY_MS + TELEPHONE_NIGHT_FROM_HOUR * HOUR_MS;
  return (local < nightEnd ? nightEnd : nextNight) - MOSCOW_OFFSET_MS;
};
const isNight = (at: number) => {
  const hour = Math.floor((((at + MOSCOW_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS / HOUR_MS);
  return hour >= TELEPHONE_NIGHT_FROM_HOUR && hour < TELEPHONE_NIGHT_TO_HOUR;
};
/** The moment when `ms` of day time (outside the night) have passed since `from`. */
export function telephoneDeadline(from: Date, ms = TELEPHONE_TURN_HOURS * HOUR_MS): Date {
  let at = from.getTime();
  let left = ms;
  while (left > 0) {
    const edge = nextNightEdge(at);
    if (isNight(at)) { at = edge; continue; }
    const step = Math.min(left, edge - at);
    at += step;
    left -= step;
  }
  return new Date(at);
}
/** Day time (outside the night) between two moments; 0 when `to` is not later. */
export function telephoneDayMsBetween(from: Date, to: Date): number {
  let at = from.getTime();
  const end = to.getTime();
  let total = 0;
  while (at < end) {
    const edge = Math.min(nextNightEdge(at), end);
    if (!isNight(at)) total += edge - at;
    at = edge;
  }
  return total;
}
export type TelephoneLinkKind = 'drawing' | 'caption';
/** Link 1 is a drawing of the phrase, link 2 a caption of that drawing, and so on. */
export const telephoneLinkKind = (position: number): TelephoneLinkKind => (position % 2 === 1 ? 'drawing' : 'caption');
export type TelephoneItem = { kind: 'phrase' | TelephoneLinkKind | 'guess'; position: number; nickname: string; text: string | null; image: string | null };
/** `bot_blocked`: the player blocked the club bot, so «твой ход» will not reach him (owner, 2026-11-16). */
export type TelephonePlayer = { id: string; nickname: string; bot_blocked?: boolean; telegram_username?: string | null };
/** move — draw or caption and choose the next; choose — a turn came back, choose another player; guess — the last link;
 * choose_guesser — the guesser did not answer, the author chooses another one. Every step has 8 hours. */
export type TelephoneStep = 'move' | 'choose' | 'guess' | 'choose_guesser';
export type TelephoneChainState = {
  id: string; status: 'active' | 'done'; length: number; done_links: number;
  author: TelephonePlayer; guesser: TelephonePlayer; current: TelephonePlayer | null; step: TelephoneStep | null;
  deadline_at: string | null; created_at: string; finished_at: string | null;
  /** What the viewer is asked to do now, if anything. */
  my_task: null | { step: TelephoneStep; kind: TelephoneLinkKind | 'guess' | null; position: number; last: boolean };
  /** Only what the viewer may see: the previous link for a mover, the last drawing and caption for the guesser, everything when done. */
  items: TelephoneItem[];
  /** Everyone who has taken part so far (names only, the content stays hidden). */
  players: TelephonePlayer[];
};
export type TelephoneListState = {
  my_turns: Array<{ id: string; step: TelephoneStep; position: number; length: number; author: string; deadline_at: string | null }>;
  my_active: { id: string; done_links: number; length: number; current: string | null } | null;
  /** Every chain under way, for everybody (owner, 2026-11-16: «все видели все начатые звенья с этапом»); no content until the end. */
  running: Array<{ id: string; author: string; guesser: string; done_links: number; length: number; step: TelephoneStep | null; current: string | null; deadline_at: string | null }>;
  finished: Array<{ id: string; author: string; guesser: string; phrase: string; guess: string | null; length: number; finished_at: string; cover: string | null }>;
  reward: number;
};
/**
 * Words of a caption for the «no word of an earlier caption» rule: words of 3+ letters, each reduced to its stem, so
 * «кот», «кота», «котом» are one word and «котлета» another (owner, 2026-11-16). Map: stem → the word as written.
 */
export const telephoneWords = (text: string) => new Map((text.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').match(/[a-zа-я0-9]+/g) || []).filter((word) => word.length >= 3).map((word) => [russianStem(word), word] as const));
/** The key that keeps a starting phrase from being used twice in the club: words only, Ё = Е, one space between. */
export const normalizeTelephonePhrase = (text: string) => (text.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').match(/[a-zа-я0-9]+/g) || []).join(' ');
