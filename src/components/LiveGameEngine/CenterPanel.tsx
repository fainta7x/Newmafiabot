import React from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, LogOut, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { ActivePlayerState, NightSubPhase, Phase } from "./types.js";
import { VotingRound, determineVotingResult } from "../../shared/tournamentVoting.js";
import { requestJudgeGameMusicStop, requestJudgeNightMusicStart } from "../JudgeGameMusicController.tsx";
import type { ZeroNightMusicState } from "./engineStateModel.js";
import "../crm/liveGameEveningBugfixes.css";
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
import {
  activateTableDecisionSelection,
  deactivateTableDecisionSelection,
  useTableDecisionSelection,
} from "./tableDecisionSelectionStore.js";

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

const normalizeJudgeCopy = (value: string): string => value
  .replace(/^Посадка/, 'Свободная посадка')
  .replace(/^Разбудить город$/, 'Открыть нулевой круг')
  .replace(/^Стрельба мафии$/, 'Отстрел')
  .replace(/^Прощальная речь/, 'Последняя речь')
  .replace(/^Прощальная /, 'Последняя речь ')
  .replace(/^Завершить прощальные$/, 'Завершить последние речи')
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
  } = props;

  const [musicStartedRound, setMusicStartedRound] = React.useState<number | null>(null);
  const [musicStoppedRound, setMusicStoppedRound] = React.useState<number | null>(null);
  const [bestMoveTimeLeft, setBestMoveTimeLeft] = React.useState<number | null>(null);
  const [pendingVotingResolution, setPendingVotingResolution] = React.useState(false);
  const timerDeadlineRef = React.useRef<number | null>(null);
  const timerIdentityRef = React.useRef('');
  const bestMoveDeadlineRef = React.useRef<number | null>(null);
  const tableDecisionSelection = useTableDecisionSelection();

  const activeSpeaker = activePlayers.find((player) => player.slot_num === activeSpeakerSlot);
  const donPlayer = activePlayers.find((player) => player.role === 'Дон');
  const mafiaPlayers = activePlayers.filter((player) => player.role === 'Мафия');
  const currentRound = votingRounds[activeVotingRoundIndex];
  const currentVotingResult = currentRound ? determineVotingResult(currentRound) : null;
  const effectiveTimerMax = resolveTimerDuration(phase, votingStage, timerMax);
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
    if (phase === 'day_voting' && votingStage === 'revote_speeches' && activeSpeakerSlot !== null && timeLeft > 30) {
      setTimeLeft(30);
    }
  }, [phase, votingStage, activeSpeakerSlot, timeLeft, setTimeLeft]);

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
    ? 'Нулевая ночь'
    : phase === 'night'
      ? `Ночь ${roundNumber}`
      : phase === 'day_voting'
        ? `Голосование · ${dayLabel}`
        : dayLabel;

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

  const canUseVotingBack = phase === 'day_voting' && (votingStage === 'round_result' || votingStage === 'revote_speeches');

  const handleVotingBack = () => {
    if (!currentRound || !currentVotingResult) return;
    setIsTimerRunning(false);
    setActiveSpeakerSlot(null);

    if (votingStage === 'round_result') {
      deactivateTableDecisionSelection();
      setTableLeaveVotesInput?.(null);
      setVotingStage?.('collecting');
      return;
    }

    if (votingStage === 'revote_speeches') {
      const participants = currentVotingResult.winners;
      if (revoteSpeakerIndex > 0) {
        const previousIndex = revoteSpeakerIndex - 1;
        const previousSpeaker = participants[previousIndex];
        setRevoteSpeakerIndex?.(previousIndex);
        if (previousSpeaker) handleStartTimer(previousSpeaker, 30);
      } else {
        setVotingStage?.('round_result');
      }
    }
  };

  const renderNominationChips = () => (
    <div className="live-judge-hud__meta">
      <span className="live-judge-chip">Выставлены <strong>{nominations.length ? nominations.map((slot) => `#${slot}`).join(' · ') : '—'}</strong></span>
    </div>
  );

  const renderTimer = () => {
    const timerLabel = normalizeJudgeCopy(customTimerLabel || (activeSpeakerSlot ? `Речь #${activeSpeakerSlot}` : 'Таймер'));
    const timerName = activeSpeaker?.nickname || (nightActionStatus ?? '');
    return (
      <div className="live-judge-timer">
        <div className="live-judge-timer__label">{timerLabel}</div>
        <div className="live-judge-timer__name" data-testid={nightActionStatus ? 'live-game-night-status' : undefined}>
          {nightActionStatus || timerName}
        </div>
        <div className={`live-judge-timer__time ${timeLeft <= 10 ? 'live-judge-timer__time--danger' : ''}`}>{timeLeft}с</div>
        <div className="live-judge-timer__bar"><div style={{ width: `${Math.min(100, Math.max(0, effectiveTimerMax ? (timeLeft / effectiveTimerMax) * 100 : 0))}%` }} /></div>
        <div className="live-judge-timer__buttons">
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

  const renderVoting = () => {
    if (!currentRound) return <div className="live-judge-hud__hint">Подготовка голосования…</div>;

    const result = determineVotingResult(currentRound);
    const eligibleVoterSeats = activePlayers.filter((player) => player.alive).map((player) => player.slot_num);

    if (votingStage === 'collecting' || votingStage === 'setup') {
      const { nominee, eligible, remaining, currentVotes, isLast } = buildCollectingVotingPresentation({
        eligibleVoterSeats,
        eligibleVoters: currentRound.eligible_voters,
        nominatedSeats: currentRound.nominated_seats,
        currentNomineeIndex: currentVotingNomineeIndex,
        votesByPlayer,
      });

      const finalizeVoting = () => {
        if (pendingVotingResolution) return;
        if (remaining > 0) {
          setPendingVotingResolution(true);
          handleInteractiveAutoRemainder();
          return;
        }
        handleResolveVoting();
      };

      return (
        <div className="live-judge-hud__stack live-judge-hud__stack--voting-scroll">
          <div className="live-judge-hud__eyebrow">{currentRound.is_revote ? `Переголосование ${activeVotingRoundIndex}` : 'Голосование'}</div>
          {renderVotingOrder(currentRound.nominated_seats, currentVotingNomineeIndex)}
          <div className="live-judge-hud__title">Кто против <strong>#{nominee}</strong>?</div>
          <div className="live-judge-vote-summary">
            <div className="live-judge-stat"><div className="live-judge-stat__label">Голосов</div><div className="live-judge-stat__value">{currentVotes}</div></div>
            <div className="live-judge-stat"><div className="live-judge-stat__label">Осталось</div><div className="live-judge-stat__value">{remaining}/{eligible}</div></div>
          </div>
          <div className="live-judge-hud__hint">
            {isLast
              ? 'Нажимайте карточки голосующих. Неотмеченные голоса уйдут сюда только при подведении итога.'
              : `Нажимайте карточки игроков, голосующих против #${nominee}.`}
          </div>
          <div className="live-judge-vote-actions">
            <button type="button" disabled={currentVotingNomineeIndex === 0 || pendingVotingResolution} onClick={() => selectVotingNomineeIndex(currentVotingNomineeIndex - 1)} className="live-judge-action">← Назад</button>
            {isLast ? (
              <button type="button" disabled={pendingVotingResolution} onClick={finalizeVoting} className="live-judge-action live-judge-action--success">{pendingVotingResolution ? 'Считаю…' : 'Подвести итог'}</button>
            ) : (
              <button type="button" disabled={pendingVotingResolution} onClick={() => selectVotingNomineeIndex(currentVotingNomineeIndex + 1)} className="live-judge-action live-judge-action--primary">Следующий →</button>
            )}
          </div>
        </div>
      );
    }

    if (votingStage === 'revote_speeches') {
      const participants = result.winners;
      const isLastSpeaker = revoteSpeakerIndex >= participants.length - 1;
      const advanceSpeech = () => {
        setIsTimerRunning(false);
        if (isLastSpeaker) {
          setActiveSpeakerSlot(null);
          handleLaunchNextRevote?.(participants);
          return;
        }
        const next = participants[revoteSpeakerIndex + 1];
        setRevoteSpeakerIndex?.((index) => index + 1);
        handleStartTimer(next, 30);
      };

      return (
        <div className="live-judge-hud__stack live-judge-hud__stack--voting-scroll">
          <div className="live-judge-hud__eyebrow">Речи перед переголосованием · 30 сек</div>
          {renderVotingOrder(participants, revoteSpeakerIndex)}
          {renderTimer()}
          <button type="button" onClick={advanceSpeech} className="live-judge-action live-judge-action--primary">
            {isLastSpeaker ? 'К переголосованию' : 'Следующий игрок'}
          </button>
        </div>
      );
    }

    if (votingStage === 'round_result') {
      if (result.outcome === 'single_eliminated') {
        return (
          <div className="live-judge-hud__stack">
            <div className="live-judge-hud__eyebrow">Итог голосования</div>
            <div className="live-judge-hud__title">Заголосован <strong>#{result.winners[0]}</strong></div>
            <button type="button" onClick={() => handleConfirmSingleElimination?.(result.winners[0])} className="live-judge-action live-judge-action--primary">Подтвердить</button>
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
  const nextStep = (() => {
    if (phase === 'zero_night' && zeroNightMusicState === 'pending') {
      return {
        label: '♫ Включить музыку ночи',
        onClick: () => {
          requestJudgeNightMusicStart();
          setZeroNightMusicState('playing');
        },
      };
    }

    if (phase === 'zero_night' && zeroNightSubPhase === 'seating' && zeroNightMusicState === 'playing') {
      return {
        label: '♫ Выключить музыку',
        onClick: () => {
          requestJudgeGameMusicStop();
          setZeroNightMusicState('stopped');
        },
      };
    }

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

    return baseNextStep ? { ...baseNextStep, label: normalizeJudgeCopy(baseNextStep.label) } : null;
  })();

  const prevStep = getPrevStepAction();
  const showFooterAction = phase !== 'day_voting' || votingStage === 'resolved';
  const footerSingle = !(prevStep && nextStep);

  return (
    <>
      <div data-testid="live-judge-hud" className="live-judge-hud col-span-2 md:col-start-2 md:col-span-3 md:row-start-2 order-first md:order-none">
        <div className="live-judge-hud__header">
          <span className="live-judge-hud__phase">{phaseLabel}</span>
          <div className="live-judge-hud__header-actions">
            {canUseVotingBack && (
              <button type="button" onClick={handleVotingBack} className="live-judge-hud__header-button"><ArrowLeft /><span>Назад</span></button>
            )}
            {onCancel && (
              <button type="button" onClick={() => confirm('Выйти из текущей игры?') && onCancel()} className="live-judge-hud__header-button"><LogOut /><span>Выйти</span></button>
            )}
          </div>
        </div>

        <div className="live-judge-hud__body">
          {phase === 'day_voting' && votingStage === 'revote_speeches'
            ? renderVoting()
            : (activeSpeakerSlot !== null || customTimerLabel !== null)
              ? renderTimer()
              : renderIdleBody()}
        </div>

        <div className="live-judge-hud__footer">
          <div className="live-judge-hud__summary">
            <span>Выставлены: {nominations.length ? nominations.map((seat) => `#${seat}`).join(' · ') : '—'}</span>
            <span>Живых: {activePlayers.filter((player) => player.alive).length}/10</span>
          </div>
          {showFooterAction && (prevStep || nextStep) && (
            <div className={`live-judge-hud__footer-actions ${footerSingle ? 'live-judge-hud__footer-actions--single' : ''}`}>
              {prevStep && <button type="button" onClick={prevStep.onClick} className="live-judge-hud__secondary"><ArrowLeft />Назад</button>}
              {nextStep && <button type="button" onClick={nextStep.onClick} className="live-judge-hud__primary">{nextStep.label}<ArrowRight /></button>}
            </div>
          )}
        </div>
      </div>

      {bestMoveTimeLeft !== null && typeof document !== 'undefined' && createPortal(
        <div className="fixed left-1/2 top-3 z-[145] -translate-x-1/2 rounded-2xl border border-amber-400/50 bg-slate-950/95 px-5 py-2 text-center shadow-2xl backdrop-blur-xl">
          <div className="text-[9px] font-black uppercase tracking-widest text-amber-300">ЛХ · 20 секунд</div>
          <div className={`font-mono text-3xl font-black ${bestMoveTimeLeft <= 5 ? 'text-rose-400' : 'text-white'}`}>{bestMoveTimeLeft}с</div>
        </div>,
        document.body,
      )}
    </>
  );
}