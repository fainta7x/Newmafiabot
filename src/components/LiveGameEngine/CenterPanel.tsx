import React from "react";
import { createPortal } from "react-dom";
import { Pause, Play, RotateCcw, Mic, LogOut, ArrowLeft, ArrowRight, Volume2, VolumeX } from "lucide-react";
import { ActivePlayerState, Phase, NightSubPhase } from "./types.js";
import { VotingRound, determineVotingResult } from "../../shared/tournamentVoting.js";
import { requestJudgeGameMusicStop, requestJudgeNightMusicStart } from "../JudgeGameMusicController.tsx";
import {
  BEST_MOVE_SECONDS,
  buildTimerIdentity,
  createTimerDeadline,
  getRemainingTimerSeconds,
  resolveTimerDuration,
} from "./timerModel.js";
import {
  buildCollectingVotingPresentation,
  buildTableDecisionPresentation,
} from "./votingPresentationModel.js";

interface CenterPanelProps {
  activePlayers: ActivePlayerState[];
  activeSpeakerSlot: number | null;
  setActiveSpeakerSlot: (slot: number | null) => void;
  phase: Phase;
  roundNumber: number;
  timeLeft: number;
  setTimeLeft: (time: number) => void;
  zeroNightSubPhase: string | null;
  customTimerLabel: string | null;
  isTimerRunning: boolean;
  setIsTimerRunning: (isRunning: boolean) => void;
  timerMax: number;
  handleAdjustTime: (amount: number) => void;
  handleStartZeroNightTimer: (sub: "agreement" | "sheriff" | "seating") => void;
  donCheckSlot: number | null;
  donCheckResult: boolean | null;
  sheriffCheckSlot: number | null;
  sheriffCheckResult: string | null;
  nextSpeaker: ActivePlayerState | null;
  handleStartNextSpeaker: () => void;
  nominations: number[];
  currentVotingNomineeIndex: number;
  selectVotingNomineeIndex: (idx: number, customNominations?: number[]) => void;
  votes: Record<number, number>;
  votesByPlayer: Record<number, number>;
  handleInteractiveAutoRemainder: () => void;
  handleAllocateVotes: (nominee: number, count: number) => void;
  handleResolveVoting: () => void;
  nightSubPhase: NightSubPhase;
  shotPlayerSlot: number | null;
  getPrevStepAction: () => { label: string; onClick: () => void } | null;
  getNextStepInfo: () => { label: string; onClick: () => void } | null;
  addLogEntry?: (logText: string) => void;
  onCancel?: () => void;
  handleAdvanceNightSubPhase?: (sub: NightSubPhase) => void;
  handleResolveNight?: () => void;
  isMuted?: boolean;
  setIsMuted?: React.Dispatch<React.SetStateAction<boolean>>;
  votingRounds?: VotingRound[];
  activeVotingRoundIndex?: number;
  votingStage?: 'setup' | 'collecting' | 'round_result' | 'revote_speeches' | 'table_decision' | 'resolved';
  setVotingStage?: React.Dispatch<React.SetStateAction<'setup' | 'collecting' | 'round_result' | 'revote_speeches' | 'table_decision' | 'resolved'>>;
  revoteSpeakerIndex?: number;
  setRevoteSpeakerIndex?: React.Dispatch<React.SetStateAction<number>>;
  tableLeaveVotesInput?: number | null;
  setTableLeaveVotesInput?: React.Dispatch<React.SetStateAction<number | null>>;
  handleConfirmSingleElimination?: (slotNum: number) => void;
  handleGoToRevoteSpeeches?: (winners: number[]) => void;
  handleLaunchNextRevote?: (winners: number[]) => void;
  handleConfirmAutoNoElimination?: () => void;
  handleConfirmTableDecision?: (votesCount: number, winners: number[]) => void;

