import React from "react";
import { Crosshair, Mic, User, Skull, Star, Heart, X, Gavel } from "lucide-react";
import { ActivePlayerState, Phase } from "./types.js";
import { PistolIcon, MafiaHatIcon } from "./Icons.js";
import { canToggleVoteAssignment } from "../../lib/liveVoting.js";

interface SeatCardProps {
  slotNum: number;
  activePlayers: ActivePlayerState[];
  setActivePlayers: React.Dispatch<React.SetStateAction<ActivePlayerState[]>>;
  activeSpeakerSlot: number | null;
  setActiveSpeakerSlot: (slot: number | null) => void;
  nominations: number[];
  phase: Phase;
  shotPlayerSlot: number | null;
  donCheckSlot: number | null;
  sheriffCheckSlot: number | null;
  bestMoveGuesses: number[];
  hideBestMoveGlow: boolean;
  nominationsMap: { [slot: number]: number };
  setNominationsMap: React.Dispatch<React.SetStateAction<{ [slot: number]: number }>>;
  showToast: (msg: string, type?: "success" | "info" | "error") => void;
  playBeep: (freq: number, dur: number) => void;
  votes: { [slot: number]: number };
  handleAllocateVotes: (nominee: number, count: number) => void;
  showRolesOnTable: boolean;
  shootoutNominees: number[];
  isTimerRunning: boolean;
  setIsTimerRunning: (isRunning: boolean) => void;
  timeLeft: number;
  handleStartTimer: (slotNum: number, duration: number) => void;
  handleNominateCandidate: (slotNum: number) => void;
  handleSeatClick: (slotNum: number) => void;
  handleFoulChange: (slotNum: number, dir: "up" | "down") => void;
  onRequestDirectRemoval: (slotNum: number) => void;
  markPlayerSpoken: (slotNum: number) => void;
  setBestMovePlayerSlot: (slot: number | null) => void;
  setBestMoveGuesses: (guesses: number[]) => void;
  nightSubPhase: string;
  roundNumber: number;
  getSeatColor: (slotNum: number) => string;
  votesByPlayer?: { [voterSlot: number]: number };
  currentVotingNomineeIndex?: number;
  isInteractiveVoting?: boolean;
  votingSubPhase?: string;
  shootoutSubPhase?: string;
  bothLeaveVotes?: number[];
}

const getGridPositionClass = (slot: number) => {
  const positions: { [key: number]: string } = {
    1: "md:col-start-1 md:row-start-3",
    2: "md:col-start-2 md:row-start-3",
    3: "md:col-start-3 md:row-start-3",
    4: "md:col-start-4 md:row-start-3",
    5: "md:col-start-5 md:row-start-3",
    6: "md:col-start-5 md:row-start-1",
    7: "md:col-start-4 md:row-start-1",
    8: "md:col-start-3 md:row-start-1",
    9: "md:col-start-2 md:row-start-1",
    10: "md:col-start-1 md:row-start-1",
  };
  return positions[slot] || "";
};

