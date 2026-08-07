import React from "react";
import { Pause, Play, RotateCcw, Mic, LogOut, ArrowLeft, ArrowRight, Volume2, VolumeX } from "lucide-react";
import { ActivePlayerState, Phase, NightSubPhase } from "./types.js";
import { VotingRound, determineVotingResult } from "../../shared/tournamentVoting.js";
import { isVoteDecidedFromAssignments } from "../../lib/liveVoting.js";

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

  // Deprecated PATCH-02 props retained temporarily so old callers remain type-safe.
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
  handleAdvanceNightSubPhase,
  handleResolveNight,
  isMuted = false,
  setIsMuted,
  votingRounds = [],
  activeVotingRoundIndex = 0,
  votingStage = 'setup',
  revoteSpeakerIndex = 0,
  setRevoteSpeakerIndex,
  tableLeaveVotesInput = null,
  setTableLeaveVotesInput,
  handleConfirmSingleElimination,
  handleGoToRevoteSpeeches,
  handleLaunchNextRevote,
  handleConfirmAutoNoElimination,
  handleConfirmTableDecision,
}: CenterPanelProps) {
  const activeSpeaker = activePlayers.find((p) => p.slot_num === activeSpeakerSlot);
  const donPlayer = activePlayers.find((p) => p.role === "Дон");
  const mafiaPlayers = activePlayers.filter((p) => p.role === "Мафия");
  const prevStep = getPrevStepAction();
  const nextStep = getNextStepInfo();
  const currentRound = votingRounds[activeVotingRoundIndex];

  const handleStartTimer = (slot: number, duration: number) => {
    setActiveSpeakerSlot(slot);
    setTimeLeft(duration);
    setIsTimerRunning(true);
  };

  const phaseLabel = phase === 'zero_night'
    ? '🌙 Нулевая ночь'
    : phase === 'night'
      ? `🌙 Ночь ${roundNumber}`
      : phase === 'day_voting'
        ? `🗳️ Голосование · День ${roundNumber}`
        : `☀️ День ${roundNumber}`;

  const renderTimer = () => (
    <div className="space-y-2 w-full max-w-[250px] mx-auto">
      <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest block">
        {customTimerLabel || (activeSpeakerSlot ? `Сейчас говорит #${activeSpeakerSlot}` : 'Таймер')}
      </span>
      {activeSpeaker && <div className="text-xs font-black text-white">{activeSpeaker.nickname || `Игрок ${activeSpeaker.slot_num}`}</div>}
      <div className={`text-3xl font-mono font-black py-1 rounded-xl border ${timeLeft <= 10 ? 'text-rose-400 border-rose-500/60 bg-rose-950/60' : 'text-emerald-400 border-slate-800 bg-slate-950'}`}>
        {timeLeft}с
      </div>
      <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
        <div className="h-full bg-emerald-600 transition-all" style={{ width: `${Math.min(100, Math.max(0, timerMax ? (timeLeft / timerMax) * 100 : 0))}%` }} />
      </div>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => handleAdjustTime(-10)} className="w-11 h-10 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold">-10</button>
        {isTimerRunning ? (
          <button type="button" onClick={() => setIsTimerRunning(false)} className="flex-1 h-10 rounded-xl bg-amber-600 text-slate-950 font-black text-xs flex items-center justify-center gap-1"><Pause className="w-4 h-4" />Пауза</button>
        ) : (
          <button type="button" onClick={() => setIsTimerRunning(true)} className="flex-1 h-10 rounded-xl bg-emerald-600 text-white font-black text-xs flex items-center justify-center gap-1"><Play className="w-4 h-4" />Старт</button>
        )}
        <button type="button" onClick={() => { setIsTimerRunning(false); setTimeLeft(timerMax); }} className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 flex items-center justify-center"><RotateCcw className="w-4 h-4" /></button>
        {setIsMuted && (
          <button type="button" onClick={() => setIsMuted((v) => !v)} className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 flex items-center justify-center">
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );

  const renderVoting = () => {
    if (!currentRound) {
      return <div className="text-xs text-slate-400">Подготовка голосования…</div>;
    }

    const result = determineVotingResult(currentRound);
    const eligibleVoterSeats = activePlayers.filter((p) => p.alive).map((p) => p.slot_num);
    const decided = isVoteDecidedFromAssignments(currentRound.nominated_seats, votesByPlayer, eligibleVoterSeats);

    if (votingStage === 'collecting' || votingStage === 'setup') {
      const candidates = currentRound.nominated_seats;
      const nominee = candidates[currentVotingNomineeIndex];
      const explicitAssigned = Object.keys(votesByPlayer).filter((raw) => eligibleVoterSeats.includes(Number(raw))).length;
      const eligible = currentRound.eligible_voters ?? eligibleVoterSeats.length;
      const remaining = Math.max(0, eligible - explicitAssigned);
      const isLast = currentVotingNomineeIndex === candidates.length - 1;
      return (
        <div className="space-y-2.5 w-full max-w-[245px] mx-auto">
          <div className="text-[9px] uppercase font-black text-slate-400">
            {currentRound.is_revote ? `Переголосование #${activeVotingRoundIndex}` : 'Основное голосование'} · {eligible} голосующих
          </div>
          <div className="text-xs font-black text-white">
            Кто против <span className="text-rose-400 font-mono">#{nominee}</span>?
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2 flex justify-between text-[10px]">
            <span className="text-slate-400">Текущий итог</span>
            <strong className="text-rose-400 font-mono">{votes[nominee] || 0}</strong>
          </div>
          {decided && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-2 py-1.5 text-[9px] font-black text-emerald-400 uppercase">
              ✓ Голосование решено
            </div>
          )}
          {isLast && remaining > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 px-2 py-1.5 text-[9px] text-amber-300">
              Последнему кандидату автоматически уйдут оставшиеся голоса: {remaining}
            </div>
          )}
          <div className="flex justify-center gap-1.5">
            <button type="button" onClick={() => handleAllocateVotes(nominee, (votes[nominee] || 0) - 1)} className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs">−1</button>
            <button type="button" onClick={() => handleAllocateVotes(nominee, (votes[nominee] || 0) + 1)} className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-rose-400 text-xs">+1</button>
          </div>
          <div className="flex justify-between gap-1.5 pt-1">
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
      const speaker = winners[revoteSpeakerIndex];
      return (
        <div className="space-y-2.5 w-full max-w-[245px] mx-auto">
          <div className="text-xs font-black text-amber-400 uppercase">30 секунд спорным игрокам</div>
          <div className="text-sm font-black text-white">#{speaker} · {activePlayers.find((p) => p.slot_num === speaker)?.nickname || 'Игрок'}</div>
          <div className="text-[9px] text-slate-400">Спикер {revoteSpeakerIndex + 1} из {winners.length}</div>
          {revoteSpeakerIndex < winners.length - 1 ? (
            <button type="button" onClick={() => { const next = winners[revoteSpeakerIndex + 1]; setRevoteSpeakerIndex?.((i) => i + 1); handleStartTimer(next, 30); }} className="w-full py-2 rounded-xl bg-amber-600 text-white font-black text-[10px] uppercase">Следующая речь</button>
          ) : (
            <button type="button" onClick={() => handleLaunchNextRevote?.(winners)} className="w-full py-2 rounded-xl bg-rose-600 text-white font-black text-[10px] uppercase">Переголосование</button>
          )}
        </div>
      );
    }

    if (votingStage === 'round_result') {
      if (result.outcome === 'single_eliminated') {
        return (
          <div className="space-y-2.5 max-w-[245px] mx-auto">
            <div className="text-xs font-black text-rose-400">Игрок #{result.winners[0]} покидает стол</div>
            <button type="button" onClick={() => handleConfirmSingleElimination?.(result.winners[0])} className="w-full py-2 rounded-xl bg-rose-600 text-white font-black text-[10px] uppercase">Подтвердить</button>
          </div>
        );
      }

      if (result.outcome === 'needs_revote') {
        return (
          <div className="space-y-2.5 max-w-[245px] mx-auto">
            <div className="text-[10px] font-black text-amber-300">Ничья: {result.winners.map((s) => `#${s}`).join(', ')}</div>
            <button type="button" onClick={() => handleGoToRevoteSpeeches?.(result.winners)} className="w-full py-2 rounded-xl bg-amber-600 text-white font-black text-[10px] uppercase">Речи 30 сек</button>
          </div>
        );
      }

      if (result.outcome === 'auto_no_elimination') {
        return (
          <div className="space-y-2.5 max-w-[245px] mx-auto">
            <div className="text-[10px] text-emerald-300">Спорных игроков больше половины стола. Никто не покидает стол.</div>
            <button type="button" onClick={() => handleConfirmAutoNoElimination?.()} className="w-full py-2 rounded-xl bg-emerald-600 text-white font-black text-[10px] uppercase">Подтвердить и перейти в ночь</button>
          </div>
        );
      }

      if (result.outcome === 'requires_table_decision') {
        const eligible = currentRound.eligible_voters ?? eligibleVoterSeats.length;
        const majority = Math.floor(eligible / 2) + 1;
        const entered = Math.max(0, Math.min(eligible, tableLeaveVotesInput ?? 0));
        return (
          <div className="space-y-2.5 max-w-[245px] mx-auto">
            <div className="text-[10px] text-amber-300">Повторная ничья: {result.winners.map((s) => `#${s}`).join(', ')}</div>
            <div className="text-[9px] text-slate-400">Голосование стола за уход всех спорных. Нужно {majority} из {eligible}.</div>
            <div className="flex items-center justify-center gap-2">
              <button type="button" onClick={() => setTableLeaveVotesInput?.(Math.max(0, entered - 1))} className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">−</button>
              <strong className="text-lg font-mono text-amber-400">{entered}</strong>
              <button type="button" onClick={() => setTableLeaveVotesInput?.(Math.min(eligible, entered + 1))} className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-amber-400">+</button>
            </div>
            <button type="button" onClick={() => handleConfirmTableDecision?.(entered, result.winners)} className="w-full py-2 rounded-xl bg-amber-600 text-white font-black text-[10px] uppercase">Подтвердить голосование стола</button>
          </div>
        );
      }
    }

    return <div className="text-xs text-slate-400">Голосование завершено</div>;
  };

  const renderIdleBody = () => {
    if (phase === 'zero_night') {
      return (
        <div className="space-y-2 max-w-[220px] mx-auto">
          <div className="text-xs font-black text-white uppercase">Подготовка игры</div>
          <button type="button" onClick={() => handleStartZeroNightTimer('agreement')} className="w-full py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 text-[10px] font-bold">1. Договорка · 75с</button>
          <button type="button" onClick={() => handleStartZeroNightTimer('sheriff')} className="w-full py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 text-[10px] font-bold">2. Вызов шерифа · 10с</button>
          <button type="button" onClick={() => handleStartZeroNightTimer('seating')} className="w-full py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 text-[10px] font-bold">3. Посадка · 40с</button>
          {zeroNightSubPhase === 'agreement' && <div className="text-[9px] text-slate-400">Дон #{donPlayer?.slot_num || '—'} · Мафия {mafiaPlayers.map((p) => `#${p.slot_num}`).join(', ') || '—'}</div>}
        </div>
      );
    }

    if (phase === 'day_speeches') {
      return nextSpeaker ? (
        <div className="space-y-2">
          <div className="text-xs font-black text-white uppercase">Круг обсуждения</div>
          <button type="button" onClick={handleStartNextSpeaker} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-black text-[10px] uppercase flex items-center gap-1.5 mx-auto"><Mic className="w-4 h-4" />Речь #{nextSpeaker.slot_num}</button>
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
        morning: 'Итоги ночи',
      };
      return <div className="text-xs font-black text-purple-300">{labels[nightSubPhase] || 'Ночь'}</div>;
    }

    return null;
  };

  return (
    <div className="col-span-2 md:col-start-2 md:col-span-3 md:row-start-2 order-first md:order-none min-h-[300px] bg-slate-900/95 border-2 border-slate-800 rounded-2xl sm:rounded-3xl p-3 flex flex-col justify-between text-center shadow-2xl">
      <div className="flex justify-between items-center border-b border-slate-800 pb-2">
        <span className="text-[10px] font-black uppercase text-slate-300">{phaseLabel}</span>
        {onCancel && <button type="button" onClick={() => confirm('Выйти из текущей игры?') && onCancel()} className="text-[9px] text-slate-400 flex items-center gap-1"><LogOut className="w-3 h-3" />Выйти</button>}
      </div>

      {phase === 'night' && handleAdvanceNightSubPhase && (
        <div className="flex flex-wrap justify-center gap-1 py-2">
          {(['intro','shooting','don','sheriff','morning'] as NightSubPhase[]).map((sub) => (
            <button key={sub} type="button" onClick={() => handleAdvanceNightSubPhase(sub)} className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase border ${nightSubPhase === sub ? 'bg-purple-600 border-purple-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>{sub === 'intro' ? 'Старт' : sub === 'shooting' ? 'Стрельба' : sub === 'don' ? 'Дон' : sub === 'sheriff' ? 'Шериф' : 'Утро'}</button>
          ))}
        </div>
      )}

      <div className="flex-1 flex items-center justify-center py-3 overflow-y-auto">
        {(activeSpeakerSlot !== null || customTimerLabel !== null) ? renderTimer() : renderIdleBody()}
      </div>

      <div className="border-t border-slate-800 pt-2 space-y-2">
        <div className="flex justify-between text-[9px] text-slate-500">
          <span>Выставлены: {nominations.length ? nominations.map((n) => `#${n}`).join(', ') : '—'}</span>
          <span>Живых: {activePlayers.filter((p) => p.alive).length}/10</span>
        </div>
        <div className="grid grid-cols-12 gap-1.5 min-h-[42px]">
          {prevStep ? <button type="button" onClick={prevStep.onClick} className="col-span-4 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-[9px] font-bold flex items-center justify-center gap-1"><ArrowLeft className="w-3 h-3" />{prevStep.label}</button> : <div className="col-span-4" />}
          {nextStep ? <button type="button" onClick={nextStep.onClick} className="col-span-8 rounded-lg bg-rose-600 text-white text-[10px] font-black uppercase flex items-center justify-center gap-1">{nextStep.label}<ArrowRight className="w-3 h-3" /></button> : <div className="col-span-8 rounded-lg bg-slate-950/40 border border-slate-850 text-slate-600 text-[10px] flex items-center justify-center">Ожидание</div>}
        </div>
        {phase === 'night' && handleResolveNight && nightSubPhase === 'morning' && (
          <button type="button" onClick={handleResolveNight} className="w-full py-2 rounded-xl bg-emerald-600 text-white font-black text-[10px] uppercase">Зафиксировать ночь и разбудить город</button>
        )}
      </div>
    </div>
  );
}
