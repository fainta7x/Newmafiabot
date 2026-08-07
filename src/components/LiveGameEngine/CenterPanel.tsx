import React from "react";
import { Pause, Play, RotateCcw, Mic, LogOut, ArrowLeft, ArrowRight, Volume2, VolumeX } from "lucide-react";
import { ActivePlayerState, Phase, NightSubPhase } from "./types.js";
import { VotingRound, determineVotingResult } from "../../shared/tournamentVoting.js";
import { isVoteDecidedFromAssignments } from "../../lib/liveVoting.js";

type VotingStage = 'setup' | 'collecting' | 'round_result' | 'revote_speeches' | 'table_decision' | 'resolved';

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
  onCancel?: () => void;
  isMuted?: boolean;
  setIsMuted?: React.Dispatch<React.SetStateAction<boolean>>;
  votingRounds?: VotingRound[];
  activeVotingRoundIndex?: number;
  votingStage?: VotingStage;
  setVotingStage?: React.Dispatch<React.SetStateAction<VotingStage>>;
  revoteSpeakerIndex?: number;
  setRevoteSpeakerIndex?: React.Dispatch<React.SetStateAction<number>>;
  setTableLeaveVotesInput?: React.Dispatch<React.SetStateAction<number | null>>;
  handleConfirmSingleElimination?: (slotNum: number) => void;
  handleGoToRevoteSpeeches?: (winners: number[]) => void;
  handleLaunchNextRevote?: (winners: number[]) => void;
  handleConfirmAutoNoElimination?: () => void;
  handleConfirmTableDecision?: (votesCount: number, winners: number[]) => void;
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
  handleStartZeroNightTimer,
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
  const activeSpeaker = activePlayers.find((p) => p.slot_num === activeSpeakerSlot);
  const donPlayer = activePlayers.find((p) => p.role === "Дон");
  const mafiaPlayers = activePlayers.filter((p) => p.role === "Мафия");
  const prevStep = getPrevStepAction();
  const nextStep = getNextStepInfo();
  const currentRound = votingRounds[activeVotingRoundIndex];
  const effectiveTimerMax = phase === 'day_voting' && votingStage === 'revote_speeches' ? 30 : timerMax;

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

  const handleStartTimer = (slot: number, duration: number) => {
    const safeDuration = phase === 'day_voting' && votingStage === 'revote_speeches' ? 30 : duration;
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
    setTableVoterSlots((previous) => {
      const next = previous.includes(slot)
        ? previous.filter((value) => value !== slot)
        : [...previous, slot];
      setTableLeaveVotesInput?.(next.length);
      return next;
    });
  };

  const renderTimer = () => (
    <div className="live-hud-timer w-full max-w-[300px] mx-auto">
      <span className="live-hud-timer-label text-[9px] font-black text-amber-400 uppercase tracking-widest block">
        {customTimerLabel || (activeSpeakerSlot ? `Сейчас говорит #${activeSpeakerSlot}` : 'Таймер')}
      </span>
      <div className="live-hud-timer-main">
        {activeSpeaker && <div className="live-hud-speaker text-xs font-black text-white truncate">{activeSpeaker.nickname || `Игрок ${activeSpeaker.slot_num}`}</div>}
        <div className={`live-hud-time text-2xl sm:text-3xl font-mono font-black rounded-xl border ${timeLeft <= 10 ? 'text-rose-400 border-rose-500/60 bg-rose-950/60' : 'text-emerald-400 border-slate-800 bg-slate-950'}`}>
          {timeLeft}с
        </div>
      </div>
      <div className="live-hud-progress w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
        <div className="h-full bg-emerald-600 transition-all" style={{ width: `${Math.min(100, Math.max(0, effectiveTimerMax ? (timeLeft / effectiveTimerMax) * 100 : 0))}%` }} />
      </div>
      <div className="live-hud-timer-controls">
        <button type="button" onClick={() => handleAdjustTime(-10)} className="live-hud-control bg-slate-900 border border-slate-800 text-slate-300 font-bold">-10</button>
        {isTimerRunning ? (
          <button type="button" aria-label="Пауза" onClick={() => setIsTimerRunning(false)} className="live-hud-control live-hud-control-primary bg-amber-600 text-slate-950 font-black"><Pause /></button>
        ) : (
          <button type="button" aria-label="Старт" onClick={() => setIsTimerRunning(true)} className="live-hud-control live-hud-control-primary bg-emerald-600 text-white font-black"><Play /></button>
        )}
        <button type="button" aria-label="Сбросить таймер" onClick={() => { setIsTimerRunning(false); setTimeLeft(effectiveTimerMax); }} className="live-hud-control bg-slate-900 border border-slate-800 text-slate-300"><RotateCcw /></button>
        {setIsMuted && (
          <button type="button" aria-label={isMuted ? 'Включить звук' : 'Выключить звук'} onClick={() => setIsMuted((v) => !v)} className="live-hud-control bg-slate-900 border border-slate-800 text-slate-300">
            {isMuted ? <VolumeX /> : <Volume2 />}
          </button>
        )}
      </div>
    </div>
  );

  const renderVoting = () => {
    if (!currentRound) return <div className="live-voting-empty text-xs text-slate-400">Подготовка голосования…</div>;

    const result = determineVotingResult(currentRound);
    const eligiblePlayers = activePlayers.filter((p) => p.alive);
    const eligibleVoterSeats = eligiblePlayers.map((p) => p.slot_num);
    const decided = isVoteDecidedFromAssignments(currentRound.nominated_seats, votesByPlayer, eligibleVoterSeats);

    if (votingStage === 'collecting' || votingStage === 'setup') {
      const candidates = currentRound.nominated_seats;
      const nominee = candidates[currentVotingNomineeIndex];
      const explicitAssigned = Object.keys(votesByPlayer).filter((raw) => eligibleVoterSeats.includes(Number(raw))).length;
      const eligible = currentRound.eligible_voters ?? eligibleVoterSeats.length;
      const remaining = Math.max(0, eligible - explicitAssigned);
      const isLast = currentVotingNomineeIndex === candidates.length - 1;

      return (
        <div className="live-voting live-voting-collecting w-full max-w-[300px] mx-auto">
          <div className="live-voting-meta text-[9px] uppercase font-black text-slate-400">
            {currentRound.is_revote ? `Переголосование #${activeVotingRoundIndex}` : 'Основное голосование'} · {eligible} голосующих
          </div>
          <div className="live-voting-question text-xs font-black text-white">
            Кто против <span className="text-rose-400 font-mono">#{nominee}</span>?
          </div>
          <div className="live-voting-score bg-slate-950 border border-slate-800 rounded-xl flex justify-between items-center">
            <span className="text-slate-400">Текущий итог</span>
            <strong className="text-rose-400 font-mono">{votes[nominee] || 0}</strong>
          </div>
          {(decided || (isLast && remaining > 0)) && (
            <div className={`live-voting-hint ${decided ? 'text-emerald-300' : 'text-amber-300'}`}>
              {decided ? '✓ Голосование уже решено' : `Последнему автоматически: ${remaining}`}
            </div>
          )}
          <div className="live-voting-stepper">
            <button type="button" onClick={() => handleAllocateVotes(nominee, (votes[nominee] || 0) - 1)}>−1</button>
            <button type="button" onClick={() => handleAllocateVotes(nominee, (votes[nominee] || 0) + 1)}>+1</button>
          </div>
          <div className="live-voting-nav">
            <button type="button" disabled={currentVotingNomineeIndex === 0} onClick={() => selectVotingNomineeIndex(currentVotingNomineeIndex - 1)}>← Назад</button>
            {isLast ? (
              <button type="button" onClick={() => { if (remaining > 0) handleInteractiveAutoRemainder(); handleResolveVoting(); }} className="live-voting-nav-primary bg-emerald-600 text-white">Итог</button>
            ) : (
              <button type="button" onClick={() => selectVotingNomineeIndex(currentVotingNomineeIndex + 1)} className="live-voting-nav-primary bg-rose-600 text-white">Следующий →</button>
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
        <div className="live-voting live-voting-revote w-full max-w-[300px] mx-auto">
          <div className="live-voting-revote-head">
            <span>Спорная речь · 30с</span>
            <span>{revoteSpeakerIndex + 1}/{winners.length}</span>
          </div>
          {renderTimer()}
          <button type="button" onClick={advanceSpeech} className={`live-voting-revote-next ${isLastSpeaker ? 'bg-rose-600' : 'bg-amber-600'} text-white font-black uppercase`}>
            {isLastSpeaker ? 'К переголосованию' : 'Следующий спорный'}
          </button>
        </div>
      );
    }

    if (votingStage === 'round_result') {
      if (result.outcome === 'single_eliminated') {
        return (
          <div className="live-voting-result">
            <div className="text-rose-400 font-black">Игрок #{result.winners[0]} покидает стол</div>
            <button type="button" onClick={() => handleConfirmSingleElimination?.(result.winners[0])} className="bg-rose-600 text-white font-black">Подтвердить</button>
          </div>
        );
      }

      if (result.outcome === 'needs_revote') {
        return (
          <div className="live-voting-result">
            <div className="text-amber-300 font-black">Ничья: {result.winners.map((s) => `#${s}`).join(', ')}</div>
            <button type="button" onClick={() => handleGoToRevoteSpeeches?.(result.winners)} className="bg-amber-600 text-white font-black">Речи по 30 секунд</button>
          </div>
        );
      }

      if (result.outcome === 'auto_no_elimination') {
        return (
          <div className="live-voting-result">
            <div className="text-emerald-300">Спорных больше половины стола. Никто не уходит.</div>
            <button type="button" onClick={() => handleConfirmAutoNoElimination?.()} className="bg-emerald-600 text-white font-black">В ночь</button>
          </div>
        );
      }

      if (result.outcome === 'requires_table_decision') {
        const eligible = currentRound.eligible_voters ?? eligibleVoterSeats.length;
        const majority = Math.floor(eligible / 2) + 1;
        const entered = tableVoterSlots.length;
        return (
          <div className="live-voting live-voting-table-decision w-full max-w-[340px] mx-auto">
            <div className="live-voting-table-title">Повторная ничья: {result.winners.map((s) => `#${s}`).join(', ')}</div>
            <div className="live-voting-table-count">За уход всех: <strong>{entered}/{eligible}</strong> · нужно {majority}</div>
            <div className="live-voting-table-seats">
              {eligiblePlayers.map((player) => {
                const selected = tableVoterSlots.includes(player.slot_num);
                return (
                  <button key={player.slot_num} type="button" onClick={() => toggleTableVoter(player.slot_num)} className={selected ? 'is-selected' : ''}>
                    {player.slot_num}
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => handleConfirmTableDecision?.(entered, result.winners)} className="live-voting-table-confirm bg-amber-600 text-white font-black">Подтвердить решение стола</button>
          </div>
        );
      }
    }

    return <div className="text-xs text-slate-400">Голосование завершено</div>;
  };

  const renderIdleBody = () => {
    if (phase === 'zero_night') {
      return (
        <div className="live-zero-night w-full max-w-[300px] mx-auto">
          <div className="live-zero-night-title font-black text-white uppercase">Подготовка игры</div>
          <button type="button" onClick={() => handleStartZeroNightTimer('agreement')}>1. Договорка · 75с</button>
          <button type="button" onClick={() => handleStartZeroNightTimer('sheriff')}>2. Вызов шерифа · 10с</button>
          <button type="button" onClick={() => handleStartZeroNightTimer('seating')}>3. Посадка · 40с</button>
          {zeroNightSubPhase === 'agreement' && <div className="live-zero-night-note">Дон #{donPlayer?.slot_num || '—'} · Мафия {mafiaPlayers.map((p) => `#${p.slot_num}`).join(', ') || '—'}</div>}
        </div>
      );
    }

    if (phase === 'day_speeches') {
      return nextSpeaker ? (
        <div className="live-day-idle">
          <div className="live-day-idle-title">Круг обсуждения</div>
          <button type="button" onClick={handleStartNextSpeaker} className="bg-emerald-600 text-white font-black uppercase"><Mic />Речь #{nextSpeaker.slot_num}</button>
        </div>
      ) : <div className="text-xs font-black text-emerald-400">Все выступили ✓</div>;
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
      return <div className="live-night-status text-purple-300 font-black">{labels[nightSubPhase] || 'Ночь'}</div>;
    }

    return null;
  };

  const showFooter = Boolean(prevStep || nextStep);

  return (
    <div className={`live-hud live-hud-phase-${phase} live-hud-voting-${votingStage} col-span-2 md:col-start-2 md:col-span-3 md:row-start-2 order-first md:order-none sticky top-[72px] md:static z-40 md:z-auto bg-slate-900/98 border-2 border-slate-800 rounded-2xl sm:rounded-3xl text-center shadow-2xl`}>
      <div className="live-hud-header flex justify-between items-center border-b border-slate-800 gap-2">
        <span className="live-hud-phase-label font-black uppercase text-slate-300 truncate">{phaseLabel}</span>
        <div className="live-hud-header-actions flex items-center gap-2 shrink-0">
          {canUseVotingBack && (
            <button type="button" onClick={handleVotingBack} className="live-hud-back text-slate-300 flex items-center gap-1 rounded-lg bg-slate-950 border border-slate-800">
              <ArrowLeft />Назад
            </button>
          )}
          {onCancel && <button type="button" onClick={() => confirm('Выйти из текущей игры?') && onCancel()} className="live-hud-exit text-slate-400 flex items-center gap-1"><LogOut />Выйти</button>}
        </div>
      </div>

      <div className="live-hud-body flex items-center justify-center">
        {phase === 'day_voting' && votingStage === 'revote_speeches'
          ? renderVoting()
          : (activeSpeakerSlot !== null || customTimerLabel !== null)
            ? renderTimer()
            : renderIdleBody()}
      </div>

      {showFooter && (
        <div className="live-hud-footer border-t border-slate-800">
          <div className="live-hud-nav grid grid-cols-12">
            {prevStep ? <button type="button" onClick={prevStep.onClick} className="live-hud-nav-back col-span-4 bg-slate-950 border border-slate-800 text-slate-300 font-bold flex items-center justify-center gap-1"><ArrowLeft />{prevStep.label}</button> : <div className="col-span-4" />}
            {nextStep ? <button type="button" onClick={nextStep.onClick} className="live-hud-nav-next col-span-8 bg-rose-600 text-white font-black uppercase flex items-center justify-center gap-1">{nextStep.label}<ArrowRight /></button> : <div className="col-span-8" />}
          </div>
        </div>
      )}
    </div>
  );
}
