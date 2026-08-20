import { describe, expect, it } from 'vitest';
import {
  buildSeatVoteStatusPresentation,
  getSeatGridPositionClass,
  resolveSeatContainerClass,
} from '../components/LiveGameEngine/seatPresentationModel.js';

const baseBorderInput = () => ({
  alive: true,
  phase: 'day_speeches' as const,
  slotNum: 3,
  nominations: [] as number[],
  currentVotingNomineeIndex: 0,
  isSpeaking: false,
  isInteractiveVoting: false,
  votesByPlayer: undefined as Record<number, number> | undefined,
  isNominated: false,
  isChosenInBestMove: false,
  shootoutNominees: [] as number[],
  shootoutSubPhase: 'shootout_intro',
  bothLeaveVotes: [] as number[],
});

describe('Live Game seat presentation model', () => {
  it('keeps the existing table grid positions', () => {
    expect(getSeatGridPositionClass(1)).toBe('md:col-start-1 md:row-start-3');
    expect(getSeatGridPositionClass(6)).toBe('md:col-start-5 md:row-start-1');
    expect(getSeatGridPositionClass(10)).toBe('md:col-start-1 md:row-start-1');
    expect(getSeatGridPositionClass(11)).toBe('');
  });

  it('preserves the visual priority for dead, current nominee and speaking seats', () => {
    expect(resolveSeatContainerClass({ ...baseBorderInput(), alive: false })).toContain('border-rose-950');
    const currentNominee = resolveSeatContainerClass({
      ...baseBorderInput(),
      phase: 'day_voting',
      nominations: [3, 7],
      isSpeaking: true,
    });
    expect(currentNominee).toContain('border-rose-400');
    expect(currentNominee).toContain('ring-rose-400/50');
    expect(currentNominee).not.toContain('animate-pulse');
    expect(currentNominee).not.toContain('scale-[');
    expect(resolveSeatContainerClass({ ...baseBorderInput(), isSpeaking: true })).toContain('border-amber-400');
  });

  it('preserves shootout result and nominee highlighting priority', () => {
    expect(resolveSeatContainerClass({
      ...baseBorderInput(),
      phase: 'shootout',
      shootoutSubPhase: 'shootout_both_results',
      bothLeaveVotes: [3],
      shootoutNominees: [3, 5],
    })).toContain('border-rose-500');
    expect(resolveSeatContainerClass({
      ...baseBorderInput(),
      phase: 'shootout',
      shootoutSubPhase: 'shootout_both_results',
      shootoutNominees: [3, 5],
    })).toContain('border-amber-500/80');
    expect(resolveSeatContainerClass({
      ...baseBorderInput(),
      phase: 'shootout',
      shootoutNominees: [3],
    })).toContain('ring-2 ring-amber-400/40');
  });

  it('keeps interactive-voting border semantics, including the existing missing-map nuance', () => {
    const voting = {
      ...baseBorderInput(),
      phase: 'day_voting' as const,
      nominations: [4, 8],
      currentVotingNomineeIndex: 0,
      isInteractiveVoting: true,
    };

    expect(resolveSeatContainerClass({ ...voting, votesByPlayer: { 3: 4 } })).toContain('border-rose-500');
    expect(resolveSeatContainerClass({ ...voting, votesByPlayer: { 3: 8 } })).toContain('opacity-60');

    // Mandatory last-candidate remainder belongs to an ordinary voter seat.
    // Keep this assertion away from the current nominee itself because nominee
    // highlighting intentionally has a higher visual priority than vote state.
    const ordinaryVoterOnLastCandidate = {
      ...voting,
      slotNum: 2,
      currentVotingNomineeIndex: 1,
    };
    expect(resolveSeatContainerClass({ ...ordinaryVoterOnLastCandidate, votesByPlayer: {} })).toContain('border-rose-500');
    expect(resolveSeatContainerClass({ ...ordinaryVoterOnLastCandidate, votesByPlayer: undefined })).toBe('border-slate-800 bg-slate-900/50 hover:border-slate-600');
  });

  it('keeps nomination and best-move highlighting behind higher-priority states', () => {
    expect(resolveSeatContainerClass({ ...baseBorderInput(), isNominated: true })).toContain('ring-2 ring-rose-500/30');
    expect(resolveSeatContainerClass({ ...baseBorderInput(), isChosenInBestMove: true })).toContain('ring-2 ring-amber-500/20');
    expect(resolveSeatContainerClass(baseBorderInput())).toContain('border-slate-800/80');
  });

  it('shows an unassigned mandatory vote on the last candidate without repeating the voter number', () => {
    const automatic = buildSeatVoteStatusPresentation({
      slotNum: 3,
      activeNomineeSlot: 8,
      lastNomineeSlot: 8,
      votesByPlayer: {},
    });
    expect(automatic).toMatchObject({
      target: 8,
      automatic: true,
      hasVotedOther: false,
      statusText: '→ #8*',
    });
    expect(automatic.title).toContain('автоматический остаток');

    const explicitOther = buildSeatVoteStatusPresentation({
      slotNum: 3,
      activeNomineeSlot: 8,
      lastNomineeSlot: 8,
      votesByPlayer: { 3: 4 },
    });
    expect(explicitOther).toMatchObject({
      target: 4,
      automatic: false,
      hasVotedOther: true,
      statusText: '→ #4',
      statusColor: 'text-slate-500',
    });
  });

  it('leaves an unassigned voter visually blank before the last candidate', () => {
    expect(buildSeatVoteStatusPresentation({
      slotNum: 3,
      activeNomineeSlot: 4,
      lastNomineeSlot: 8,
      votesByPlayer: {},
    })).toMatchObject({
      target: undefined,
      automatic: false,
      statusText: '',
      statusBg: 'bg-slate-950/40',
    });
  });
});