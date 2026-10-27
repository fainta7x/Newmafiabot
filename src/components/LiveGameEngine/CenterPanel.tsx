import type { ZeroRoundRule } from '../../shared/zeroRoundRule.ts';
import React from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, LogOut, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { ActivePlayerState, NightSubPhase, Phase } from "./types.js";
import { VotingRound, determineVotingResult } from "../../shared/tournamentVoting.js";
import { requestJudgeGameMusicStop, requestJudgeNightMusicStart } from "../JudgeGameMusicController.tsx";

const JUDGE_MUSIC_MENU_ENABLED = false;
import type { ZeroNightMusicState } from "./engineStateModel.js";
import { VoteByNumbersOverlay } from "./VoteByNumbersOverlay.tsx";
import { seatColorVars } from "./seatColors.ts";
import { SeatBadge } from "./SeatBadge.tsx";
import { FitText } from "./FitText.tsx";
import "../crm/liveGameEveningBugfixes.css";
import "../crm/liveGameHudReadability.css";
import {
  BEST_MOVE_SECONDS,
  DEATH_PROTOCOL_SECONDS,
  SPEECH_EXTENSION_SECONDS,
  buildTimerIdentity,
  createTimerDeadline,
  getRemainingTimerSeconds,
  resolvePersistedTimerDeadline,
  resolveTimerDuration,
} from "./timerModel.js";
import {
  buildCollectingVotingPresentation,
  buildTableDecisionPresentation,
} from "./votingPresentationModel.js";
import {
  activateTableDecisionSelection,
  deactivateTableDecisionSelection,
  useTableDecisionSelection,
} from "./tableDecisionSelectionStore.js";
import { normalizeGameRole } from '../../shared/gameRoles.ts';

interface CenterPanelProps {
  activePlayers: ActivePlayerState[];
  activeSpeakerSlot: number | null;
  setActiveSpeakerSlot: (slot: number | null) => void;
  phase: Phase;
  roundNumber: number;
  timeLeft: number;
  setTimeLeft: (time: number) => void;
  zeroNightSubPhase: string | null;
  zeroNightMusicState: ZeroNightMusicState;
  setZeroNightMusicState: React.Dispatch<React.SetStateAction<ZeroNightMusicState>>;
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
  canUndoLastVote?: boolean;
  handleUndoLastVote?: () => void;
  handleAllocateVotes: (nominee: number, count: number) => void;
  quickSplitAvailable?: boolean;
  handleQuickSplit?: (pair: [number, number]) => void;
  sameSplitAvailable?: boolean;
  handleSameSplit?: () => void;
  /** The vote of one player for the candidate being counted (the seat cards and the numbers window). */
  handleVoteToggle?: (voterSlot: number) => void;
  handleResolveVoting: () => void;
  nightSubPhase: NightSubPhase;
  shotPlayerSlot: number | null;
  bestMoveDeadlineMs: number | null;
  setBestMoveDeadlineMs: React.Dispatch<React.SetStateAction<number | null>>;
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
  /** Club zero-round rule: the player the split was broken into stays and speaks 30 more seconds. */
  handleClubZeroRoundBreak?: (slotNum: number) => void;
  zeroRoundRule?: ZeroRoundRule;
  breakSpeechSlot?: number | null;
  /** «Кто сломал попил?»: the seat the judge named for a broken zero-round split (optional, never derived from votes). */
  zeroRoundBreakerSlot?: number | null;
  onSetZeroRoundBreaker?: (slotNum: number | null) => void;
  handleGoToRevoteSpeeches?: (winners: number[]) => void;
  handleAdvanceRevoteSpeaker?: (slot: number, nextIndex: number) => void;
  handleBackWithinRevoteSpeeches?: (previousSlot: number, previousIndex: number) => void;
  handleBackFromRevoteSpeeches?: () => void;
  handleLaunchNextRevote?: (winners: number[]) => void;
  onStartVoting?: () => void;
  postNightStage?: 'none' | 'farewell' | 'death_protocol';
  onZeroRoundSingleToNight?: () => void;
  handleConfirmAutoNoElimination?: () => void;
  handleConfirmTableDecision?: (votesCount: number, winners: number[]) => void;
  handleTransitionToVoting?: () => void;
  onBackToDaySpeeches?: () => void;
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
  /** «+30 с за 2 фола» during a speech — also in the centre panel, because the judge toolbar is hidden by the engine CSS. */
  speechExtensionAvailability?: { allowed: boolean; reason: string };
  onSpeechExtension?: () => void;
  /** The current speaker has already bought +30 s for two fouls: a revote speech then lasts 30 + 30 s, not 30. */
  speechExtended?: boolean;
}

/** Auto mode (owner, 2026-10-17): the switch is remembered on this device; the countdown leaves time to press «Стоп». */
const AUTO_ADVANCE_STORAGE_KEY = 'mafia_live_auto_advance';
const AUTO_COUNTDOWN_SECONDS = 3;

const normalizeJudgeCopy = (value: string): string => value
  .replace(/^Посадка/, 'Свободная посадка')
  .replace(/^Разбудить город$/, 'Открыть нулевой круг')
  .replace(/^Стрельба мафии$/, 'Отстрел')
  .replace(/^Прощальная речь/, 'Последняя речь')
  .replace(/^Прощальная /, 'Последняя речь ')
  .replace(/^Завершить прощальные$/, 'Завершить последние речи')
  .replace(/^Протокол убитого · 15с$/, `Протокол убитого · ${DEATH_PROTOCOL_SECONDS}с`)
  .replace(/^К дневным речам$/, 'Открыть день');

