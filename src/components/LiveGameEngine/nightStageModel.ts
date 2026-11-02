import { normalizeGameRole } from '../../shared/gameRoles.ts';
import type { ActivePlayerState } from './types.ts';

/**
 * What the judge sees at the top of the night panel (owner, 2026-11-02): which stage of the night it is (a ribbon) and what to do
 * now (a big hint in the stage's colour). Pure data, so the wording is tested without a browser.
 */
export type NightStageKey = 'intro' | 'shooting' | 'don' | 'sheriff' | 'morning';
export type NightStageTone = 'sleep' | 'shot' | 'don' | 'sheriff' | 'morning';

export const NIGHT_STAGES: Array<{ key: NightStageKey; short: string; tone: NightStageTone }> = [
  { key: 'intro', short: 'Сон', tone: 'sleep' },
  { key: 'shooting', short: 'Отстрел', tone: 'shot' },
  { key: 'don', short: 'Дон', tone: 'don' },
  { key: 'sheriff', short: 'Шериф', tone: 'sheriff' },
  { key: 'morning', short: 'Утро', tone: 'morning' },
];

export interface NightStageInput {
  subPhase: string;
  players: ActivePlayerState[];
  shotSlot: number | null;
  donSlot: number | null;
  donResult: boolean;
  sheriffSlot: number | null;
  sheriffResult: string | null;
}

export interface NightStageView {
  index: number;
  total: number;
  key: NightStageKey;
  tone: NightStageTone;
  /** The ribbon's label of the current stage. */
  stage: string;
  /** What to do right now, one sentence. */
  hint: string;
  /** The same in a line short enough for a small screen (it also carries the current choice). */
  shortHint: string;
  /** The judge's current choice in this stage, if there is one. */
  chosen: string | null;
}

const aliveWithRole = (players: ActivePlayerState[], role: 'don' | 'sheriff') => players.some((player) => player.alive && normalizeGameRole(player.role) === role);
const seatLabel = (players: ActivePlayerState[], slot: number) => `#${slot} ${players.find((player) => player.slot_num === slot)?.nickname || `Игрок ${slot}`}`;

export const donAtTable = (players: ActivePlayerState[]) => aliveWithRole(players, 'don');
export const sheriffAtTable = (players: ActivePlayerState[]) => aliveWithRole(players, 'sheriff');

export function nightStageView(input: NightStageInput): NightStageView {
  const key: NightStageKey = input.subPhase === 'shooting' || input.subPhase === 'don' || input.subPhase === 'sheriff' ? input.subPhase
    : input.subPhase === 'intro' ? 'intro' : 'morning';
  const index = NIGHT_STAGES.findIndex((stage) => stage.key === key);
  const base = { index, total: NIGHT_STAGES.length, key, tone: NIGHT_STAGES[index].tone, stage: NIGHT_STAGES[index].short };
  if (key === 'intro') return { ...base, hint: 'Город засыпает. Дождитесь тишины и начинайте отстрел.', shortHint: 'Город засыпает — ждём тишины', chosen: null };
  if (key === 'shooting') {
    return input.shotSlot
      ? { ...base, hint: 'Мафия выбрала цель. Верно? Тогда дальше. Другая цель — нажмите на другого игрока.', shortHint: `Цель: ${seatLabel(input.players, input.shotSlot)}`, chosen: `Цель: ${seatLabel(input.players, input.shotSlot)}` }
      : { ...base, hint: 'Нажмите на игрока, в которого выстрелила мафия. Не стреляли — «Дальше», уточним промах.', shortHint: 'Нажмите, в кого стреляла мафия', chosen: 'Цель: не выбрана' };
  }
  if (key === 'don') {
    if (!donAtTable(input.players)) return { ...base, hint: 'Дона за столом нет: проверки не будет. Просто выждите время фазы.', shortHint: 'Дона нет — ждите время фазы', chosen: null };
    return input.donSlot
      ? { ...base, hint: 'Проверка Дона записана. Дальше — Шериф.', shortHint: `Дон: #${input.donSlot} — ${input.donResult ? 'Шериф' : 'не Шериф'}`, chosen: `Дон проверил: ${seatLabel(input.players, input.donSlot)} — ${input.donResult ? 'Шериф' : 'не Шериф'}` }
      : { ...base, hint: 'Нажмите на игрока, которого проверил Дон.', shortHint: 'Нажмите, кого проверил Дон', chosen: 'Проверка: не выбрана' };
  }
  if (key === 'sheriff') {
    if (!sheriffAtTable(input.players)) return { ...base, hint: 'Шерифа за столом нет: проверки не будет. Просто выждите время фазы.', shortHint: 'Шерифа нет — ждите время фазы', chosen: null };
    return input.sheriffSlot
      ? { ...base, hint: 'Проверка Шерифа записана. Дальше — итоги ночи.', shortHint: `Шериф: #${input.sheriffSlot} — ${input.sheriffResult || '—'}`, chosen: `Шериф проверил: ${seatLabel(input.players, input.sheriffSlot)} — ${input.sheriffResult || '—'}` }
      : { ...base, hint: 'Нажмите на игрока, которого проверил Шериф.', shortHint: 'Нажмите, кого проверил Шериф', chosen: 'Проверка: не выбрана' };
  }
  return { ...base, hint: input.subPhase === 'best_move' ? 'Лучший ход первого убитого: он называет трёх игроков.' : 'Проверьте итоги ночи и зафиксируйте их.', shortHint: input.subPhase === 'best_move' ? 'Лучший ход первого убитого' : 'Проверьте итоги ночи', chosen: null };
}

/** The Don found the Sheriff on an earlier night: his checks no longer need a reminder. Read from the night log lines the engine writes. */
export const donFoundSheriffEarlier = (nightLogs: Array<{ log?: string }>) => nightLogs.some((entry) => /Дон: #\d+ — Шериф\./.test(String(entry?.log || '')));

/** The blacks still at the table: who may be named when the mafia missed. */
export const blacksAtTable = (players: ActivePlayerState[]) => players.filter((player) => player.alive && ['mafia', 'don'].includes(normalizeGameRole(player.role) || ''));