  handleTransitionToVoting?: () => void;
  markPlayerSpoken?: (slot: number) => void;
  isInteractiveVoting?: boolean;
  setIsInteractiveVoting?: (value: boolean) => void;
  votingSubPhase?: string;
  setVotingSubPhase?: React.Dispatch<React.SetStateAction<any>>;
  shootoutNominees?: number[];
  votingAttempt?: number;
  handleStartReVoting?: () => void;
  handleResolveShootoutVotes?: (...args: any[]) => void;
  shootoutSubPhase?: string;
  setShootoutSubPhase?: React.Dispatch<React.SetStateAction<any>>;
  bothLeaveVotes?: number[];
  setBothLeaveVotes?: React.Dispatch<React.SetStateAction<number[]>>;
  bestMoveGuesses?: number[];
  getSeatColor?: (player: ActivePlayerState) => string;
}

export default function CenterPanel({
  activePlayers,
  activeSpeakerSlot,
  setActiveSpeakerSlot,
  phase,
  roundNumber,
  timeLeft,
  setTimeLeft,
  zeroNightSubPhase,
  customTimerLabel,
  isTimerRunning,
  setIsTimerRunning,
  timerMax,
  handleAdjustTime,
  donCheckSlot,
  donCheckResult,
  sheriffCheckSlot,
  sheriffCheckResult,
  nextSpeaker,
  handleStartNextSpeaker,
  nominations,
  currentVotingNomineeIndex,
  selectVotingNomineeIndex,
  votes,
  votesByPlayer,
  handleInteractiveAutoRemainder,
  handleAllocateVotes,
  handleResolveVoting,
  nightSubPhase,
  shotPlayerSlot,
  getPrevStepAction,
  getNextStepInfo,
  onCancel,
  isMuted = false,
  setIsMuted,
  votingRounds = [],
  activeVotingRoundIndex = 0,
  votingStage = 'setup',
  setVotingStage,
  revoteSpeakerIndex = 0,
  setRevoteSpeakerIndex,
  setTableLeaveVotesInput,
  handleConfirmSingleElimination,
  handleGoToRevoteSpeeches,
  handleLaunchNextRevote,
  handleConfirmAutoNoElimination,
  handleConfirmTableDecision,
}: CenterPanelProps) {
  const [tableVoterSlots, setTableVoterSlots] = React.useState<number[]>([]);
  const [musicStartedRound, setMusicStartedRound] = React.useState<number | null>(null);
  const [musicStoppedRound, setMusicStoppedRound] = React.useState<number | null>(null);
  const [bestMoveTimeLeft, setBestMoveTimeLeft] = React.useState<number | null>(null);
  const timerDeadlineRef = React.useRef<number | null>(null);
  const timerIdentityRef = React.useRef('');
  const bestMoveDeadlineRef = React.useRef<number | null>(null);

  const activeSpeaker = activePlayers.find((p) => p.slot_num === activeSpeakerSlot);
  const donPlayer = activePlayers.find((p) => p.role === "Дон");
  const mafiaPlayers = activePlayers.filter((p) => p.role === "Мафия");
  const prevStep = getPrevStepAction();
  const currentRound = votingRounds[activeVotingRoundIndex];
  const effectiveTimerMax = resolveTimerDuration(phase, votingStage, timerMax);
  const isVotingLayout = phase === 'day_voting';
  const isRegularNightIntro = phase === 'night' && nightSubPhase === 'intro';
  const isFirstKilledBestMove = phase === 'night' && nightSubPhase === 'best_move';

  React.useEffect(() => {
    if (phase === 'day_voting' && votingStage === 'revote_speeches' && activeSpeakerSlot !== null && timeLeft > 30) {
      setTimeLeft(30);
    }
  }, [phase, votingStage, activeSpeakerSlot, timeLeft, setTimeLeft]);

  React.useEffect(() => {
    if (votingStage !== 'round_result') {
      setTableVoterSlots([]);
      setTableLeaveVotesInput?.(null);
    }
  }, [votingStage, activeVotingRoundIndex, setTableLeaveVotesInput]);

  React.useEffect(() => {
    if (phase !== 'night') {
      setMusicStartedRound(null);
      setMusicStoppedRound(null);
    }
  }, [phase, roundNumber]);

  /* Android / Telegram WebView throttles setInterval in background. A deadline
   * keeps speech/revote timers tied to real elapsed time. */
  React.useEffect(() => {
    const identity = buildTimerIdentity(phase, votingStage, activeSpeakerSlot, customTimerLabel, effectiveTimerMax);
    if (!isTimerRunning) {
      timerDeadlineRef.current = null;
      timerIdentityRef.current = identity;
      return;
    }

    if (timerDeadlineRef.current === null || timerIdentityRef.current !== identity) {
      timerDeadlineRef.current = createTimerDeadline(Date.now(), timeLeft);
      timerIdentityRef.current = identity;
    }

    const syncFromDeadline = () => {
      const deadline = timerDeadlineRef.current;
      if (!isTimerRunning || deadline === null) return;
      const remaining = getRemainingTimerSeconds(deadline, Date.now());
      setTimeLeft(remaining);
      if (remaining <= 0) setIsTimerRunning(false);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncFromDeadline();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', syncFromDeadline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', syncFromDeadline);
    };
  }, [isTimerRunning, phase, votingStage, activeSpeakerSlot, customTimerLabel, effectiveTimerMax, setIsTimerRunning, setTimeLeft, timeLeft]);

  /* First-killed best move is a real 20-second phase, independent from browser
   * interval throttling. It is displayed above the best-move protocol overlay. */
  React.useEffect(() => {
    if (!isFirstKilledBestMove) {
      bestMoveDeadlineRef.current = null;
      setBestMoveTimeLeft(null);
      return;
    }

    const deadline = createTimerDeadline(Date.now(), BEST_MOVE_SECONDS);
    bestMoveDeadlineRef.current = deadline;
    setBestMoveTimeLeft(BEST_MOVE_SECONDS);
    const sync = () => {
      const currentDeadline = bestMoveDeadlineRef.current;
      if (currentDeadline === null) return;
      setBestMoveTimeLeft(getRemainingTimerSeconds(currentDeadline, Date.now()));
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') sync();
    };
    const interval = window.setInterval(sync, 250);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', sync);
      bestMoveDeadlineRef.current = null;
    };
  }, [isFirstKilledBestMove, roundNumber]);

  const adjustTimer = (amount: number) => {
    if (isTimerRunning && timerDeadlineRef.current !== null) timerDeadlineRef.current += amount * 1000;
    handleAdjustTime(amount);
  };

  const handleStartTimer = (slot: number, duration: number) => {
    const safeDuration = resolveTimerDuration(phase, votingStage, duration);
    timerDeadlineRef.current = createTimerDeadline(Date.now(), safeDuration);
    timerIdentityRef.current = buildTimerIdentity(phase, votingStage, slot, customTimerLabel, safeDuration);
    setActiveSpeakerSlot(slot);
    setTimeLeft(safeDuration);
    setIsTimerRunning(true);
  };

  const phaseLabel = phase === 'zero_night'
    ? '🌙 Нулевая ночь'
    : phase === 'night'
      ? `🌙 Ночь ${roundNumber}`
      : phase === 'day_voting'
        ? `🗳️ Голосование · День ${roundNumber}`
        : `☀️ День ${roundNumber}`;

  const currentVotingResult = currentRound ? determineVotingResult(currentRound) : null;
  const canUseVotingBack = phase === 'day_voting' && (votingStage === 'round_result' || votingStage === 'revote_speeches');

  const handleVotingBack = () => {
    if (!currentRound || !currentVotingResult) return;
    setIsTimerRunning(false);
    setActiveSpeakerSlot(null);

    if (votingStage === 'round_result') {
      setTableVoterSlots([]);
      setTableLeaveVotesInput?.(null);
      setVotingStage?.('collecting');
      return;
    }

    if (votingStage === 'revote_speeches') {
      const winners = currentVotingResult.winners;
      if (revoteSpeakerIndex > 0) {
        const previousIndex = revoteSpeakerIndex - 1;
        const previousSpeaker = winners[previousIndex];
        setRevoteSpeakerIndex?.(previousIndex);
        if (previousSpeaker) handleStartTimer(previousSpeaker, 30);
      } else {
        setVotingStage?.('round_result');
      }
    }
  };

  const toggleTableVoter = (slot: number) => {
    if (!activePlayers.some((player) => player.slot_num === slot && player.alive)) return;
    setTableVoterSlots((previous) => {
      const next = previous.includes(slot) ? previous.filter((value) => value !== slot) : [...previous, slot];
      setTableLeaveVotesInput?.(next.length);
      return next;
    });
  };

  const renderDayNominations = () => {
    if (phase !== 'day_speeches') return null;
    return (
      <div className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-950/20 px-2 py-1 text-[9px] font-black text-fuchsia-200">
        Выставлены: {nominations.length ? nominations.map((slot) => `#${slot}`).join(' · ') : '—'}
      </div>
    );
  };

  const renderTimer = () => (
    <div className="space-y-1.5 w-full max-w-[300px] mx-auto">
      <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest block">
        {customTimerLabel || (activeSpeakerSlot ? `Сейчас говорит #${activeSpeakerSlot}` : 'Таймер')}
      </span>
      {activeSpeaker && <div className="text-xs font-black text-white truncate">{activeSpeaker.nickname || `Игрок ${activeSpeaker.slot_num}`}</div>}
      {renderDayNominations()}
      <div className={`text-2xl sm:text-3xl font-mono font-black py-0.5 rounded-xl border ${timeLeft <= 10 ? 'text-rose-400 border-rose-500/60 bg-rose-950/60' : 'text-emerald-400 border-slate-800 bg-slate-950'}`}>
        {timeLeft}с
      </div>
      <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
        <div className="h-full bg-emerald-600 transition-all" style={{ width: `${Math.min(100, Math.max(0, effectiveTimerMax ? (timeLeft / effectiveTimerMax) * 100 : 0))}%` }} />
      </div>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => adjustTimer(-10)} className="w-10 h-9 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold">-10</button>
        {isTimerRunning ? (
          <button type="button" onClick={() => setIsTimerRunning(false)} className="flex-1 h-9 rounded-xl bg-amber-600 text-slate-950 font-black text-xs flex items-center justify-center gap-1"><Pause className="w-4 h-4" />Пауза</button>
        ) : (
          <button type="button" onClick={() => setIsTimerRunning(true)} className="flex-1 h-9 rounded-xl bg-emerald-600 text-white font-black text-xs flex items-center justify-center gap-1"><Play className="w-4 h-4" />Старт</button>
        )}
        <button type="button" onClick={() => { setIsTimerRunning(false); setTimeLeft(effectiveTimerMax); }} className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 flex items-center justify-center"><RotateCcw className="w-4 h-4" /></button>
        {setIsMuted && (
          <button type="button" onClick={() => setIsMuted((v) => !v)} className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 flex items-center justify-center">
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );

  const renderVoting = () => {
    if (!currentRound) return <div className="text-xs text-slate-400">Подготовка голосования…</div>;

    const result = determineVotingResult(currentRound);
    const eligiblePlayers = activePlayers.filter((p) => p.alive);
    const eligibleVoterSeats = eligiblePlayers.map((p) => p.slot_num);

    if (votingStage === 'collecting' || votingStage === 'setup') {
      const { nominee, eligible, remaining, isLast, assignments } = buildCollectingVotingPresentation({
        eligibleVoterSeats,
        eligibleVoters: currentRound.eligible_voters,
        nominatedSeats: currentRound.nominated_seats,
        currentNomineeIndex: currentVotingNomineeIndex,
        votesByPlayer,
      });

      return (
        <div className="space-y-2 w-full max-w-[300px] mx-auto">
          <div className="text-[9px] uppercase font-black text-slate-400">
            {currentRound.is_revote ? `Переголосование #${activeVotingRoundIndex}` : 'Основное голосование'} · {eligible} голосующих
          </div>
          <div className="text-xs font-black text-white">
            Кто против <span className="text-rose-400 font-mono">#{nominee}</span>?
          </div>
          <div className="grid grid-cols-5 gap-1">
            {assignments.map(({ slot, target, automatic }) => (
              <div key={slot} className={`rounded-md border px-1 py-1 text-[8px] font-black ${target ? 'border-rose-500/30 bg-rose-950/20 text-rose-200' : 'border-slate-800 bg-slate-950/60 text-slate-500'}`}>
                #{slot}→{target ? `#${target}${automatic ? '*' : ''}` : '—'}
              </div>
            ))}
          </div>
          {isLast && <div className="text-[8px] text-slate-500">* оставшийся голос автоматически уходит последнему выставленному</div>}
          <div className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 flex justify-between text-[10px]">
            <span className="text-slate-400">Текущий итог</span>
            <strong className="text-rose-400 font-mono">{nominee === undefined ? 0 : (votes[nominee] || 0)}</strong>
          </div>
          {isLast ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 px-2 py-1.5 text-[9px] leading-4 text-amber-300">
              Последнему кандидату автоматически уходят все оставшиеся голоса{remaining > 0 ? `: ${remaining}` : ''}.
            </div>
          ) : (
            <div className="flex justify-center gap-1.5">
              <button type="button" onClick={() => nominee !== undefined && handleAllocateVotes(nominee, (votes[nominee] || 0) - 1)} className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs">−1</button>
              <button type="button" onClick={() => nominee !== undefined && handleAllocateVotes(nominee, (votes[nominee] || 0) + 1)} className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-rose-400 text-xs">+1</button>
            </div>
          )}
          <div className="flex justify-between gap-1.5">
            <button type="button" disabled={currentVotingNomineeIndex === 0} onClick={() => selectVotingNomineeIndex(currentVotingNomineeIndex - 1)} className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-[9px] disabled:opacity-30">← Назад</button>
            {isLast ? (
              <button type="button" onClick={() => { if (remaining > 0) handleInteractiveAutoRemainder(); handleResolveVoting(); }} className="flex-1 py-1.5 rounded-lg bg-emerald-600 text-white font-black text-[9px] uppercase">Подвести итог</button>
            ) : (
              <button type="button" onClick={() => selectVotingNomineeIndex(currentVotingNomineeIndex + 1)} className="flex-1 py-1.5 rounded-lg bg-rose-600 text-white font-black text-[9px] uppercase">Следующий →</button>
            )}
          </div>
        </div>
      );
    }

    if (votingStage === 'revote_speeches') {
      const winners = result.winners;
      const isLastSpeaker = revoteSpeakerIndex >= winners.length - 1;
      const advanceSpeech = () => {
        setIsTimerRunning(false);
        if (isLastSpeaker) {
          setActiveSpeakerSlot(null);
          handleLaunchNextRevote?.(winners);
          return;
        }
        const next = winners[revoteSpeakerIndex + 1];
        setRevoteSpeakerIndex?.((i) => i + 1);
        handleStartTimer(next, 30);
      };

      return (
        <div className="space-y-2 w-full max-w-[300px] mx-auto">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-black text-amber-400 uppercase">Спорная речь · 30 секунд</div>
            <div className="text-[9px] text-slate-500">{revoteSpeakerIndex + 1}/{winners.length}</div>
          </div>
          {renderTimer()}
          <button type="button" onClick={advanceSpeech} className={`w-full py-2 rounded-xl text-white font-black text-[10px] uppercase ${isLastSpeaker ? 'bg-rose-600' : 'bg-amber-600'}`}>
            {isLastSpeaker ? 'К переголосованию' : 'Следующий спорный'}
          </button>
        </div>
      );
    }

    if (votingStage === 'round_result') {
      if (result.outcome === 'single_eliminated') {
        return (
          <div className="space-y-2 max-w-[300px] mx-auto">
            <div className="text-xs font-black text-rose-400">Игрок #{result.winners[0]} покидает стол</div>
            <button type="button" onClick={() => handleConfirmSingleElimination?.(result.winners[0])} className="w-full py-2 rounded-xl bg-rose-600 text-white font-black text-[10px] uppercase">Подтвердить</button>
          </div>
        );
      }

      if (result.outcome === 'needs_revote') {
        return (
          <div className="space-y-2 max-w-[300px] mx-auto">
            <div className="text-[10px] font-black text-amber-300">Ничья: {result.winners.map((s) => `#${s}`).join(', ')}</div>
            <button type="button" onClick={() => handleGoToRevoteSpeeches?.(result.winners)} className="w-full py-2 rounded-xl bg-amber-600 text-white font-black text-[10px] uppercase">Речи по 30 секунд</button>
          </div>
        );
      }

      if (result.outcome === 'auto_no_elimination') {
        return (
          <div className="space-y-2 max-w-[300px] mx-auto">
            <div className="text-[10px] text-emerald-300">Два одинаковых деления подряд, а спорных игроков больше половины живых. Никто не покидает стол.</div>
            <button type="button" onClick={() => handleConfirmAutoNoElimination?.()} className="w-full py-2 rounded-xl bg-emerald-600 text-white font-black text-[10px] uppercase">Подтвердить и перейти в ночь</button>
          </div>
        );
      }

      if (result.outcome === 'requires_table_decision') {
        const eligible = currentRound.eligible_voters ?? eligibleVoterSeats.length;
        const { majority, entered, hasMajority, sortedSelectedVoterSlots } = buildTableDecisionPresentation({
          eligible,
          selectedVoterSlots: tableVoterSlots,
        });
        return (
          <div className="space-y-2 w-full max-w-[320px] mx-auto">
            <div className="text-[10px] text-amber-300 font-black">Поднять спорных: {result.winners.map((s) => `#${s}`).join(', ')}</div>
            <div className="text-[9px] text-slate-400">Выберите живых игроков, которые голосуют за подъём всех спорных.</div>
            <div className="grid grid-cols-5 gap-1.5">
              {eligibleVoterSeats.slice().sort((a, b) => a - b).map((slot) => {
                const selected = tableVoterSlots.includes(slot);
                const player = activePlayers.find((item) => item.slot_num === slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => toggleTableVoter(slot)}
                    className={`min-h-9 rounded-lg border px-1 text-[9px] font-black ${selected ? 'border-amber-400 bg-amber-500/20 text-amber-200' : 'border-slate-800 bg-slate-950/70 text-slate-400'}`}
                    title={player?.nickname ? `#${slot} · ${player.nickname}` : `Игрок #${slot}`}
                  >
                    #{slot}{selected ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-[10px]">
              <span className="text-slate-400">За подъём</span>
              <strong className={hasMajority ? 'text-emerald-400' : 'text-amber-400'}>{entered}/{eligible} · нужно {majority}</strong>
            </div>
            <div className="text-[9px] text-slate-500 min-h-[12px]">
              {entered ? `Голосуют: ${sortedSelectedVoterSlots.map((slot) => `#${slot}`).join(', ')}` : 'Пока никто не выбран'}
            </div>
            <button type="button" onClick={() => handleConfirmTableDecision?.(entered, result.winners)} className="w-full py-2 rounded-xl bg-amber-600 text-white font-black text-[10px] uppercase">Подтвердить решение стола</button>
          </div>
        );
      }
    }

    return <div className="text-xs text-slate-400">Голосование завершено</div>;
  };

  const renderIdleBody = () => {
    if (phase === 'zero_night') {
      const stageCopy = !zeroNightSubPhase
        ? 'Первый шаг — договорка мафии.'
        : zeroNightSubPhase === 'agreement'
          ? 'Договорка идёт. Следом — вызов Шерифа.'
          : zeroNightSubPhase === 'sheriff'
            ? 'Вызов Шерифа. Следом — свободная посадка.'
            : 'Свободная посадка. После неё город просыпается.';
      return (
        <div className="space-y-2 max-w-[300px] mx-auto">
          <div className="text-xs font-black text-white uppercase">Нулевая ночь</div>
          <div className="rounded-xl border border-violet-400/20 bg-violet-400/[0.06] px-3 py-2 text-[10px] leading-4 text-violet-100/80">{stageCopy}</div>
          <div className="text-[9px] leading-4 text-slate-500">Переход выполняется только кнопкой шага снизу — этапы нельзя перескочить.</div>
          {zeroNightSubPhase === 'agreement' && <div className="text-[9px] text-slate-400">Дон #{donPlayer?.slot_num || '—'} · Мафия {mafiaPlayers.map((p) => `#${p.slot_num}`).join(', ') || '—'}</div>}
        </div>
      );
    }

    if (phase === 'day_speeches') {
      return nextSpeaker ? (
        <div className="space-y-2 w-full max-w-[300px] mx-auto">
          <div className="text-xs font-black text-white uppercase">Круг обсуждения</div>
          {renderDayNominations()}
          <button type="button" onClick={handleStartNextSpeaker} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-black text-[10px] uppercase flex items-center gap-1.5 mx-auto">
            <Mic className="w-4 h-4" />Речь #{nextSpeaker.slot_num} · {nextSpeaker.nickname || `Игрок ${nextSpeaker.slot_num}`}
          </button>
        </div>
      ) : (
        <div className="space-y-2 w-full max-w-[300px] mx-auto">
          {renderDayNominations()}
          <div className="text-xs font-black text-emerald-400">Все выступили ✓</div>
        </div>
      );
    }

    if (phase === 'day_voting') return renderVoting();

    if (phase === 'night') {
      const labels: Record<string, string> = {
        intro: 'Город засыпает',
        shooting: shotPlayerSlot ? `Выстрел: #${shotPlayerSlot}` : 'Стрельба мафии — выберите цель',
        don: donCheckSlot ? `Дон проверил #${donCheckSlot}: ${donCheckResult ? 'Шериф' : 'не Шериф'}` : 'Проверка Дона',
        sheriff: sheriffCheckSlot ? `Шериф проверил #${sheriffCheckSlot}: ${sheriffCheckResult || '—'}` : 'Проверка Шерифа',
        best_move: 'ЛХ первого убитого',
        morning: 'Итоги ночи',
      };
      return <div className="text-xs font-black text-purple-300">{labels[nightSubPhase] || 'Ночь'}</div>;
    }

    return null;
  };

  const baseNextStep = getNextStepInfo();
  const nextStep = (() => {
    if (isRegularNightIntro && musicStartedRound !== roundNumber) {
      return {
        label: '♫ Включить музыку ночи',
        onClick: () => {
          const started = requestJudgeNightMusicStart();
          setMusicStartedRound(roundNumber);
          if (!started) setMusicStoppedRound(roundNumber);
        },
      };
    }

    if (phase === 'night' && nightSubPhase === 'sheriff' && musicStartedRound === roundNumber && musicStoppedRound !== roundNumber) {
      return {
        label: '♫ Выключить музыку',
        onClick: () => {
          requestJudgeGameMusicStop();
          setMusicStoppedRound(roundNumber);
        },
      };
    }

    if (phase === 'day_speeches' && nextSpeaker && activeSpeakerSlot === null && baseNextStep?.label.startsWith('Речь #')) {
      return { ...baseNextStep, label: `Речь #${nextSpeaker.slot_num} · ${nextSpeaker.nickname || `Игрок ${nextSpeaker.slot_num}`}` };
    }

    return baseNextStep;
  })();

  const panelClass = isVotingLayout
    ? 'relative md:static z-20 md:z-auto min-h-[210px] md:min-h-[300px] max-h-none overflow-visible'
    : 'sticky top-[72px] md:static z-40 md:z-auto min-h-[210px] md:min-h-[300px] max-h-[360px] md:max-h-none';
  const bodyClass = isVotingLayout
    ? 'flex-none flex items-start justify-start py-2 overflow-visible min-h-0'
    : 'flex-1 flex items-center justify-center py-2 overflow-y-auto overscroll-contain';

  return (
    <>
      <div className={`col-span-2 md:col-start-2 md:col-span-3 md:row-start-2 order-first md:order-none ${panelClass} bg-slate-900/98 border-2 border-slate-800 rounded-2xl sm:rounded-3xl p-2 sm:p-3 flex flex-col justify-between text-center shadow-2xl`}>
        <div className="flex justify-between items-center border-b border-slate-800 pb-1.5 gap-2">
          <span className="text-[10px] font-black uppercase text-slate-300 truncate">{phaseLabel}</span>
          <div className="flex items-center gap-2 shrink-0">
            {canUseVotingBack && (
              <button type="button" onClick={handleVotingBack} className="text-[9px] text-slate-300 flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-950 border border-slate-800">
                <ArrowLeft className="w-3 h-3" />Назад
              </button>
            )}
            {onCancel && <button type="button" onClick={() => confirm('Выйти из текущей игры?') && onCancel()} className="text-[9px] text-slate-400 flex items-center gap-1"><LogOut className="w-3 h-3" />Выйти</button>}
          </div>
        </div>

        <div className={bodyClass}>
          {phase === 'day_voting' && votingStage === 'revote_speeches'
            ? renderVoting()
            : (activeSpeakerSlot !== null || customTimerLabel !== null)
              ? renderTimer()
              : renderIdleBody()}
        </div>

        <div className="border-t border-slate-800 pt-1.5 space-y-1.5">
          <div className="flex justify-between text-[9px] text-slate-500">
            <span>Выставлены: {nominations.length ? nominations.map((n) => `#${n}`).join(', ') : '—'}</span>
            <span>Живых: {activePlayers.filter((p) => p.alive).length}/10</span>
          </div>
          <div className="grid grid-cols-12 gap-1.5 min-h-[36px]">
            {prevStep ? <button type="button" onClick={prevStep.onClick} className="col-span-4 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-[9px] font-bold flex items-center justify-center gap-1"><ArrowLeft className="w-3 h-3" />{prevStep.label}</button> : <div className="col-span-4" />}
            {nextStep ? <button type="button" onClick={nextStep.onClick} className="col-span-8 rounded-lg bg-rose-600 text-white text-[10px] font-black uppercase flex items-center justify-center gap-1">{nextStep.label}<ArrowRight className="w-3 h-3" /></button> : <div className="col-span-8 rounded-lg bg-slate-950/40 border border-slate-850 text-slate-600 text-[10px] flex items-center justify-center">Ожидание</div>}
          </div>
        </div>
      </div>

      {bestMoveTimeLeft !== null && typeof document !== 'undefined' && createPortal(
        <div className="fixed left-1/2 top-3 z-[145] -translate-x-1/2 rounded-2xl border border-amber-400/50 bg-slate-950/95 px-5 py-2 text-center shadow-2xl backdrop-blur-xl">
          <div className="text-[9px] font-black uppercase tracking-widest text-amber-300">Лучший ход · 20 секунд</div>
          <div className={`font-mono text-3xl font-black ${bestMoveTimeLeft <= 5 ? 'text-rose-400' : 'text-white'}`}>{bestMoveTimeLeft}с</div>
        </div>,
        document.body,
      )}
    </>
  );
}
