import { describe, expect, it } from 'vitest';
import { dayStageView, DAY_STAGES, type DayStageInput } from '../components/LiveGameEngine/dayStageModel.ts';

const base: DayStageInput = {
  phase: 'day_voting', votingStage: 'collecting', isRevote: false, speakerSlot: null, nextSpeakerSlot: null, nominated: [2, 6], candidateSlot: 2,
  candidateIndex: 0, candidateCount: 2, counted: 4, eligible: 10, revoteSpeakerSlot: null, farewellSlot: null,
};

describe('day stage view', () => {
  it('speeches: who speaks, what is next, what to do when everybody has spoken', () => {
    expect(dayStageView({ ...base, phase: 'day_speeches', speakerSlot: 3, nominated: [] }).hint).toContain('Говорит #3');
    expect(dayStageView({ ...base, phase: 'day_speeches', nextSpeakerSlot: 4, nominated: [] }).hint).toContain('Речь #4');
    const done = dayStageView({ ...base, phase: 'day_speeches', nominated: [2] });
    expect(done.stage).toBe('Речи');
    expect(done.hint).toContain('К голосованию');
    expect(dayStageView({ ...base, phase: 'day_speeches', nominated: [] }).hint).toContain('никто не выставлен');
  });

  it('voting: the candidate being counted and how many hands are in', () => {
    const view = dayStageView(base);
    expect([view.index, view.stage, view.tone]).toEqual([1, 'Голосование', 'vote']);
    expect(view.hint).toContain('Кандидат 1 из 2: #2');
    expect(view.chosen).toBe('Проголосовали 4 из 10');
  });

  it('a revote, the raise and the result are their own stages', () => {
    expect(dayStageView({ ...base, isRevote: true }).stage).toBe('Переголосование');
    expect(dayStageView({ ...base, votingStage: 'revote_speeches', revoteSpeakerSlot: 6 }).hint).toContain('#6');
    expect(dayStageView({ ...base, votingStage: 'table_decision' }).stage).toBe('Подъём');
    expect(dayStageView({ ...base, votingStage: 'resolved', farewellSlot: 6 }).hint).toContain('Прощальная минута #6');
    expect(dayStageView({ ...base, votingStage: 'resolved' }).stage).toBe('Итог');
    expect(DAY_STAGES).toHaveLength(5);
  });

  it('one candidate: no voting is needed', () => {
    expect(dayStageView({ ...base, votingStage: 'setup', nominated: [5] }).hint).toContain('Выставлен один кандидат');
  });
});
