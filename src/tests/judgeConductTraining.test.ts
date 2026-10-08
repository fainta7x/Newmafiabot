import { describe, expect, it } from 'vitest';
import type { PersistedLiveSession } from '../components/LiveGameEngine/liveSessionStorage.ts';
import { getTrainingPrompt, getJudgeTrainingGate, planTrainingDay, trainingNightTarget } from '../lib/judgeConductTraining.ts';

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


  it('forces the correct zero-night progression with one primary control', () => {
    for (const [sub, music, title] of [
      [null, 'pending', 'Включи музыку нулевой ночи'],
      [null, 'playing', 'Договорка мафии'],
      ['agreement', 'playing', 'Вызов Шерифа'],
      ['sheriff', 'playing', 'Свободная посадка'],
      ['seating', 'playing', 'Выключи музыку'],
      ['seating', 'stopped', 'Открой нулевой круг'],
    ] as const) {
      const gate = getJudgeTrainingGate(game({ phase: 'zero_night', zeroNightSubPhase: sub, zeroNightMusicState: music }));
      expect(gate?.title).toBe(title);
      expect(gate?.allowed).toEqual(['.live-judge-hud__primary']);
    }
  });

  it('requires the nominated player during #2 and allows only that action', () => {
    const gate = getJudgeTrainingGate(game());
    expect(gate?.allowed).toEqual(['.live-seat-card[data-seat="1"] .live-seat-quick-action--nomination']);
    expect(gate?.title).toBe('Игрок #2 выставляет #1');
    const after = getJudgeTrainingGate(game({ nominations: [1], nominationsMap: { 1: 2 } }));
    expect(after?.allowed).toEqual(['.live-judge-hud__primary']);
    expect(after?.title).toBe('Заверши речь #2');
    expect(getJudgeTrainingGate(game({ activeSpeakerSlot: 7, nominations: [1], nominationsMap: { 1: 2 } }))?.allowed)
      .toEqual(['.live-seat-card[data-seat="3"] .live-seat-quick-action--nomination']);
  });

  it('only exposes the five required voters, then Next and Finalize', () => {
    const voting = { phase: 'day_voting', activeSpeakerSlot: null, votingStage: 'collecting',
      votingRounds: [{ nominated_seats: [1, 3], is_revote: false }], activeVotingRoundIndex: 0,
      currentVotingNomineeIndex: 0 };
    const start = getJudgeTrainingGate(game(voting));
    expect(start?.highlight).toEqual([2, 3, 4, 5, 6].map((n) => '.live-seat-card[data-seat="' + n + '"]'));
    expect(start?.allowed).toContain('[data-testid="live-voting-back-to-speeches"]');
    const votes = { 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
    expect(getJudgeTrainingGate(game({ ...voting, votesByPlayer: votes }))?.allowed).toEqual(['[data-testid="live-voting-next"]', '[data-testid="live-voting-back-to-speeches"]']);
    expect(getJudgeTrainingGate(game({ ...voting, votesByPlayer: votes }))?.highlight).toEqual(['[data-testid="live-voting-next"]']);
    expect(getJudgeTrainingGate(game({ ...voting, votesByPlayer: votes, currentVotingNomineeIndex: 1 }))?.highlight)
      .toEqual(['[data-testid="live-voting-finalize"]']);
  });

  it('continues with the simple revote and releases the hard gate after the zero round', () => {
    const voting = { phase: 'day_voting', activeSpeakerSlot: null, votingStage: 'revote_speeches',
      votingRounds: [{ nominated_seats: [1, 3], is_revote: false }], activeVotingRoundIndex: 0 };
    expect(getJudgeTrainingGate(game(voting))?.allowed).toEqual(['.live-judge-hud__stack--revote-speech > .live-judge-action']);
    expect(getJudgeTrainingGate(game({ ...voting, roundNumber: 2 }))?.title).toBe('Попил: речи по 30 секунд');
    expect(getJudgeTrainingGate(game({ phase: 'night', nightSubPhase: 'shooting' }))?.title).toBe('Мафия стреляет в #7');
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

describe('judge training stays scripted beyond the zero round', () => {
  it('teaches an ordinary foul on zero round and +30 only on an eligible later day', () => {
    const at = (slot: number, roundNumber: number, fouls: number, extended: number | null = null) => game({
      roundNumber,
      activeSpeakerSlot: slot,
      speechExtendedSlot: extended,
      activePlayers: game().activePlayers.map(p => ({ ...p, fouls: p.slot_num === slot ? fouls : 0 })),
    });
    const foul = getJudgeTrainingGate(at(3, 1, 0));
    expect(foul?.kind).toBe('foul');
    expect(foul?.foulSeat).toBe(3);
    expect(foul?.allowed).toContain('[data-testid="live-player-add-regular-foul"][data-seat="3"]');
    expect(getJudgeTrainingGate(at(3, 1, 1))?.title).toBe('Заверши речь #3');
    // There must be no +30 instruction anywhere in the zero circle.
    expect(getJudgeTrainingGate(at(4, 1, 0))?.title).toBe('Заверши речь #4');
    const extension = getJudgeTrainingGate(at(2, 2, 0));
    expect(extension?.allowed).toEqual(['[data-testid="live-hud-speech-extension"]']);
    expect(extension?.detail).toContain('начислит два обычных фола');
    expect(getJudgeTrainingGate(at(2, 2, 2, 2))?.title).toBe('Заверши речь #2');
  });

  it('teaches shooting and Don/Sheriff checks by specified seats, never arbitrary clicks', () => {
    const shot = getJudgeTrainingGate(game({ phase: 'night', nightSubPhase: 'shooting' }));
    expect(shot?.allowed).toEqual(['.live-seat-card[data-seat="7"]']);
    expect(shot?.kind).toBe('night');
    expect(getJudgeTrainingGate(game({ phase: 'night', nightSubPhase: 'shooting', shotPlayerSlot: 7 }))?.allowed)
      .toEqual(['.live-judge-hud__primary']);
    expect(getJudgeTrainingGate(game({ phase: 'night', nightSubPhase: 'don' }))?.allowed)
      .toEqual(['.live-seat-card[data-seat="1"]']);
    expect(getJudgeTrainingGate(game({ phase: 'night', nightSubPhase: 'don', donCheckSlot: 1 }))?.title)
      .toBe('Проверка Дона записана');
    expect(getJudgeTrainingGate(game({ phase: 'night', nightSubPhase: 'sheriff' }))?.allowed)
      .toEqual(['.live-seat-card[data-seat="9"]']);
    expect(getJudgeTrainingGate(game({ phase: 'night', nightSubPhase: 'sheriff', sheriffCheckSlot: 9 }))?.allowed)
      .toEqual(['.live-judge-hud__primary']);
  });

  it('keeps the voting gate active for split-vote and later day rounds', () => {
    const vote = { phase: 'day_voting', votingStage: 'collecting', currentVotingNomineeIndex: 0,
      votingRounds: [{ nominated_seats: [1, 3], is_revote: false }, { nominated_seats: [1, 3], is_revote: true }], activeVotingRoundIndex: 1,
      activeSpeakerSlot: null, roundNumber: 2 };
    const guard = getJudgeTrainingGate(game(vote));
    expect(guard?.kind).toBe('vote');
    expect(guard?.allowed).not.toContain(backToSpeechesTest);
    expect(guard?.allowed.some(s => s.includes('live-seat-card'))).toBe(true);
  });
});

const backToSpeechesTest = '[data-testid="live-voting-back-to-speeches"]';
