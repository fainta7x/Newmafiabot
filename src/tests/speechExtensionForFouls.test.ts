import { describe, expect, it } from 'vitest';
import { createInitialGameDiscipline, consumeNextSpeech } from '../lib/gameDiscipline.js';
import {
  exchangeTwoFoulsForSpeech,
  getSpeechExtensionAvailability,
} from '../components/LiveGameEngine/speechExtensionModel.js';

const createState = () => createInitialGameDiscipline([{ id: '6', team: 'red' }]);

const availability = (overrides: Partial<Parameters<typeof getSpeechExtensionAvailability>[0]> = {}) => getSpeechExtensionAvailability({
  phase: 'day_speeches',
  roundNumber: 2,
  votingStage: 'setup',
  postNightStage: 'none',
  activeSpeakerSlot: 6,
  votingFarewellActive: false,
  regularFouls: 0,
  isRemoved: false,
  hasPendingDisciplineAction: false,
  ...overrides,
});

describe('two fouls for +30 seconds of current speech', () => {
  it('converts 0 fouls into 2 without queuing a third-foul penalty', () => {
    const state = createState();
    const next = exchangeTwoFoulsForSpeech(state, '6');
    expect(next.players['6'].regularFouls).toBe(2);
    expect(next.players['6'].has30SecPenalty).toBe(false);
  });

  it('converts 1 foul into 3 and keeps the next-speech 30-second penalty queued', () => {
    const state = createState();
    state.players['6'].regularFouls = 1;
    const next = exchangeTwoFoulsForSpeech(state, '6');
    expect(next.players['6'].regularFouls).toBe(3);
    expect(next.players['6'].has30SecPenalty).toBe(true);

    const followingSpeech = consumeNextSpeech(next, '6');
    expect(followingSpeech.duration).toBe(30);
    expect(followingSpeech.newState.players['6'].has30SecPenalty).toBe(false);
  });

  it('cannot be used with 2 or more regular fouls', () => {
    const state = createState();
    state.players['6'].regularFouls = 2;
    expect(exchangeTwoFoulsForSpeech(state, '6')).toBe(state);
    expect(availability({ regularFouls: 2 }).allowed).toBe(false);
  });

  it('is forbidden on the zero round', () => {
    expect(availability({ roundNumber: 1 }).allowed).toBe(false);
  });

  it('is allowed during regular, revote and farewell speeches after zero round', () => {
    expect(availability({ phase: 'day_speeches' }).allowed).toBe(true);
    expect(availability({ phase: 'day_voting', votingStage: 'revote_speeches' }).allowed).toBe(true);
    expect(availability({ phase: 'day_voting', votingStage: 'resolved', votingFarewellActive: true }).allowed).toBe(true);
    expect(availability({ phase: 'night', postNightStage: 'farewell' }).allowed).toBe(true);
  });

  it('is unavailable outside the current player speech', () => {
    expect(availability({ activeSpeakerSlot: null }).allowed).toBe(false);
    expect(availability({ phase: 'day_voting', votingStage: 'collecting' }).allowed).toBe(false);
    expect(availability({ phase: 'night', postNightStage: 'death_protocol' }).allowed).toBe(false);
  });
});
