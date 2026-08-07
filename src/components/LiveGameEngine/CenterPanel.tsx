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
    <div className="space-y-1.5 w-full max-w-[300px] mx-auto">
      <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest block">
        {customTimerLabel || (activeSpeakerSlot ? `Сейчас говорит #${activeSpeakerSlot}` : 'Таймер')}
      </span>
      {activeSpeaker && <div className="text-xs font-black text-white truncate">{activeSpeaker.nickname || `Игрок ${activeSpeaker.slot_num}`}</div>}
      <div className={`text-2xl sm:text-3xl font-mono font-black py-0.5 rounded-xl border ${timeLeft <= 10 ? 'text-rose-400 border-rose-500/60 bg-rose-950/60' : 'text-emerald-400 border-slate-800 bg-slate-950'}`}>
        {timeLeft}с
      </div>
      <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
        <div className="h-full bg-emerald-600 transition-all" style={{ width: `${Math.min(100, Math.max(0, effectiveTimerMax ? (timeLeft / effectiveTimerMax) * 100 : 0))}%` }} />
      </div>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => handleAdjustTime(-10)} className="w-10 h-9 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold">-10</button>
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
    if (!currentRound) {
      return <div className="text-xs text-slate-400">Подготовка голосования…</div>;
    }

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
        <div className="space-y-2 w-full max-w-[300px] mx-auto">
          <div className="text-[9px] uppercase font-black text-slate-400">
            {currentRound.is_revote ? `Переголосование #${activeVotingRoundIndex}` : 'Основное голосование'} · {eligible} голосующих
          </div>
          <div className="text-xs font-black text-white">
            Кто против <span className="text-rose-400 font-mono">#{nominee}</span>?
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 flex justify-between text-[10px]">
            <span className="text-slate-400">Текущий итог</span>
            <strong className="text-rose-400 font-mono">{votes[nominee] || 0}</strong>
          </div>
          {decided && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-2 py-1 text-[9px] font-black text-emerald-400 uppercase">
              ✓ Голосование решено
            </div>
          )}
          {isLast && remaining > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 px-2 py-1 text-[9px] text-amber-300">
              Последнему кандидату автоматически: {remaining}
            </div>
          )}
          <div className="flex justify-center gap-1.5">
            <button type="button" onClick={() => handleAllocateVotes(nominee, (votes[nominee] || 0) - 1)} className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs">−1</button>
            <button type="button" onClick={() => handleAllocateVotes(nominee, (votes[nominee] || 0) + 1)} className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-rose-400 text-xs">+1</button>
          </div>
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
      const speaker = winners[revoteSpeakerIndex];
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
          <button
            type="button"
            onClick={advanceSpeech}
            className={`w-full py-2 rounded-xl text-white font-black text-[10px] uppercase ${isLastSpeaker ? 'bg-rose-600' : 'bg-amber-600'}`}
          >
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
            <div className="text-[10px] text-emerald-300">Спорных игроков больше половины стола. Никто не покидает стол.</div>
            <button type="button" onClick={() => handleConfirmAutoNoElimination?.()} className="w-full py-2 rounded-xl bg-emerald-600 text-white font-black text-[10px] uppercase">Подтвердить и перейти в ночь</button>
          </div>
        );
      }

      if (result.outcome === 'requires_table_decision') {
        const eligible = currentRound.eligible_voters ?? eligibleVoterSeats.length;
        const majority = Math.floor(eligible / 2) + 1;
        const entered = tableVoterSlots.length;
        return (
          <div className="space-y-2 w-full max-w-[340px] mx-auto">
            <div className="text-[10px] text-amber-300 font-black">Повторная ничья: {result.winners.map((s) => `#${s}`).join(', ')}</div>
            <div className="text-[9px] text-slate-400">Нажимайте на окна игроков, которые голосуют за уход всех спорных.</div>
            <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-slate-950/60 border border-slate-800 text-[10px]">
              <span className="text-slate-400">За уход всех</span>
              <strong className={entered >= majority ? 'text-emerald-400' : 'text-amber-400'}>{entered}/{eligible} · нужно {majority}</strong>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {eligiblePlayers.map((player) => {
                const selected = tableVoterSlots.includes(player.slot_num);
                return (
                  <button
                    key={player.slot_num}
                    type="button"
                    onClick={() => toggleTableVoter(player.slot_num)}
                    className={`min-w-0 px-2 py-2 rounded-xl border text-left transition-all ${selected ? 'bg-rose-950/80 border-rose-500 ring-1 ring-rose-500/40' : 'bg-slate-950/70 border-slate-800'}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-xs shrink-0 ${selected ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{player.slot_num}</span>
                      <span className={`truncate text-[10px] font-black ${selected ? 'text-rose-200' : 'text-slate-300'}`}>{player.nickname || `Игрок ${player.slot_num}`}</span>
                    </div>
                  </button>
                );
              })}
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
        <div className="space-y-2 max-w-[300px] mx-auto">
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
    <div className="col-span-2 md:col-start-2 md:col-span-3 md:row-start-2 order-first md:order-none sticky top-[72px] md:static z-40 md:z-auto min-h-[210px] md:min-h-[300px] max-h-[360px] md:max-h-none bg-slate-900/98 border-2 border-slate-800 rounded-2xl sm:rounded-3xl p-2 sm:p-3 flex flex-col justify-between text-center shadow-2xl">
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

      {phase === 'night' && handleAdvanceNightSubPhase && (
        <div className="flex flex-wrap justify-center gap-1 py-1.5">
          {(['intro','shooting','don','sheriff','morning'] as NightSubPhase[]).map((sub) => (
            <button key={sub} type="button" onClick={() => handleAdvanceNightSubPhase(sub)} className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase border ${nightSubPhase === sub ? 'bg-purple-600 border-purple-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>{sub === 'intro' ? 'Старт' : sub === 'shooting' ? 'Стрельба' : sub === 'don' ? 'Дон' : sub === 'sheriff' ? 'Шериф' : 'Утро'}</button>
          ))}
        </div>
      )}

      <div className="flex-1 flex items-center justify-center py-2 overflow-y-auto overscroll-contain">
        {phase === 'day_voting' && votingStage === 'revote_speeches'
          ? renderVoting()
          : (activeSpeakerSlot !== null || customTimerLabel !== null)
            ? renderTimer()
            : renderIdleBody()}
      </div>

      <div className="border-t border-slate-800 pt-1.5 space-y-1.5">
        <div className="hidden sm:flex justify-between text-[9px] text-slate-500">
          <span>Выставлены: {nominations.length ? nominations.map((n) => `#${n}`).join(', ') : '—'}</span>
          <span>Живых: {activePlayers.filter((p) => p.alive).length}/10</span>
        </div>
        <div className="grid grid-cols-12 gap-1.5 min-h-[36px]">
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
