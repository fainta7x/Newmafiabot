import React from "react";
import { Pause, Play, RotateCcw, Mic, LogOut, ArrowLeft, ArrowRight, Volume2, VolumeX } from "lucide-react";
import { ActivePlayerState, Phase, NightSubPhase } from "./types.js";
import { PistolIcon, MafiaHatIcon } from "./Icons.js";
import { VotingRound, determineVotingResult } from "../../shared/tournamentVoting.js";

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
  getSeatColor?: (player: ActivePlayerState) => string;
  nextSpeaker: ActivePlayerState | null;
  markPlayerSpoken?: (slot: number) => void;
  handleStartNextSpeaker: () => void;
  handleTransitionToVoting?: () => void;
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
  addLogEntry?: (logText: string) => void;
  onCancel?: () => void;
  handleAdvanceNightSubPhase?: (sub: NightSubPhase) => void;
  handleResolveNight?: () => void;
  isMuted?: boolean;
  setIsMuted?: React.Dispatch<React.SetStateAction<boolean>>;

  // Dynamic voting additions
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
  handleConfirmTableDecision?: (leavesTable: boolean, winners: number[]) => void;
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
  handleTransitionToVoting: _handleTransitionToVoting,
  isInteractiveVoting: _isInteractiveVoting,
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
  votingAttempt: _votingAttempt,
  handleStartReVoting: _handleStartReVoting,
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
  addLogEntry,
  onCancel,
  handleAdvanceNightSubPhase,
  handleResolveNight,
  isMuted = false,
  setIsMuted,

  // Dynamic voting destructured
  votingRounds = [],
  activeVotingRoundIndex = 0,
  votingStage = 'setup',
  setVotingStage,
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
  const [shootoutSpeakerIndex, setShootoutSpeakerIndex] = React.useState(0);

  const handleStartTimer = (slot: number, duration: number) => {
    setActiveSpeakerSlot(slot);
    setTimeLeft(duration);
    setIsTimerRunning(true);
    if (phase === "shootout" && shootoutSubPhase === "shootout_speeches") {
      addLogEntry?.(`Д${roundNumber}: Перестрелка. Речь игрока #${slot} (30 сек)`);
    }
  };

  const activeSpeaker = activePlayers.find((p) => p.slot_num === activeSpeakerSlot);
  const donPlayer = activePlayers.find((p) => p.role === "Дон");
  const mafiaPlayers = activePlayers.filter((p) => p.role === "Мафия");
  const prevStep = getPrevStepAction();
  const nextStep = getNextStepInfo();

  // Dynamic title/badge depending on phase
  const getPhaseTitleAndStyle = () => {
    switch (phase) {
      case "zero_night":
        return {
          label: "🌙 Нулевая Ночь",
          style: "bg-rose-950/60 border-rose-800/80 text-rose-300",
        };
      case "night":
        return {
          label: `🌙 Ночь ${roundNumber}`,
          style: "bg-purple-950/60 border-purple-800/80 text-purple-300",
        };
      case "day_voting":
        return {
          label: `🗳️ Голосование (День ${roundNumber})`,
          style: "bg-rose-950/70 border-rose-600/80 text-rose-300 animate-pulse",
        };
      case "shootout":
        return {
          label: `🛑 Перестрелка (День ${roundNumber})`,
          style: "bg-amber-950/70 border-amber-600/80 text-amber-300 animate-pulse",
        };
      case "day_speeches":
      default:
        return {
          label: `☀️ День ${roundNumber}`,
          style: "bg-amber-950/60 border-amber-800/80 text-amber-300",
        };
    }
  };

  const phaseInfo = getPhaseTitleAndStyle();

  return (
    <div className="col-span-2 md:col-start-2 md:col-span-3 md:row-start-2 order-first md:order-none h-full min-h-0 md:min-h-[300px] bg-slate-900/95 border-2 border-slate-800 rounded-2xl sm:rounded-3xl p-2.5 sm:p-3 flex flex-col justify-between text-center relative overflow-hidden shadow-2xl transition-all">
      {/* Subtle background decoration */}
      <div className="absolute inset-0 bg-radial-gradient from-rose-500/5 via-transparent to-transparent pointer-events-none" />

      {/* HEADER BAR INSIDE CENTER PANEL */}
      <div className="flex justify-between items-center border-b border-slate-800/80 pb-1.5 z-10 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">Центр Стола</span>
          <span className={`text-[9px] sm:text-[10px] font-black uppercase px-2 py-0.5 rounded-full border flex items-center gap-1 ${phaseInfo.style}`}>
            {phaseInfo.label}
          </span>
        </div>

        {/* Exit Game Button */}
        {onCancel && (
          <button
            type="button"
            onClick={() => {
              if (confirm("Вы уверены, что хотите завершить игру без результатов? Все несохраненные данные будут утеряны.")) {
                onCancel();
              }
            }}
            className="text-[9px] sm:text-[10px] font-bold text-slate-400 hover:text-rose-400 bg-slate-950 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-900/60 px-2 py-0.5 rounded-lg transition-all cursor-pointer flex items-center gap-1"
          >
            <LogOut className="w-3 h-3" />
            <span>Выйти</span>
          </button>
        )}
      </div>

      {/* JUDGE ROLE CHEAT SHEET MATRIX BAR */}
      {phase !== "setup" && (
        <div className="w-full bg-slate-950/90 border border-slate-850 rounded-xl px-2 py-1 shrink-0 flex items-center justify-between gap-1 text-[9px] sm:text-[10px] z-10 shadow-sm mt-1">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            <span className="font-extrabold text-slate-400 uppercase tracking-wider text-[8px] sm:text-[9px] shrink-0">Шпаргалка:</span>
            <span className="bg-amber-950/70 border border-amber-600/50 text-amber-300 font-extrabold px-1.5 py-0.5 rounded whitespace-nowrap shadow-sm text-[9px]">
              🌟 Ш: #{activePlayers.find(p => p.role === "Шериф")?.slot_num || "—"}
            </span>
            <span className="bg-purple-950/70 border border-purple-600/50 text-purple-300 font-extrabold px-1.5 py-0.5 rounded whitespace-nowrap shadow-sm text-[9px]">
              🎩 Дон: #{activePlayers.find(p => p.role === "Дон")?.slot_num || "—"}
            </span>
            <span className="bg-rose-950/70 border border-rose-600/50 text-rose-300 font-extrabold px-1.5 py-0.5 rounded whitespace-nowrap shadow-sm text-[9px]">
              🕶️ Маф: #{activePlayers.filter(p => p.role === "Мафия").map(p => `#${p.slot_num}`).join(", ") || "—"}
            </span>
          </div>
          <span className="text-[9px] text-slate-500 font-mono font-bold shrink-0">
            Живых: {activePlayers.filter(p => p.alive).length}/10
          </span>
        </div>
      )}

      {/* NIGHT SUB-PHASES SELECTOR BAR (rendered right below header during night) */}
      {phase === "night" && handleAdvanceNightSubPhase && (
        <div className="flex flex-wrap gap-1 justify-center bg-slate-950 p-1 rounded-xl border border-slate-850 z-10 shrink-0 mt-1">
          {(["intro", "shooting", "don", "sheriff", "best_move", "morning"] as const).map((sub) => {
            if (sub === "best_move" && roundNumber > 1) return null;

            const labels: Record<string, string> = {
              intro: "Старт",
              shooting: "Стрельба 🔫",
              don: "Дон 🎩",
              sheriff: "Шериф 🌟",
              best_move: "ЛХ 🏆",
              morning: "Утро 🌅",
            };

            const active = nightSubPhase === sub;
            return (
              <button
                key={sub}
                type="button"
                onClick={() => handleAdvanceNightSubPhase(sub)}
                className={`px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-black uppercase transition-all cursor-pointer ${
                  active
                    ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                }`}
              >
                {labels[sub]}
              </button>
            )}
          )}
        </div>
      )}

      {/* 1-TAP FAST NIGHT BUTTON */}
      {phase === "night" && handleResolveNight && (
        <button
          type="button"
          onClick={handleResolveNight}
          className="w-full my-1 py-1.5 px-2 bg-gradient-to-r from-purple-700 via-indigo-600 to-amber-600 hover:brightness-110 active:scale-[0.98] text-white font-black text-[10px] sm:text-xs uppercase tracking-wider rounded-xl shadow-lg border border-purple-400/40 flex items-center justify-center gap-1.5 cursor-pointer transition-all z-10 shrink-0"
          title="Мгновенно подвести итоги ночи и разбудить город"
        >
          <span>⚡ Быстрая ночь & Встретить утро 🌅</span>
        </button>
      )}

      {/* CORE STABLE HUD BODY (fixed min-height prevents layout jump!) */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-[110px] sm:min-h-[140px] max-h-[220px] my-auto py-1 px-1 w-full overflow-y-auto z-10">
        {/* IF TIMER IS RUNNING / ACTIVE SPEAKER */}
        {timeLeft !== null && (activeSpeakerSlot !== null || zeroNightSubPhase !== null || customTimerLabel !== null) ? (
          <div className="space-y-1.5 w-full max-w-[240px] mx-auto">
            {/* Timer label */}
            <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest block animate-pulse">
              {customTimerLabel
                ? customTimerLabel
                : activeSpeakerSlot
                ? `Сейчас говорит #${activeSpeakerSlot}`
                : "Таймер"}
            </span>

            {/* Speaker Nickname */}
            {activeSpeakerSlot !== null && activeSpeaker && (
              <span className="text-xs font-black text-white truncate block mx-auto -mt-0.5 bg-slate-900/80 py-0.5 px-2 rounded-lg border border-slate-800">
                {activeSpeaker.nickname || `Игрок ${activeSpeakerSlot}`}
              </span>
            )}

            {/* Timer Clock Display */}
            <div
              className={`text-2xl sm:text-3xl font-mono font-black flex items-center justify-center gap-1.5 py-1 px-3 rounded-xl border transition-all shadow-md ${
                timeLeft <= 10
                  ? "text-rose-400 bg-rose-950/70 border-rose-500/60 animate-pulse shadow-rose-600/30"
                  : timeLeft <= 20
                  ? "text-amber-400 bg-amber-950/50 border-amber-500/50 shadow-amber-500/20"
                  : "text-emerald-400 bg-slate-950/90 border-slate-800/80 shadow-slate-950/50"
              }`}
            >
              <Mic
                className={`w-4 h-4 ${
                  timeLeft <= 10 ? "text-rose-400 animate-ping" : "text-amber-400 animate-pulse"
                }`}
              />
              <span>{timeLeft}с</span>
            </div>

            {/* Visual Countdown Progress Bar */}
            {timerMax > 0 && (
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800/80 shadow-inner">
                <div
                  className={`h-full transition-all duration-1000 ease-linear rounded-full ${
                    timeLeft <= 10
                      ? "bg-gradient-to-r from-rose-500 to-rose-600"
                      : timeLeft <= 20
                      ? "bg-gradient-to-r from-amber-500 to-amber-600"
                      : "bg-gradient-to-r from-emerald-500 to-emerald-600"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, (timeLeft / timerMax) * 100))}%` }}
                />
              </div>
            )}

            {/* Thumb-Friendly Timer Control Bar */}
            <div className="flex items-center justify-between gap-1.5 bg-slate-950 border border-slate-800 p-1.5 rounded-2xl max-w-[250px] mx-auto shadow-inner">
              <button
                type="button"
                onClick={() => handleAdjustTime(-10)}
                disabled={timeLeft <= 10}
                className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 active:scale-95 text-slate-300 font-mono font-bold text-xs flex items-center justify-center disabled:opacity-30 transition-all cursor-pointer shadow"
                title="-10 секунд"
              >
                -10с
              </button>

              <button
                type="button"
                onClick={() => handleAdjustTime(10)}
                className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 active:scale-95 text-slate-300 font-mono font-bold text-xs flex items-center justify-center transition-all cursor-pointer shadow"
                title="+10 секунд"
              >
                +10с
              </button>

              {isTimerRunning ? (
                <button
                  type="button"
                  onClick={() => setIsTimerRunning(false)}
                  className="flex-1 h-10 px-3 bg-amber-600 hover:bg-amber-500 active:scale-95 text-slate-950 font-black text-xs uppercase rounded-xl border border-amber-400/50 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md"
                  title="Пауза"
                >
                  <Pause className="w-4 h-4 fill-current" />
                  <span>Пауза</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsTimerRunning(true)}
                  className="flex-1 h-10 px-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs uppercase rounded-xl border border-emerald-400/50 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md"
                  title="Старт"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Старт</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsTimerRunning(false);
                  setTimeLeft(timerMax);
                }}
                className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 active:scale-95 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow"
                title="Сбросить время"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {setIsMuted && (
                <button
                  type="button"
                  onClick={() => setIsMuted((prev) => !prev)}
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all cursor-pointer shadow active:scale-95 ${
                    isMuted
                      ? "bg-rose-950/80 border-rose-800 text-rose-400 hover:bg-rose-900"
                      : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                  title={isMuted ? "Включить звук" : "Выключить звук"}
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                </button>
              )}
            </div>

            {/* Quick PAS / End Speech Button during active speeches */}
            {activeSpeakerSlot !== null && nextStep && (
              <button
                type="button"
                onClick={nextStep.onClick}
                className="w-full mt-1.5 py-2.5 bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider shadow-lg shadow-rose-600/30 border border-rose-400/40 flex items-center justify-center gap-2 transition-all cursor-pointer animate-pulse"
              >
                <span>ПАС / Завершить речь #{activeSpeakerSlot}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {/* Role helpers during Zero Night timers */}
            {phase === "zero_night" && zeroNightSubPhase === "agreement" && (
              <div className="p-2 bg-slate-950/80 rounded-xl border border-slate-850 max-w-[210px] mx-auto text-left text-[9px] space-y-1 my-1">
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
          /* IF TIMER IS NOT RUNNING, DISPLAY PHASE DASHBOARDS */
          <div className="w-full space-y-2">
            {phase === "zero_night" && (
              <div className="space-y-2">
                <div className="text-center">
                  <span className="text-xs font-black uppercase text-slate-200 tracking-wider block">
                    Договорка / Знакомство
                  </span>
                  <span className="text-[9px] text-slate-400 block">Запустите таймеры подготовки:</span>
                </div>

                <div className="flex flex-col gap-1.5 max-w-[200px] mx-auto">
                  <button
                    type="button"
                    onClick={() => handleStartZeroNightTimer("agreement")}
                    className={`px-3 py-1.5 rounded-xl border text-[9px] font-bold uppercase transition-all flex items-center justify-between cursor-pointer ${
                      zeroNightSubPhase === "agreement"
                        ? "bg-rose-900/40 border-rose-500 text-rose-300"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span>1. Договорка</span>
                    <span className="font-mono text-[8px] bg-slate-900 px-1.5 py-0.5 rounded">75с</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartZeroNightTimer("sheriff")}
                    className={`px-3 py-1.5 rounded-xl border text-[9px] font-bold uppercase transition-all flex items-center justify-between cursor-pointer ${
                      zeroNightSubPhase === "sheriff"
                        ? "bg-amber-900/40 border-amber-500 text-amber-300"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span>2. Вызов шерифа</span>
                    <span className="font-mono text-[8px] bg-slate-900 px-1.5 py-0.5 rounded">10с</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartZeroNightTimer("seating")}
                    className={`px-3 py-1.5 rounded-xl border text-[9px] font-bold uppercase transition-all flex items-center justify-between cursor-pointer ${
                      zeroNightSubPhase === "seating"
                        ? "bg-emerald-900/40 border-emerald-500 text-emerald-300"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span>3. Посадка</span>
                    <span className="font-mono text-[8px] bg-slate-900 px-1.5 py-0.5 rounded">40с</span>
                  </button>
                </div>
              </div>
            )}

            {phase === "day_speeches" && (
              <div className="space-y-2.5">
                <div className="text-center">
                  <span className="text-xs font-black uppercase text-slate-200 tracking-wider block">Круг Обсуждения</span>
                </div>

                {nextSpeaker ? (
                  <div className="space-y-2">
                    <span className="text-[9px] text-slate-400 uppercase font-bold block">Очередь выступать:</span>
                    <button
                      type="button"
                      onClick={handleStartNextSpeaker}
                      className="w-full max-w-[220px] mx-auto bg-emerald-600 hover:bg-emerald-500 text-white font-black px-4 py-2.5 rounded-xl text-[10px] uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Mic className="w-4 h-4" /> Слот #{nextSpeaker.slot_num} ({nextSpeaker.nickname})
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1 text-center py-2 bg-emerald-950/30 border border-emerald-900/40 rounded-xl max-w-[210px] mx-auto">
                    <span className="text-[10px] text-emerald-400 font-bold block">Все игроки выступили ✓</span>
                    <span className="text-[8px] text-slate-400 block">Переходите к голосованию</span>
                  </div>
                )}
              </div>
            )}

            {phase === "day_voting" && (
              <div className="space-y-3 w-full text-center">
                {/* 1. Setup / Intro Stage */}
                {(votingStage === 'setup' || votingSubPhase === 'voting_intro') && (
                  <div className="space-y-3 w-full text-center">
                    <span className="text-xs font-black text-rose-500 uppercase tracking-widest block animate-pulse">
                      🗳️ Сводка Голосования
                    </span>
                    <p className="text-[10px] text-slate-300 leading-relaxed max-w-[220px] mx-auto">
                      На голосование выставлены игроки: <strong className="text-rose-400 font-mono">{nominations.map(n => `#${n}`).join(", ")}</strong>.
                    </p>
                    <div className="pt-2 border-t border-slate-950 max-w-[210px] mx-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setVotingSubPhase("voting_active");
                          setVotingStage?.('collecting');
                          selectVotingNomineeIndex(0, nominations);
                        }}
                        className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black py-2 rounded-xl text-[10px] uppercase tracking-wider shadow-lg shadow-rose-600/20 cursor-pointer transition-all"
                      >
                        Начать Опрос ▶️
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. Collecting Votes Stage */}
                {votingStage === 'collecting' && (
                  <div className="space-y-2.5 w-full text-center">
                    {(() => {
                      const currentRound = votingRounds[activeVotingRoundIndex];
                      if (!currentRound) return null;

                      const nominatedSeats = currentRound.nominated_seats;
                      const activeNomineeSlot = nominatedSeats[currentVotingNomineeIndex];
                      const activeNomineePlayer = activePlayers.find((p) => p.slot_num === activeNomineeSlot);
                      const totalAlive = currentRound.eligible_voters ?? activePlayers.filter((p) => p.alive).length;
                      
                      const votesSoFar = Object.values(votes).reduce((a, b) => a + b, 0);
                      const unusedVotes = totalAlive - votesSoFar;
                      const currentNomineeVotes = votes[activeNomineeSlot] || 0;

                      // Find voters who explicitly voted for this nominee
                      const explicitVoters = Object.entries(votesByPlayer)
                        .filter(([, v]) => v === activeNomineeSlot)
                        .map(([v]) => parseInt(v));

                      return (
                        <div className="space-y-2">
                          <span className="text-xs font-black text-rose-500 uppercase tracking-widest block">
                            Кандидат {currentVotingNomineeIndex + 1} из {nominatedSeats.length}
                          </span>
                          <div className="text-[11px] font-black text-slate-200">
                            Кто против <span className="text-rose-400 font-mono text-xs font-black">#{activeNomineeSlot}</span> ({activeNomineePlayer?.nickname || "—"})?
                          </div>

                          {/* Live Counter */}
                          <div className="bg-slate-950 p-2 rounded-xl border border-slate-850 max-w-[190px] mx-auto flex items-center justify-between text-[10px] font-bold">
                            <span className="text-slate-400 font-bold">Голосов ЗА:</span>
                            <span className="text-rose-400 font-mono text-sm font-black">{currentNomineeVotes}</span>
                          </div>

                          {/* Voters list indicator */}
                          {explicitVoters.length > 0 && (
                            <div className="text-[8px] text-slate-400 max-w-[190px] mx-auto font-bold">
                              Проголосовали: <span className="text-rose-400 font-mono font-black">{explicitVoters.map(v => `#${v}`).join(", ")}</span>
                            </div>
                          )}

                          {/* Manual Adjusters override */}
                          <div className="flex items-center justify-center gap-1.5 max-w-[190px] mx-auto">
                            <button
                              type="button"
                              onClick={() => handleAllocateVotes(activeNomineeSlot, currentNomineeVotes - 1)}
                              className="px-2.5 py-1 bg-slate-950 border border-slate-800 text-slate-400 rounded-lg hover:bg-slate-900 text-[10px] font-bold cursor-pointer"
                            >
                              -1
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAllocateVotes(activeNomineeSlot, currentNomineeVotes + 1)}
                              className="px-2.5 py-1 bg-slate-950 border border-slate-800 text-rose-400 rounded-lg hover:bg-slate-900 text-[10px] font-bold cursor-pointer"
                            >
                              +1
                            </button>
                          </div>

                          {/* Autovote remnant block for last nominee */}
                          {currentVotingNomineeIndex === nominatedSeats.length - 1 && unusedVotes > 0 && (
                            <div className="bg-rose-950/30 border border-rose-500/20 p-1.5 rounded-lg max-w-[210px] mx-auto text-[8px] text-rose-300 font-bold leading-tight">
                              ✋ Автомат: #{activeNomineeSlot} получает все оставшиеся голоса ({unusedVotes} гол.)
                            </div>
                          )}

                          {/* Progress summary bar */}
                          <div className="pt-2 border-t border-slate-950 max-w-[210px] mx-auto flex justify-between items-center text-[9px] font-bold text-slate-400">
                            <span>Собрано: {votesSoFar} / {totalAlive}</span>
                            <div className="flex gap-1.5">
                              {currentVotingNomineeIndex > 0 && (
                                <button
                                  type="button"
                                  onClick={() => selectVotingNomineeIndex(currentVotingNomineeIndex - 1)}
                                  className="bg-slate-950 hover:bg-slate-900 text-slate-300 border border-slate-800 px-2 py-1 rounded-lg text-[8px] font-bold cursor-pointer"
                                >
                                  ← Назад
                                </button>
                              )}
                              {currentVotingNomineeIndex < nominatedSeats.length - 1 ? (
                                <button
                                  type="button"
                                  onClick={() => selectVotingNomineeIndex(currentVotingNomineeIndex + 1)}
                                  className="bg-rose-600 hover:bg-rose-500 text-white px-2 py-1 rounded-lg text-[8px] font-bold cursor-pointer"
                                >
                                  Далее →
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (unusedVotes > 0) {
                                      handleInteractiveAutoRemainder();
                                    }
                                    handleResolveVoting();
                                  }}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-2 py-1 rounded-lg text-[8px] uppercase tracking-wider animate-pulse cursor-pointer"
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

                {/* 3. Round Result Stage */}
                {votingStage === 'round_result' && (
                  <div className="space-y-3 w-full text-center">
                    {(() => {
                      const currentRound = votingRounds[activeVotingRoundIndex];
                      if (!currentRound) return null;

                      const result = determineVotingResult(currentRound);

                      return (
                        <div className="space-y-3">
                          <span className="text-xs font-black text-rose-500 uppercase tracking-widest block">
                            📊 {currentRound.is_revote ? "Результаты Переголосования" : "Результаты Голосования"}
                          </span>

                          {/* Candidate tallies list */}
                          <div className="space-y-1 max-w-[210px] mx-auto">
                            {currentRound.nominated_seats.map((num) => {
                              const count = votes[num] || 0;
                              return (
                                <div key={num} className="bg-slate-950 border border-slate-850 p-1.5 rounded-lg flex items-center justify-between text-[10px] font-bold font-mono">
                                  <span className="text-slate-300">Игрок #{num}</span>
                                  <span className="text-rose-400 font-black">{count} гол.</span>
                                </div>
                              );
                            })}
                          </div>

                          {/* Verdict Block */}
                          {result.outcome === 'single_eliminated' && (
                            <div className="space-y-2">
                              <p className="text-[9px] text-rose-300 bg-rose-950/30 border border-rose-500/20 p-1.5 rounded-xl max-w-[210px] mx-auto leading-tight">
                                ВЕРДИКТ: Игрок <strong className="text-rose-400">#{result.winners[0]}</strong> покидает стол.
                              </p>
                              <button
                                type="button"
                                onClick={() => handleConfirmSingleElimination?.(result.winners[0])}
                                className="w-full max-w-[210px] mx-auto bg-rose-600 hover:bg-rose-500 text-white font-black py-1.5 rounded-xl text-[10px] uppercase tracking-wider shadow shadow-rose-600/20 cursor-pointer"
                              >
                                Подтвердить выбывание #{result.winners[0]} ⏹️
                              </button>
                            </div>
                          )}

                          {result.outcome === 'needs_revote' && (
                            <div className="space-y-2">
                              <p className="text-[9px] text-amber-300 bg-amber-950/30 border border-amber-500/20 p-1.5 rounded-xl max-w-[210px] mx-auto leading-tight font-sans">
                                ВЕРДИКТ: Ничья между <strong className="text-amber-400 font-mono">{result.winners.map(t => `#${t}`).join(", ")}</strong>! Требуется перестрелка.
                              </p>
                              <button
                                type="button"
                                onClick={() => handleGoToRevoteSpeeches?.(result.winners)}
                                className="w-full max-w-[210px] mx-auto bg-amber-600 hover:bg-amber-500 text-white font-black py-1.5 rounded-xl text-[10px] uppercase tracking-wider shadow shadow-amber-600/20 cursor-pointer"
                              >
                                Начать перестрелку (30с) 🎙️
                              </button>
                            </div>
                          )}

                          {result.outcome === 'requires_table_decision' && (
                            <div className="space-y-2 max-w-[210px] mx-auto">
                              <p className="text-[9px] text-amber-300 bg-amber-950/30 border border-amber-500/20 p-1.5 rounded-xl leading-tight">
                                ВЕРДИКТ: Повторная ничья среди <strong className="text-amber-400 font-mono">{result.winners.map(t => `#${t}`).join(", ")}</strong>! Стол голосует: поднять всех или оставить?
                              </p>

                              {/* Manual votes input for leaving table */}
                              <div className="bg-slate-950 p-2 rounded-xl border border-slate-850 space-y-1.5">
                                <span className="text-[8px] text-slate-400 font-bold uppercase block text-center">
                                  Голосов за уход всех:
                                </span>
                                <div className="flex items-center justify-between gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setTableLeaveVotesInput?.(Math.max(0, (tableLeaveVotesInput ?? 0) - 1))}
                                    className="px-2 py-1 bg-slate-900 border border-slate-800 text-slate-400 rounded-lg hover:bg-slate-850 text-[10px] font-bold cursor-pointer"
                                  >
                                    -1
                                  </button>
                                  <span className="text-amber-400 font-mono text-sm font-black">{tableLeaveVotesInput ?? 0}</span>
                                  <button
                                    type="button"
                                    onClick={() => setTableLeaveVotesInput?.(Math.min(10, (tableLeaveVotesInput ?? 0) + 1))}
                                    className="px-2 py-1 bg-slate-900 border border-slate-800 text-amber-400 rounded-lg hover:bg-slate-850 text-[10px] font-bold cursor-pointer"
                                  >
                                    +1
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-1.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleConfirmTableDecision?.(true, result.winners)}
                                  className="bg-rose-600 hover:bg-rose-500 text-white font-black py-1.5 rounded-xl text-[9px] uppercase tracking-wider shadow cursor-pointer"
                                >
                                  Все уходят 🚪
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleConfirmTableDecision?.(false, result.winners)}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-black py-1.5 rounded-xl text-[9px] uppercase tracking-wider shadow cursor-pointer"
                                >
                                  Все остаются 🤝
                                </button>
                              </div>
                            </div>
                          )}

                          {result.outcome === 'auto_no_elimination' && (
                            <                {/* 4. Revote Speeches Stage */}
                {votingStage === 'revote_speeches' && (
                  <div className="space-y-3 w-full text-center">
                    {(() => {
                      const currentRound = votingRounds[activeVotingRoundIndex];
                      if (!currentRound) return null;

                      const result = determineVotingResult(currentRound);
                      const winners = result.winners;
                      const activeSpeakerSlot = winners[revoteSpeakerIndex];
                      const activeSpeakerPlayer = activePlayers.find(p => p.slot_num === activeSpeakerSlot);

                      return (
                        <div className="space-y-2">
                          <span className="text-xs font-black text-amber-500 uppercase tracking-widest block animate-pulse">
                            Речь на автокатастрофе
                          </span>
                          <p className="text-[11px] font-black text-slate-200 leading-none">
                            Игрок <span className="text-amber-400 font-mono text-sm font-black font-sans">#{activeSpeakerSlot}</span> ({activeSpeakerPlayer?.nickname || "—"})
                          </p>
                          <span className="text-[8px] text-slate-400 uppercase font-black block leading-none mt-1">
                            Спикер {revoteSpeakerIndex + 1} из {winners.length}
                          </span>

                          {/* Speech Navigation controls */}
                          <div className="pt-2 border-t border-slate-950 max-w-[210px] mx-auto flex justify-center gap-1.5">
                            {revoteSpeakerIndex < winners.length - 1 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setRevoteSpeakerIndex?.(i => i + 1);
                                  handleStartTimer(winners[revoteSpeakerIndex + 1], 30);
                                }}
                                className="bg-amber-600 hover:bg-amber-500 text-white font-black px-3 py-1.5 rounded-xl text-[9px] uppercase tracking-wider cursor-pointer"
                              >
                                Следующий спикер 🎙️
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleLaunchNextRevote?.(winners)}
                                className="bg-rose-600 hover:bg-rose-500 text-white font-black px-3 py-1.5 rounded-xl text-[9px] uppercase tracking-wider animate-pulse cursor-pointer"
                              >
                                Перейти к голосованию 🗳️
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}imate-pulse">
                            ⚠️ Большинство набрано! Игроки покинут стол.
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-bold uppercase">
                            ✓ Большинство не набрано. Игроки остаются.
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
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
                      Запуск ночи
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-1">Оденьте маски. Город засыпает.</span>
                  </>
                )}
                {nightSubPhase === "shooting" && (
                  <>
                    <span className="text-xs font-black text-rose-500 uppercase tracking-widest block animate-pulse font-sans">
                      Стрельба Мафии 🔫
                    </span>
                    <div className="p-2 bg-slate-950 border border-slate-850 rounded-xl text-center max-w-[215px] mx-auto space-y-1">
                      <span className="text-[8px] uppercase text-slate-400 font-bold block">Цель мафии:</span>
                      <span className="text-xs font-black text-rose-400">
                        {shotPlayerSlot
                          ? `#${shotPlayerSlot} (${activePlayers.find((pl) => pl.slot_num === shotPlayerSlot)?.nickname})`
                          : "Нажмите на слот на столе"}
                      </span>
                    </div>
                  </>
                )}
                {nightSubPhase === "don" && (
                  <>
                    <span className="text-xs font-black text-purple-400 uppercase tracking-widest block animate-pulse font-sans">
                      Проверка Дона 🎩
                    </span>
                    <div className="p-2 bg-slate-950 border border-slate-850 rounded-xl text-center max-w-[215px] mx-auto space-y-1">
                      <span className="text-[8px] uppercase text-slate-400 font-bold block">Проверить игрока:</span>
                      <span className="text-xs font-black text-purple-400">
                        {donCheckSlot
                          ? `#${donCheckSlot} (${donCheckResult ? "ШЕРИФ! ✓" : "Не шериф"})`
                          : "Нажмите на слот на столе"}
                      </span>
                    </div>
                  </>
                )}
                {nightSubPhase === "sheriff" && (
                  <>
                    <span className="text-xs font-black text-emerald-400 uppercase tracking-widest block animate-pulse font-sans">
                      Проверка Шерифа 🌟
                    </span>
                    <div className="p-2 bg-slate-950 border border-slate-850 rounded-xl text-center max-w-[215px] mx-auto space-y-1">
                      <span className="text-[8px] uppercase text-slate-400 font-bold block">Проверить игрока:</span>
                      <span className="text-xs font-black text-emerald-400">
                        {sheriffCheckSlot
                          ? `#${sheriffCheckSlot} (${
                              sheriffCheckResult?.includes("ЧЁРНЫЙ") ? "ЧЁРНЫЙ!" : "Красный"
                            })`
                          : "Нажмите на слот на столе"}
                      </span>
                    </div>
                  </>
                )}
                {nightSubPhase === "best_move" && (
                  <>
                    <span className="text-xs font-black text-amber-400 uppercase tracking-widest block animate-pulse font-sans">
                      Лучший ход (ЛХ) 🏆
                    </span>
                    <div className="p-2 bg-slate-950 border border-slate-850 rounded-xl text-center max-w-[215px] mx-auto space-y-1.5">
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
                          <span className="text-[10px] text-slate-500 italic">Выберите 3 номера</span>
                        )}
                      </div>
                    </div>
                  </>
                )}
                {nightSubPhase === "morning" && (
                  <>
                    <span className="text-xs font-black text-rose-500 uppercase tracking-widest block">Итоги Ночи 🌅</span>
                    <div className="p-1.5 bg-slate-950 border border-slate-850 rounded-xl text-left text-[9px] space-y-1 max-w-[210px] mx-auto">
                      <div className="flex justify-between items-center text-rose-400">
                        <span>Выстрел:</span>
                        <span className="font-mono font-bold">#{shotPlayerSlot || "Промах"}</span>
                      </div>
                      <div className="flex justify-between items-center text-purple-400">
                        <span>Дон:</span>
                        <span className="font-mono font-bold">
                          {donCheckSlot ? `#${donCheckSlot} (${donCheckResult ? "Шериф" : "Нет"})` : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-emerald-400">
                        <span>Шериф:</span>
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

      {/* FOOTER BAR: STATUS & MAIN STEPPER ACTIONS */}
      <div className="border-t border-slate-800/80 pt-2 z-10 shrink-0 space-y-2">
        {/* Status indicators */}
        <div className="flex justify-between items-center text-[9px] text-slate-400 font-semibold px-1 font-sans">
          {nominations.length > 0 ? (
            <span className="truncate max-w-[140px]">
              Выставлены:{" "}
              <strong className="text-rose-400 font-mono font-bold">{nominations.map((n) => `#${n}`).join(", ")}</strong>
            </span>
          ) : (
            <span className="italic text-slate-500">Выставленных нет</span>
          )}
          <span>
            Живых: <strong className="text-emerald-400 font-bold">{activePlayers.filter((p) => p.alive).length}/10</strong>
          </span>
        </div>

        {/* Unified Stepper Action Buttons */}
        <div className="grid grid-cols-12 gap-1 sm:gap-1.5 min-h-[42px] sm:min-h-[44px] w-full">
          {prevStep ? (
            <button
              type="button"
              onClick={prevStep.onClick}
              className="col-span-4 h-full min-h-[42px] bg-slate-950 hover:bg-slate-900 active:bg-slate-900 text-slate-300 border border-slate-800 rounded-lg px-1 text-[8.5px] xs:text-[9.5px] sm:text-xs font-bold uppercase transition-all cursor-pointer flex items-center justify-center gap-0.5 font-sans shadow-md py-1"
            >
              <ArrowLeft className="w-3 h-3 shrink-0" />
              <span className="leading-tight text-center whitespace-normal break-words line-clamp-2">{prevStep.label}</span>
            </button>
          ) : (
            <div className="col-span-4" />
          )}

          {nextStep ? (
            <button
              type="button"
              onClick={nextStep.onClick}
              className="col-span-8 h-full min-h-[42px] bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white border border-rose-500/80 rounded-lg px-1.5 text-[10px] xs:text-[11px] sm:text-xs font-black uppercase tracking-wide transition-all shadow-lg shadow-rose-600/25 cursor-pointer flex items-center justify-center gap-1 font-sans py-1"
            >
              <span className="leading-tight text-center whitespace-normal break-words line-clamp-2">{nextStep.label}</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          ) : (
            <div className="col-span-8 bg-slate-950/40 border border-slate-850 rounded-lg flex items-center justify-center text-slate-600 text-[10px] sm:text-xs font-bold uppercase min-h-[42px]">
              Ожидание
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
