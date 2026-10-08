import { describe, expect, it } from 'vitest';
import type { PersistedLiveSession } from '../components/LiveGameEngine/liveSessionStorage.ts';
import { getTrainingPrompt, planTrainingDay, trainingNightTarget } from '../lib/judgeConductTraining.ts';

const game = (changes: Record<string, unknown> = {}): PersistedLiveSession => ({
  phase: 'day_speeches', roundNumber: 1, dayStarterSlot: 1,
  activePlayers: Array.from({ length: 10 }, (_, i) => ({
    slot_num: i + 1, role: i === 0 ? 'Шериф' : i === 8 ? 'Мафия' : 'Мирный',
    team: i === 8 ? 'Чёрные' : 'Красные', alive: true,
    has_spoken_this_round: false,
  })),
  activeSpeakerSlot: 2,
  nominations: [], nominationsMap: {},
  votesByPlayer: {}, votingRounds: [], activeVotingRoundIndex: 0,
  votingStage: 'setup', currentVotingNomineeIndex: 0,
  votingFarewellQueue: [], nightSubPhase: 'intro', postNightStage: 'none',
  zeroNightSubPhase: null, zeroNightMusicState: 'pending',
  ...changes,
}) as unknown as PersistedLiveSession;

describe('judge conduct coach linear script', () => {
  it('starts with the agreed #2 -> #1, #7 -> #3 nominations', () => {
    const s = game();
    expect(planTrainingDay(s)).toEqual([{ speaker: 2, nominee: 1 }, { speaker: 7, nominee: 3 }]);
    expect(getTrainingPrompt(s).title).toBe('Игрок #2 выставляет #1');
    expect(getTrainingPrompt(game({ activeSpeakerSlot: 7, nominations: [1], nominationsMap: { 1: 2 } })).title)
      .toBe('Игрок #7 выставляет #3');
  });

  it('does not silently ignore a nomination skipped during a speech', () => {
    const s = game({
      activeSpeakerSlot: 7,
      activePlayers: game().activePlayers.map((p) => ({ ...p, has_spoken_this_round: p.slot_num === 2 })),
    });
    const hint = getTrainingPrompt(s);
    expect(hint.warning).toBe(true);
    expect(hint.detail).toContain('Назад');
  });

  it('expects exactly seats 2,3,4,5,6 on the first candidate of the first 5:5 vote', () => {
    const base = { phase: 'day_voting', activeSpeakerSlot: null, votingStage: 'collecting',
      votingRounds: [{ nominated_seats: [1, 3], is_revote: false }], activeVotingRoundIndex: 0,
      currentVotingNomineeIndex: 0 };
    const hint = getTrainingPrompt(game(base));
    expect(hint.detail).toContain('#2 · #3 · #4 · #5 · #6');
    const votesByPlayer = { 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
    expect(getTrainingPrompt(game({ ...base, votesByPlayer })).title).toBe('Голоса записаны');
    expect(getTrainingPrompt(game({ ...base, votesByPlayer: { ...votesByPlayer, 7: 1 } })).warning).toBe(true);
  });

  it('moves ordinary later voting to a majority without requiring complex splits', () => {
    const s = game({ roundNumber: 2, phase: 'day_voting', votingStage: 'collecting',
      votingRounds: [{ nominated_seats: [4, 5], is_revote: false }] });
    const hint = getTrainingPrompt(s);
    expect(hint.title).toBe('Голосуют против #4');
    expect(hint.detail).toContain('Осталось отметить:');
  });

  it('targets a live red player during the night, and teaches the mandatory post-kill steps', () => {
    expect(trainingNightTarget(game({ phase: 'night' }))).toBe(7);
    expect(getTrainingPrompt(game({ phase: 'night', nightSubPhase: 'shooting' })).title).toBe('Мафия убила #7');
    expect(getTrainingPrompt(game({ phase: 'night', postNightStage: 'farewell' })).detail).toContain('60 секунд');
    expect(getTrainingPrompt(game({ phase: 'night', postNightStage: 'death_protocol' })).title).toBe('Протокол убитого');
  });

  it('treats the Sheriff gesture in zero night as distinct from a night check', () => {
    const hint = getTrainingPrompt(game({ phase: 'zero_night', zeroNightMusicState: 'playing', zeroNightSubPhase: 'agreement' }));
    expect(hint.title).toBe('Вызови Шерифа');
    expect(hint.detail).toContain('НЕТ');
  });
});