export default function SeatCard({
  slotNum,
  activePlayers,
  setActivePlayers,
  activeSpeakerSlot,
  setActiveSpeakerSlot,
  nominations,
  phase,
  shotPlayerSlot,
  donCheckSlot,
  sheriffCheckSlot,
  bestMoveGuesses,
  hideBestMoveGlow,
  nominationsMap,
  setNominationsMap,
  showToast,
  playBeep,
  votes,
  handleAllocateVotes,
  showRolesOnTable,
  shootoutNominees,
  isTimerRunning: _isTimerRunning,
  setIsTimerRunning,
  timeLeft,
  handleStartTimer,
  handleNominateCandidate,
  handleSeatClick,
  handleFoulChange,
  onRequestDirectRemoval,
  markPlayerSpoken,
  setBestMovePlayerSlot,
  setBestMoveGuesses,
  nightSubPhase,
  roundNumber,
  getSeatColor,
  votesByPlayer,
  currentVotingNomineeIndex = 0,
  isInteractiveVoting = false,
  votingSubPhase = "voting_intro",
  shootoutSubPhase = "shootout_intro",
  bothLeaveVotes = [],
}: SeatCardProps) {
  const p = activePlayers.find((pl) => pl.slot_num === slotNum);
  if (!p) return null;

  const isSpeaking = activeSpeakerSlot === slotNum;
  const isNominated = nominations.includes(slotNum);
  const hasSpoken = p.has_spoken_this_round;
  const activeVoteNominee = phase === "day_voting" ? nominations[currentVotingNomineeIndex] : undefined;

  // Night specific highlighting
  const isNightShot = phase === "night" && shotPlayerSlot === slotNum;
  const isNightDon = phase === "night" && donCheckSlot === slotNum;
  const isNightSheriff = phase === "night" && sheriffCheckSlot === slotNum;

  // Best Move (ЛХ) status
  const firstNightVictim = activePlayers.find(
    (pl) => pl.best_move_guesses && pl.best_move_guesses.length > 0
  );
  const isChosenInBestMove =
    !hideBestMoveGlow &&
    ((phase === "night" && nightSubPhase === "best_move" && bestMoveGuesses.includes(slotNum)) ||
      (firstNightVictim &&
        firstNightVictim.best_move_guesses?.includes(slotNum) &&
        (phase === "night" || (phase === "day_speeches" && activeSpeakerSlot === null))));
  const bestMoveIndex =
    phase === "night" && nightSubPhase === "best_move"
      ? bestMoveGuesses.indexOf(slotNum)
      : firstNightVictim?.best_move_guesses?.indexOf(slotNum) ?? -1;

  // Design classes based on speech / nomination / status
  let containerBorder = "border-slate-800 bg-slate-900/30";
  if (p.alive) {
    const activeNomineeSlot = phase === "day_voting" ? nominations[currentVotingNomineeIndex] : null;
    const isCurrentNominee = phase === "day_voting" && activeNomineeSlot === slotNum;

    if (phase === "shootout" && shootoutSubPhase === "shootout_both_results") {
      const votedYes = bothLeaveVotes.includes(slotNum);
      if (votedYes) {
        containerBorder = "border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.5)] bg-rose-500/20 ring-2 ring-rose-500/40 scale-[1.02]";
      } else if (shootoutNominees.includes(slotNum)) {
        containerBorder = "border-amber-500/80 bg-amber-500/10 ring-1 ring-amber-500/30";
      } else {
        containerBorder = "border-slate-800 bg-slate-900/50 hover:border-slate-600";
      }
    } else if (phase === "shootout" && shootoutNominees.includes(slotNum)) {
      containerBorder = "border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.45)] bg-amber-500/15 ring-2 ring-amber-400/40 scale-[1.02]";
    } else if (isCurrentNominee) {
      containerBorder = "border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.5)] scale-[1.02] animate-pulse";
    } else if (isSpeaking) {
      containerBorder =
        "border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.45)] bg-amber-500/15 ring-2 ring-amber-400/40 scale-[1.03]";
    } else if (phase === "day_voting" && isInteractiveVoting) {
      const lastNominee = nominations[nominations.length - 1];
      const hasVotedOther = votesByPlayer && votesByPlayer[slotNum] !== undefined && votesByPlayer[slotNum] !== activeNomineeSlot;
      const isVotingThis = votesByPlayer && (votesByPlayer[slotNum] === activeNomineeSlot ||
        (activeNomineeSlot === lastNominee && votesByPlayer[slotNum] === undefined));

      if (isVotingThis) {
        containerBorder = "border-rose-500 shadow-[0_0_15px_rgba(239,68,68,0.35)] bg-rose-500/10 ring-2 ring-rose-500/30";
      } else if (hasVotedOther) {
        containerBorder = "border-slate-950 bg-slate-950/20 opacity-60";
      } else {
        containerBorder = "border-slate-800 bg-slate-900/50 hover:border-slate-600";
      }
    } else if (isNominated) {
      containerBorder = "border-rose-500 shadow-[0_0_15px_rgba(239,68,68,0.35)] bg-rose-500/10 ring-2 ring-rose-500/30";
    } else if (isChosenInBestMove) {
      containerBorder =
        "border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] bg-amber-500/5 ring-2 ring-amber-500/20 hover:border-amber-400 hover:scale-[1.01]";
    } else {
      containerBorder = "border-slate-800/80 bg-slate-900/50 hover:border-slate-600 hover:scale-[1.01]";
    }
  } else {
    containerBorder = "border-rose-950 bg-[#160a0f] hover:border-rose-900";
  }

  const handleCardClick = () => {
    if (phase === "day_voting" && isInteractiveVoting && activeVoteNominee !== undefined) {
      const assignments = votesByPlayer || {};
      if (!canToggleVoteAssignment(slotNum, activeVoteNominee, assignments)) {
        const existing = assignments[slotNum];
        showToast(`#${slotNum} уже проголосовал за #${existing}. Вернитесь к этой кандидатуре, чтобы снять голос.`, "info");
        return;
      }
    }
    handleSeatClick(slotNum);
  };

  return (
    <div
      onClick={handleCardClick}
      className={`relative aspect-auto md:aspect-[16/11.5] min-h-[102px] sm:min-h-[120px] md:min-h-[160px] pt-7 pb-1 px-1 rounded-2xl border transition-all duration-300 flex flex-col justify-between cursor-pointer select-none overflow-hidden group shadow-md md:shadow-lg self-center w-full ${getGridPositionClass(slotNum)} ${containerBorder}`}
    >
      {/* If player is ALIVE */}
      {p.alive ? (
        <>
          {/* Quick 1-Tap Actions Header Bar (Fouls & Nomination) */}
          <div className="absolute top-1.5 inset-x-1.5 z-20 flex justify-between items-center pointer-events-auto">
            {/* Quick Nomination Button during speeches or general view */}
            {phase === "day_speeches" ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNominateCandidate(slotNum);
                }}
                className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer shadow-md ${
                  isNominated
                    ? "bg-rose-600 text-white border border-rose-400"
                    : "bg-slate-950/80 hover:bg-slate-900 text-slate-300 border border-slate-700/60"
                }`}
                title={isNominated ? "Снять с голосования" : "Выставить на голосование"}
              >
                <Crosshair className={`w-3 h-3 ${isNominated ? "text-white" : "text-rose-400"}`} />
                <span>{isNominated ? "Выставлен" : "Выставить"}</span>
              </button>
            ) : phase === "shootout" && shootoutSubPhase === "shootout_both_results" && bothLeaveVotes.includes(slotNum) ? (
              <div className="bg-rose-950/95 text-rose-200 px-2 py-0.5 rounded-lg text-[9px] font-black tracking-wider flex items-center gap-1 uppercase border border-rose-500/50 shadow-lg animate-pulse">
                <span>✋ ЗА УДАЛЕНИЕ</span>
              </div>
            ) : phase === "shootout" && shootoutNominees.includes(slotNum) ? (
              <div className="bg-amber-950/95 text-amber-200 px-2 py-0.5 rounded-lg text-[9px] font-black tracking-wider flex items-center gap-1 uppercase border border-amber-500/50 shadow-lg animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>🛑 В перестрелке</span>
              </div>
            ) : isNominated ? (
              <div className="bg-rose-950/95 text-rose-200 px-2 py-0.5 rounded-lg text-[9px] font-black tracking-wider flex items-center gap-1 uppercase border border-rose-500/35 shadow-lg animate-pulse">
                <Crosshair className="w-3 h-3 text-rose-500" />
                <span>Выставлен</span>
              </div>
            ) : <div />}

            {/* Quick Foul Management Buttons (- / +) */}
            <div className="flex items-center gap-0.5">
              {p.fouls > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFoulChange(slotNum, "down");
                  }}
                  className="bg-slate-950/90 hover:bg-slate-800 text-slate-300 border border-slate-800 w-4 h-4 rounded text-[9px] font-black flex items-center justify-center cursor-pointer shadow active:scale-95 transition-all"
                  title="Снять фол (-1)"
                >
                  -
                </button>
              )}
              <div
                className={`px-1 py-0.5 rounded text-[9px] font-black flex items-center border shadow-md ${
                  p.fouls >= 3
                    ? "bg-rose-950 text-rose-300 border-rose-500/80 animate-pulse"
                    : p.fouls > 0
                    ? "bg-slate-950 text-amber-400 border-amber-500/50"
                    : "bg-slate-950/80 text-slate-500 border-slate-800"
                }`}
              >
                <span>{p.fouls}Ф</span>
              </div>
              {p.fouls < 4 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFoulChange(slotNum, "up");
                  }}
                  className="bg-slate-950/90 hover:bg-rose-950 text-rose-400 hover:text-rose-300 border border-slate-800 hover:border-rose-600/60 px-1 py-0.5 rounded text-[8px] font-black uppercase transition-all cursor-pointer shadow flex items-center gap-0.5 active:scale-95"
                  title="Добавить фол (+1)"
                >
                  <span>+Ф</span>
                </button>
              )}
              {p.alive && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestDirectRemoval(slotNum);
                  }}
                  className="bg-slate-950/90 hover:bg-rose-900 text-rose-400 hover:text-white border border-slate-800 hover:border-rose-600/60 w-4 h-4 rounded text-[8px] font-black flex items-center justify-center cursor-pointer shadow active:scale-95 transition-all ml-0.5"
                  title="Дисквалификация / Удалить из игры"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Speech status (if speaking, show waving/pulsing audio state) */}
          {isSpeaking && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-amber-500/10 pointer-events-none rounded-2xl z-0">
              <Mic className="w-5 h-5 text-amber-400 animate-bounce mb-0.5" />
              <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">
                Идет речь...
              </span>
            </div>
          )}

          {/* Normal player card body */}
          <div className="flex-1 flex flex-col items-center justify-center p-1.5">
            {phase === "day_voting" ? (
              isInteractiveVoting ? (
                (() => {
                  const activeNomineeSlot = nominations[currentVotingNomineeIndex];
                  const lastNominee = nominations[nominations.length - 1];
                  const explicitTarget = votesByPlayer?.[slotNum];
                  const automatic = explicitTarget === undefined && activeNomineeSlot === lastNominee;
                  const target = explicitTarget ?? (automatic ? lastNominee : undefined);
                  const hasVotedOther = explicitTarget !== undefined && explicitTarget !== activeNomineeSlot;

                  let statusColor = "text-slate-400";
                  let statusBg = "bg-slate-950/40";
                  if (hasVotedOther) {
                    statusColor = "text-slate-500";
                    statusBg = "bg-slate-950/60";
                  } else if (target !== undefined) {
                    statusColor = "text-rose-400 font-black";
                    statusBg = "bg-rose-950/20 border border-rose-500/25";
                  }
                  const statusText = target !== undefined
                    ? `#${slotNum}→#${target}${automatic ? "*" : ""}`
                    : `#${slotNum}→—`;

                  return (
                    <div className={`text-center space-y-1.5 p-2 rounded-xl w-full max-w-[95%] mx-auto ${statusBg}`} title={target !== undefined ? `Игрок #${slotNum} голосует за #${target}${automatic ? " (автоматический остаток)" : ""}` : `Игрок #${slotNum} ещё не проголосовал`}>
                      <span className="text-[9px] text-slate-500 font-bold uppercase block tracking-wider leading-none">Голосование</span>
                      <span className={`text-[9px] sm:text-xs font-black block tracking-normal leading-none whitespace-nowrap ${statusColor}`}>
                        {statusText}
                      </span>
                    </div>
                  );
                })()
              ) : (
                <div className="text-center space-y-1 bg-slate-950/40 p-2 rounded-xl border border-slate-900 w-full max-w-[95%] mx-auto">
                  <span className="text-[9px] text-slate-500 font-bold uppercase block tracking-wider leading-none">Голосование</span>
                  {isNominated ? (
                    <div className="text-center">
                      <span className="text-[8px] text-slate-500 block">Получил:</span>
                      <span className="text-xs sm:text-sm font-black text-rose-400 font-mono">
                        {votes[slotNum] || 0} гол.
                      </span>
                    </div>
                  ) : (
                    <span className="text-[9px] text-slate-500 italic block">Не выставлен</span>
                  )}
                </div>
              )
            ) : phase === "shootout" ? (
              (() => {
                if (shootoutSubPhase === "shootout_revote_active") {
                  const activeNomineeSlot = shootoutNominees[currentVotingNomineeIndex];
                  const lastNominee = shootoutNominees[shootoutNominees.length - 1];
                  const hasVotedOther =
                    votesByPlayer && votesByPlayer[slotNum] !== undefined && votesByPlayer[slotNum] !== activeNomineeSlot;
                  const isVotingThis = votesByPlayer && (votesByPlayer[slotNum] === activeNomineeSlot ||
                    (activeNomineeSlot === lastNominee && votesByPlayer[slotNum] === undefined));

                  let statusColor = "text-slate-400";
                  let statusText = "Не голосовал";
                  let statusBg = "bg-slate-950/40";

                  if (hasVotedOther) {
                    const otherNominee = votesByPlayer[slotNum];
                    statusColor = "text-slate-500";
                    statusText = `Против #${otherNominee}`;
                    statusBg = "bg-slate-950/60";
                  } else if (isVotingThis) {
                    statusColor = "text-amber-400 font-black";
                    statusText = activeNomineeSlot === lastNominee && votesByPlayer[slotNum] === undefined ? "✋ Автомат" : "✋ Голосует";
                    statusBg = "bg-amber-950/20 border border-amber-500/25";
                  }

                  return (
                    <div className={`text-center space-y-1.5 p-2 rounded-xl w-full max-w-[95%] mx-auto ${statusBg}`}>
                      <span className="text-[9px] text-slate-500 font-bold uppercase block tracking-wider leading-none">Перестрелка</span>
                      <span className={`text-[10px] sm:text-xs font-black block uppercase tracking-wide leading-none ${statusColor}`}>
                        {statusText}
                      </span>
                    </div>
                  );
                } else if (shootoutSubPhase === "shootout_revote_results" || shootoutSubPhase === "shootout_both_results") {
                  const votedYes = bothLeaveVotes.includes(slotNum);
                  const isTiedCandidate = shootoutNominees.includes(slotNum);
                  if (shootoutSubPhase === "shootout_both_results") {
                    return (
                      <div className={`text-center space-y-1.5 p-2 rounded-xl w-full max-w-[95%] mx-auto ${votedYes ? "bg-rose-900/20 border border-rose-500/25" : "bg-slate-950/40"}`}>
                        <span className="text-[8px] text-slate-500 font-bold uppercase block tracking-wider leading-none">Удалить обоих?</span>
                        <span className={`text-[10px] sm:text-xs font-black block uppercase tracking-wide leading-none ${votedYes ? "text-rose-400" : "text-slate-500"}`}>
                          {votedYes ? "✋ ЗА УДАЛЕНИЕ" : "Пас"}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div className="text-center space-y-1 bg-slate-950/40 p-2 rounded-xl border border-slate-900 w-full max-w-[95%] mx-auto">
                      <span className="text-[9px] text-slate-500 font-bold uppercase block tracking-wider leading-none">Результат</span>
                      {isTiedCandidate ? (
                        <div className="text-center">
                          <span className="text-[8px] text-slate-500 block">Получил:</span>
                          <span className="text-xs sm:text-sm font-black text-amber-400 font-mono">
                            {votes[slotNum] || 0} гол.
                          </span>
                        </div>
                      ) : (
                        <span className="text-[9px] text-slate-500 italic block">Не в ничьей</span>
                      )}
                    </div>
                  );
                } else {
                  const isTiedCandidate = shootoutNominees.includes(slotNum);
                  if (isTiedCandidate) {
                    return (
                      <div className="text-center space-y-1 p-2 rounded-xl bg-amber-950/30 border border-amber-500/40 w-full max-w-[95%] mx-auto">
                        <span className="text-[9px] text-amber-400 font-bold uppercase block tracking-wider leading-none">
                          🛑 В перестрелке
                        </span>
                        {isSpeaking ? (
                          <span className="text-[10px] sm:text-xs font-black text-amber-300 block uppercase animate-pulse">
                            🎙️ Речь ({timeLeft}с)
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartTimer(slotNum, 30);
                            }}
                            className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-black uppercase rounded-lg shadow transition-all cursor-pointer block w-full mt-1"
                          >
                            🎙️ Речь 30с
                          </button>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div className="text-center space-y-1 bg-slate-950/40 p-2 rounded-xl border border-slate-900 w-full max-w-[95%] mx-auto">
                      <span className="text-[9px] text-slate-500 font-bold uppercase block tracking-wider leading-none">Автокатастрофа</span>
                      <span className="text-[10px] sm:text-xs font-medium text-slate-500 block uppercase tracking-wide leading-none">
                        Не в перестрелке
                      </span>
                    </div>
                  );
                }
              })()
            ) : isNightShot && roundNumber === 1 ? (
              <div className="text-center space-y-1 bg-slate-950/65 p-2 rounded-xl border border-amber-500/35 max-w-[95%] mx-auto shadow-md">
                <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider block">Выбор ЛХ:</span>
                {bestMoveGuesses.length > 0 ? (
                  <div className="flex justify-center gap-1 mt-1">
                    {bestMoveGuesses.map((gNum) => (
                      <div
                        key={gNum}
                        className={`w-5 h-5 rounded-lg font-mono font-black text-xs flex items-center justify-center border shadow-inner ${getSeatColor(
                          gNum
                        )}`}
                      >
                        {gNum}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-[8px] text-slate-500 italic block mt-0.5">Кликните 3 номера на столе</span>
                )}
              </div>
            ) : (
              !isSpeaking &&
              !isNominated && (
                <div className="text-center space-y-0.5">
                  <User className="w-4 h-4 text-slate-500 mx-auto opacity-75" />
                  <span className="text-[10px] sm:text-xs text-slate-400 font-mono font-bold block">
                    {p.mute_this_round
                      ? "🔇 Молчит"
                      : p.has_foul_penalty || p.fouls === 3
                      ? "⚠️ 3 фола (30с)"
                      : hasSpoken
                      ? "Выступил ✓"
                      : "Ожидает речи"}
                  </span>
                </div>
              )
            )}
          </div>
        </>
      ) : (
        /* If player is DEAD - Polemica burgundy card */
        <div className="absolute inset-0 bg-[#160a0f] flex flex-col justify-between p-2.5 text-center">
          <div className="flex-1 flex flex-col items-center justify-center">
            <span className="text-[9px] sm:text-[10px] font-mono font-bold text-rose-400/50 uppercase tracking-widest leading-none mb-1.5">
              {p.eliminated_phase || "Игра"}
            </span>
            <div className="py-1 px-3 bg-rose-950/40 border border-rose-800/40 rounded-xl inline-flex items-center justify-center gap-1.5 shadow-md">
              <Skull className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              <span className="text-[10px] sm:text-xs font-black text-rose-200 uppercase tracking-wider">Убит</span>
            </div>

            {/* Best Move guesses (ЛХ) */}
            {p.best_move_guesses && p.best_move_guesses.length > 0 && (
              <div className="flex items-center justify-center gap-1 mt-2.5 bg-slate-950/50 px-2 py-1 rounded-xl border border-rose-900/30">
                <span className="text-[9px] sm:text-xs font-bold text-rose-400/75 mr-1 font-mono">ЛХ:</span>
                <div className="flex gap-1">
                  {p.best_move_guesses.map((gNum) => (
                    <div
                      key={gNum}
                      className={`w-5.5 h-5.5 rounded-lg font-mono font-black text-xs flex items-center justify-center border shadow-inner ${getSeatColor(
                        gNum
                      )}`}
                    >
                      {gNum}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active Night selections indicators */}
      {phase === "night" && (
        <div className="absolute top-2.5 inset-x-2.5 flex flex-col gap-1 z-10">
          {isNightShot && (
            <span className="text-[9px] sm:text-[10px] bg-rose-900/95 border border-rose-500/50 text-rose-300 px-2 py-1 rounded-lg font-bold uppercase flex items-center justify-center gap-1.5 animate-pulse shadow-lg">
              <PistolIcon className="w-3.5 h-3.5 text-rose-500" />
              <span>Жертва</span>
            </span>
          )}
          {isNightDon && (
            <span className="text-[9px] sm:text-[10px] bg-purple-950/95 border border-purple-500/50 text-purple-300 px-2 py-1 rounded-lg font-bold uppercase flex items-center justify-center gap-1.5 shadow-lg">
              <MafiaHatIcon className="w-3.5 h-3.5 text-purple-400" />
              <span>Дон</span>
            </span>
          )}
          {isNightSheriff && (
            <span className="text-[9px] sm:text-[10px] bg-emerald-900/95 border border-emerald-500/50 text-emerald-300 px-2 py-1 rounded-lg font-bold uppercase flex items-center justify-center gap-1.5 shadow-lg">
              <Star className="w-3.5 h-3.5 text-emerald-400 fill-current" />
              <span>Шериф</span>
            </span>
          )}
        </div>
      )}

      {/* Bottom Tag Overlay (Slot #, Nickname, Role) */}
      <div className="min-h-[36px] py-1 bg-slate-950/95 border-t border-slate-900 px-1.5 md:px-3 flex items-center justify-between mt-auto z-10 gap-1">
        <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 min-w-0 flex-1">
          <div
            className={`relative w-5.5 h-5.5 sm:w-6 sm:h-6 md:w-8 md:h-8 rounded-lg font-mono font-black text-[10px] md:text-sm flex items-center justify-center border shrink-0 shadow-md ${getSeatColor(
              slotNum
            )} ${isChosenInBestMove ? "ring-2 ring-amber-400 shadow-amber-500/50" : ""}`}
          >
            {slotNum}
            {isChosenInBestMove && (
              <div
                className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 w-3.5 h-3.5 md:w-4.5 md:h-4.5 rounded-full flex items-center justify-center text-[7px] md:text-[9px] font-black border border-amber-300 shadow-lg animate-pulse"
                title={`Выбор ЛХ #${bestMoveIndex + 1}`}
              >
                🏆
              </div>
            )}
          </div>
          <div className="flex flex-col min-w-0 flex-1 justify-center">
            <div className="flex items-center gap-0.5 min-w-0">
              <span className="text-[11px] sm:text-xs md:text-sm font-black text-slate-100 truncate leading-tight">
                {p.nickname || `Игрок ${slotNum}`}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const note = window.prompt(`Заметка ведущего для #${slotNum} (${p.nickname}):`, p.note || "");
                  if (note !== null) {
                    setActivePlayers((prev) =>
                      prev.map((pl) => (pl.slot_num === slotNum ? { ...pl, note: note.trim() } : pl))
                    );
                  }
                }}
                className="text-slate-500 hover:text-amber-400 text-[9px] px-0.5 py-0 rounded hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                title="Добавить заметку ведущего"
              >
                ✎
              </button>
            </div>
            {p.note && (
              <span className="text-[7.5px] md:text-[9px] text-amber-300/90 font-medium truncate italic bg-amber-950/50 px-1 py-0 rounded border border-amber-500/30 max-w-[80px] sm:max-w-[130px] shadow-sm leading-none mt-0.5">
                📌 {p.note}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center shrink-0 ml-0.5 gap-1">
          {showRolesOnTable ? (
            <div
              className={`flex items-center justify-center w-5.5 h-5.5 md:w-8 md:h-8 rounded-full border transition-transform hover:scale-110 shadow-md ${
                p.role === "Дон"
                  ? "bg-purple-500/10 border-purple-500/40 text-purple-400"
                  : p.role === "Мафия"
                  ? "bg-slate-200 border-slate-400 text-slate-950 shadow-inner"
                  : p.role === "Шериф"
                  ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                  : "bg-rose-600/10 border-rose-500/30 text-rose-500"
              }`}
              title={p.role === "Мирный" ? "Красный" : p.role}
            >
              {p.role === "Мирный" && <Heart className="w-3 h-3 md:w-4 md:h-4 fill-current text-rose-500" />}
              {p.role === "Дон" && <MafiaHatIcon className="w-3 h-3 md:w-4 md:h-4 text-purple-400" />}
              {p.role === "Мафия" && <PistolIcon className="w-3 h-3 md:w-4 md:h-4 text-slate-950" />}
              {p.role === "Шериф" && <Star className="w-3 h-3 md:w-4 md:h-4 fill-current text-emerald-400" />}
            </div>
          ) : (
            <div
              className="w-5.5 h-5.5 md:w-8 md:h-8 flex items-center justify-center rounded-full bg-slate-900/80 border border-slate-800 text-slate-500 font-mono font-black text-[10px] md:text-xs shadow-inner"
              title="Скрыто"
            >
              P
            </div>
          )}
        </div>
      </div>

      {/* Day Phase Hover Controls Panel */}
      {(() => {
        const disableHover =
          (phase === "day_voting" && votingSubPhase === "voting_active") ||
          (phase === "shootout" &&
            (shootoutSubPhase === "shootout_revote_active" ||
              shootoutSubPhase === "shootout_revote_results" ||
              shootoutSubPhase === "shootout_both_results"));
        return phase !== "night" && phase !== "zero_night" && !disableHover;
      })() && (
        <div className="absolute inset-0 bg-slate-950 hidden md:flex flex-col justify-between p-2.5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-1">
            <span className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider">
              Управление #{slotNum}
            </span>
            <button type="button" onClick={(e) => e.stopPropagation()} className="text-slate-500 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-1.5 my-1">
            {p.alive ? (
              <div className="grid grid-cols-2 gap-1.5 text-[9px] sm:text-xs font-black uppercase">
                {phase === "shootout" ? (
                  shootoutNominees.includes(slotNum) ? (
                    activeSpeakerSlot === slotNum ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveSpeakerSlot(null);
                          setIsTimerRunning(false);
                        }}
                        className="col-span-2 bg-rose-600 hover:bg-rose-550 text-white rounded-lg py-2 cursor-pointer text-center animate-pulse flex items-center justify-center gap-1 font-bold text-[10px]"
                      >
                        <Mic className="w-3.5 h-3.5 animate-pulse" /> Стоп ⏹️ ({timeLeft}с)
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartTimer(slotNum, p.mute_this_round ? 0 : 30);
                        }}
                        className="col-span-2 bg-rose-600 hover:bg-rose-550 text-white rounded-lg py-2 cursor-pointer text-center flex items-center justify-center gap-1.5 font-bold text-[10px]"
                      >
                        <Mic className="w-3.5 h-3.5 text-amber-400" /> Речь 30с 🎙️
                      </button>
                    )
                  ) : (
                    <div className="col-span-2 bg-slate-900/40 text-slate-500 rounded-lg py-2 text-center text-[10px] font-bold border border-slate-850/50">
                      Вне перестрелки
                    </div>
                  )
                ) : (
                  <>
                    {p.has_spoken_this_round ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePlayers((prev) =>
                            prev.map((pl) => (pl.slot_num === slotNum ? { ...pl, has_spoken_this_round: false } : pl))
                          );
                          showToast(`Речь игрока #${slotNum} сброшена`, "info");
                        }}
                        className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/20 rounded-lg py-1.5 cursor-pointer text-center font-black"
                      >
                        Сбросить
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartTimer(slotNum, p.mute_this_round ? 0 : 60);
                        }}
                        className="bg-slate-800 hover:bg-slate-700 text-white border-2 border-slate-700 rounded-lg py-1.5 cursor-pointer text-center flex items-center justify-center gap-1"
                      >
                        <Mic className="w-3 h-3 text-amber-400" /> Речь
                      </button>
                    )}

                    {activeSpeakerSlot === slotNum ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          markPlayerSpoken(slotNum);
                        }}
                        className="bg-rose-600 hover:bg-rose-500 text-white rounded-lg py-1.5 cursor-pointer text-center animate-pulse"
                      >
                        Стоп ⏹️
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNominateCandidate(slotNum);
                        }}
                        className={`rounded-lg py-1.5 cursor-pointer text-center border-2 ${
                          nominations.includes(slotNum)
                            ? "bg-rose-600 border-rose-500 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-450 hover:text-slate-300"
                        }`}
                      >
                        {nominations.includes(slotNum) ? "Снять 🎯" : "Выставить 🎯"}
                      </button>
                    )}
                  </>
                )}

                {nominations.includes(slotNum) && (
                  <div
                    className="col-span-2 flex flex-col gap-1 mt-1 bg-slate-950 p-1.5 rounded-lg border border-slate-850"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[9px] text-rose-400 font-bold uppercase tracking-wider">Выставил:</span>
                    <select
                      value={nominationsMap[slotNum] ?? 0}
                      onChange={(e) => {
                        const nominator = parseInt(e.target.value);
                        setNominationsMap((prev) => ({ ...prev, [slotNum]: nominator }));
                        showToast(
                          `Кандидатура игрока #${slotNum} теперь выставлена игроком #${nominator || "Ведущий"}`,
                          "success"
                        );
                      }}
                      className="bg-slate-900 border border-slate-800 text-slate-300 rounded px-1.5 py-1 text-[10px] font-mono font-bold focus:outline-none w-full"
                    >
                      <option value="0">Ведущий</option>
                      {activePlayers
                        .filter((pl) => pl.alive)
                        .map((pl) => (
                          <option key={pl.slot_num} value={pl.slot_num}>
                            Игрок #{pl.slot_num} ({pl.nickname})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {phase === "day_voting" && nominations.includes(slotNum) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const count = votes[slotNum] || 0;
                      handleAllocateVotes(slotNum, count + 1);
                      playBeep(659, 0.1);
                    }}
                    className="col-span-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-500 border-2 border-rose-500/30 rounded-lg py-1.5 text-center font-black flex items-center justify-center gap-1.5"
                  >
                    <Gavel className="w-3.5 h-3.5" /> Голос +1 ({votes[slotNum] || 0})
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setBestMovePlayerSlot(slotNum);
                  setBestMoveGuesses(p.best_move_guesses || []);
                }}
                className="w-full bg-amber-600/15 hover:bg-amber-600/35 text-amber-400 border-2 border-amber-600/25 rounded-lg py-2 cursor-pointer text-center flex items-center justify-center gap-1.5 text-[9px] sm:text-xs font-black uppercase"
              >
                📝 Лучший Ход
              </button>
            )}
          </div>

          {p.alive && (
            <div className="flex items-center justify-between bg-slate-900/60 p-1 rounded-xl border border-slate-800/60 text-[10px] font-bold">
              <span className="text-slate-400 pl-1">Фолы: {p.fouls}{(p.has_foul_penalty || p.fouls === 3) && " (30с)"}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFoulChange(slotNum, "down");
                  }}
                  className="w-5 h-5 bg-slate-850 hover:bg-slate-700 text-white rounded flex items-center justify-center font-mono cursor-pointer"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFoulChange(slotNum, "up");
                  }}
                  className="w-5 h-5 bg-slate-850 hover:bg-slate-700 text-white rounded flex items-center justify-center font-mono cursor-pointer"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePlayers((prev) =>
                      prev.map((pl) => (pl.slot_num === slotNum ? { ...pl, mute_this_round: !pl.mute_this_round } : pl))
                    );
                    showToast(`Игрок #${slotNum} ${p.mute_this_round ? "размучен" : "получил фол молчания"}`, "info");
                  }}
                  className={`px-1.5 h-5 rounded text-[8px] font-black uppercase cursor-pointer flex items-center justify-center ${
                    p.mute_this_round
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      : "bg-slate-800 hover:bg-slate-750 text-slate-300"
                  }`}
                >
                  🔇 {p.mute_this_round ? "Разм." : "Молч."}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
