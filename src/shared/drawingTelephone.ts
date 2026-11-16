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
export type TelephoneLinkKind = 'drawing' | 'caption';
/** Link 1 is a drawing of the phrase, link 2 a caption of that drawing, and so on. */
export const telephoneLinkKind = (position: number): TelephoneLinkKind => (position % 2 === 1 ? 'drawing' : 'caption');
export type TelephoneItem = { kind: 'phrase' | TelephoneLinkKind | 'guess'; position: number; nickname: string; text: string | null; image: string | null };
export type TelephonePlayer = { id: string; nickname: string };
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
