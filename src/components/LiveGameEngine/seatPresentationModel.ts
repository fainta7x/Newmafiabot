import type { Phase } from './types.js';

const BORDER = {
  dead: 'border-rose-950 bg-[#160a0f] hover:border-rose-900',
  shootoutYes: 'border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.5)] bg-rose-500/20 ring-2 ring-rose-500/40 scale-[1.02]',
  shootoutResultNominee: 'border-amber-500/80 bg-amber-500/10 ring-1 ring-amber-500/30',
  shootoutNominee: 'border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.45)] bg-amber-500/15 ring-2 ring-amber-400/40 scale-[1.02]',
  currentNominee: 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.5)] scale-[1.02] animate-pulse',
  speaking: 'border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.45)] bg-amber-500/15 ring-2 ring-amber-400/40 scale-[1.03]',
  votingThis: 'border-rose-500 shadow-[0_0_15px_rgba(239,68,68,0.35)] bg-rose-500/10 ring-2 ring-rose-500/30',
  votedOther: 'border-slate-950 bg-slate-950/20 opacity-60',
  interactiveIdle: 'border-slate-800 bg-slate-900/50 hover:border-slate-600',
  nominated: 'border-rose-500 shadow-[0_0_15px_rgba(239,68,68,0.35)] bg-rose-500/10 ring-2 ring-rose-500/30',
  bestMove: 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] bg-amber-500/5 ring-2 ring-amber-500/20 hover:border-amber-400 hover:scale-[1.01]',
  aliveIdle: 'border-slate-800/80 bg-slate-900/50 hover:border-slate-600 hover:scale-[1.01]',
} as const;

export const getSeatGridPositionClass = (slot: number): string => {
  const positions: Record<number, string> = {
    1: 'md:col-start-1 md:row-start-3',
    2: 'md:col-start-2 md:row-start-3',
    3: 'md:col-start-3 md:row-start-3',
    4: 'md:col-start-4 md:row-start-3',
    5: 'md:col-start-5 md:row-start-3',
    6: 'md:col-start-5 md:row-start-1',
    7: 'md:col-start-4 md:row-start-1',
    8: 'md:col-start-3 md:row-start-1',
    9: 'md:col-start-2 md:row-start-1',
    10: 'md:col-start-1 md:row-start-1',
  };
  return positions[slot] || '';
};

export const resolveSeatContainerClass = ({
  alive,
  phase,
  slotNum,
  nominations,
  currentVotingNomineeIndex,
  isSpeaking,
  isInteractiveVoting,
  votesByPlayer,
  isNominated,
  isChosenInBestMove,
  shootoutNominees,
  shootoutSubPhase,
  bothLeaveVotes,
}: {
  alive: boolean;
  phase: Phase;
  slotNum: number;
  nominations: number[];
  currentVotingNomineeIndex: number;
  isSpeaking: boolean;
  isInteractiveVoting: boolean;
  votesByPlayer?: Record<number, number>;
  isNominated: boolean;
  isChosenInBestMove: boolean | undefined;
  shootoutNominees: number[];
  shootoutSubPhase: string;
  bothLeaveVotes: number[];
}): string => {
  if (!alive) return BORDER.dead;

  const activeNomineeSlot = phase === 'day_voting' ? nominations[currentVotingNomineeIndex] : null;
  const isCurrentNominee = phase === 'day_voting' && activeNomineeSlot === slotNum;

  if (phase === 'shootout' && shootoutSubPhase === 'shootout_both_results') {
    if (bothLeaveVotes.includes(slotNum)) return BORDER.shootoutYes;
    if (shootoutNominees.includes(slotNum)) return BORDER.shootoutResultNominee;
    return BORDER.interactiveIdle;
  }

  if (phase === 'shootout' && shootoutNominees.includes(slotNum)) return BORDER.shootoutNominee;
  if (isCurrentNominee) return BORDER.currentNominee;
  if (isSpeaking) return BORDER.speaking;

  if (phase === 'day_voting' && isInteractiveVoting) {
    const lastNominee = nominations[nominations.length - 1];
    const hasAssignments = votesByPlayer !== undefined;
    const explicitTarget = votesByPlayer?.[slotNum];
    const hasVotedOther = hasAssignments && explicitTarget !== undefined && explicitTarget !== activeNomineeSlot;
    const isVotingThis = hasAssignments && (
      explicitTarget === activeNomineeSlot ||
      (activeNomineeSlot === lastNominee && explicitTarget === undefined)
    );

    if (isVotingThis) return BORDER.votingThis;
    if (hasVotedOther) return BORDER.votedOther;
    return BORDER.interactiveIdle;
  }

  if (isNominated) return BORDER.nominated;
  if (isChosenInBestMove) return BORDER.bestMove;
  return BORDER.aliveIdle;
};

export interface SeatVoteStatusPresentation {
  target: number | undefined;
  automatic: boolean;
  hasVotedOther: boolean;
  statusColor: string;
  statusBg: string;
  statusText: string;
  title: string;
}

export const buildSeatVoteStatusPresentation = ({
  slotNum,
  activeNomineeSlot,
  lastNomineeSlot,
  votesByPlayer,
}: {
  slotNum: number;
  activeNomineeSlot: number | undefined;
  lastNomineeSlot: number | undefined;
  votesByPlayer?: Record<number, number>;
}): SeatVoteStatusPresentation => {
  const explicitTarget = votesByPlayer?.[slotNum];
  const automatic = explicitTarget === undefined && activeNomineeSlot === lastNomineeSlot;
  const target = explicitTarget ?? (automatic ? lastNomineeSlot : undefined);
  const hasVotedOther = explicitTarget !== undefined && explicitTarget !== activeNomineeSlot;

  let statusColor = 'text-slate-400';
  let statusBg = 'bg-slate-950/40';
  if (hasVotedOther) {
    statusColor = 'text-slate-500';
    statusBg = 'bg-slate-950/60';
  } else if (target !== undefined) {
    statusColor = 'text-rose-400 font-black';
    statusBg = 'bg-rose-950/20 border border-rose-500/25';
  }

  // The seat number is already a large persistent locator in the footer.
  // Voting state should only communicate the new information: target or no target.
  const statusText = target !== undefined
    ? `→ #${target}${automatic ? '*' : ''}`
    : '';
  const title = target !== undefined
    ? `Игрок #${slotNum} голосует за #${target}${automatic ? ' (автоматический остаток)' : ''}`
    : `Игрок #${slotNum} ещё не проголосовал`;

  return { target, automatic, hasVotedOther, statusColor, statusBg, statusText, title };
};