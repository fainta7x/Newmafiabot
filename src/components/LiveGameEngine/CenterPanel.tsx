import React from "react";
import { Minus, Plus, Pause, Play, RotateCcw, Mic, BarChart2 } from "lucide-react";
import { ActivePlayerState, Phase, NightSubPhase } from "./types.js";
import { PistolIcon, MafiaHatIcon } from "./Icons.js";
import { Star } from "lucide-react";

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
  bestMoveGuesses: number[];
  nextSpeaker: ActivePlayerState | null;
  handleStartNextSpeaker: () => void;
  isInteractiveVoting: boolean;
  setIsInteractiveVoting: (isInteractive: boolean) => void;
  nominations: number[];
  currentVotingNomineeIndex: number;
  selectVotingNomineeIndex: (idx: number, customNominations?: number[]) => void;
  votes: { [slot: number]: number };
  votesByPlayer: { [voterSlot: number]: number };
  handleInteractiveAutoRemainder: () => void;
  handleAllocateVotes: (nominee: number, count: number) => void;
  handleResolveVoting: () => void;
  shootoutNominees: number[];
  votingAttempt: number;
  handleStartReVoting: () => void;
  handleResolveShootoutVotes: (act: "eliminate_one" | "eliminate_all" | "no_one_leaves", slot?: number) => void;
  nightSubPhase: NightSubPhase;
  shotPlayerSlot: number | null;
  getPrevStepAction: () => { label: string; onClick: () => void } | null;
  getNextStepInfo: () => { label: string; onClick: () => void } | null;
  votingSubPhase: "voting_intro" | "voting_active" | "voting_results";
  setVotingSubPhase: React.Dispatch<React.SetStateAction<"voting_intro" | "voting_active" | "voting_results" | any>>;
  shootoutSubPhase: "shootout_intro" | "shootout_speeches" | "shootout_revote_intro" | "shootout_revote_active" | "shootout_revote_results" | "shootout_both_results";
  setShootoutSubPhase: React.Dispatch<React.SetStateAction<"shootout_intro" | "shootout_speeches" | "shootout_revote_intro" | "shootout_revote_active" | "shootout_revote_results" | "shootout_both_results" | any>>;
  bothLeaveVotes: number[];
  setBothLeaveVotes: React.Dispatch<React.SetStateAction<number[]>>;
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
  bestMoveGuesses,
  nextSpeaker,
  handleStartNextSpeaker,
  isInteractiveVoting,
  setIsInteractiveVoting,
  nominations,
  currentVotingNomineeIndex,
  selectVotingNomineeIndex,
  votes,
  votesByPlayer,
  handleInteractiveAutoRemainder,
  handleAllocateVotes,
  handleResolveVoting,
  shootoutNominees,
  votingAttempt,
  handleStartReVoting,
  handleResolveShootoutVotes,
  nightSubPhase,
  shotPlayerSlot,
  getPrevStepAction,
  getNextStepInfo,
  votingSubPhase,
  setVotingSubPhase,
  shootoutSubPhase,
  setShootoutSubPhase,
  bothLeaveVotes,
  setBothLeaveVotes,
}: CenterPanelProps) {
  const [shootoutSpeakerIndex, setShootoutSpeakerIndex] = React.useState(0);
  const [currentVotingNomineeIndexLocal, setCurrentVotingNomineeIndexLocal] = React.useState(0);

  const handleStartTimer = (slot: number, duration: number) => {
    setActiveSpeakerSlot(slot);
    setTimeLeft(duration);
    setIsTimerRunning(true);
  };

  const activeSpeaker = activePlayers.find((p) => p.slot_num === activeSpeakerSlot);
  const donPlayer = activePlayers.find((p) => p.role === "Дон");
  const mafiaPlayers = activePlayers.filter((p) => p.role === "Мафия");
  const sheriffPlayer = activePlayers.find((p) => p.role === "Шериф");

  // Dynamic title/badge depending on phase
  const getPhaseTitleAndStyle = () => {
    switch (phase) {
      case "zero_night":
        return {
          label: "🌙 Ночь 0",
          style: "bg-rose-950/50 border-rose-800/60 text-rose-400",
        };
      case "night":
        return {
          label: `🌙 Ночь ${roundNumber}`,
          style: "bg-purple-950/50 border-purple-800/60 text-purple-400",
        };
      case "day_voting":
        return {
          label: `🗳️ Голосование (День ${roundNumber})`,
          style: "bg-rose-950/50 border-rose-800/60 text-rose-400 animate-pulse",
        };
      case "shootout":
        return {
          label: `🛑 Перестрелка (День ${roundNumber})`,
          style: "bg-amber-950/50 border-amber-800/60 text-amber-400",
        };
      case "day_speeches":
      default:
        return {
          label: `☀️ День ${roundNumber}`,
          style: "bg-amber-950/50 border-amber-800/60 text-amber-400",
        };
    }
  };

  const phaseInfo = getPhaseTitleAndStyle();

  return (
    <div className="col-start-2 col-span-3 row-start-2 h-full min-h-[300px] bg-slate-900 border-2 border-slate-800 rounded-2xl p-3 flex flex-col justify-between text-center relative overflow-hidden shadow-2xl transition-all">
      {/* Subtle background decoration */}
      <div className="absolute inset-0 bg-radial-gradient from-rose-500/5 to-transparent pointer-events-none" />

      {/* Phase Badge */}
      <div className="flex justify-between items-center border-b border-slate-900 pb-1.5 z-10">
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">Центр стола</span>
        <span
          className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${phaseInfo.style}`}
        >
          {phaseInfo.label}
        </span>
      </div>

      {/* Core HUD content */}
      <div className="flex-1 flex flex-col items-center justify-center py-2 z-10 w-full">
        {/* If any general timer is running or active */}
        {timeLeft !== null && (activeSpeakerSlot !== null || zeroNightSubPhase !== null || customTimerLabel !== null) ? (
          <div className="space-y-2 w-full">
            {/* Timer label */}
            <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest block animate-pulse">
              {customTimerLabel
                ? customTimerLabel
                : activeSpeakerSlot
                ? `Сейчас говорит #${activeSpeakerSlot}`
                : "Таймер"}
            </span>

            {/* Speaker Nickname if applicable */}
            {activeSpeakerSlot !== null && activeSpeaker && (
              <span className="text-xs sm:text-sm font-black text-white truncate max-w-[150px] block mx-auto -mt-1 bg-slate-900/60 py-0.5 px-2 rounded-lg border border-slate-800/45">
                {activeSpeaker.nickname || `Игрок ${activeSpeakerSlot}`}
              </span>
            )}

            {/* Massive Timer display */}
            <div className="text-3xl sm:text-4xl font-mono font-black text-rose-500 flex items-center justify-center gap-1.5">
              <Mic className="w-5 h-5 text-amber-400 animate-pulse" />
              {timeLeft}с
            </div>

            {/* Elegant Compact Timer Controllers */}
            <div className="flex items-center justify-center gap-1 bg-slate-900/80 border border-slate-800 p-1 rounded-xl max-w-[180px] mx-auto shadow-inner">
              <button
                onClick={() => handleAdjustTime(-10)}
                disabled={timeLeft <= 10}
                className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                title="-10s"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-[8px] text-slate-500 font-bold px-0.5 font-mono font-sans">10s</span>
              <button
                onClick={() => handleAdjustTime(10)}
                className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                title="+10s"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-3.5 bg-slate-800 mx-1" />
              {isTimerRunning ? (
                <button
                  onClick={() => setIsTimerRunning(false)}
                  className="w-6 h-6 flex items-center justify-center text-rose-400 hover:text-rose-300 transition-colors"
                  title="Пауза"
                >
                  <Pause className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={() => setIsTimerRunning(true)}
                  className="w-6 h-6 flex items-center justify-center text-emerald-400 hover:text-emerald-300 transition-colors"
                  title="Старт"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                </button>
              )}
              <button
                onClick={() => {
                  setIsTimerRunning(false);
                  setTimeLeft(timerMax);
                }}
                className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                title="Сбросить"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Role helpers during Zero Night timers */}
            {phase === "zero_night" && zeroNightSubPhase === "agreement" && (
              <div className="p-1.5 bg-slate-900/40 rounded-lg border border-slate-900 max-w-[200px] mx-auto text-left text-[9px] space-y-1 my-1">
                <div className="flex justify-between items-center text-purple-400">
                  <span className="flex items-center gap-1">
                    <MafiaHatIcon className="w-3.5 h-3.5 text-purple-400" />
                    <span>Дон:</span>
                  </span>
                  <span className="font-mono font-bold">#{donPlayer?.slot_num || "—"}</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span className="flex items-center gap-1">
                    <PistolIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span>Мафия:</span>
                  </span>
                  <span className="font-mono font-bold font-sans">
                    {mafiaPlayers.map((p) => `#${p.slot_num}`).join(", ") || "—"}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* If timer is NOT active, display phase-specific dashboards */
          <div className="w-full space-y-2">
            {phase === "zero_night" && (
              <div className="space-y-2">
                <div className="text-center">
                  <span className="text-xs font-black uppercase text-slate-200 tracking-wider block">
                    Договорка / Знакомство
                  </span>
                  <span className="text-[9px] text-slate-500 block">Запустите таймеры подготовки:</span>
                </div>

                <div className="flex flex-col gap-1 max-w-[180px] mx-auto">
                  <button
                    onClick={() => handleStartZeroNightTimer("agreement")}
                    className={`px-2.5 py-1 rounded-lg border text-[9px] font-bold uppercase transition-all flex items-center justify-between cursor-pointer ${
                      zeroNightSubPhase === "agreement"
                        ? "bg-rose-900/40 border-rose-500 text-rose-300"
                        : "bg-slate-900 border-slate-850 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span>1. Договорка</span>
                    <span className="font-mono text-[8px] bg-slate-950 px-1 py-0.2 rounded">75с</span>
                  </button>
                  <button
                    onClick={() => handleStartZeroNightTimer("sheriff")}
                    className={`px-2.5 py-1 rounded-lg border text-[9px] font-bold uppercase transition-all flex items-center justify-between cursor-pointer ${
                      zeroNightSubPhase === "sheriff"
                        ? "bg-amber-900/40 border-amber-500 text-amber-300"
                        : "bg-slate-900 border-slate-850 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span>2. Вызов шерифа</span>
                    <span className="font-mono text-[8px] bg-slate-950 px-1 py-0.2 rounded">10с</span>
                  </button>
                  <button
                    onClick={() => handleStartZeroNightTimer("seating")}
                    className={`px-2.5 py-1 rounded-lg border text-[9px] font-bold uppercase transition-all flex items-center justify-between cursor-pointer ${
                      zeroNightSubPhase === "seating"
                        ? "bg-emerald-900/40 border-emerald-500 text-emerald-300"
                        : "bg-slate-900 border-slate-850 text-slate-450 hover:text-slate-200"
                    }`}
                  >
                    <span>3. Посадка</span>
                    <span className="font-mono text-[8px] bg-slate-950 px-1 py-0.2 rounded">40с</span>
                  </button>
                </div>

                {/* Roles summary during preparation phase */}
                <div className="pt-1.5 border-t border-slate-900 max-w-[200px] mx-auto text-left text-[9px] space-y-1 text-slate-450">
                  <div className="flex justify-between items-center">
                    <span className="text-purple-400 flex items-center gap-1">
                      <MafiaHatIcon className="w-3 h-3 text-purple-400" />
                      <span>Дон:</span>
                    </span>
                    <span className="font-mono font-bold text-slate-300">
                      #{donPlayer?.slot_num || "—"} {donPlayer?.nickname || ""}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 flex items-center gap-1">
                      <PistolIcon className="w-3 h-3 text-slate-400" />
                      <span>Мафия:</span>
                    </span>
                    <span className="font-mono font-bold text-slate-300 font-sans">
                      {mafiaPlayers.map((p) => `#${p.slot_num}`).join(", ") || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-emerald-400 flex items-center gap-1">
                      <Star className="w-3 h-3 text-emerald-400 fill-current" />
                      <span>Шериф:</span>
                    </span>
                    <span className="font-mono font-bold text-slate-300">
                      #{sheriffPlayer?.slot_num || "—"} {sheriffPlayer?.nickname || ""}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {phase === "day_speeches" && (
              <div className="space-y-2.5">
                <div className="text-center">
                  <span className="text-xs font-black uppercase text-slate-200 tracking-wider block">Круг Обсуждения</span>
                </div>

                {nextSpeaker ? (
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-slate-500 uppercase font-bold block">Очередь выступать:</span>
                    <button
                      onClick={handleStartNextSpeaker}
                      className="w-full max-w-[200px] mx-auto bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3 py-2 rounded-xl text-[10px] uppercase tracking-wider shadow-lg shadow-emerald-600/10 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Mic className="w-3.5 h-3.5" /> Слот #{nextSpeaker.slot_num} ({nextSpeaker.nickname})
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1 text-center py-1 bg-emerald-950/20 border border-emerald-900/30 rounded-xl max-w-[200px] mx-auto">
                    <span className="text-[10px] text-emerald-400 font-bold block">Все игроки выступили ✓</span>
                    <span className="text-[8px] text-slate-500 block">Переходите к голосованию</span>
                  </div>
                )}

                <span className="text-[9px] text-slate-500 block max-w-[180px] mx-auto leading-tight">
                  Или наведите курсор на любого игрока для индивидуального управления.
                </span>
              </div>
            )}

            {phase === "day_voting" && votingSubPhase === "voting_intro" && (
              <div className="space-y-3 w-full text-center">
                <span className="text-xs font-black text-rose-500 uppercase tracking-widest block animate-pulse">
                  🗳️ Сводка Голосования
                </span>
                <p className="text-[10px] text-slate-300 leading-relaxed max-w-[220px] mx-auto">
                  На голосование выставлены игроки: <strong className="text-rose-400 font-mono">{nominations.map(n => `#${n}`).join(", ")}</strong>.
                </p>
                <div className="pt-2 border-t border-slate-900 max-w-[210px] mx-auto">
                  <button
                    onClick={() => {
                      setVotingSubPhase("voting_active");
                      selectVotingNomineeIndex(0, nominations);
                    }}
                    className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black py-2 rounded-xl text-[10px] uppercase tracking-wider shadow-lg shadow-rose-600/20 cursor-pointer transition-all"
                  >
                    Начать Опрос ▶️
                  </button>
                </div>
              </div>
            )}

            {phase === "day_voting" && votingSubPhase === "voting_active" && (
              <div className="space-y-3 w-full text-center">
                {(() => {
                  const activeNomineeSlot = nominations[currentVotingNomineeIndex];
                  const activeNomineePlayer = activePlayers.find((p) => p.slot_num === activeNomineeSlot);
                  const totalAlive = activePlayers.filter((p) => p.alive).length;
                  const votesSoFar = Object.values(votes).reduce((a, b) => a + b, 0);
                  const unusedVotes = totalAlive - votesSoFar;
                  const currentNomineeVotes = Object.values(votesByPlayer).filter((v) => v === activeNomineeSlot).length;

                  return (
                    <div className="space-y-2">
                      <span className="text-xs font-black text-rose-500 uppercase tracking-widest block">
                        Кандидат {currentVotingNomineeIndex + 1} из {nominations.length}
                      </span>
                      <div className="text-[11px] font-black text-slate-200">
                        Кто против <span className="text-rose-400 font-mono text-xs">#{activeNomineeSlot}</span> ({activeNomineePlayer?.nickname || "—"})?
                      </div>

                      {/* Instructions */}
                      <span className="text-[8px] text-slate-500 block leading-tight max-w-[225px] mx-auto">
                        Кликните на карточки игроков на столе, чтобы зафиксировать их голос.
                      </span>

                      {/* Live Counter */}
                      <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-900 max-w-[190px] mx-auto flex items-center justify-between text-[10px] font-bold">
                        <span className="text-slate-400">Голосов ЗА:</span>
                        <span className="text-rose-400 font-mono text-sm font-black">{currentNomineeVotes}</span>
                      </div>

                      {/* Manual Adjusters override */}
                      <div className="flex items-center justify-center gap-1.5 max-w-[190px] mx-auto">
                        <button
                          onClick={() => handleAllocateVotes(activeNomineeSlot, currentNomineeVotes - 1)}
                          className="px-2 py-0.5 bg-slate-900 border border-slate-800 text-slate-400 rounded-lg hover:bg-slate-800 text-[10px]"
                        >
                          -1
                        </button>
                        <button
                          onClick={() => handleAllocateVotes(activeNomineeSlot, currentNomineeVotes + 1)}
                          className="px-2 py-0.5 bg-slate-900 border border-slate-800 text-rose-400 rounded-lg hover:bg-slate-800 text-[10px]"
                        >
                          +1
                        </button>
                      </div>

                      {/* Autovote remnant block for last nominee */}
                      {currentVotingNomineeIndex === nominations.length - 1 && unusedVotes > 0 && (
                        <div className="bg-rose-950/20 border border-rose-500/20 p-1.5 rounded-lg max-w-[210px] mx-auto text-[8px] text-rose-300 font-bold leading-tight">
                          ✋ Автомат: #{activeNomineeSlot} получает все оставшиеся голоса ({unusedVotes} гол.)
                        </div>
                      )}

                      {/* Progress summary bar */}
                      <div className="pt-2 border-t border-slate-900 max-w-[210px] mx-auto flex justify-between items-center text-[9px] font-bold text-slate-400">
                        <span>Собрано: {votesSoFar} / {totalAlive}</span>
                        <div className="flex gap-1.5">
                          {currentVotingNomineeIndex > 0 && (
                            <button
                              onClick={() => selectVotingNomineeIndex(currentVotingNomineeIndex - 1)}
                              className="bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 px-2 py-0.5 rounded text-[8px]"
                            >
                              ← Назад
                            </button>
                          )}
                          {currentVotingNomineeIndex < nominations.length - 1 ? (
                            <button
                              onClick={() => selectVotingNomineeIndex(currentVotingNomineeIndex + 1)}
                              className="bg-rose-600 hover:bg-rose-500 text-white px-2 py-0.5 rounded text-[8px]"
                            >
                              Далее →
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                if (unusedVotes > 0) {
                                  handleInteractiveAutoRemainder();
                                }
                                setVotingSubPhase("voting_results");
                              }}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-2 py-0.5 rounded text-[8px] uppercase tracking-wider animate-pulse"
                            >
                              Итог 🗳️
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {phase === "day_voting" && votingSubPhase === "voting_results" && (
              <div className="space-y-3 w-full text-center">
                <span className="text-xs font-black text-rose-500 uppercase tracking-widest block">
                  📊 Результаты Голосования
                </span>

                {/* Candidate tallies list */}
                <div className="space-y-1 max-w-[210px] mx-auto">
                  {nominations.map((num) => {
                    const count = votes[num] || 0;
                    return (
                      <div key={num} className="bg-slate-900/40 border border-slate-900/60 p-1.5 rounded-lg flex items-center justify-between text-[10px] font-bold font-mono">
                        <span className="text-slate-300">Игрок #{num}</span>
                        <span className="text-rose-400 font-black">{count} гол.</span>
                      </div>
                    );
                  })}
                </div>

                {/* Solver logic representation */}
                {(() => {
                  const pairs = nominations.map((n) => ({ slot: n, count: votes[n] || 0 }));
                  const maxVotes = Math.max(...pairs.map((p) => p.count));
                  const highest = pairs.filter((p) => p.count === maxVotes);

                  if (highest.length === 1) {
                    const winner = highest[0].slot;
                    const winnerPlayer = activePlayers.find(p => p.slot_num === winner);
                    return (
                      <div className="space-y-2">
                        <p className="text-[9px] text-rose-300 bg-rose-900/20 border border-rose-500/15 p-1.5 rounded-lg max-w-[210px] mx-auto leading-tight">
                          ВЕРДИКТ: Игрок <strong className="text-rose-400">#{winner} ({winnerPlayer?.nickname})</strong> покидает стол с {maxVotes} голосами.
                        </p>
                        <button
                          onClick={handleResolveVoting}
                          className="w-full max-w-[210px] mx-auto bg-rose-600 hover:bg-rose-500 text-white font-black py-1.5 rounded-xl text-[10px] uppercase tracking-wider shadow shadow-rose-600/20 cursor-pointer"
                        >
                          Подтвердить выбывание ⏹️
                        </button>
                      </div>
                    );
                  } else {
                    const tied = highest.map((p) => p.slot);
                    return (
                      <div className="space-y-2">
                        <p className="text-[9px] text-amber-300 bg-amber-900/20 border border-amber-500/15 p-1.5 rounded-lg max-w-[210px] mx-auto leading-tight">
                          ВЕРДИКТ: Ничья между <strong className="text-amber-400 font-mono">{tied.map(t => `#${t}`).join(", ")}</strong>! Назначается автокатастрофа.
                        </p>
                        <button
                          onClick={handleResolveVoting}
                          className="w-full max-w-[210px] mx-auto bg-amber-600 hover:bg-amber-500 text-white font-black py-1.5 rounded-xl text-[10px] uppercase tracking-wider shadow shadow-amber-600/20 cursor-pointer"
                        >
                          Запустить Автокатастрофу 🛑
                        </button>
                      </div>
                    );
                  }
                })()}
              </div>
            )}

            {phase === "shootout" && shootoutSubPhase === "shootout_intro" && (
              <div className="space-y-3 w-full text-center">
                <span className="text-xs font-black text-amber-400 uppercase tracking-widest block animate-pulse">
                  🛑 Автокатастрофа
                </span>
                <p className="text-[10px] text-slate-300 leading-relaxed max-w-[220px] mx-auto">
                  Ничья на голосовании! Кандидаты: <strong className="text-amber-400 font-mono">{shootoutNominees.map(n => `#${n}`).join(", ")}</strong> имеют право высказаться по 30 секунд.
                </p>
                <div className="pt-2 border-t border-slate-900 max-w-[210px] mx-auto">
                  <button
                    onClick={() => {
                      setShootoutSubPhase("shootout_speeches");
                      setShootoutSpeakerIndex(0);
                      handleStartTimer(shootoutNominees[0], 30);
                    }}
                    className="w-full bg-amber-600 hover:bg-amber-500 text-white font-black py-2 rounded-xl text-[10px] uppercase tracking-wider shadow-lg shadow-amber-600/20 cursor-pointer transition-all"
                  >
                    Запустить Речи 🎙️
                  </button>
                </div>
              </div>
            )}

            {phase === "shootout" && shootoutSubPhase === "shootout_speeches" && (
              <div className="space-y-3 w-full text-center">
                {(() => {
                  const speakerSlot = shootoutNominees[shootoutSpeakerIndex];
                  const speakerPlayer = activePlayers.find(p => p.slot_num === speakerSlot);
                  const isSpeaking = activeSpeakerSlot === speakerSlot;

                  return (
                    <div className="space-y-2">
                      <span className="text-xs font-black text-amber-500 uppercase tracking-widest block animate-pulse">
                        Речь на автокатастрофе
                      </span>
                      <p className="text-[11px] font-black text-slate-200 leading-none">
                        Выступает <span className="text-amber-400 font-mono">#{speakerSlot}</span> ({speakerPlayer?.nickname})
                      </p>

                      {/* Speech Timer Feedback inside Center */}
                      <div className="bg-slate-900/50 p-2.5 rounded-xl border border-slate-900 max-w-[190px] mx-auto flex flex-col items-center justify-center">
                        <span className="text-[8px] text-slate-500 font-bold uppercase">Оставшееся время:</span>
                        {isSpeaking ? (
                          <div className="text-rose-500 font-mono text-xl font-black animate-pulse mt-0.5">
                            {timeLeft}с
                          </div>
                        ) : (
                          <span className="text-slate-500 italic text-[10px] mt-0.5">Таймер остановлен</span>
                        )}
                      </div>

                      {/* Controls */}
                      <div className="flex flex-col gap-1.5 max-w-[210px] mx-auto pt-1.5 border-t border-slate-900/60">
                        {!isSpeaking ? (
                          <button
                            onClick={() => handleStartTimer(speakerSlot, 30)}
                            className="w-full bg-amber-600 hover:bg-amber-500 text-white text-[9px] uppercase font-bold py-1.5 rounded-lg cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Play className="w-3 h-3" /> Запустить 30 секунд
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setActiveSpeakerSlot(null);
                              setIsTimerRunning(false);
                            }}
                            className="w-full bg-rose-600 hover:bg-rose-500 text-white text-[9px] uppercase font-bold py-1.5 rounded-lg cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Pause className="w-3 h-3" /> Остановить речь
                          </button>
                        )}

                        <div className="flex gap-1.5 mt-0.5">
                          {shootoutSpeakerIndex > 0 && (
                            <button
                              onClick={() => {
                                setShootoutSpeakerIndex(shootoutSpeakerIndex - 1);
                                handleStartTimer(shootoutNominees[shootoutSpeakerIndex - 1], 30);
                              }}
                              className="flex-1 bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-800 py-1 rounded text-[8px]"
                            >
                              ← Назад
                            </button>
                          )}
                          {shootoutSpeakerIndex < shootoutNominees.length - 1 ? (
                            <button
                              onClick={() => {
                                setShootoutSpeakerIndex(shootoutSpeakerIndex + 1);
                                handleStartTimer(shootoutNominees[shootoutSpeakerIndex + 1], 30);
                              }}
                              className="flex-1 bg-amber-600 hover:bg-amber-500 text-white py-1 rounded text-[8px] font-black"
                            >
                              Далее →
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setActiveSpeakerSlot(null);
                                setIsTimerRunning(false);
                                setShootoutSubPhase("shootout_revote_intro");
                              }}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1 rounded text-[8px] font-black uppercase tracking-wider"
                            >
                              Переголосование 🗳️
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {phase === "shootout" && shootoutSubPhase === "shootout_revote_intro" && (
              <div className="space-y-3 w-full text-center">
                <span className="text-xs font-black text-amber-400 uppercase tracking-widest block">
                  🔄 Повторный Опрос
                </span>
                <p className="text-[10px] text-slate-300 leading-relaxed max-w-[220px] mx-auto">
                  Все кандидаты высказались. Начинается повторное голосование по игрокам: <strong className="text-amber-500 font-mono">{shootoutNominees.map(n => `#${n}`).join(", ")}</strong>.
                </p>
                <div className="pt-2 border-t border-slate-900 max-w-[210px] mx-auto">
                  <button
                    onClick={() => {
                      setShootoutSubPhase("shootout_revote_active");
                      const iv: { [s: number]: number } = {};
                      shootoutNominees.forEach((n) => { iv[n] = 0; });
                      handleAllocateVotes(shootoutNominees[0], 0);
                      setCurrentVotingNomineeIndex(0);
                      setIsInteractiveVoting(true);
                    }}
                    className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black py-2 rounded-xl text-[10px] uppercase tracking-wider shadow-lg shadow-rose-600/20 cursor-pointer"
                  >
                    Запустить Опрос 📊
                  </button>
                </div>
              </div>
            )}

            {phase === "shootout" && shootoutSubPhase === "shootout_revote_active" && (
              <div className="space-y-3 w-full text-center">
                {(() => {
                  const activeNomineeSlot = shootoutNominees[currentVotingNomineeIndex];
                  const activeNomineePlayer = activePlayers.find((p) => p.slot_num === activeNomineeSlot);
                  const totalAlive = activePlayers.filter((p) => p.alive).length;
                  const votesSoFar = shootoutNominees.reduce((sum, s) => sum + (votes[s] || 0), 0);
                  const unusedVotes = totalAlive - votesSoFar;
                  const currentNomineeVotes = Object.values(votesByPlayer).filter((v) => v === activeNomineeSlot).length;

                  return (
                    <div className="space-y-2">
                      <span className="text-xs font-black text-rose-500 uppercase tracking-widest block animate-pulse">
                        Перестрелка: {currentVotingNomineeIndex + 1} из {shootoutNominees.length}
                      </span>
                      <div className="text-[11px] font-black text-slate-200">
                        Кто против <span className="text-rose-400 font-mono text-xs">#{activeNomineeSlot}</span> ({activeNomineePlayer?.nickname || "—"})?
                      </div>

                      {/* Instructions */}
                      <span className="text-[8px] text-slate-500 block leading-tight max-w-[225px] mx-auto">
                        Кликните на карточки игроков на столе, чтобы зафиксировать их голос.
                      </span>

                      {/* Live Counter */}
                      <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-900 max-w-[190px] mx-auto flex items-center justify-between text-[10px] font-bold">
                        <span className="text-slate-400">Голосов ЗА:</span>
                        <span className="text-rose-400 font-mono text-sm font-black">{currentNomineeVotes}</span>
                      </div>

                      {/* Manual adjusters */}
                      <div className="flex items-center justify-center gap-1.5 max-w-[190px] mx-auto">
                        <button
                          onClick={() => handleAllocateVotes(activeNomineeSlot, currentNomineeVotes - 1)}
                          className="px-2 py-0.5 bg-slate-900 border border-slate-800 text-slate-400 rounded-lg hover:bg-slate-800 text-[10px]"
                        >
                          -1
                        </button>
                        <button
                          onClick={() => handleAllocateVotes(activeNomineeSlot, currentNomineeVotes + 1)}
                          className="px-2 py-0.5 bg-slate-900 border border-slate-800 text-rose-400 rounded-lg hover:bg-slate-800 text-[10px]"
                        >
                          +1
                        </button>
                      </div>

                      {/* Autovote remnant block for last nominee */}
                      {currentVotingNomineeIndex === shootoutNominees.length - 1 && unusedVotes > 0 && (
                        <div className="bg-rose-900/20 border border-rose-500/20 p-1.5 rounded-lg max-w-[210px] mx-auto text-[8px] text-rose-300 font-bold leading-tight">
                          ✋ Автомат: #{activeNomineeSlot} получает все оставшиеся голоса ({unusedVotes} гол.)
                        </div>
                      )}

                      {/* Progress summary bar */}
                      <div className="pt-2 border-t border-slate-900 max-w-[210px] mx-auto flex justify-between items-center text-[9px] font-bold text-slate-400">
                        <span>Собрано: {votesSoFar} / {totalAlive}</span>
                        <div className="flex gap-1.5">
                          {currentVotingNomineeIndex > 0 && (
                            <button
                              onClick={() => selectVotingNomineeIndex(currentVotingNomineeIndex - 1, shootoutNominees)}
                              className="bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 px-2 py-0.5 rounded text-[8px]"
                            >
                              ← Назад
                            </button>
                          )}
                          {currentVotingNomineeIndex < shootoutNominees.length - 1 ? (
                            <button
                              onClick={() => selectVotingNomineeIndex(currentVotingNomineeIndex + 1, shootoutNominees)}
                              className="bg-rose-600 hover:bg-rose-500 text-white px-2 py-0.5 rounded text-[8px]"
                            >
                              Далее →
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                if (unusedVotes > 0) {
                                  handleAllocateVotes(activeNomineeSlot, currentNomineeVotes + unusedVotes);
                                }
                                setShootoutSubPhase("shootout_revote_results");
                              }}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-2 py-0.5 rounded text-[8px] uppercase tracking-wider animate-pulse"
                            >
                              Итог 🗳️
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {phase === "shootout" && shootoutSubPhase === "shootout_revote_results" && (
              <div className="space-y-3 w-full text-center">
                <span className="text-xs font-black text-amber-400 uppercase tracking-widest block">
                  📊 Результаты Перестрелки
                </span>

                {/* Tallies */}
                <div className="space-y-1 max-w-[210px] mx-auto">
                  {shootoutNominees.map((s) => {
                    const count = votes[s] || 0;
                    return (
                      <div key={s} className="bg-slate-900/40 border border-slate-900/60 p-1.5 rounded-lg flex items-center justify-between text-[10px] font-bold font-mono">
                        <span className="text-slate-300">Игрок #{s}</span>
                        <span className="text-amber-400 font-black">{count} гол.</span>
                      </div>
                    );
                  })}
                </div>

                {(() => {
                  const pairs = shootoutNominees.map(s => ({ slot: s, count: votes[s] || 0 }));
                  const maxVotes = Math.max(...pairs.map((p) => p.count));
                  const highest = pairs.filter((p) => p.count === maxVotes);

                  if (highest.length === 1) {
                    const candidateToLeave = highest[0].slot;
                    const candidatePlayer = activePlayers.find(p => p.slot_num === candidateToLeave);
                    return (
                      <div className="space-y-2">
                        <p className="text-[9px] text-rose-300 bg-rose-900/20 border border-rose-500/15 p-1.5 rounded-lg max-w-[210px] mx-auto leading-tight">
                          ВЕРДИКТ: Ничья разорвана! Игрок <strong className="text-rose-400">#{candidateToLeave} ({candidatePlayer?.nickname})</strong> покидает стол.
                        </p>
                        <button
                          onClick={() => {
                            handleResolveShootoutVotes("eliminate_one", candidateToLeave);
                          }}
                          className="w-full max-w-[210px] mx-auto bg-rose-600 hover:bg-rose-500 text-white font-black py-1.5 rounded-xl text-[10px] uppercase tracking-wider shadow shadow-rose-600/20 cursor-pointer"
                        >
                          Подтвердить выбывание ⏹️
                        </button>
                      </div>
                    );
                  } else {
                    return (
                      <div className="space-y-2">
                        <p className="text-[9px] text-amber-300 bg-amber-900/20 border border-amber-500/15 p-1.5 rounded-lg max-w-[210px] mx-auto leading-tight">
                          ВЕРДИКТ: Снова ничья! Проводится опрос: Кто за то, чтобы ОБА кандидата покинули стол?
                        </p>
                        <button
                          onClick={() => {
                            setShootoutSubPhase("shootout_both_results");
                            setBothLeaveVotes([]);
                          }}
                          className="w-full max-w-[210px] mx-auto bg-amber-600 hover:bg-amber-500 text-white font-black py-1.5 rounded-xl text-[10px] uppercase tracking-wider shadow shadow-amber-600/20 cursor-pointer animate-pulse"
                        >
                          Запустить Опрос ОБА 🤝
                        </button>
                      </div>
                    );
                  }
                })()}
              </div>
            )}

            {phase === "shootout" && shootoutSubPhase === "shootout_both_results" && (
              <div className="space-y-3 w-full text-center">
                <span className="text-xs font-black text-rose-500 uppercase tracking-widest block animate-pulse">
                  🤝 Выбывание Обоих Игроков?
                </span>
                <p className="text-[10px] text-slate-300 leading-tight max-w-[220px] mx-auto">
                  Выберите на столе тех, кто проголосовал за то, чтобы игроки <strong className="text-rose-400 font-mono">{shootoutNominees.map(n => `#${n}`).join(", ")}</strong> ОБА покинули стол.
                </p>

                {/* Poll results visual box */}
                {(() => {
                  const alivePlayers = activePlayers.filter((p) => p.alive);
                  const majority = Math.floor(alivePlayers.length / 2) + 1;
                  const votedYes = bothLeaveVotes.length;
                  const majorityMet = votedYes >= majority;

                  return (
                    <div className="space-y-2">
                      <div className="bg-slate-900/50 p-2 rounded-xl border border-slate-900 max-w-[195px] mx-auto space-y-1">
                        <div className="flex justify-between items-center text-[10px] font-bold">
                          <span className="text-slate-400">Голосов ЗА удаление:</span>
                          <span className="text-rose-400 font-mono font-black text-sm">{votedYes} / {alivePlayers.length}</span>
                        </div>
                        <div className="flex justify-between items-center text-[8px] text-slate-500 border-t border-slate-950 pt-1 font-bold">
                          <span>Требуется большинство:</span>
                          <span>&gt;= {majority} гол.</span>
                        </div>
                      </div>

                      <div className="text-[9px]">
                        {majorityMet ? (
                          <span className="text-rose-400 font-bold uppercase animate-pulse">
                            ⚠️ Большинство набрано! Игроки покинут стол.
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-bold uppercase">
                            ✓ Большинство не набрано. Игроки остаются.
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          if (majorityMet) {
                            handleResolveShootoutVotes("eliminate_all");
                          } else {
                            handleResolveShootoutVotes("no_one_leaves");
                          }
                        }}
                        className="w-full max-w-[210px] mx-auto bg-rose-600 hover:bg-rose-500 text-white font-black py-1.5 rounded-xl text-[10px] uppercase tracking-wider shadow shadow-rose-600/20 cursor-pointer"
                      >
                        Зафиксировать Вердикт 🔨
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}

            {phase === "night" && (
              <div className="space-y-1.5 w-full">
                {nightSubPhase === "intro" && (
                  <>
                    <span className="text-xs font-black text-purple-400 uppercase tracking-widest block animate-pulse font-sans">
                      Запуск ночи (15с)
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-1">Оденьте маски. Город засыпает.</span>
                  </>
                )}
                {nightSubPhase === "shooting" && (
                  <>
                    <span className="text-xs font-black text-rose-500 uppercase tracking-widest block animate-pulse font-sans">
                      Стрельба Мафии (15с)
                    </span>
                    <div className="p-2 bg-slate-900/60 border border-slate-900 rounded-xl text-center max-w-[215px] mx-auto space-y-1">
                      <span className="text-[8px] uppercase text-slate-400 font-bold block">Цель мафии:</span>
                      <span className="text-sm font-black text-rose-400">
                        {shotPlayerSlot
                          ? `#${shotPlayerSlot} (${activePlayers.find((pl) => pl.slot_num === shotPlayerSlot)?.nickname})`
                          : "Промах (нажмите на стол)"}
                      </span>
                    </div>
                  </>
                )}
                {nightSubPhase === "don" && (
                  <>
                    <span className="text-xs font-black text-purple-400 uppercase tracking-widest block animate-pulse font-sans">
                      Проверка Дона (15с)
                    </span>
                    <div className="p-2 bg-slate-900/60 border border-slate-900 rounded-xl text-center max-w-[215px] mx-auto space-y-1">
                      <span className="text-[8px] uppercase text-slate-400 font-bold block">Проверить игрока:</span>
                      <span className="text-sm font-black text-purple-400">
                        {donCheckSlot
                          ? `#${donCheckSlot} (${donCheckResult ? "ШЕРИФ! ✓" : "Не шериф"})`
                          : "Нет (нажмите на стол)"}
                      </span>
                    </div>
                  </>
                )}
                {nightSubPhase === "sheriff" && (
                  <>
                    <span className="text-xs font-black text-emerald-400 uppercase tracking-widest block animate-pulse font-sans">
                      Проверка Шерифа (15с)
                    </span>
                    <div className="p-2 bg-slate-900/60 border border-slate-900 rounded-xl text-center max-w-[215px] mx-auto space-y-1">
                      <span className="text-[8px] uppercase text-slate-400 font-bold block">Проверить игрока:</span>
                      <span className="text-sm font-black text-emerald-400">
                        {sheriffCheckSlot
                          ? `#${sheriffCheckSlot} (${
                              sheriffCheckResult?.includes("ЧЁРНЫЙ") ? "ЧЁРНЫЙ!" : "Красный"
                            })`
                          : "Нет (нажмите на стол)"}
                      </span>
                    </div>
                  </>
                )}
                {nightSubPhase === "best_move" && (
                  <>
                    <span className="text-xs font-black text-amber-400 uppercase tracking-widest block animate-pulse font-sans">
                      Лучший ход (20с)
                    </span>
                    <div className="p-2 bg-slate-900/60 border border-slate-900 rounded-xl text-center max-w-[215px] mx-auto space-y-1.5">
                      <span className="text-[8px] uppercase text-slate-400 font-bold block">
                        Версия убитого игрока (3 мафии):
                      </span>
                      <div className="flex justify-center gap-1 font-sans">
                        {bestMoveGuesses.map((g) => (
                          <span
                            key={g}
                            className="bg-amber-600 border border-amber-500 text-white font-bold px-2 py-0.5 rounded text-xs"
                          >
                            #{g}
                          </span>
                        ))}
                        {bestMoveGuesses.length === 0 && (
                          <span className="text-[10px] text-slate-500 italic">Нажмите на 3 игроков</span>
                        )}
                      </div>
                    </div>
                  </>
                )}
                {nightSubPhase === "morning" && (
                  <>
                    <span className="text-xs font-black text-rose-500 uppercase tracking-widest block">Итоги Ночи</span>
                    <div className="p-1.5 bg-slate-900/60 border border-slate-900 rounded-xl text-left text-[9px] space-y-1 max-w-[210px] mx-auto">
                      <div className="flex justify-between items-center text-rose-400">
                        <span>Выстрел:</span>
                        <span className="font-mono font-bold">#{shotPlayerSlot || "Промах"}</span>
                      </div>
                      <div className="flex justify-between items-center text-purple-400">
                        <span>Проверка Дона:</span>
                        <span className="font-mono font-bold">
                          {donCheckSlot ? `#${donCheckSlot} (${donCheckResult ? "Шериф" : "Нет"})` : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-emerald-400">
                        <span>Проверка Шерифа:</span>
                        <span className="font-mono font-bold">
                          {sheriffCheckSlot ? `#${sheriffCheckSlot} (${sheriffCheckResult || ""})` : "—"}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick HUD Footer Navigation & Info */}
      <div className="border-t border-slate-900 pt-1.5 z-10 space-y-1.5">
        {/* Status indicators */}
        <div className="flex justify-between items-center text-[9px] text-slate-500 font-semibold px-0.5 font-sans">
          {nominations.length > 0 ? (
            <span className="truncate max-w-[130px]">
              Выставлены:{" "}
              <span className="text-rose-500 font-mono font-bold">{nominations.map((n) => `#${n}`).join(", ")}</span>
            </span>
          ) : (
            <span className="italic text-slate-500">Выставленных нет</span>
          )}
          <span>
            Живых: <span className="text-emerald-400 font-bold">{activePlayers.filter((p) => p.alive).length}/10</span>
          </span>
        </div>

        {/* Workflow buttons */}
        <div className="flex gap-1.5">
          {getPrevStepAction() && (
            <button
              onClick={getPrevStepAction()!.onClick}
              className="flex-1 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white border border-slate-800 rounded-lg py-1 text-[10px] font-bold uppercase transition-all cursor-pointer flex items-center justify-center font-sans"
            >
              ← Назад
            </button>
          )}
          {getNextStepInfo() && (
            <button
              onClick={getNextStepInfo()!.onClick}
              className="flex-2 bg-rose-600 hover:bg-rose-500 text-white border border-rose-500 rounded-lg py-1 text-[10px] font-black uppercase tracking-wide transition-all shadow-md shadow-rose-600/10 cursor-pointer flex items-center justify-center font-sans"
            >
              {getNextStepInfo()!.label} ➔
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
