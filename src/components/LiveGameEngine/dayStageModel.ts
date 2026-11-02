import type { NightStageView } from './nightStageModel.ts';

/**
 * The day's stages for the judge (owner, 2026-11-02: «понятно, что сейчас происходит и что нужно сделать», night and voting):
 * speeches, the voting, the revote, the raise («подъём») and the result. Pure data, like the night's.
 */
export const DAY_STAGES: Array<{ short: string; tone: StageTone }> = [
  { short: 'Речи', tone: 'speech' },
  { short: 'Голосование', tone: 'vote' },
  { short: 'Переголосование', tone: 'revote' },
  { short: 'Подъём', tone: 'raise' },
  { short: 'Итог', tone: 'result' },
];

type StageTone = NightStageView['tone'] | 'speech' | 'vote' | 'revote' | 'raise' | 'result';

export interface DayStageInput {
  phase: 'day_speeches' | 'day_voting';
  votingStage: string;
  isRevote: boolean;
  speakerSlot: number | null;
  nextSpeakerSlot: number | null;
  nominated: number[];
  candidateSlot: number | null;
  candidateIndex: number;
  candidateCount: number;
  /** Players who already put their hand for some candidate / players who may vote. */
  counted: number;
  eligible: number;
  revoteSpeakerSlot: number | null;
  farewellSlot: number | null;
}

export interface StageView {
  index: number;
  total: number;
  tone: StageTone;
  stage: string;
  stages: string[];
  hint: string;
  shortHint: string;
  chosen: string | null;
}

const seats = (list: number[]) => (list.length ? list.map((seat) => `#${seat}`).join(' · ') : 'никого');

export function dayStageView(input: DayStageInput): StageView {
  const make = (index: number, hint: string, shortHint: string, chosen: string | null = null): StageView => ({
    index, total: DAY_STAGES.length, tone: DAY_STAGES[index].tone, stage: DAY_STAGES[index].short, stages: DAY_STAGES.map((stage) => stage.short), hint, shortHint, chosen,
  });
  if (input.phase === 'day_speeches') {
    if (input.speakerSlot) return make(0, `Говорит #${input.speakerSlot}. Когда время вышло — «Завершить речь».`, `Говорит #${input.speakerSlot}`, `Выставлены: ${seats(input.nominated)}`);
    if (input.nextSpeakerSlot) return make(0, `Следующая речь — #${input.nextSpeakerSlot}. Нажмите «Речь #${input.nextSpeakerSlot}».`, `Дальше #${input.nextSpeakerSlot}`, `Выставлены: ${seats(input.nominated)}`);
    return make(0, input.nominated.length ? 'Все высказались. Нажмите «К голосованию».' : 'Все высказались, но никто не выставлен. Проверьте выставления или идите к ночи.', 'Все высказались', `Выставлены: ${seats(input.nominated)}`);
  }
  switch (input.votingStage) {
    case 'setup':
      return make(input.isRevote ? 2 : 1, input.nominated.length === 1 ? `Выставлен один кандидат: #${input.nominated[0]}. Голосование по правилам не нужно, дальше — ночь.` : 'Выставлены кандидаты. Нажмите «Начать голосование».', 'Начните голосование', `Кандидаты: ${seats(input.nominated)}`);
    case 'collecting':
      return make(input.isRevote ? 2 : 1, `Кандидат ${input.candidateIndex + 1} из ${input.candidateCount}${input.candidateSlot ? `: #${input.candidateSlot}` : ''}. Нажимайте игроков, поднявших руку.`, `Кандидат ${input.candidateIndex + 1} из ${input.candidateCount}`, `Проголосовали ${input.counted} из ${input.eligible}`);
    case 'revote_speeches':
      return make(2, `Речь перед переголосованием${input.revoteSpeakerSlot ? `: #${input.revoteSpeakerSlot}` : ''}. Потом — «Дальше».`, `Речь${input.revoteSpeakerSlot ? ` #${input.revoteSpeakerSlot}` : ''}`);
    case 'round_result':
      return make(input.isRevote ? 2 : 1, 'Голоса посчитаны. Проверьте итог и подтвердите.', 'Проверьте итог');
    case 'table_decision':
      return make(3, 'Спорные игроки набрали поровну. Сколько человек за «подъём»? Внесите число и подтвердите.', 'Кто за подъём?');
    default:
      return input.farewellSlot
        ? make(4, `Прощальная минута #${input.farewellSlot}. Потом — «Дальше».`, `Прощальная #${input.farewellSlot}`)
        : make(4, 'Голосование закончено. Нажмите, чтобы перейти к ночи.', 'Дальше — ночь');
  }
}