export default function CenterPanel(props: CenterPanelProps) {
  const {
    activePlayers,
    activeSpeakerSlot,
    setActiveSpeakerSlot,
    phase,
    roundNumber,
    timeLeft,
    setTimeLeft,
    zeroNightSubPhase,
    zeroNightMusicState,
    setZeroNightMusicState,
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
    nominations,
    currentVotingNomineeIndex,
    selectVotingNomineeIndex,
    votesByPlayer,
    handleInteractiveAutoRemainder,
    canUndoLastVote = false,
    handleUndoLastVote,
    quickSplitAvailable = false,
    handleQuickSplit,
    sameSplitAvailable = false,
    handleSameSplit,
    handleVoteToggle,
    speechExtensionAvailability,
    onSpeechExtension,
    speechExtended = false,
    handleResolveVoting,
    nightSubPhase,
    shotPlayerSlot,
    bestMoveDeadlineMs,
    setBestMoveDeadlineMs,
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
    handleClubZeroRoundBreak,
    zeroRoundRule = 'tournament',
    breakSpeechSlot = null,
    zeroRoundBreakerSlot = null,
    onSetZeroRoundBreaker,
    handleGoToRevoteSpeeches,
    handleAdvanceRevoteSpeaker,
    handleBackWithinRevoteSpeeches,
    handleBackFromRevoteSpeeches,
    handleLaunchNextRevote,
    onStartVoting,
    postNightStage = 'none',
    onZeroRoundSingleToNight,
    handleConfirmAutoNoElimination,
    handleConfirmTableDecision,
    onBackToDaySpeeches,
  } = props;

  const [musicStartedRound, setMusicStartedRound] = React.useState<number | null>(null);
  const [musicStoppedRound, setMusicStoppedRound] = React.useState<number | null>(null);
  const [numbersOpen, setNumbersOpen] = React.useState(false);
  // On a phone «Авто» lives in the game's top bar (owner, 2026-10-27: «ПЕРЕ…»): next to «Авто», «←» and «Выйти» the phase
  // pill had about 60 px and «Переголосование» needs 86. The game window offers the place as `#live-topbar-slot`; the
  // panel only portals into it and never touches the table's DOM.
  const [topbarSlot, setTopbarSlot] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const phone = window.matchMedia('(max-width: 699px)');
    const sync = () => setTopbarSlot(phone.matches ? document.getElementById('live-topbar-slot') : null);
    sync();
    phone.addEventListener?.('change', sync);
    return () => phone.removeEventListener?.('change', sync);
  }, []);
  // The numbers window belongs to one vote count: it closes when the count ends.
  React.useEffect(() => { if (votingStage !== 'collecting') setNumbersOpen(false); }, [votingStage]);
  const [bestMoveTimeLeft, setBestMoveTimeLeft] = React.useState<number | null>(null);
  const [pendingVotingResolution, setPendingVotingResolution] = React.useState(false);
  const [splitPicking, setSplitPicking] = React.useState<number[] | null>(null);
  const [breakerPicking, setBreakerPicking] = React.useState(false);
  React.useEffect(() => { if (votingStage !== 'round_result') setBreakerPicking(false); }, [votingStage]);
  const [autoAdvance, setAutoAdvance] = React.useState<boolean>(() => {
    try { return localStorage.getItem(AUTO_ADVANCE_STORAGE_KEY) === '1'; } catch { return false; }
  });
  const [autoCountdown, setAutoCountdown] = React.useState<number | null>(null);
  const autoChainRef = React.useRef(false);
  const timerDeadlineRef = React.useRef<number | null>(null);
  const timerIdentityRef = React.useRef('');
  const bestMoveDeadlineRef = React.useRef<number | null>(null);
  const deathProtocolBufferedRef = React.useRef(false);
  const tableDecisionSelection = useTableDecisionSelection();

  const activeSpeaker = activePlayers.find((player) => player.slot_num === activeSpeakerSlot);
  const donPlayer = activePlayers.find((player) => normalizeGameRole(player.role) === 'don');
  const mafiaPlayers = activePlayers.filter((player) => normalizeGameRole(player.role) === 'mafia');
  const currentRound = votingRounds[activeVotingRoundIndex];
  const currentVotingResult = currentRound ? determineVotingResult(currentRound) : null;
  const isDeathProtocolTimer = phase === 'night' && Boolean(customTimerLabel?.startsWith('Протокол убитого'));
  const isRevoteSpeech = phase === 'day_voting' && votingStage === 'revote_speeches';
  // A purchased extension (two fouls for +30 s) is the only way a revote speech may exceed its fixed 30 seconds.
  const revoteExtensionSeconds = isRevoteSpeech && speechExtended ? SPEECH_EXTENSION_SECONDS : 0;
  const effectiveTimerMax = isDeathProtocolTimer
    ? DEATH_PROTOCOL_SECONDS
    : resolveTimerDuration(phase, votingStage, timerMax) + revoteExtensionSeconds;
  const isRegularNightIntro = phase === 'night' && nightSubPhase === 'intro';
  const isFirstKilledBestMove = phase === 'night' && nightSubPhase === 'best_move';
  const dayLabel = roundNumber === 1 ? 'Нулевой круг' : `День ${roundNumber - 1}`;
  const tableDecisionRequired = phase === 'day_voting'
    && votingStage === 'round_result'
    && currentVotingResult?.outcome === 'requires_table_decision';
  const tableDecisionKey = tableDecisionRequired && currentRound
    ? `${activeVotingRoundIndex}:${currentRound.round_number}:${currentRound.nominated_seats.join('-')}`
    : null;

  React.useEffect(() => {
    const revoteLimit = 30 + revoteExtensionSeconds;
    if (phase === 'day_voting' && votingStage === 'revote_speeches' && activeSpeakerSlot !== null && timeLeft > revoteLimit) {
      setTimeLeft(revoteLimit);
    }
  }, [phase, votingStage, activeSpeakerSlot, timeLeft, setTimeLeft, revoteExtensionSeconds]);

  React.useEffect(() => {
    if (tableDecisionKey) activateTableDecisionSelection(tableDecisionKey);
    else deactivateTableDecisionSelection();
  }, [tableDecisionKey]);

  React.useEffect(() => {
    if (!tableDecisionSelection.active) {
      setTableLeaveVotesInput?.(null);
      return;
    }
    setTableLeaveVotesInput?.(tableDecisionSelection.selectedVoterSlots.length);
  }, [tableDecisionSelection.active, tableDecisionSelection.selectedVoterSlots, setTableLeaveVotesInput]);

  React.useEffect(() => {
    if (!pendingVotingResolution) return;
    if (phase !== 'day_voting' || votingStage !== 'collecting' || !currentRound) {
      setPendingVotingResolution(false);
      return;
    }
    const eligibleVoterSeats = activePlayers.filter((player) => player.alive).map((player) => player.slot_num);
    const collecting = buildCollectingVotingPresentation({
      eligibleVoterSeats,
      eligibleVoters: currentRound.eligible_voters,
      nominatedSeats: currentRound.nominated_seats,
      currentNomineeIndex: currentVotingNomineeIndex,
      votesByPlayer,
    });
    if (collecting.remaining > 0) return;
    setPendingVotingResolution(false);
    handleResolveVoting();
  }, [
    pendingVotingResolution,
    phase,
    votingStage,
    currentRound,
    currentVotingNomineeIndex,
    votesByPlayer,
    activePlayers,
    handleResolveVoting,
  ]);

  React.useEffect(() => {
    if (phase !== 'night') {
      setMusicStartedRound(null);
      setMusicStoppedRound(null);
    }
  }, [phase, roundNumber]);

  React.useEffect(() => {
    if (!isDeathProtocolTimer) deathProtocolBufferedRef.current = false;
    const identity = buildTimerIdentity(phase, votingStage, activeSpeakerSlot, customTimerLabel, effectiveTimerMax);
    if (!isTimerRunning) {
      timerDeadlineRef.current = null;
      timerIdentityRef.current = identity;
      return;
    }

    if (timerDeadlineRef.current === null || timerIdentityRef.current !== identity) {
      const shouldApplyDeathProtocolBuffer = isDeathProtocolTimer && !deathProtocolBufferedRef.current;
      const initialSeconds = shouldApplyDeathProtocolBuffer
        ? Math.max(timeLeft, DEATH_PROTOCOL_SECONDS)
        : timeLeft;
      if (shouldApplyDeathProtocolBuffer) deathProtocolBufferedRef.current = true;
      timerDeadlineRef.current = createTimerDeadline(Date.now(), initialSeconds);
      timerIdentityRef.current = identity;
      if (initialSeconds !== timeLeft) setTimeLeft(initialSeconds);
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
  }, [isTimerRunning, phase, votingStage, activeSpeakerSlot, customTimerLabel, effectiveTimerMax, isDeathProtocolTimer, setIsTimerRunning, setTimeLeft, timeLeft]);

  React.useEffect(() => {
    if (!isFirstKilledBestMove) {
      bestMoveDeadlineRef.current = null;
      setBestMoveTimeLeft(null);
      return;
    }

    const deadline = resolvePersistedTimerDeadline(bestMoveDeadlineMs, Date.now(), BEST_MOVE_SECONDS);
    if (bestMoveDeadlineMs === null) setBestMoveDeadlineMs(deadline);
    bestMoveDeadlineRef.current = deadline;
    setBestMoveTimeLeft(getRemainingTimerSeconds(deadline, Date.now()));
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
  }, [isFirstKilledBestMove, bestMoveDeadlineMs, setBestMoveDeadlineMs]);

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

  const votingPhaseLabel = (() => {
    if (phase !== 'day_voting') return null;
    if (votingStage === 'setup') return 'Переход к голосованию';
    if (votingStage === 'collecting') {
      // The candidate being counted is in the strip under it (owner, 2026-10-27); the pill says which voting it is.
      return currentRound?.is_revote ? `Переголосование ${activeVotingRoundIndex}` : 'Голосование';
    }
    if (votingStage === 'revote_speeches') {
      const speaker = currentVotingResult?.winners[revoteSpeakerIndex] ?? activeSpeakerSlot;
      return speaker ? `Переголосование · речь #${speaker}` : 'Переголосование · речи';
    }
    if (votingStage === 'round_result') return 'Голосование · итог';
    if (votingStage === 'table_decision') return 'Голосование · решение стола';
    if (votingStage === 'resolved' && breakSpeechSlot !== null) return `Доп. речь · #${breakSpeechSlot}`;
    if (votingStage === 'resolved' && activeSpeakerSlot !== null) return `Последняя речь · #${activeSpeakerSlot}`;
    return 'Голосование · завершено';
  })();

  const phaseLabel = phase === 'zero_night'
    ? 'Нулевая ночь'
    : phase === 'night'
      ? `Ночь ${roundNumber}`
      : votingPhaseLabel ?? dayLabel;

  const nightActionStatus = phase === 'night'
    ? ({
        intro: 'Город засыпает',
        shooting: shotPlayerSlot ? `Отстрел: #${shotPlayerSlot}` : 'Отстрел · выберите номер',
        don: donCheckSlot ? `Дон · #${donCheckSlot}: ${donCheckResult ? 'Шериф' : 'не Шериф'}` : 'Проверка Дона · выберите номер',
        sheriff: sheriffCheckSlot ? `Шериф · #${sheriffCheckSlot}: ${sheriffCheckResult || '—'}` : 'Проверка Шерифа · выберите номер',
        best_move: 'ЛХ первого убитого',
        morning: 'Итог ночи',
      } as Record<string, string>)[nightSubPhase] || 'Ночь'
    : null;

  const canReturnToSpeeches = phase === 'day_voting' && activeVotingRoundIndex === 0 && (votingStage === 'collecting' || votingStage === 'setup') && Boolean(onBackToDaySpeeches);
  const canUseVotingBack = canReturnToSpeeches || (phase === 'day_voting' && (votingStage === 'round_result' || votingStage === 'revote_speeches'));

  const handleVotingBack = () => {
    if (canReturnToSpeeches) { onBackToDaySpeeches?.(); return; }
    if (!currentRound || !currentVotingResult) return;

    if (votingStage === 'round_result') {
      setIsTimerRunning(false);
      setActiveSpeakerSlot(null);
      deactivateTableDecisionSelection();
      setTableLeaveVotesInput?.(null);
      setVotingStage?.('collecting');
      return;
    }

    if (votingStage === 'revote_speeches') {
      const participants = currentVotingResult.winners;
      if (revoteSpeakerIndex > 0) {
        setIsTimerRunning(false);
        setActiveSpeakerSlot(null);
        const previousIndex = revoteSpeakerIndex - 1;
        const previousSpeaker = participants[previousIndex];
        if (previousSpeaker) {
          if (handleBackWithinRevoteSpeeches) handleBackWithinRevoteSpeeches(previousSpeaker, previousIndex);
          else {
            setRevoteSpeakerIndex?.(previousIndex);
            handleStartTimer(previousSpeaker, 30);
          }
        }
      } else if (handleBackFromRevoteSpeeches) {
        handleBackFromRevoteSpeeches();
      } else {
        setIsTimerRunning(false);
        setActiveSpeakerSlot(null);
        setVotingStage?.('round_result');
      }
    }
  };

  const renderNominationChips = () => (
    <div className="live-judge-hud__meta">
      <span className="live-judge-chip">Выставлены <strong>{nominations.length ? nominations.map((slot) => `#${slot}`).join(' · ') : '—'}</strong></span>
    </div>
  );

  const toggleAutoAdvance = () => {
    const next = !autoAdvance;
    setAutoAdvance(next);
    setAutoCountdown(null);
    autoChainRef.current = false;
    try { localStorage.setItem(AUTO_ADVANCE_STORAGE_KEY, next ? '1' : '0'); } catch { /* the choice is only a convenience */ }
  };

  /** «Стоп» cancels the pending automatic step only; the mode itself stays on. */
  const stopAutoAdvance = () => {
    setAutoCountdown(null);
    autoChainRef.current = false;
  };

  const renderTimer = () => {
    const timerLabel = normalizeJudgeCopy(customTimerLabel || (activeSpeakerSlot ? `Речь #${activeSpeakerSlot}` : 'Таймер'));
    const timerName = activeSpeaker?.nickname || (nightActionStatus ?? '');
    const showSpeechExtension = Boolean(onSpeechExtension && speechExtensionAvailability?.allowed);
    return (
      <div className="live-judge-timer">
        <FitText as="div" minPx={7} className="live-judge-timer__label">{timerLabel}</FitText>
        {/* A night check's result is read whole — it may take two lines; a nickname fits its one line. */}
        {nightActionStatus
          ? <div className="live-judge-timer__name live-judge-timer__name--status" data-testid="live-game-night-status">{nightActionStatus}</div>
          : <FitText as="div" className="live-judge-timer__name">{timerName}</FitText>}
        <div className={`live-judge-timer__time ${timeLeft <= 10 ? 'live-judge-timer__time--danger' : ''}`}>{timeLeft}с</div>
        <div className="live-judge-timer__bar"><div style={{ width: `${Math.min(100, Math.max(0, effectiveTimerMax ? (timeLeft / effectiveTimerMax) * 100 : 0))}%` }} /></div>
        <div className={`live-judge-timer__buttons ${showSpeechExtension ? 'live-judge-timer__buttons--with-extension' : ''}`}>
          <button type="button" onClick={() => adjustTimer(-10)} className="live-judge-timer__button">−10</button>
          {isTimerRunning ? (
            <button type="button" onClick={() => setIsTimerRunning(false)} className="live-judge-timer__button live-judge-timer__button--pause"><Pause />Пауза</button>
          ) : (
            <button type="button" onClick={() => setIsTimerRunning(true)} className="live-judge-timer__button live-judge-timer__button--primary"><Play />Старт</button>
          )}
          <button type="button" onClick={() => { setIsTimerRunning(false); setTimeLeft(effectiveTimerMax); }} className="live-judge-timer__button" aria-label="Сбросить таймер"><RotateCcw /></button>
          {setIsMuted ? (
            <button type="button" onClick={() => setIsMuted((value) => !value)} className="live-judge-timer__button" aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}>
              {isMuted ? <VolumeX /> : <Volume2 />}
            </button>
          ) : <span />}
          {showSpeechExtension ? (
            <button
              type="button"
              data-testid="live-hud-speech-extension"
              onClick={() => onSpeechExtension?.()}
              className="live-judge-timer__button live-judge-timer__button--extension"
              title="Добавить 30 секунд текущей речи ценой двух обычных фолов"
              aria-label="Добавить 30 секунд к речи за два обычных фола"
            >+30</button>
          ) : null}
        </div>
      </div>
    );
  };

  const renderVotingOrder = (seats: number[], activeIndex: number | null = null) => (
    <div className="live-judge-voting-order" aria-label={`Очередность голосования: ${seats.map((seat) => `номер ${seat}`).join(', ')}`}>
      <div className="live-judge-voting-order__label">Очередность голосования</div>
      <div className="live-judge-voting-order__list">
        {seats.map((seat, index) => (
          <span
            key={`${seat}-${index}`}
            className={`live-judge-voting-order__seat ${index === activeIndex ? 'live-judge-voting-order__seat--current' : ''}`}
          >
            {index + 1}. #{seat}
          </span>
        ))}
      </div>
    </div>
  );

  const renderVotingAnnouncement = () => {
    const seats = (currentRound?.nominated_seats ?? nominations).filter((slot) => activePlayers.some((player) => player.slot_num === slot && player.alive));
    const isRevote = Boolean(currentRound?.is_revote);
    const zeroRoundSingle = !currentRound && roundNumber === 1 && seats.length === 1;
    const title = zeroRoundSingle ? 'Выставлена одна кандидатура' : isRevote ? 'Переходим к переголосованию' : 'Переходим к голосованию';
    const hint = zeroRoundSingle
      ? `Выставлена одна кандидатура: #${seats[0]}. Голосования не будет. Следующий шаг — ночь.`
      : seats.length === 1
        ? `Выставлена одна кандидатура: #${seats[0]}. Следующий шаг — голосование.`
        : null;
    return (
      <div className="live-judge-hud__stack live-judge-hud__stack--voting-scroll" data-testid="live-voting-announcement">
        <div className="live-judge-hud__eyebrow">{isRevote ? 'Переголосование' : 'Голосование'}</div>
        <div className="live-judge-hud__title">{title}</div>
        {seats.length > 1 && renderVotingOrder(seats)}
        {seats.length === 1 && <div className="live-judge-hud__meta"><span className="live-judge-chip">Выставлена <strong>#{seats[0]}</strong></span></div>}
        {hint && <div className="live-judge-hud__hint">{hint}</div>}
        <div className="live-judge-vote-actions">
          {zeroRoundSingle ? (
            <button type="button" data-testid="live-zero-single-to-night" onClick={() => onZeroRoundSingleToNight?.()} className="live-judge-action live-judge-action--primary">К ночи</button>
          ) : (
            <button type="button" data-testid="live-voting-start" onClick={() => onStartVoting?.()} className="live-judge-action live-judge-action--primary">Начать голосование</button>
          )}
        </div>
      </div>
    );
  };

  const advanceRevoteSpeech = () => {
    if (!currentRound) return;
    const participants = determineVotingResult(currentRound).winners;
    const isLastSpeaker = revoteSpeakerIndex >= participants.length - 1;
    setIsTimerRunning(false);
    if (isLastSpeaker) {
      setActiveSpeakerSlot(null);
      handleLaunchNextRevote?.(participants);
      return;
    }
    const next = participants[revoteSpeakerIndex + 1];
    if (handleAdvanceRevoteSpeaker) handleAdvanceRevoteSpeaker(next, revoteSpeakerIndex + 1);
    else {
      setRevoteSpeakerIndex?.(revoteSpeakerIndex + 1);
      handleStartTimer(next, 30);
    }
  };

  const renderVoting = () => {
    if (votingStage === 'setup') return renderVotingAnnouncement();
    if (!currentRound) return <div className="live-judge-hud__hint">Подготовка голосования…</div>;

    const result = determineVotingResult(currentRound);
    const eligibleVoterSeats = activePlayers.filter((player) => player.alive).map((player) => player.slot_num);

    if (votingStage === 'collecting') {
      const { nominee, eligible, remaining, isLast } = buildCollectingVotingPresentation({
        eligibleVoterSeats,
        eligibleVoters: currentRound.eligible_voters,
        nominatedSeats: currentRound.nominated_seats,
        currentNomineeIndex: currentVotingNomineeIndex,
        votesByPlayer,
      });

      const nomineeNickname = activePlayers.find((player) => player.slot_num === nominee)?.nickname || '';
      const tallyOf = (seat: number) => eligibleVoterSeats.filter((voter) => votesByPlayer[voter] === seat).length;

      const finalizeVoting = () => {
        if (pendingVotingResolution) return;
        if (remaining > 0) {
          setPendingVotingResolution(true);
          handleInteractiveAutoRemainder();
          return;
        }
        handleResolveVoting();
      };

      const quickSplitButton = <button type="button" data-testid="live-quick-split" disabled={pendingVotingResolution} onClick={() => setSplitPicking([])} className="live-judge-action">Попил</button>;

      return (
        <div className="live-judge-hud__stack live-judge-hud__stack--voting-scroll live-judge-hud__stack--vote-count">
          {/* One strip for the order, the candidate being counted and every candidate's votes (owner, 2026-10-27: too many
              small elements in the cell); a tap moves to that candidate. */}
          <div className="live-judge-vote-strip" role="tablist" aria-label={`Очередность голосования: ${currentRound.nominated_seats.map((seat) => `номер ${seat}`).join(', ')}`}>
            {currentRound.nominated_seats.map((seat, index) => (
              <button
                key={`${seat}-${index}`}
                type="button"
                role="tab"
                aria-selected={index === currentVotingNomineeIndex}
                aria-label={`#${seat}: ${tallyOf(seat)} гол.`}
                disabled={pendingVotingResolution}
                onClick={() => selectVotingNomineeIndex(index)}
                className="live-judge-vote-strip__seat"
                data-seat={seat}
                style={seatColorVars(seat) as React.CSSProperties}
              >
                <span>#{seat}</span>
                <b className="live-judge-vote-strip__count" data-testid={`live-vote-tally-${seat}`}>{tallyOf(seat)}</b>
              </button>
            ))}
          </div>
          <div className="live-judge-vote-summary live-judge-vote-summary--with-undo" title={isLast ? `Остаток уйдёт к #${nominee} при подведении итога` : undefined}>
            <div className="live-judge-hud__title live-judge-vote-focus"><span>Кто против <SeatBadge seat={nominee} size="xs" />{nomineeNickname ? <span className="live-judge-vote-focus__mark">?</span> : '?'}</span>{nomineeNickname ? <FitText className="live-judge-vote-focus__name">{nomineeNickname}?</FitText> : null}</div>
            <div className="live-judge-stat"><div className="live-judge-stat__label">Осталось</div><div className="live-judge-stat__value">{remaining}/{eligible}</div></div>
            <button
              type="button"
              aria-label="Отменить последний голос"
              title="Отменить последний голос"
              disabled={!canUndoLastVote || pendingVotingResolution}
              onClick={() => handleUndoLastVote?.()}
              className="live-judge-stat live-judge-vote-undo"
            >
              <span className="live-judge-stat__label">Отменить</span>
              <span className="live-judge-vote-undo__value"><RotateCcw />голос</span>
            </button>
          </div>
          <div className="live-judge-vote-actions">
            {quickSplitAvailable && handleQuickSplit ? (
              splitPicking ? (
                <div className="live-judge-quick-split" data-testid="live-quick-split-picker">
                  <div className="live-judge-hud__hint">Между кем попил? Выберите двоих{splitPicking.length ? `: #${splitPicking[0]} и…` : ''}</div>
                  <div className="live-judge-quick-split__seats">
                    {currentRound.nominated_seats.map((seat) => (
                      <button
                        key={seat}
                        type="button"
                        aria-pressed={splitPicking.includes(seat)}
                        disabled={splitPicking.includes(seat)}
                        onClick={() => {
                          if (!splitPicking.length) return setSplitPicking([seat]);
                          handleQuickSplit([splitPicking[0], seat]);
                          setSplitPicking(null);
                        }}
                        className="live-judge-quick-split__seat"
                      >#{seat}</button>
                    ))}
                  </div>
                  <button type="button" onClick={() => setSplitPicking(null)} className="live-judge-action">Отмена</button>
                </div>
              ) : handleVoteToggle ? null : quickSplitButton
            ) : null}
            {handleVoteToggle ? (
              <div className="live-judge-vote-shortcuts">
                {/* «Попил» shares the shortcut row: next to «←» and «Следующий →» it cut both off on a phone (2026-10-27). */}
                {quickSplitAvailable && handleQuickSplit && !splitPicking ? quickSplitButton : null}
                {sameSplitAvailable && handleSameSplit ? (
                  <button type="button" data-testid="live-same-split" disabled={pendingVotingResolution} onClick={handleSameSplit} className="live-judge-action">Поделилось также</button>
                ) : null}
                <button type="button" data-testid="live-vote-numbers-open" disabled={pendingVotingResolution} onClick={() => setNumbersOpen(true)} className="live-judge-action">Цифрами</button>
              </div>
            ) : null}
            <button type="button" disabled={currentVotingNomineeIndex === 0 || pendingVotingResolution} onClick={() => selectVotingNomineeIndex(currentVotingNomineeIndex - 1)} className="live-judge-action" aria-label="Назад">←</button>
            {isLast ? (
              <button type="button" data-testid="live-voting-finalize" disabled={pendingVotingResolution} onClick={finalizeVoting} className="live-judge-action live-judge-action--success">{pendingVotingResolution ? 'Считаю…' : 'Подвести итог'}</button>
            ) : (
              <button type="button" data-testid="live-voting-next" disabled={pendingVotingResolution} onClick={() => selectVotingNomineeIndex(currentVotingNomineeIndex + 1)} className="live-judge-action live-judge-action--primary">Следующий →</button>
            )}
          </div>
          {numbersOpen && handleVoteToggle ? (
            <VoteByNumbersOverlay
              nominees={currentRound.nominated_seats}
              nomineeIndex={currentVotingNomineeIndex}
              votesByPlayer={votesByPlayer}
              voterSeats={eligibleVoterSeats}
              tableSize={activePlayers.length}
              nicknameOf={(seat) => activePlayers.find((player) => player.slot_num === seat)?.nickname || ''}
              remaining={remaining}
              busy={pendingVotingResolution}
              onToggle={handleVoteToggle}
              onSelectNominee={selectVotingNomineeIndex}
              onFinish={() => { setNumbersOpen(false); finalizeVoting(); }}
              onClose={() => setNumbersOpen(false)}
            />
          ) : null}
        </div>
      );
    }

    if (votingStage === 'revote_speeches') {
      const participants = result.winners;
      const isLastSpeaker = revoteSpeakerIndex >= participants.length - 1;
      const advanceSpeech = advanceRevoteSpeech;

      return (
        <div className="live-judge-hud__stack live-judge-hud__stack--voting-scroll live-judge-hud__stack--revote-speech">
          <div className="sr-only">Речи перед переголосованием · 30 сек</div>
          {renderVotingOrder(participants, revoteSpeakerIndex)}
          {renderTimer()}
          <button type="button" onClick={advanceSpeech} className="live-judge-action live-judge-action--primary">
            {isLastSpeaker ? 'К переголосованию' : 'Следующий игрок'}
          </button>
        </div>
      );
    }

    if (votingStage === 'round_result') {
      const zeroRoundSplitBroken = result.outcome === 'single_eliminated' && currentRound?.day_number === 0;
      // Under both settings the judge may name who broke the split; skipping it is fine (the protocol form still asks).
      // The seats open on demand so the primary step keeps its place in the small centre cell on a phone.
      const breakerQuestion = zeroRoundSplitBroken && onSetZeroRoundBreaker ? (
        <button type="button" data-testid="live-zero-breaker" onClick={() => setBreakerPicking(true)} className="live-judge-action">
          {zeroRoundBreakerSlot ? `Сломал попил: #${zeroRoundBreakerSlot}` : 'Кто сломал попил?'}
        </button>
      ) : null;

      if (breakerQuestion && breakerPicking) {
        const choose = (seat: number | null) => { onSetZeroRoundBreaker?.(seat); setBreakerPicking(false); };
        return (
          <div className="live-judge-hud__stack live-judge-hud__stack--voting-scroll live-judge-breaker">
            <div className="live-judge-breaker__head">
              <div className="live-judge-hud__hint">Кто сломал попил?</div>
              <button type="button" onClick={() => choose(null)} className="live-judge-action">Не знаю</button>
            </div>
            <div className="live-judge-breaker__seats" role="group" aria-label="Кто сломал попил">
              {eligibleVoterSeats.map((seat) => (
                <button
                  key={seat}
                  type="button"
                  aria-pressed={zeroRoundBreakerSlot === seat}
                  onClick={() => choose(seat)}
                  className="live-judge-breaker__seat"
                >#{seat}</button>
              ))}
            </div>
          </div>
        );
      }

      if (zeroRoundSplitBroken && zeroRoundRule === 'club') {
        const seat = result.winners[0];
        return (
          <div className="live-judge-hud__stack">
            <div className="live-judge-hud__eyebrow">Нулевой круг · клубная настройка</div>
            <div className="live-judge-hud__title">Попил сломан в <strong>#{seat}</strong></div>
            <div className="live-judge-hud__hint">#{seat} остаётся за столом, без ЛХ: 30 секунд дополнительной речи, затем ночь.</div>
            <button type="button" onClick={() => handleClubZeroRoundBreak?.(seat)} className="live-judge-action live-judge-action--primary">Доп. речь #{seat} · 30 сек</button>
            {breakerQuestion}
          </div>
        );
      }

      if (result.outcome === 'single_eliminated') {
        return (
          <div className="live-judge-hud__stack">
            <div className="live-judge-hud__eyebrow">Итог голосования</div>
            <div className="live-judge-hud__title">Заголосован <strong>#{result.winners[0]}</strong></div>
            <button type="button" onClick={() => handleConfirmSingleElimination?.(result.winners[0])} className="live-judge-action live-judge-action--primary">Подтвердить</button>
            {breakerQuestion}
          </div>
        );
      }

      if (result.outcome === 'needs_revote') {
        return (
          <div className="live-judge-hud__stack live-judge-hud__stack--voting-scroll">
            <div className="live-judge-hud__eyebrow">Переголосование</div>
            <div className="live-judge-hud__title">{result.winners.map((seat) => `#${seat}`).join(' · ')}</div>
            {renderVotingOrder(result.winners)}
            <div className="live-judge-hud__hint">Перед переголосованием каждый из этих игроков получает 30 секунд.</div>
            <button type="button" onClick={() => handleGoToRevoteSpeeches?.(result.winners)} className="live-judge-action live-judge-action--primary">Речи по 30 секунд</button>
          </div>
        );
      }

      if (result.outcome === 'auto_no_elimination') {
        return (
          <div className="live-judge-hud__stack">
            <div className="live-judge-hud__eyebrow">Повторное равенство</div>
            <div className="live-judge-hud__title">Никто не покидает стол</div>
            <div className="live-judge-hud__hint">Решение «поднять / оставить» не проводится: в равенстве больше половины живых игроков.</div>
            <button type="button" onClick={() => handleConfirmAutoNoElimination?.()} className="live-judge-action live-judge-action--success">Подтвердить → ночь</button>
          </div>
        );
      }

      if (result.outcome === 'requires_table_decision') {
        const eligible = currentRound.eligible_voters ?? eligibleVoterSeats.length;
        const { majority, entered, hasMajority } = buildTableDecisionPresentation({
          eligible,
          selectedVoterSlots: tableDecisionSelection.selectedVoterSlots,
        });
        const confirmTableDecision = () => {
          handleConfirmTableDecision?.(entered, result.winners);
          deactivateTableDecisionSelection();
        };
        return (
          <div className="live-judge-hud__stack live-judge-table-decision">
            <div className="live-judge-hud__eyebrow">Поднять / оставить · {result.winners.map((seat) => `#${seat}`).join(' · ')}</div>
            <div className="live-judge-hud__title">Поднять всех?</div>
            <div className="live-judge-hud__hint">Нажимайте карточки игроков, голосующих за «поднять».</div>
            <div className="live-judge-table-decision-count">
              <span>За «поднять»</span>
              <strong>{entered}/{eligible}<small>нужно {majority}</small></strong>
            </div>
            <button type="button" onClick={confirmTableDecision} className={`live-judge-action ${hasMajority ? 'live-judge-action--success' : 'live-judge-action--primary'}`}>Зафиксировать решение</button>
          </div>
        );
      }
    }

    return <div className="live-judge-hud__hint">Голосование завершено.</div>;
  };

  const renderIdleBody = () => {
    if (phase === 'zero_night') {
      const title = !zeroNightSubPhase
        ? 'Договорка'
        : zeroNightSubPhase === 'agreement'
          ? 'Договорка'
          : zeroNightSubPhase === 'sheriff'
            ? 'Вызов Шерифа'
            : 'Свободная посадка';
      const hint = !zeroNightSubPhase
        ? 'Первый этап нулевой ночи.'
        : zeroNightSubPhase === 'agreement'
          ? 'После договорки — вызов Шерифа.'
          : zeroNightSubPhase === 'sheriff'
            ? 'После вызова Шерифа — свободная посадка.'
            : 'После свободной посадки начинается нулевой круг.';
      return (
        <div className="live-judge-hud__stack">
          <div className="live-judge-hud__title">{title}</div>
          <div className="live-judge-hud__hint">{hint}</div>
          {zeroNightSubPhase === 'agreement' && (
            <div className="live-judge-hud__meta">
              <span className="live-judge-chip">Дон <strong>#{donPlayer?.slot_num || '—'}</strong></span>
              <span className="live-judge-chip">Мафия <strong>{mafiaPlayers.map((player) => `#${player.slot_num}`).join(' · ') || '—'}</strong></span>
            </div>
          )}
        </div>
      );
    }

    if (phase === 'day_speeches') {
      return nextSpeaker ? (
        <div className="live-judge-hud__stack">
          <div className="live-judge-hud__eyebrow">{dayLabel} · следующая речь</div>
          <div className="live-judge-hud__title"><strong>#{nextSpeaker.slot_num}</strong> · {nextSpeaker.nickname || `Игрок ${nextSpeaker.slot_num}`}</div>
          {renderNominationChips()}
        </div>
      ) : (
        <div className="live-judge-hud__stack">
          <div className="live-judge-hud__eyebrow">{dayLabel}</div>
          <div className="live-judge-hud__title">Все речи завершены</div>
          {renderNominationChips()}
        </div>
      );
    }

    if (phase === 'day_voting') return renderVoting();

    if (phase === 'night') {
      return (
        <div className="live-judge-hud__stack">
          <div className="live-judge-hud__eyebrow">Ночь {roundNumber}</div>
          <div className="live-judge-hud__title">{nightActionStatus || 'Ночь'}</div>
        </div>
      );
    }

    return null;
  };

  const baseNextStep = getNextStepInfo();
  // Owner decision 2026-10-24: the automatic music menu is switched off, not removed. The judge only gets a plain
  // «Включите музыку» / «Выключите музыку» step and plays the music by hand; set JUDGE_MUSIC_MENU_ENABLED to bring it back.
  const startNightMusic = () => (JUDGE_MUSIC_MENU_ENABLED ? requestJudgeNightMusicStart() : true);
  const stopGameMusic = () => { if (JUDGE_MUSIC_MENU_ENABLED) requestJudgeGameMusicStop(); };
  const nextStep = (() => {
    if (phase === 'zero_night' && zeroNightMusicState === 'pending') {
      return {
        label: '♫ Включите музыку',
        onClick: () => {
          startNightMusic();
          setZeroNightMusicState('playing');
        },
      };
    }

    if (phase === 'zero_night' && zeroNightSubPhase === 'seating' && zeroNightMusicState === 'playing') {
      return {
        label: '♫ Выключите музыку',
        onClick: () => {
          stopGameMusic();
          setZeroNightMusicState('stopped');
        },
      };
    }

    if (isRegularNightIntro && musicStartedRound !== roundNumber) {
      return {
        label: '♫ Включите музыку',
        onClick: () => {
          const started = startNightMusic();
          setMusicStartedRound(roundNumber);
          if (!started) setMusicStoppedRound(roundNumber);
        },
      };
    }

    if (phase === 'night' && nightSubPhase === 'sheriff' && musicStartedRound === roundNumber && musicStoppedRound !== roundNumber) {
      return {
        label: '♫ Выключите музыку',
        onClick: () => {
          stopGameMusic();
          setMusicStoppedRound(roundNumber);
        },
      };
    }

    return baseNextStep ? { ...baseNextStep, label: normalizeJudgeCopy(baseNextStep.label) } : null;
  })();

  // Auto mode: when a timer has run out, the phase's own next step is pressed after a short countdown. Only steps that need
  // no judge input follow a timer: ending a speech, the next revote or last speech, the zero-night timers. Music, the
  // death protocol, best move and every voting stay manual.
  const timerEnded = !isTimerRunning && timeLeft === 0;
  const nextIsPlainStep = Boolean(baseNextStep) && Boolean(nextStep) && !nextStep!.label.startsWith('♫');
  const autoStep: (() => void) | null = (() => {
    if (!autoAdvance || !timerEnded) return null;
    if (phase === 'day_speeches' && activeSpeakerSlot !== null && nextIsPlainStep) {
      return () => { autoChainRef.current = true; baseNextStep!.onClick(); };
    }
    if (phase === 'zero_night' && (zeroNightSubPhase === 'agreement' || zeroNightSubPhase === 'sheriff') && nextIsPlainStep) {
      return () => baseNextStep!.onClick();
    }
    if (phase === 'night' && postNightStage === 'farewell' && activeSpeakerSlot !== null && nextIsPlainStep) {
      return () => baseNextStep!.onClick();
    }
    if (phase === 'day_voting' && votingStage === 'resolved' && activeSpeakerSlot !== null && nextIsPlainStep) {
      return () => baseNextStep!.onClick();
    }
    if (phase === 'day_voting' && votingStage === 'revote_speeches' && activeSpeakerSlot !== null) {
      return () => advanceRevoteSpeech();
    }
    return null;
  })();
  const autoStepRef = React.useRef(autoStep);
  autoStepRef.current = autoStep;
  const hasAutoStep = autoStep !== null;
  const autoContext = `${phase}|${votingStage}|${activeSpeakerSlot}|${zeroNightSubPhase}|${postNightStage}|${revoteSpeakerIndex}`;
  React.useEffect(() => {
    if (!hasAutoStep) {
      setAutoCountdown(null);
      return;
    }
    setAutoCountdown(AUTO_COUNTDOWN_SECONDS);
    const id = window.setInterval(() => setAutoCountdown((value) => (value === null ? null : value - 1)), 1000);
    return () => window.clearInterval(id);
  }, [hasAutoStep, autoContext]);
  React.useEffect(() => {
    if (autoCountdown === null || autoCountdown > 0) return;
    setAutoCountdown(null);
    autoStepRef.current?.();
  }, [autoCountdown]);

  // After an automatic end of a speech the next speech starts by itself (the countdown above already gave the pause).
  const baseNextStepRef = React.useRef(baseNextStep);
  baseNextStepRef.current = baseNextStep;
  React.useEffect(() => {
    if (!autoChainRef.current || phase !== 'day_speeches' || activeSpeakerSlot !== null) return;
    autoChainRef.current = false;
    const step = baseNextStepRef.current;
    if (!autoAdvance || !nextSpeaker || !step || !step.label.startsWith('Речь #')) return;
    const id = window.setTimeout(() => baseNextStepRef.current?.onClick(), 500);
    return () => window.clearTimeout(id);
  }, [phase, activeSpeakerSlot, autoAdvance, nextSpeaker]);

  const prevStep = getPrevStepAction();
  const showFooterAction = phase !== 'day_voting' || votingStage === 'resolved';
  const showFooterSummary = phase !== 'day_voting';
  const showFooter = showFooterSummary || (showFooterAction && Boolean(prevStep || nextStep));
  const footerSingle = !(prevStep && nextStep);

  const autoControl = phase !== 'setup' && !(phase === 'day_voting' && votingStage === 'collecting' && autoCountdown === null) ? (autoCountdown !== null ? (
    <button type="button" data-testid="live-auto-stop" onClick={stopAutoAdvance} className="live-judge-hud__header-button live-judge-hud__auto" data-active="true" aria-label="Отменить автоматический переход">
      <span>Стоп <span data-testid="live-auto-countdown">{autoCountdown}</span></span>
    </button>
  ) : (
    <button type="button" data-testid="live-auto-toggle" onClick={toggleAutoAdvance} className="live-judge-hud__header-button live-judge-hud__auto" data-active={autoAdvance ? 'true' : 'false'} aria-pressed={autoAdvance} title="Авторежим: после таймера следующий шаг наступает сам">
      <span>Авто</span>
    </button>
  )) : null;

  return (
    <>
      {topbarSlot && autoControl ? createPortal(autoControl, topbarSlot) : null}
      <div data-testid="live-judge-hud" className="live-judge-hud col-span-2 md:col-start-2 md:col-span-3 md:row-start-2 order-first md:order-none">
        <div className="live-judge-hud__header">
          <span className="live-judge-hud__phase">{phaseLabel}</span>
          <div className="live-judge-hud__header-actions">
            {/* No timer runs while votes are counted: «Авто» steps aside so the pill can say «Переголосование 1» in full. */}
            {!topbarSlot && autoControl}
            {canUseVotingBack && (
              <button type="button" data-testid={canReturnToSpeeches ? "live-voting-back-to-speeches" : undefined} onClick={handleVotingBack} className="live-judge-hud__header-button"><ArrowLeft /><span>{canReturnToSpeeches ? "К речам" : "Назад"}</span></button>
            )}
            {onCancel && (
              <button type="button" onClick={() => confirm('Выйти из текущей игры?') && onCancel()} className="live-judge-hud__header-button"><LogOut /><span>Выйти</span></button>
            )}
          </div>
        </div>

        {autoCountdown !== null && (
          <div data-testid="live-auto-notice" className="live-judge-hud__auto-notice" role="status">
            <span>Авто: переход к следующему шагу через <b>{autoCountdown}</b></span>
            <button type="button" onClick={stopAutoAdvance}>Остановить</button>
          </div>
        )}
        <div className="live-judge-hud__body">
          {phase === 'day_voting' && votingStage === 'revote_speeches'
            ? renderVoting()
            : (activeSpeakerSlot !== null || customTimerLabel !== null)
              ? renderTimer()
              : renderIdleBody()}
        </div>

        {showFooter && (
          <div className="live-judge-hud__footer">
            {showFooterSummary && (
              <div className="live-judge-hud__summary">
                <span>Выставлены: {nominations.length ? nominations.map((seat) => `#${seat}`).join(' · ') : '—'}</span>
                <span>Живых: {activePlayers.filter((player) => player.alive).length}/{activePlayers.length}</span>
              </div>
            )}
            {showFooterAction && (prevStep || nextStep) && (
              <div className={`live-judge-hud__footer-actions ${footerSingle ? 'live-judge-hud__footer-actions--single' : ''}`}>
                {prevStep && <button type="button" onClick={prevStep.onClick} className="live-judge-hud__secondary"><ArrowLeft />Назад</button>}
                {nextStep && <button type="button" onClick={nextStep.onClick} className="live-judge-hud__primary">{nextStep.label}<ArrowRight /></button>}
              </div>
            )}
          </div>
        )}
      </div>

      {bestMoveTimeLeft !== null && typeof document !== 'undefined' && createPortal(
        <div className="fixed left-1/2 top-3 z-[145] -translate-x-1/2 rounded-2xl border border-amber-400/50 bg-slate-950/95 px-5 py-2 text-center shadow-2xl backdrop-blur-xl">
          <div className="text-[10px] font-black uppercase tracking-widest text-amber-300">ЛХ · {BEST_MOVE_SECONDS} секунд</div>
          <div className={`font-mono text-3xl font-black ${bestMoveTimeLeft <= 5 ? 'text-rose-400' : 'text-white'}`}>{bestMoveTimeLeft}с</div>
        </div>,
        document.body,
      )}
    </>
  );
}
