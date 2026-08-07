import { useState, useEffect, useRef } from "react";
import { Shield, EyeOff, Eye, RotateCcw } from "lucide-react";
import { Player, GameSlot } from "../types.js";
import { 
  VotingRound, 
  determineVotingResult, 
  calculateVoteRemainder, 
  createNextRevoteRound, 
  cleanAndSyncVotes, 
  safeRenumberVotes 
} from "../shared/tournamentVoting.js";
import { isVoteDecided } from "../lib/liveVoting.js";

// Modularized subcomponents
import SetupPhase from "./LiveGameEngine/SetupPhase.js";
import EventsPanel from "./LiveGameEngine/EventsPanel.js";
import SeatCard from "./LiveGameEngine/SeatCard.js";
import CenterPanel from "./LiveGameEngine/CenterPanel.js";
import { ActivePlayerState, Phase } from "./LiveGameEngine/types.js";
import {
  LiveProtocolMarkers,
  BestMoveSource,
  createEmptyLiveProtocolMarkers,
  registerFirstKilled,
  registerZeroRoundVoted,
  setBestMove,
  clearBestMove
} from "../lib/gameProtocolCore.js";

interface LiveGameEngineProps {
  players: Player[];
  initialJudgeId: number;
  onGameFinished: (gameData: { winning_team: "Красные" | "Чёрные"; protocol_text: string; slots: GameSlot[]; judge_id: number }) => void;
  onCancel: () => void;
  onPhaseChange?: (phase: string) => void;
}

export default function LiveGameEngine({ players, initialJudgeId, onGameFinished, onCancel, onPhaseChange }: LiveGameEngineProps) {
  const [judgeId, setJudgeId] = useState<number>(initialJudgeId);
  const [phase, setPhase] = useState<Phase>("setup");
  const [roundNumber, setRoundNumber] = useState(1);
  const [nightSubPhase, setNightSubPhase] = useState<"intro" | "shooting" | "don" | "sheriff" | "best_move" | "morning">("intro");

  const [protocolMarkers, setProtocolMarkers] = useState<LiveProtocolMarkers>(createEmptyLiveProtocolMarkers());
  const [activeBestMoveSource, setActiveBestMoveSource] = useState<BestMoveSource | null>(null);
  const [activeBestMoveSlot, setActiveBestMoveSlot] = useState<number | null>(null);
  const [pendingBestMoveSeats, setPendingBestMoveSeats] = useState<number[]>([]);
  const [onConfirmBestMove, setOnConfirmBestMove] = useState<(() => void) | null>(null);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  const [activePlayers, setActivePlayers] = useState<ActivePlayerState[]>(
    Array.from({ length: 10 }, (_, i) => ({
      slot_num: i + 1, user_id: 0, nickname: "", role: "Мирный", team: "Красные", fouls: 0, alive: true,
      nominated_this_round: false, has_spoken_this_round: false, mute_this_round: false, is_pu: false,
      best_move_guesses: [], kick: false, ppk: false, bonus_points: 0, lh_points: 0, will_protocol_points: 0,
      will_opinion_points: 0, dc_points: 0, eliminated_phase: "", has_foul_penalty: false, exit_reason: "alive"
    }))
  );

  const [toast, setToast] = useState<{ message: string; type: "error" | "warning" | "success" | "info" } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const showToast = (message: string, type: "error" | "warning" | "success" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(p => p?.message === message ? null : p), 3500);
  };

  const [timeLeft, setTimeLeft] = useState(60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [activeSpeakerSlot, setActiveSpeakerSlot] = useState<number | null>(null);
  const [customTimerLabel, setCustomTimerLabel] = useState<string | null>(null);
  const [zeroNightSubPhase, setZeroNightSubPhase] = useState<"agreement" | "sheriff" | "seating" | null>(null);
  const [timerMax, setTimerMax] = useState(60);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [nominations, setNominations] = useState<number[]>([]);
  const [votes, setVotes] = useState<{ [slot: number]: number }>({});
  const [shootoutNominees, setShootoutNominees] = useState<number[]>([]);

  const [shotPlayerSlot, setShotPlayerSlot] = useState<number | null>(null);
  const [donCheckSlot, setDonCheckSlot] = useState<number | null>(null);
  const [donCheckResult, setDonCheckResult] = useState<boolean | null>(null);
  const [sheriffCheckSlot, setSheriffCheckSlot] = useState<number | null>(null);
  const [sheriffCheckResult, setSheriffCheckResult] = useState<string | null>(null);
  const [nightLogs, setNightLogs] = useState<{ round: number; log: string }[]>([]);
  const [viewMode, setViewMode] = useState<"table" | "list">("table");
  const [showRolesOnTable, setShowRolesOnTable] = useState<boolean>(true);

  const [selectedMobileSlot, setSelectedMobileSlot] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [, setBestMovePlayerSlot] = useState<number | null>(null);
  const [bestMoveGuesses, setBestMoveGuesses] = useState<number[]>([]);
  const [protocolNotes, setProtocolNotes] = useState("");
  const [hideBestMoveGlow, setHideBestMoveGlow] = useState<boolean>(false);
  const [votingAttempt, setVotingAttempt] = useState<number>(1);

  const [nominationsMap, setNominationsMap] = useState<{ [candidateSlot: number]: number }>({});
  const [votesByPlayer, setVotesByPlayer] = useState<{ [voterSlot: number]: number }>({});
  const [currentVotingNomineeIndex, setCurrentVotingNomineeIndex] = useState<number>(0);
  const [isInteractiveVoting, setIsInteractiveVoting] = useState<boolean>(true);

  // Dynamic voting chain state
  const [votingRounds, setVotingRounds] = useState<VotingRound[]>([]);
  const [activeVotingRoundIndex, setActiveVotingRoundIndex] = useState<number>(0);
  const [votingStage, setVotingStage] = useState<'setup' | 'collecting' | 'round_result' | 'revote_speeches' | 'table_decision' | 'resolved'>('setup');
  const [revoteSpeakerIndex, setRevoteSpeakerIndex] = useState<number>(0);
  const [tableLeaveVotesInput, setTableLeaveVotesInput] = useState<number | null>(null);

  // Linear Voting & Shootout subphase state managers
  const [votingSubPhase, setVotingSubPhase] = useState<"voting_intro" | "voting_active" | "voting_results">("voting_intro");
  const [shootoutSubPhase, setShootoutSubPhase] = useState<"shootout_intro" | "shootout_speeches" | "shootout_revote_intro" | "shootout_revote_active" | "shootout_revote_results" | "shootout_both_results">("shootout_intro");
  const [bothLeaveVotes, setBothLeaveVotes] = useState<number[]>([]);

  // History stack for Undo action functionality
  const [historyStack, setHistoryStack] = useState<{
    activePlayers: ActivePlayerState[];
    nominations: number[];
    phase: Phase;
    roundNumber: number;
    nightSubPhase: "intro" | "shooting" | "don" | "sheriff" | "best_move" | "morning";
    protocolMarkers: LiveProtocolMarkers;
    votingRounds: VotingRound[];
    activeVotingRoundIndex: number;
    votesByPlayer: Record<number, number>;
    votingStage: 'setup' | 'collecting' | 'round_result' | 'revote_speeches' | 'table_decision' | 'resolved';
    revoteSpeakerIndex: number;
    tableLeaveVotesInput: number | null;
  }[]>([]);

  const saveSnapshot = () => {
    setHistoryStack((prev) => [
      ...prev.slice(-15),
      {
        activePlayers: JSON.parse(JSON.stringify(activePlayers)),
        nominations: [...nominations],
        phase,
        roundNumber,
        nightSubPhase,
        protocolMarkers: JSON.parse(JSON.stringify(protocolMarkers)),
        votingRounds: JSON.parse(JSON.stringify(votingRounds)),
        activeVotingRoundIndex,
        votesByPlayer: { ...votesByPlayer },
        votingStage,
        revoteSpeakerIndex,
        tableLeaveVotesInput,
      }
    ]);
  };

  const handleUndoAction = () => {
    if (historyStack.length === 0) {
      showToast("История действий пуста", "warning");
      return;
    }
    const last = historyStack[historyStack.length - 1];
    setActivePlayers(last.activePlayers);
    setNominations(last.nominations);
    setPhase(last.phase);
    setRoundNumber(last.roundNumber);
    setNightSubPhase(last.nightSubPhase);
    setProtocolMarkers(last.protocolMarkers || createEmptyLiveProtocolMarkers());
    setVotingRounds(last.votingRounds || []);
    setActiveVotingRoundIndex(last.activeVotingRoundIndex || 0);
    setVotesByPlayer(last.votesByPlayer || {});
    setVotingStage(last.votingStage || 'collecting');
    setRevoteSpeakerIndex(last.revoteSpeakerIndex || 0);
    setTableLeaveVotesInput(last.tableLeaveVotesInput);
    setHistoryStack((prev) => prev.slice(0, -1));
    showToast("Последнее действие ведущего отменено ↺", "info");
  };

  const [isMuted, setIsMuted] = useState(false);
  const [restorableSession, setRestorableSession] = useState<any | null>(null);

  // Check for saved session on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mafia_live_session");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.phase && parsed.phase !== "setup" && parsed.activePlayers?.length === 10) {
          setRestorableSession(parsed);
        }
      }
    } catch {}
  }, []);

  // Autosave live game state whenever key state updates during active game
  useEffect(() => {
    if (phase !== "setup") {
      try {
        const sessionData = {
          activePlayers,
          nominations,
          phase,
          roundNumber,
          nightSubPhase,
          nightLogs,
          votes,
          shootoutNominees,
          protocolMarkers,
          votingRounds,
          activeVotingRoundIndex,
          votesByPlayer,
          votingStage,
          revoteSpeakerIndex,
          tableLeaveVotesInput,
          savedAt: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
        };
        localStorage.setItem("mafia_live_session", JSON.stringify(sessionData));
      } catch {}
    } else {
      localStorage.removeItem("mafia_live_session");
    }
  }, [
    activePlayers, 
    nominations, 
    phase, 
    roundNumber, 
    nightSubPhase, 
    nightLogs, 
    votes, 
    shootoutNominees, 
    protocolMarkers,
    votingRounds,
    activeVotingRoundIndex,
    votesByPlayer,
    votingStage,
    revoteSpeakerIndex,
    tableLeaveVotesInput
  ]);

  const handleRestoreSession = () => {
    if (!restorableSession) return;
    try {
      setActivePlayers(restorableSession.activePlayers || activePlayers);
      setNominations(restorableSession.nominations || []);
      setPhase(restorableSession.phase);
      setRoundNumber(restorableSession.roundNumber || 1);
      setNightSubPhase(restorableSession.nightSubPhase || "intro");
      setNightLogs(restorableSession.nightLogs || []);
      setVotes(restorableSession.votes || {});
      setShootoutNominees(restorableSession.shootoutNominees || []);
      setProtocolMarkers(restorableSession.protocolMarkers || createEmptyLiveProtocolMarkers());
      setVotingRounds(restorableSession.votingRounds || []);
      setActiveVotingRoundIndex(restorableSession.activeVotingRoundIndex || 0);
      setVotesByPlayer(restorableSession.votesByPlayer || {});
      setVotingStage(restorableSession.votingStage || 'setup');
      setRevoteSpeakerIndex(restorableSession.revoteSpeakerIndex || 0);
      setTableLeaveVotesInput(restorableSession.tableLeaveVotesInput !== undefined ? restorableSession.tableLeaveVotesInput : null);
      setRestorableSession(null);
      showToast("Прерванная игра успешно восстановлена! 🔄", "success");
    } catch {
      showToast("Ошибка при восстановлении сессии", "warning");
    }
  };

  const handleDiscardSavedSession = () => {
    localStorage.removeItem("mafia_live_session");
    setRestorableSession(null);
    showToast("Сохраненная сессия сброшена", "info");
  };
  const [shootoutSpeakerIndex, setShootoutSpeakerIndex] = useState(0);

  const recalculateVotesAndSet = (voterMap: { [voterSlot: number]: number }, customNominations?: number[]) => {
    updateCurrentRoundVotes(voterMap);
  };

  const selectVotingNomineeIndex = (idx: number, customNominations?: number[]) => {
    const currentRound = votingRounds[activeVotingRoundIndex];
    const nomis = customNominations || (currentRound ? currentRound.nominated_seats : nominations);
    if (nomis.length === 0) return;

    setCurrentVotingNomineeIndex(idx);

    const alivePlayers = activePlayers.filter(p => p.alive);
    setVotesByPlayer((prev) => {
      const copy = { ...prev };

      // Clear any votes for nominees that are not in the current voting nominations list
      Object.entries(copy).forEach(([voter, nominee]) => {
        if (!nomis.includes(nominee)) {
          delete copy[parseInt(voter)];
        }
      });

      // Clear any dead players
      Object.keys(copy).forEach((voterStr) => {
        const voterSlot = parseInt(voterStr);
        const pl = alivePlayers.find(p => p.slot_num === voterSlot);
        if (!pl) {
          delete copy[voterSlot];
        }
      });

      updateCurrentRoundVotes(copy);
      return copy;
    });
  };

  const playBeep = (freq: number, dur: number) => {
    if (isMuted) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.frequency.value = freq; osc.type = "sine";
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + dur);
      osc.start(); osc.stop(audioCtx.currentTime + dur);
      if ("vibrate" in navigator) {
        try { navigator.vibrate(30); } catch {}
      }
    } catch { }
  };

  // Keyboard shortcuts listener for PC / judge controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        setIsTimerRunning((prev) => !prev);
      } else if (e.code === "KeyR" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setTimeLeft(timerMax);
        playBeep(523, 0.05);
      } else if (e.code === "KeyM" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsMuted((prev) => !prev);
      } else if (e.code === "KeyN" && !e.ctrlKey && !e.metaKey) {
        const step = getNextStepInfo();
        if (step) {
          e.preventDefault();
          step.onClick();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [timerMax]);

  useEffect(() => {
    if (isTimerRunning) {
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft((p) => {
          if (p <= 1) {
            setIsTimerRunning(false);
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            playBeep(1000, 0.5); return 0;
          }
          if (p === 11) {
            playBeep(600, 0.25);
          } else if (p <= 6 && p >= 2) {
            playBeep(750, 0.1);
          }
          return p - 1;
        });
      }, 1000);
    } else if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [isTimerRunning]);

  const handleAdjustTime = (amount: number) => {
    setTimeLeft((p) => Math.max(0, p + amount));
    playBeep(523, 0.05);
  };

  const handleStartTimer = (slotNum: number, duration: number = 60) => {
    const player = activePlayers.find((p) => p.slot_num === slotNum);
    if (player?.mute_this_round) {
      showToast(`Игрок #${slotNum} пропускает речь (молчание)!`, "warning");
      markPlayerSpoken(slotNum);
      return;
    }
    let finalDuration = duration;
    if (player?.has_foul_penalty || player?.fouls === 3) {
      finalDuration = 30;
      showToast(`Игрок #${slotNum} выступает 30 секунд (3-й фол)!`, "info");
      setActivePlayers(prev => prev.map(p => p.slot_num === slotNum ? { ...p, has_foul_penalty: false } : p));
    }
    if (phase === "day_speeches" && slotNum === 2) {
      setHideBestMoveGlow(true);
    }
    setActiveSpeakerSlot(slotNum); setCustomTimerLabel(null); setTimerMax(finalDuration); setTimeLeft(finalDuration); setIsTimerRunning(true);
    playBeep(523.25, 0.1);
  };

  const handleStartZeroNightTimer = (sub: "agreement" | "sheriff" | "seating") => {
    let duration = 60;
    let label = "";
    if (sub === "agreement") {
      duration = 75;
      label = "Договорка мафии";
    } else if (sub === "sheriff") {
      duration = 10;
      label = "Вызов шерифа";
    } else if (sub === "seating") {
      duration = 40;
      label = "Свободная посадка";
    }
    setZeroNightSubPhase(sub);
    setCustomTimerLabel(label);
    setActiveSpeakerSlot(null);
    setTimerMax(duration);
    setTimeLeft(duration);
    setIsTimerRunning(true);
    playBeep(523.25, 0.1);
  };

  const getSpeakerQueue = (): ActivePlayerState[] => {
    const startSlot = ((roundNumber - 1) % 10) + 1;
    const ordered: ActivePlayerState[] = [];
    for (let i = 0; i < 10; i++) {
      const slotNum = ((startSlot - 1 + i) % 10) + 1;
      const p = activePlayers.find(pl => pl.slot_num === slotNum);
      if (p) ordered.push(p);
    }
    return ordered.filter(p => p.alive && !p.has_spoken_this_round);
  };

  const queue = getSpeakerQueue();
  const nextSpeaker = queue[0];

  const getNextStepInfo = () => {
    if (phase === "setup") {
      return {
        label: "Запустить игру",
        onClick: validateSetupAndStart
      };
    }
    
    if (phase === "zero_night") {
      if (zeroNightSubPhase === null) {
        return {
          label: "Договорка (75с) 🕵️",
          onClick: () => handleStartZeroNightTimer("agreement")
        };
      }
      if (zeroNightSubPhase === "agreement") {
        return {
          label: "Вызов Шерифа (10с) 🌟",
          onClick: () => handleStartZeroNightTimer("sheriff")
        };
      }
      if (zeroNightSubPhase === "sheriff") {
        return {
          label: "Посадка (40с) 🪑",
          onClick: () => handleStartZeroNightTimer("seating")
        };
      }
      if (zeroNightSubPhase === "seating") {
        return {
          label: "Разбудить город 🌅",
          onClick: () => {
            setPhase("day_speeches");
            setCustomTimerLabel(null);
            playBeep(440, 0.2);
          }
        };
      }
    }
    
    if (phase === "day_speeches") {
      if (activeSpeakerSlot !== null) {
        return {
          label: `Завершить речь #${activeSpeakerSlot}`,
          onClick: () => markPlayerSpoken(activeSpeakerSlot)
        };
      }
      if (nextSpeaker) {
        return {
          label: `Речь #${nextSpeaker.slot_num} (${nextSpeaker.nickname || ""})`,
          onClick: handleStartNextSpeaker
        };
      }
      return {
        label: "К голосованию 🗳️",
        onClick: handleTransitionToVoting
      };
    }
    
    if (phase === "day_voting") {
      return {
        label: "Подсчитать голоса",
        onClick: handleResolveVoting
      };
    }
    
    if (phase === "shootout") {
      if (shootoutSubPhase === "shootout_intro") {
        return {
          label: "Запустить речи (30с) 🎙️",
          onClick: () => {
            setShootoutSubPhase("shootout_speeches");
            setShootoutSpeakerIndex(0);
            if (shootoutNominees.length > 0) {
              handleStartTimer(shootoutNominees[0], 30);
            }
          }
        };
      }
      if (shootoutSubPhase === "shootout_speeches") {
        const currentSlot = shootoutNominees[shootoutSpeakerIndex];
        const currentP = activePlayers.find(p => p.slot_num === currentSlot);
        const isSpeaking = activeSpeakerSlot === currentSlot;

        if (!isSpeaking) {
          return {
            label: `Речь 30с: #${currentSlot} ${currentP?.nickname || ""}`,
            onClick: () => handleStartTimer(currentSlot, 30)
          };
        }

        if (shootoutSpeakerIndex < shootoutNominees.length - 1) {
          const nextSlot = shootoutNominees[shootoutSpeakerIndex + 1];
          const nextP = activePlayers.find(p => p.slot_num === nextSlot);
          return {
            label: `След. речи 30с: #${nextSlot} ${nextP?.nickname || ""} →`,
            onClick: () => {
              setShootoutSpeakerIndex(i => i + 1);
              handleStartTimer(nextSlot, 30);
            }
          };
        } else {
          return {
            label: "Завершить речи → Переголосование 🗳️",
            onClick: () => {
              setActiveSpeakerSlot(null);
              setIsTimerRunning(false);
              setShootoutSubPhase("shootout_revote_intro");
            }
          };
        }
      }
      if (shootoutSubPhase === "shootout_revote_intro") {
        return {
          label: "Запустить переголосование 📊",
          onClick: () => {
            handleStartReVoting();
          }
        };
      }
      if (shootoutSubPhase === "shootout_revote_active") {
        return {
          label: "Итоги переголосования 🗳️",
          onClick: () => {
            const activeNomineeSlot = shootoutNominees[currentVotingNomineeIndex];
            const totalAlive = activePlayers.filter((p) => p.alive).length;
            const votesSoFar = shootoutNominees.reduce((sum, s) => sum + (votes[s] || 0), 0);
            const unusedVotes = totalAlive - votesSoFar;
            const currentNomineeVotes = Object.values(votesByPlayer).filter((v) => v === activeNomineeSlot).length;
            let finalVotes = { ...votes };
            if (unusedVotes > 0) {
              handleAllocateVotes(activeNomineeSlot, currentNomineeVotes + unusedVotes);
              finalVotes[activeNomineeSlot] = currentNomineeVotes + unusedVotes;
            }
            setShootoutSubPhase("shootout_revote_results");
          }
        };
      }
      if (shootoutSubPhase === "shootout_revote_results") {
        const pairs = shootoutNominees.map(s => ({ slot: s, count: votes[s] || 0 }));
        const maxVotes = Math.max(...pairs.map((p) => p.count), 0);
        const highest = pairs.filter((p) => p.count === maxVotes);

        if (highest.length === 1) {
          const candidateToLeave = highest[0].slot;
          return {
            label: `Подтвердить выбывание #${candidateToLeave} ⏹️`,
            onClick: () => handleResolveShootoutVotes("eliminate_one", candidateToLeave)
          };
        } else {
          return {
            label: "Опрос: Удалить обоих? 🤝",
            onClick: () => {
              setShootoutSubPhase("shootout_both_results");
              setBothLeaveVotes([]);
            }
          };
        }
      }
      if (shootoutSubPhase === "shootout_both_results") {
        const alivePlayers = activePlayers.filter((p) => p.alive);
        const majority = Math.floor(alivePlayers.length / 2) + 1;
        const votedYes = bothLeaveVotes.length;
        const majorityMet = votedYes >= majority;

        return {
          label: majorityMet ? "Удалить обоих игроков 🔨" : "Оставить всех за столом 🛡️",
          onClick: () => {
            if (majorityMet) {
              handleResolveShootoutVotes("eliminate_all");
            } else {
              handleResolveShootoutVotes("no_one_leaves");
            }
          }
        };
      }
    }
    
    if (phase === "night") {
      if (nightSubPhase === "intro") {
        return {
          label: "Далее: Стрельба Мафии",
          onClick: () => handleAdvanceNightSubPhase("shooting")
        };
      }
      if (nightSubPhase === "shooting") {
        return {
          label: "Далее: Проверка Дона",
          onClick: () => handleAdvanceNightSubPhase("don")
        };
      }
      if (nightSubPhase === "don") {
        return {
          label: "Далее: Проверка Шерифа",
          onClick: () => handleAdvanceNightSubPhase("sheriff")
        };
      }
      if (nightSubPhase === "sheriff") {
        const isFirstNight = roundNumber === 1;
        if (isFirstNight) {
          return {
            label: "Далее: Лучший ход",
            onClick: () => handleAdvanceNightSubPhase("best_move")
          };
        } else {
          return {
            label: "Далее: Итоги Ночи",
            onClick: () => handleAdvanceNightSubPhase("morning")
          };
        }
      }
      if (nightSubPhase === "best_move") {
        return {
          label: "Далее: Итоги Ночи",
          onClick: () => handleAdvanceNightSubPhase("morning")
        };
      }
      if (nightSubPhase === "morning") {
        return {
          label: "Утро! Начать новый день",
          onClick: handleResolveNight
        };
      }
    }
    
    return null;
  };

  const getPrevStepAction = () => {
    if (phase === "zero_night") {
      if (zeroNightSubPhase === "seating") {
        return {
          label: "Вызов шерифа",
          onClick: () => {
            setZeroNightSubPhase("sheriff");
            setCustomTimerLabel("Вызов шерифа");
            setTimerMax(10);
            setTimeLeft(10);
            setIsTimerRunning(false);
          }
        };
      }
      if (zeroNightSubPhase === "sheriff") {
        return {
          label: "Договорка мафии",
          onClick: () => {
            setZeroNightSubPhase("agreement");
            setCustomTimerLabel("Договорка мафии");
            setTimerMax(75);
            setTimeLeft(75);
            setIsTimerRunning(false);
          }
        };
      }
      return {
        label: "Настройка",
        onClick: () => {
          setPhase("setup");
          setZeroNightSubPhase(null);
          setCustomTimerLabel(null);
          setIsTimerRunning(false);
        }
      };
    }
    
    if (phase === "day_speeches") {
      if (activeSpeakerSlot !== null) {
        return {
          label: "Пауза",
          onClick: () => {
            setActiveSpeakerSlot(null);
            setIsTimerRunning(false);
          }
        };
      }
      const spokenPlayers = activePlayers.filter(p => p.alive && p.has_spoken_this_round);
      if (spokenPlayers.length > 0) {
        return {
          label: "Шаг назад по списку спикеров",
          onClick: () => {
            const order = [];
            const startSlot = ((roundNumber - 1) % 10) + 1;
            for (let i = 0; i < 10; i++) {
              const slotNum = ((startSlot - 1 + i) % 10) + 1;
              const p = activePlayers.find(pl => pl.slot_num === slotNum);
              if (p) order.push(p);
            }
            const spokenInOrder = order.filter(p => p.alive && p.has_spoken_this_round);
            if (spokenInOrder.length > 0) {
              const lastSpoken = spokenInOrder[spokenInOrder.length - 1];
              setActivePlayers(prev => prev.map(p => p.slot_num === lastSpoken.slot_num ? { ...p, has_spoken_this_round: false } : p));
              showToast(`Статус речи игрока #${lastSpoken.slot_num} возвращен`, "info");
            }
          }
        };
      }
      if (roundNumber > 1) {
        return {
          label: "Ночь",
          onClick: () => {
            setRoundNumber(r => r - 1);
            setPhase("night");
          }
        };
      } else {
        return {
          label: "Нулевая ночь",
          onClick: () => {
            setPhase("zero_night");
            setZeroNightSubPhase("seating");
            setCustomTimerLabel("Свободная посадка");
            setTimerMax(40);
            setTimeLeft(40);
            setIsTimerRunning(false);
          }
        };
      }
    }
    
    if (phase === "day_voting") {
      return {
        label: "Выступления",
        onClick: () => {
          setPhase("day_speeches");
        }
      };
    }
    
    if (phase === "shootout") {
      if (shootoutSubPhase === "shootout_both_results") {
        return {
          label: "К итогам перестрелки",
          onClick: () => setShootoutSubPhase("shootout_revote_results")
        };
      }
      if (shootoutSubPhase === "shootout_revote_results" || shootoutSubPhase === "shootout_revote_active") {
        return {
          label: "К речам 30с",
          onClick: () => {
            setShootoutSubPhase("shootout_speeches");
            setShootoutSpeakerIndex(0);
          }
        };
      }
      if (shootoutSubPhase === "shootout_speeches") {
        if (shootoutSpeakerIndex > 0) {
          return {
            label: `К речи #${shootoutNominees[shootoutSpeakerIndex - 1]}`,
            onClick: () => {
              setShootoutSpeakerIndex(i => i - 1);
              handleStartTimer(shootoutNominees[shootoutSpeakerIndex - 1], 30);
            }
          };
        }
        return {
          label: "Вводная автокатастрофы",
          onClick: () => setShootoutSubPhase("shootout_intro")
        };
      }
      return {
        label: "Голосование",
        onClick: () => setPhase("day_voting")
      };
    }
    
    if (phase === "night") {
      if (nightSubPhase === "shooting") {
        return {
          label: "Вводная",
          onClick: () => handleAdvanceNightSubPhase("intro")
        };
      }
      if (nightSubPhase === "don") {
        return {
          label: "Стрельба",
          onClick: () => handleAdvanceNightSubPhase("shooting")
        };
      }
      if (nightSubPhase === "sheriff") {
        return {
          label: "Дон",
          onClick: () => handleAdvanceNightSubPhase("don")
        };
      }
      if (nightSubPhase === "best_move") {
        return {
          label: "Шериф",
          onClick: () => handleAdvanceNightSubPhase("sheriff")
        };
      }
      if (nightSubPhase === "morning") {
        const isFirstNight = roundNumber === 1;
        return {
          label: isFirstNight ? "Лучший ход" : "Шериф",
          onClick: () => handleAdvanceNightSubPhase(isFirstNight ? "best_move" : "sheriff")
        };
      }
      return {
        label: "Голосование",
        onClick: () => {
          setPhase("day_voting");
        }
      };
    }
    
    return null;
  };

  const handleStartNextSpeaker = () => {
    if (!nextSpeaker) return;
    if (nextSpeaker.mute_this_round) {
      showToast(`Игрок #${nextSpeaker.slot_num} пропускает круг (молчание)!`, "warning");
      markPlayerSpoken(nextSpeaker.slot_num); return;
    }
    handleStartTimer(nextSpeaker.slot_num, 60);
  };

  const handleInteractiveAutoRemainder = () => {
    const currentRound = votingRounds[activeVotingRoundIndex];
    if (!currentRound) return;

    const nominatedSeats = currentRound.nominated_seats;
    const lastNominee = nominatedSeats[nominatedSeats.length - 1];
    if (!lastNominee) return;

    const alivePlayers = activePlayers.filter(p => p.alive);
    setVotesByPlayer((prev) => {
      const copy = { ...prev };
      alivePlayers.forEach((p) => {
        if (copy[p.slot_num] === undefined) {
          copy[p.slot_num] = lastNominee;
        }
      });
      
      updateCurrentRoundVotes(copy);
      return copy;
    });
    playBeep(523, 0.05);
    showToast("Оставшиеся голоса распределены за последнего кандидата!", "success");
  };

  const handleConfirmSingleElimination = (slotNum: number) => {
    saveSnapshot();
    setVotingRounds(prev => {
      const copy = [...prev];
      if (copy[activeVotingRoundIndex]) {
        copy[activeVotingRoundIndex] = {
          ...copy[activeVotingRoundIndex],
          outcome: 'single_eliminated',
          eliminated_seats: [slotNum]
        };
      }
      return copy;
    });

    eliminatePlayer(slotNum, `Голосование (День ${roundNumber})`, false);

    setNightLogs(prev => [...prev, {
      round: roundNumber,
      log: `Д${roundNumber}: Голосование. Стол покинул игрок #${slotNum} (${votes[slotNum] || 0} голосов).`
    }]);

    setVotingStage('resolved');
    startNightPhase();
  };

  const handleGoToRevoteSpeeches = (winners: number[]) => {
    setVotingRounds(prev => {
      const copy = [...prev];
      if (copy[activeVotingRoundIndex]) {
        copy[activeVotingRoundIndex] = {
          ...copy[activeVotingRoundIndex],
          outcome: 'tie_revote'
        };
      }
      return copy;
    });

    setNightLogs(prev => [...prev, {
      round: roundNumber,
      log: `Д${roundNumber}: Голосование. Ничья между игроками: ${winners.join(", ")} (${votes[winners[0]] || 0} голосов). Объявлена автокатастрофа.`
    }]);

    setVotingStage('revote_speeches');
    setRevoteSpeakerIndex(0);
    handleStartTimer(winners[0], 30);
  };

  const handleLaunchNextRevote = (winners: number[]) => {
    const currentRound = votingRounds[activeVotingRoundIndex];
    if (!currentRound) return;

    const nextRound = createNextRevoteRound(currentRound, winners);
    nextRound.round_number = votingRounds.length + 1;

    setVotingRounds(prev => [...prev, nextRound]);
    setActiveVotingRoundIndex(votingRounds.length);
    setVotesByPlayer({});
    setIsInteractiveVoting(true);
    setVotingStage('collecting');
    
    selectVotingNomineeIndex(0, winners);

    setNightLogs(prev => [...prev, {
      round: roundNumber,
      log: `Д${roundNumber}: Автокатастрофа. Запущено повторное голосование между ${winners.map(n => `#${n}`).join(", ")}`
    }]);
  };

  const handleConfirmAutoNoElimination = () => {
    setVotingRounds(prev => {
      const copy = [...prev];
      if (copy[activeVotingRoundIndex]) {
        copy[activeVotingRoundIndex] = {
          ...copy[activeVotingRoundIndex],
          outcome: 'no_elimination',
          eliminated_seats: []
        };
      }
      return copy;
    });

    setNightLogs(prev => [...prev, {
      round: roundNumber,
      log: `Д${roundNumber}: Автокатастрофа. Спорных игроков больше половины стола — никто не покидает стол.`
    }]);

    setVotingStage('resolved');
    startNightPhase();
  };

  const handleConfirmTableDecision = (leavesTable: boolean, winners: number[]) => {
    saveSnapshot();

    const votesCount = tableLeaveVotesInput ?? 0;

    setVotingRounds(prev => {
      const copy = [...prev];
      if (copy[activeVotingRoundIndex]) {
        copy[activeVotingRoundIndex] = {
          ...copy[activeVotingRoundIndex],
          outcome: leavesTable ? 'all_tied_eliminated' : 'no_elimination',
          eliminated_seats: leavesTable ? [...winners] : [],
          table_leave_votes: votesCount
        };
      }
      return copy;
    });

    if (leavesTable) {
      winners.forEach(s => {
        eliminatePlayer(s, `Автокатастрофа (День ${roundNumber})`, true);
      });

      setNightLogs(prev => [...prev, {
        round: roundNumber,
        log: `Д${roundNumber}: Автокатастрофа. Решение стола за уход всех спорных игроков: ${votesCount} голосов. Игроки ${winners.map(n => `#${n}`).join(", ")} покидают стол.`
      }]);
    } else {
      setNightLogs(prev => [...prev, {
        round: roundNumber,
        log: `Д${roundNumber}: Автокатастрофа. Решение стола против ухода всех спорных игроков: ${votesCount} голосов. Никто не покидает стол.`
      }]);
    }

    setVotingStage('resolved');
    startNightPhase();
  };

  const handleResolveShootoutVotes = (act: "eliminate_one" | "eliminate_all" | "no_one_leaves", slot?: number) => {
    // Keep legacy stub to prevent compilation errors
  };

  const handleStartReVoting = () => {
    // Keep legacy stub to prevent compilation errors
  };

  const handleAutoFillSetupPlayers = () => {
    setActivePlayers((prev) => {
      const updated = [...prev];
      for (let i = 0; i < 10; i++) {
        const p = players[i];
        if (p) {
          updated[i] = {
            ...updated[i],
            user_id: p.user_id,
            nickname: p.nickname,
          };
        }
      }
      return updated;
    });
    showToast("Игроки автозаполнены!", "success");
  };

  const handleAutoFillSetupRoles = () => {
    const roles: ("Мирный" | "Шериф" | "Мафия" | "Дон")[] = [
      "Мирный", "Мирный", "Мирный", "Мирный", "Мирный", "Мирный",
      "Шериф",
      "Мафия", "Мафия",
      "Дон"
    ];
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    setActivePlayers((prev) =>
      prev.map((s, idx) => {
        const role = roles[idx];
        const team = (role === "Мирный" || role === "Шериф") ? "Красные" : "Чёрные";
        return { ...s, role, team };
      })
    );
    showToast("Роли распределены случайно по ФСМ!", "success");
  };

  const handleSelectSetupPlayer = (slotNum: number, userId: number) => {
    const p = players.find((pl) => pl.user_id === userId);
    setActivePlayers((prev) => prev.map((s) => s.slot_num === slotNum ? { ...s, user_id: userId, nickname: p ? p.nickname : "" } : s));
  };

  const handleSelectSetupRole = (slotNum: number, role: "Мирный" | "Шериф" | "Мафия" | "Дон") => {
    const team = (role === "Мирный" || role === "Шериф") ? "Красные" : "Чёрные";
    setActivePlayers((prev) => prev.map((s) => s.slot_num === slotNum ? { ...s, role, team } : s));
  };

  const validateSetupAndStart = () => {
    if (!judgeId) { showToast("Выберите Судью Вечера!", "error"); return; }
    if (activePlayers.some((p) => !p.user_id)) { showToast("Заполните всех 10 игроков!", "error"); return; }
    const counts = { "Мирный": 0, "Шериф": 0, "Мафия": 0, "Дон": 0 };
    activePlayers.forEach((p) => counts[p.role]++);

    const start = () => setPhase("zero_night");
    if (counts["Мирный"] !== 6 || counts["Шериф"] !== 1 || counts["Мафия"] !== 2 || counts["Дон"] !== 1) {
      setConfirmDialog({ message: "Распределение отличается от ФСМ (6М, 1Ш, 2Маф, 1Дон). Продолжить?", onConfirm: start });
    } else start();
  };

  const handleFoulChange = (slotNum: number, direction: "up" | "down") => {
    saveSnapshot();
    setActivePlayers((prev) => prev.map((p) => {
      if (p.slot_num === slotNum) {
        let current = p.fouls;
        if (direction === "up" && current < 4) current++;
        if (direction === "down" && current > 0) current--;

        let alive = p.alive; let status_reason = p.eliminated_phase;
        let hasPenalty = p.has_foul_penalty;
        
        if (current === 3 && p.fouls < 3) {
          hasPenalty = true;
          showToast(`Игрок #${slotNum} получил 3-й фол: штраф 30 секунд на ближайшую речь!`, "warning");
        } else if (current < 3) {
          hasPenalty = false;
        }

        if (current === 4) {
          alive = false; status_reason = `Фолы (День ${roundNumber})`; playBeep(220, 0.8);
          showToast(`Игрок #${slotNum} дисквалифицирован за 4 фола!`, "error");
        } else if (p.fouls === 4 && current < 4) { alive = true; status_reason = ""; }

        return { ...p, fouls: current, alive, has_foul_penalty: hasPenalty, mute_this_round: false, eliminated_phase: status_reason };
      }
      return p;
    }));
  };

  const handleNominateCandidate = (slotNum: number, manualNominatorSlot?: number) => {
    saveSnapshot();
    if (nominations.includes(slotNum)) {
      setNominations((prev) => prev.filter((n) => n !== slotNum));
      setNominationsMap((prev) => {
        const copy = { ...prev };
        delete copy[slotNum];
        return copy;
      });
      showToast(`Игрок #${slotNum} снят с голосования`, "info");
    } else {
      let nominatorSlot = 0; // 0 represents Moderator (Ведущий)
      if (activeSpeakerSlot !== null) {
        nominatorSlot = activeSpeakerSlot;
        
        // Enforce max 1 nomination during speaker's speech
        const alreadyNominated = Object.values(nominationsMap).includes(activeSpeakerSlot);
        if (alreadyNominated) {
          showToast(`Игрок #${activeSpeakerSlot} уже выставил кандидата в свою минуту!`, "warning");
          return;
        }
      } else if (manualNominatorSlot !== undefined) {
        nominatorSlot = manualNominatorSlot;
      }
      
      setNominations((prev) => [...prev, slotNum]);
      setNominationsMap((prev) => ({ ...prev, [slotNum]: nominatorSlot }));
      playBeep(659, 0.1);
      if (nominatorSlot > 0) {
        showToast(`Игрок #${nominatorSlot} выставил игрока #${slotNum}!`, "success");
      } else {
        showToast(`Ведущий выставил игрока #${slotNum}!`, "success");
      }
    }
  };

  const updateCurrentRoundVotes = (newVotesByPlayer: Record<number, number>) => {
    const currentRound = votingRounds[activeVotingRoundIndex];
    if (!currentRound) return;

    const nominatedSeats = currentRound.nominated_seats;
    const alivePlayers = activePlayers.filter(p => p.alive).map(p => p.slot_num);

    // Calculate explicit counts
    const explicitCounts: Record<number, number> = {};
    nominatedSeats.forEach(s => { explicitCounts[s] = 0; });

    Object.entries(newVotesByPlayer).forEach(([voterStr, nomineeSlot]) => {
      const voter = parseInt(voterStr);
      if (alivePlayers.includes(voter) && nominatedSeats.includes(nomineeSlot)) {
        explicitCounts[nomineeSlot]++;
      }
    });

    const finalCounts = calculateVoteRemainder(
      nominatedSeats,
      currentRound.eligible_voters ?? alivePlayers.length,
      explicitCounts
    );

    // Update state variables: `votes`
    setVotes(finalCounts);

    // Update the round itself inside `votingRounds` list
    setVotingRounds(prev => {
      const copy = [...prev];
      if (copy[activeVotingRoundIndex]) {
        copy[activeVotingRoundIndex] = {
          ...copy[activeVotingRoundIndex],
          vote_counts: finalCounts
        };
      }
      return copy;
    });
  };

  const handleInteractiveVoteToggle = (voterSlot: number) => {
    const currentRound = votingRounds[activeVotingRoundIndex];
    if (!currentRound) return;

    const nominatedSeats = currentRound.nominated_seats;
    const currentNominee = nominatedSeats[currentVotingNomineeIndex];
    if (!currentNominee) return;

    const lastNominee = nominatedSeats[nominatedSeats.length - 1];

    const alreadyVotedNominee = votesByPlayer[voterSlot];
    if (alreadyVotedNominee && alreadyVotedNominee !== currentNominee && alreadyVotedNominee !== lastNominee) {
      const nomineeIndex = nominatedSeats.indexOf(alreadyVotedNominee);
      showToast(`Игрок #${voterSlot} уже проголосовал против #${alreadyVotedNominee} (Кандидат №${nomineeIndex + 1})!`, "warning");
      return;
    }

    setVotesByPlayer((prev) => {
      const copy = { ...prev };
      
      if (copy[voterSlot] === currentNominee) {
        delete copy[voterSlot];
      } else {
        copy[voterSlot] = currentNominee;
      }

      // Clear any dead players
      const alivePlayers = activePlayers.filter(p => p.alive).map(p => p.slot_num);
      Object.keys(copy).forEach((slotStr) => {
        const slot = parseInt(slotStr);
        if (!alivePlayers.includes(slot)) {
          delete copy[slot];
        }
      });

      updateCurrentRoundVotes(copy);
      return copy;
    });
    playBeep(523, 0.05);
  };

  const markPlayerSpoken = (slotNum: number) => {
    setActivePlayers((prev) => prev.map((p) => p.slot_num === slotNum ? { ...p, has_spoken_this_round: true } : p));
    setActiveSpeakerSlot(null); setIsTimerRunning(false);
  };

  const handleTransitionToVoting = () => {
    if (nominations.length === 0) {
      showToast("Нет кандидатов. Переходим в Ночь.", "info"); startNightPhase(); return;
    }
    const initialRound: VotingRound = {
      round_number: 1,
      is_revote: false,
      nominated_seats: [...nominations],
      vote_counts: nominations.reduce<Record<number, number>>((acc, s) => { acc[s] = 0; return acc; }, {}),
      day_number: roundNumber,
      eligible_voters: activePlayers.filter(p => p.alive).length,
      parent_round_number: null,
      outcome: 'pending',
      eliminated_seats: [],
      table_leave_votes: null
    };

    setVotingRounds([initialRound]);
    setActiveVotingRoundIndex(0);
    setVotesByPlayer({});
    setIsInteractiveVoting(true);
    setVotingStage('collecting');
    setPhase("day_voting");
    setVotingSubPhase("voting_intro");
    setBothLeaveVotes([]);
    selectVotingNomineeIndex(0, nominations);
  };

  const handleAllocateVotes = (nominee: number, count: number) => {
    const currentRound = votingRounds[activeVotingRoundIndex];
    if (!currentRound) return;

    const nominatedSeats = currentRound.nominated_seats;
    const lastNominee = nominatedSeats[nominatedSeats.length - 1];
    const totalAlive = currentRound.eligible_voters ?? activePlayers.filter((p) => p.alive).length;

    setVotes((prev) => {
      const copy = { ...prev };
      
      if (lastNominee && nominee !== lastNominee) {
        const otherAllocated = Object.entries(copy)
          .filter(([s]) => {
            const slot = parseInt(s);
            return slot !== nominee && slot !== lastNominee;
          })
          .reduce((a, [, v]) => a + v, 0);

        const newCount = Math.max(0, Math.min(count, totalAlive - otherAllocated));
        copy[nominee] = newCount;
        copy[lastNominee] = Math.max(0, totalAlive - otherAllocated - newCount);
      } else {
        const currentAllocated = Object.entries(copy)
          .filter(([s]) => parseInt(s) !== nominee)
          .reduce((a, [, v]) => a + v, 0);
        const maxAllowed = totalAlive - currentAllocated;
        copy[nominee] = Math.max(0, Math.min(count, maxAllowed));
      }

      setVotingRounds(prevRounds => {
        const copyRounds = [...prevRounds];
        if (copyRounds[activeVotingRoundIndex]) {
          copyRounds[copyRounds.length - 1] = {
            ...copyRounds[copyRounds.length - 1],
            vote_counts: copy
          };
        }
        return copyRounds;
      });

      return copy;
    });
  };

  const handleResolveVoting = () => {
    const currentRound = votingRounds[activeVotingRoundIndex];
    if (!currentRound) return;

    const result = determineVotingResult(currentRound);

    const goResolve = () => {
      setVotingStage('round_result');
    };

    if (result.outcome === 'pending') {
      showToast(result.description, "warning");
      return;
    }

    goResolve();
  };

  const handleCompleteShootout = (action: "leave_all" | "leave_none" | "leave_one", singleSlot?: number) => {
    // Keep legacy signature as stub to prevent external breakage
  };

  const getExitReason = (reason: string, rNum: number): 'killed' | 'voted_zero_round' | 'voted_day' | 'removed' => {
    const r = reason.toLowerCase();
    if (r.includes("убит ночью") || r.includes("убит")) return 'killed';
    if (r.includes("голосование") || r.includes("автокатастрофа")) {
      return rNum === 1 ? 'voted_zero_round' : 'voted_day';
    }
    if (r.includes("дисквалификация") || r.includes("удален") || r.includes("фолы") || r.includes("ппк")) {
      return 'removed';
    }
    return 'voted_day';
  };

  const eliminatePlayer = (slotNum: number, reason: string, isMultipleElimination: boolean = false) => {
    saveSnapshot();
    const player = activePlayers.find((p) => p.slot_num === slotNum);
    if (!player) return;
    let isFirst = false;

    const extReason = getExitReason(reason, roundNumber);

    setActivePlayers((prev) => {
      const alreadyKilled = prev.some((p) => p.is_pu);
      isFirst = !alreadyKilled;
      return prev.map((p) =>
        p.slot_num === slotNum
          ? { ...p, alive: false, eliminated_phase: reason, is_pu: isFirst, exit_reason: extReason }
          : p
      );
    });

    showToast(`Игрок #${slotNum} (${player.nickname}) покидает стол!`, "info");
    handleStartTimer(slotNum, 60);

    // Update protocol markers and trigger Best Move step if eligible
    let updatedMarkers = { ...protocolMarkers };
    let showBmStep = false;
    let bmSource: BestMoveSource = "first_killed";

    if (extReason === "killed") {
      if (protocolMarkers.firstKilledSlot === null) {
        updatedMarkers = registerFirstKilled(protocolMarkers, slotNum);
        showBmStep = true;
        bmSource = "first_killed";
      }
    } else if (extReason === "voted_zero_round" && !isMultipleElimination) {
      if (protocolMarkers.zeroRoundVotedSlot === null) {
        updatedMarkers = registerZeroRoundVoted(protocolMarkers, slotNum);
        showBmStep = true;
        bmSource = "zero_round_voted";
      }
    }

    setProtocolMarkers(updatedMarkers);

    if (showBmStep) {
      setActiveBestMoveSource(bmSource);
      setActiveBestMoveSlot(slotNum);
      setPendingBestMoveSeats([]);
    } else {
      const alreadyKilled = activePlayers.some((p) => p.is_pu);
      if (!alreadyKilled && player.team === "Красные" && !reason.includes("Ночь 1")) {
        setBestMovePlayerSlot(slotNum); setBestMoveGuesses([]);
      }
    }
  };

  const handleSeatClick = (slotNum: number) => {
    const player = activePlayers.find(p => p.slot_num === slotNum);
    if (!player) return;

    if (phase === "night") {
      if (!player.alive) {
        showToast("Этот игрок уже мертв!", "warning");
        return;
      }
      if (nightSubPhase === "shooting") {
        setShotPlayerSlot(p => p === slotNum ? null : slotNum);
        playBeep(440, 0.15);
      } else if (nightSubPhase === "don") {
        setDonCheckSlot(p => p === slotNum ? null : slotNum);
        const isSheriff = player.role === "Шериф";
        setDonCheckResult(isSheriff);
        playBeep(523, 0.15);
      } else if (nightSubPhase === "sheriff") {
        setSheriffCheckSlot(p => p === slotNum ? null : slotNum);
        const isBlack = player.team === "Чёрные";
        setSheriffCheckResult(isBlack ? "ЧЁРНЫЙ!" : "Красный");
        playBeep(587, 0.15);
      } else if (nightSubPhase === "best_move") {
        setBestMoveGuesses(prev => {
          if (prev.includes(slotNum)) {
            return prev.filter(g => g !== slotNum);
          }
          if (prev.length < 3) {
            return [...prev, slotNum];
          }
          return prev;
        });
        playBeep(659, 0.1);
      } else {
        showToast("Ночные действия сейчас недоступны", "info");
      }
      return;
    }

    if (isMobile) {
      // In active voting/shootout, keep direct click, otherwise open bottom actions sheet
      const isVotingPhase = phase === "day_voting";
      const isShootoutVoting = phase === "shootout" && (shootoutSubPhase === "shootout_revote_active" || shootoutSubPhase === "shootout_both_results");
      
      if (isVotingPhase || isShootoutVoting) {
        if (!player.alive) return;
        if (phase === "shootout" && shootoutSubPhase === "shootout_both_results") {
          setBothLeaveVotes((prev) =>
            prev.includes(slotNum) ? prev.filter((s) => s !== slotNum) : [...prev, slotNum]
          );
          playBeep(659, 0.1);
          return;
        }
        if (isInteractiveVoting) {
          handleInteractiveVoteToggle(slotNum);
        } else {
          if (nominations.includes(slotNum)) {
            const count = votes[slotNum] || 0;
            handleAllocateVotes(slotNum, count + 1);
            playBeep(659, 0.1);
          }
        }
      } else {
        setSelectedMobileSlot(slotNum);
      }
      return;
    }

    // Default desktop flow
    if (phase === "day_speeches") {
      if (!player.alive) {
        showToast("Этот игрок мертв и не может выступать!", "warning");
        return;
      }
      if (activeSpeakerSlot === slotNum) {
        markPlayerSpoken(slotNum);
      } else {
        handleStartTimer(slotNum, player.mute_this_round ? 0 : 60);
      }
    } else if (phase === "day_voting") {
      if (!player.alive) return;
      if (isInteractiveVoting) {
        handleInteractiveVoteToggle(slotNum);
      } else {
        if (nominations.includes(slotNum)) {
          const count = votes[slotNum] || 0;
          handleAllocateVotes(slotNum, count + 1);
          playBeep(659, 0.1);
        } else {
          showToast(`Игрок #${slotNum} не выставлен на голосование!`, "info");
        }
      }
    } else if (phase === "shootout") {
      if (!player.alive) return;
      if (shootoutSubPhase === "shootout_intro" || shootoutSubPhase === "shootout_speeches") {
        if (shootoutNominees.includes(slotNum)) {
          setShootoutSubPhase("shootout_speeches");
          const idx = shootoutNominees.indexOf(slotNum);
          if (idx !== -1) setShootoutSpeakerIndex(idx);
          handleStartTimer(slotNum, 30);
          playBeep(523, 0.1);
        } else {
          showToast(`Игрок #${slotNum} не находится в перестрелке!`, "info");
        }
      } else if (shootoutSubPhase === "shootout_revote_active") {
        handleInteractiveVoteToggle(slotNum);
      } else if (shootoutSubPhase === "shootout_both_results") {
        setBothLeaveVotes((prev) =>
          prev.includes(slotNum) ? prev.filter((s) => s !== slotNum) : [...prev, slotNum]
        );
        playBeep(659, 0.1);
      }
    }
  };

  const handleAdvanceNightSubPhase = (nextSub: "intro" | "shooting" | "don" | "sheriff" | "best_move" | "morning") => {
    setNightSubPhase(nextSub);
    let duration = 15;
    let label = "";
    if (nextSub === "intro") {
      duration = 15;
      label = "Запуск ночи";
    } else if (nextSub === "shooting") {
      duration = 15;
      label = "Стрельба Мафии";
    } else if (nextSub === "don") {
      duration = 15;
      label = "Проверка Дона";
    } else if (nextSub === "sheriff") {
      duration = 15;
      label = "Проверка Шерифа";
    } else if (nextSub === "best_move") {
      duration = 20;
      label = "Лучший ход";
    } else if (nextSub === "morning") {
      setIsTimerRunning(false);
      setCustomTimerLabel(null);
      return;
    }

    setCustomTimerLabel(label);
    setTimerMax(duration);
    setTimeLeft(duration);
    setIsTimerRunning(true);
    playBeep(523.25, 0.1);
  };

  const startNightPhase = () => {
    setNominations([]);
    setNominationsMap({});
    setHideBestMoveGlow(false);
    setVotingAttempt(1);
    setActivePlayers(prev => prev.map(p => ({ ...p, nominated_this_round: false, has_spoken_this_round: false, mute_this_round: false })));
    setPhase("night");
    setNightSubPhase("intro");
    setShotPlayerSlot(null);
    setDonCheckSlot(null);
    setDonCheckResult(null);
    setSheriffCheckSlot(null);
    setSheriffCheckResult(null);
    setBestMoveGuesses([]);
    setCustomTimerLabel("Запуск ночи");
    setTimerMax(15);
    setTimeLeft(15);
    setIsTimerRunning(true);
  };

  const handleResolveNight = () => {
    const logs: string[] = [];
    if (shotPlayerSlot) {
      const p = activePlayers.find(pl => pl.slot_num === shotPlayerSlot);
      if (p && p.alive) {
        eliminatePlayer(shotPlayerSlot, `Убит ночью (Ночь ${roundNumber})`);
        logs.push(`Выстрел в #${shotPlayerSlot} -> Убит.`);
        if (roundNumber === 1 && bestMoveGuesses.length === 3) {
          setActivePlayers(prev => prev.map(pl => pl.slot_num === shotPlayerSlot ? { ...pl, best_move_guesses: bestMoveGuesses } : pl));
          logs.push(`Лучший ход #${shotPlayerSlot}: ${bestMoveGuesses.join(", ")}`);
        }
      } else logs.push(`Выстрел в #${shotPlayerSlot} -> Промах.`);
    } else logs.push("Промах мафии.");

    if (donCheckSlot) {
      const p = activePlayers.find(pl => pl.slot_num === donCheckSlot);
      if (p) logs.push(`Дон проверил #${donCheckSlot} -> ${p.role === "Шериф" ? "Шериф!" : "Не шериф"}`);
    }
    if (sheriffCheckSlot) {
      const p = activePlayers.find(pl => pl.slot_num === sheriffCheckSlot);
      if (p) logs.push(`Шериф проверил #${sheriffCheckSlot} -> ${p.team === "Чёрные" ? "ЧЁРНЫЙ!" : "Красный"}`);
    }

    setNightLogs(prev => [...prev, { round: roundNumber, log: logs.join(" | ") }]);
    setRoundNumber(r => r + 1); setPhase("day_speeches");
    showToast("Наступило утро! Город просыпается.", "success");
  };

  const handleUndoLastLog = () => {
    if (nightLogs.length === 0) return;
    setNightLogs((prev) => prev.slice(0, -1));
    showToast("Последняя запись протокола отменена", "info");
  };

  const handleEndGameWithWinner = (winner: "Красные" | "Чёрные") => {
    // Validation Guardrails
    if (judgeId <= 0) {
      showToast("Укажите ведущего/судью вечера перед сохранением!", "warning");
      return;
    }

    const emptySlots = activePlayers.filter(p => !p.nickname || p.user_id === 0);
    if (emptySlots.length > 0) {
      if (!confirm(`Внимание! ${emptySlots.length} мест за столом незаполнены. Все равно завершить игру и сохранить протокол?`)) {
        return;
      }
    }

    const assignedUserIds = activePlayers.map(p => p.user_id).filter(id => id > 0);
    const hasDuplicates = new Set(assignedUserIds).size !== assignedUserIds.length;
    if (hasDuplicates) {
      showToast("Ошибка: один и тот же игрок посажен на несколько мест!", "error");
      return;
    }

    const sheriffs = activePlayers.filter(p => p.role === "Шериф").length;
    const dons = activePlayers.filter(p => p.role === "Дон").length;
    const mafs = activePlayers.filter(p => p.role === "Мафия").length;
    if (sheriffs !== 1 || dons !== 1 || mafs !== 2) {
      if (!confirm(`Внимание: распределение ролей отличается от стандарта ФСМ (1 Шериф, 1 Дон, 2 Мафии). Текущее: ${sheriffs} Шер, ${dons} Дон, ${mafs} Маф. Завершить?`)) {
        return;
      }
    }

    const slotsToSubmit: GameSlot[] = activePlayers.map((p) => {
      return {
        slot_num: p.slot_num, user_id: p.user_id, nickname: p.nickname, role: p.role, team: p.team,
        bonus_points: p.bonus_points, lh_points: p.lh_points, will_protocol_points: p.will_protocol_points,
        will_opinion_points: p.will_opinion_points, dc_points: p.dc_points, kick: p.kick || p.eliminated_phase.includes("Фолы"),
        ppk: p.ppk || p.eliminated_phase.includes("ППК"), fouls: p.fouls, pu: p.is_pu, alive: p.alive,
        status_reason: p.alive ? "Жив" : p.eliminated_phase || "Убит", base_points: 0, elo_change: 0,
        exit_reason: p.exit_reason || (p.alive ? "alive" : getExitReason(p.eliminated_phase || "Убит", roundNumber))
      } as any;
    });

    onGameFinished({
      winning_team: winner,
      protocol_text: `Спортивная игра ФСМ. Победили ${winner}.${protocolNotes.trim() ? " Примечания: " + protocolNotes.trim() : ""}`,
      slots: slotsToSubmit,
      judge_id: judgeId,
      protocol_markers: protocolMarkers
    } as any);
  };

  const getSeatColor = (slotNum: number) => {
    const colors: { [key: number]: string } = {
      1: "bg-blue-600 text-white border-blue-500",
      2: "bg-amber-600 text-white border-amber-500",
      3: "bg-yellow-500 text-slate-950 border-yellow-400",
      4: "bg-rose-600 text-white border-rose-500",
      5: "bg-teal-600 text-white border-teal-500",
      6: "bg-cyan-600 text-white border-cyan-500",
      7: "bg-pink-600 text-white border-pink-500",
      8: "bg-purple-600 text-white border-purple-500",
      9: "bg-amber-800 text-white border-amber-700",
      10: "bg-lime-600 text-slate-950 border-lime-500",
    };
    return colors[slotNum] || "bg-slate-700 text-white border-slate-600";
  };

  const renderVirtualTable = () => {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-4 max-w-7xl mx-auto w-full px-1 py-1" id="virtual-table-grid">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((slotNum) => (
          <SeatCard
            key={slotNum}
            slotNum={slotNum}
            activePlayers={activePlayers}
            setActivePlayers={setActivePlayers}
            activeSpeakerSlot={activeSpeakerSlot}
            setActiveSpeakerSlot={setActiveSpeakerSlot}
            nominations={nominations}
            phase={phase}
            shotPlayerSlot={shotPlayerSlot}
            donCheckSlot={donCheckSlot}
            sheriffCheckSlot={sheriffCheckSlot}
            bestMoveGuesses={bestMoveGuesses}
            hideBestMoveGlow={hideBestMoveGlow}
            nominationsMap={nominationsMap}
            setNominationsMap={setNominationsMap}
            showToast={showToast}
            playBeep={playBeep}
            votes={votes}
            handleAllocateVotes={handleAllocateVotes}
            showRolesOnTable={showRolesOnTable}
            shootoutNominees={shootoutNominees}
            isTimerRunning={isTimerRunning}
            setIsTimerRunning={setIsTimerRunning}
            timeLeft={timeLeft}
            handleStartTimer={handleStartTimer}
            handleNominateCandidate={handleNominateCandidate}
            handleSeatClick={handleSeatClick}
            handleFoulChange={handleFoulChange}
            markPlayerSpoken={markPlayerSpoken}
            setBestMovePlayerSlot={setBestMovePlayerSlot}
            setBestMoveGuesses={setBestMoveGuesses}
            nightSubPhase={nightSubPhase}
            roundNumber={roundNumber}
            getSeatColor={getSeatColor}
            votesByPlayer={votesByPlayer}
            currentVotingNomineeIndex={currentVotingNomineeIndex}
            isInteractiveVoting={isInteractiveVoting}
            votingSubPhase={votingSubPhase}
            shootoutSubPhase={shootoutSubPhase}
            bothLeaveVotes={bothLeaveVotes}
          />
        ))}
        <CenterPanel
          phase={phase}
          roundNumber={roundNumber}
          nominations={nominations}
          activePlayers={activePlayers}
          nextSpeaker={nextSpeaker}
          handleStartNextSpeaker={handleStartNextSpeaker}
          handleTransitionToVoting={handleTransitionToVoting}
          activeSpeakerSlot={activeSpeakerSlot}
          timeLeft={timeLeft}
          setTimeLeft={setTimeLeft}
          zeroNightSubPhase={zeroNightSubPhase}
          customTimerLabel={customTimerLabel}
          isTimerRunning={isTimerRunning}
          setIsTimerRunning={setIsTimerRunning}
          setActiveSpeakerSlot={setActiveSpeakerSlot}
          markPlayerSpoken={markPlayerSpoken}
          votes={votes}
          votesByPlayer={votesByPlayer}
          isInteractiveVoting={isInteractiveVoting}
          setIsInteractiveVoting={setIsInteractiveVoting}
          currentVotingNomineeIndex={currentVotingNomineeIndex}
          selectVotingNomineeIndex={selectVotingNomineeIndex}
          handleInteractiveAutoRemainder={handleInteractiveAutoRemainder}
          handleAllocateVotes={handleAllocateVotes}
          handleResolveVoting={handleResolveVoting}
          shootoutNominees={shootoutNominees}
          votingAttempt={votingAttempt}
          handleStartReVoting={handleStartReVoting}
          handleResolveShootoutVotes={handleResolveShootoutVotes}
          nightSubPhase={nightSubPhase}
          shotPlayerSlot={shotPlayerSlot}
          donCheckSlot={donCheckSlot}
          donCheckResult={donCheckResult}
          sheriffCheckSlot={sheriffCheckSlot}
          sheriffCheckResult={sheriffCheckResult}
          bestMoveGuesses={bestMoveGuesses}
          getSeatColor={(p) => getSeatColor(p.slot_num)}
          getPrevStepAction={getPrevStepAction}
          getNextStepInfo={getNextStepInfo}
          timerMax={timerMax}
          handleAdjustTime={handleAdjustTime}
          handleStartZeroNightTimer={handleStartZeroNightTimer}
          votingSubPhase={votingSubPhase}
          setVotingSubPhase={setVotingSubPhase}
          shootoutSubPhase={shootoutSubPhase}
          setShootoutSubPhase={setShootoutSubPhase}
          bothLeaveVotes={bothLeaveVotes}
          setBothLeaveVotes={setBothLeaveVotes}
          addLogEntry={(logText: string) => setNightLogs(prev => [...prev, { round: roundNumber, log: logText }])}
          onCancel={onCancel}
          handleAdvanceNightSubPhase={handleAdvanceNightSubPhase}
        />
      </div>
    );
  };

  const renderViewToggle = () => {
    return (
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center bg-slate-900/60 p-3 border border-slate-800/80 rounded-2xl gap-3">
        <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider pl-1 flex items-center gap-1.5 justify-center sm:justify-start">
          <Shield className="w-3.5 h-3.5 text-rose-500 animate-pulse" /> Панель судейского пульта ФСМ
        </span>
        <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
          <button
            type="button"
            onClick={handleUndoAction}
            disabled={historyStack.length === 0}
            className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-amber-950/60 hover:bg-amber-900 border border-amber-800/60 text-amber-300 disabled:opacity-40 transition-all flex items-center gap-1.5 cursor-pointer"
            title="Отменить последнее действие ведущего (фол, выставление, удаление)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Отмена ({historyStack.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowRolesOnTable(!showRolesOnTable)}
            className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-all flex items-center gap-1.5 cursor-pointer"
            title={showRolesOnTable ? "Скрыть роли на столе (для трансляции)" : "Показать роли игроков"}
          >
            {showRolesOnTable ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                <span>Скрыть Роли</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span>Показать Роли</span>
              </>
            )}
          </button>

          <div className="h-7 w-[1px] bg-slate-800 self-center hidden sm:block" />

          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer border ${
              viewMode === "table" 
                ? "bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-600/15 font-black" 
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            🟢 Схема стола
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer border ${
              viewMode === "list" 
                ? "bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-600/15 font-black" 
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            📋 Список карт
          </button>
        </div>
      </div>
    );
  };

  const winTeam = (() => {
    const alive = activePlayers.filter(p => p.alive);
    const red = alive.filter(p => p.team === "Красные").length;
    const black = alive.filter(p => p.team === "Чёрные").length;
    return black === 0 ? "Красные" : black >= red ? "Чёрные" : null;
  })();

  useEffect(() => {
    if (phase !== "setup" && winTeam !== null) {
      showToast(`Игра автоматически завершена! Победили: ${winTeam}`, "success");
    }
  }, [activePlayers, phase]);

  const renderMobileActionSheet = () => {
    if (selectedMobileSlot === null) return null;
    const slotNum = selectedMobileSlot;
    const p = activePlayers.find(pl => pl.slot_num === slotNum);
    if (!p) return null;

    const isSpeaking = activeSpeakerSlot === slotNum;
    const isNominated = nominations.includes(slotNum);
    const hasSpoken = p.has_spoken_this_round;

    // Role colors and borders for styling the sheet header
    const roleThemeColors = {
      "Мирный": { text: "text-rose-500", bg: "bg-rose-950/20", border: "border-rose-900/30", label: "Красный (Мирный)", icon: "❤️" },
      "Шериф": { text: "text-emerald-500", bg: "bg-emerald-950/20", border: "border-emerald-900/30", label: "Шериф", icon: "⭐" },
      "Мафия": { text: "text-slate-300", bg: "bg-slate-900/30", border: "border-slate-800/60", label: "Мафия", icon: "🎩" },
      "Дон": { text: "text-purple-500", bg: "bg-purple-950/20", border: "border-purple-900/30", label: "Дон", icon: "🕵️" },
    };
    const theme = roleThemeColors[p.role] || roleThemeColors["Мирный"];

    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 backdrop-blur-sm transition-opacity duration-300">
        <div 
          className="absolute inset-0 cursor-pointer" 
          onClick={() => setSelectedMobileSlot(null)} 
        />
        <div className="relative w-full max-w-lg bg-slate-900 border-t border-slate-800 rounded-t-3xl p-6 shadow-2xl flex flex-col gap-4 animate-slide-up max-h-[90vh] overflow-y-auto">
          {/* Draggable indicator looking bar */}
          <div className="w-12 h-1.5 bg-slate-800 rounded-full mx-auto -mt-2 mb-2 shrink-0" />

          {/* Header section with current info */}
          <div className="flex items-center justify-between border-b border-slate-800/60 pb-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl font-mono font-black text-lg flex items-center justify-center border-2 ${getSeatColor(slotNum)}`}>
                {slotNum}
              </div>
              <div>
                <h3 className="text-base font-black text-white">{p.nickname || `Игрок ${slotNum}`}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${theme.text} ${theme.bg} ${theme.border}`}>
                    {theme.icon} {theme.label}
                  </span>
                  {!p.alive && (
                    <span className="text-[10px] bg-rose-950 text-rose-500 font-bold px-2 py-0.5 rounded border border-rose-900/40">
                      Убит ({p.eliminated_phase || "Игра"})
                    </span>
                  )}
                  {p.mute_this_round && (
                    <span className="text-[10px] bg-amber-950 text-amber-500 font-bold px-2 py-0.5 rounded border border-amber-900/40">
                      🔇 Молчит
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button 
              type="button" 
              onClick={() => setSelectedMobileSlot(null)}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white flex items-center justify-center font-bold text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Player statistics grid summary */}
          <div className="grid grid-cols-3 gap-2 text-center text-[10px] shrink-0">
            <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-800/40">
              <span className="text-slate-500 font-bold block uppercase">Фолы</span>
              <strong className="text-sm font-bold text-rose-500 font-mono mt-0.5 block">{p.fouls} / 4</strong>
            </div>
            <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-800/40">
              <span className="text-slate-500 font-bold block uppercase">Статус речи</span>
              <strong className={`text-xs font-bold mt-0.5 block uppercase ${isSpeaking ? "text-amber-400" : hasSpoken ? "text-emerald-500" : "text-slate-400"}`}>
                {isSpeaking ? "🎙️ Говорит" : hasSpoken ? "✓ Выступил" : "Ожидает"}
              </strong>
            </div>
            <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-800/40">
              <span className="text-slate-500 font-bold block uppercase">Номинация</span>
              <strong className={`text-xs font-bold mt-0.5 block uppercase ${isNominated ? "text-rose-400" : "text-slate-500"}`}>
                {isNominated ? "🎯 Выставлен" : "Пас"}
              </strong>
            </div>
          </div>

          {/* ACTION BUTTONS GROUP */}
          <div className="space-y-4">
            <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-widest pl-1">Быстрые команды</h4>
            <div className="grid grid-cols-2 gap-2.5">
              {/* SPEECH TIMER CONTROLLER */}
              {p.alive && (
                isSpeaking ? (
                  <button
                    type="button"
                    onClick={() => {
                      markPlayerSpoken(slotNum);
                    }}
                    className="col-span-2 h-12 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-600/10"
                  >
                    ⏹️ Остановить речь ({timeLeft}с)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      handleStartTimer(slotNum, p.mute_this_round ? 0 : 60);
                    }}
                    className="col-span-2 h-12 bg-amber-500 text-slate-950 hover:bg-amber-400 rounded-xl font-black flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/10"
                  >
                    🎙️ Запустить Речь (60с)
                  </button>
                )
              )}

              {/* NOMINATION CONTROLLER */}
              {p.alive && (
                <button
                  type="button"
                  onClick={() => {
                    handleNominateCandidate(slotNum);
                  }}
                  className={`h-11 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer border ${
                    isNominated
                      ? "bg-rose-950/60 border-rose-500 text-rose-400 hover:bg-rose-950"
                      : "bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-900"
                  }`}
                >
                  {isNominated ? "❌ Снять с гол." : "🎯 Выставить на гол."}
                </button>
              )}

              {/* FOUL PENALTY TIME CONTROLLER */}
              {p.alive && (
                <button
                  type="button"
                  onClick={() => {
                    setActivePlayers((prev) =>
                      prev.map((pl) => (pl.slot_num === slotNum ? { ...pl, has_foul_penalty: !pl.has_foul_penalty } : pl))
                    );
                    showToast(`Штраф 30с для игрока #${slotNum} ${!p.has_foul_penalty ? "выдан" : "снят"}`, "info");
                  }}
                  className={`h-11 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer border ${
                    p.has_foul_penalty
                      ? "bg-amber-950/60 border-amber-500 text-amber-400 hover:bg-amber-950"
                      : "bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-900"
                  }`}
                >
                  ⏱️ {p.has_foul_penalty ? "Снять штраф" : "Штраф 30 сек"}
                </button>
              )}

              {/* FOULS INCREMENT */}
              {p.alive && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      handleFoulChange(slotNum, "up");
                    }}
                    className="h-11 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    ➕ Добавить фол
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleFoulChange(slotNum, "down");
                    }}
                    disabled={p.fouls === 0}
                    className="h-11 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                  >
                    ➖ Убрать фол
                  </button>
                </>
              )}

              {/* MUTE CONTROLLER */}
              {p.alive && (
                <button
                  type="button"
                  onClick={() => {
                    setActivePlayers((prev) =>
                      prev.map((pl) => (pl.slot_num === slotNum ? { ...pl, mute_this_round: !pl.mute_this_round } : pl))
                    );
                    showToast(`Игрок #${slotNum} ${p.mute_this_round ? "размучен" : "заглушен на этот раунд"}`, "info");
                  }}
                  className={`h-11 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer border col-span-2 ${
                    p.mute_this_round
                      ? "bg-amber-950/60 border-amber-500 text-amber-400 hover:bg-amber-950"
                      : "bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-900"
                  }`}
                >
                  🔇 {p.mute_this_round ? "Размутить" : "Фол молчания"}
                </button>
              )}

              {/* SHOOTOUT BOTH VOTE TOGGLE FOR MOBILE SHEET */}
              {phase === "shootout" && shootoutSubPhase === "shootout_both_results" && p.alive && (
                <button
                  type="button"
                  onClick={() => {
                    setBothLeaveVotes((prev) =>
                      prev.includes(slotNum) ? prev.filter((s) => s !== slotNum) : [...prev, slotNum]
                    );
                    playBeep(659, 0.1);
                    setSelectedMobileSlot(null);
                  }}
                  className={`h-11 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer border col-span-2 ${
                    bothLeaveVotes.includes(slotNum)
                      ? "bg-rose-950 border-rose-500 text-rose-400 font-black"
                      : "bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-900"
                  }`}
                >
                  ✋ {bothLeaveVotes.includes(slotNum) ? "Снять голос (Удалить обоих)" : "Проголосовать за удаление обоих"}
                </button>
              )}
            </div>
          </div>

          {/* ADVANCED ADMIN CONTROL: ROLES AND ALIVE/DEAD */}
          <div className="space-y-4 pt-4 border-t border-slate-800/50">
            <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-widest pl-1">Администрирование ролей и статуса</h4>
            
            {/* ROLE SELECTOR ROW */}
            <div className="space-y-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase block pl-1">Роль игрока:</span>
              <div className="grid grid-cols-4 gap-1.5">
                {(["Мирный", "Шериф", "Мафия", "Дон"] as const).map((role) => {
                  const isActive = p.role === role;
                  const colors = {
                    "Мирный": "border-rose-500 text-rose-500 bg-rose-500/10",
                    "Шериф": "border-emerald-500 text-emerald-500 bg-emerald-500/10",
                    "Мафия": "border-slate-400 text-slate-300 bg-slate-500/10",
                    "Дон": "border-purple-500 text-purple-400 bg-purple-500/10",
                  };
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        const team = (role === "Мафия" || role === "Дон") ? "Чёрные" : "Красные";
                        setActivePlayers((prev) =>
                          prev.map((pl) => (pl.slot_num === slotNum ? { ...pl, role, team } : pl))
                        );
                        showToast(`Роль игрока #${slotNum} изменена на ${role}`, "success");
                      }}
                      className={`py-2 px-1 rounded-xl text-[10px] font-black uppercase border cursor-pointer text-center transition-all ${
                        isActive ? colors[role] : "border-slate-800 text-slate-500 hover:text-slate-400"
                      }`}
                    >
                      {role === "Мирный" ? "Мирный" : role}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* KILL/RESTORE PANEL */}
            <div className="pt-2">
              {p.alive ? (
                <div className="space-y-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block pl-1">Вывести игрока со стола:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        eliminatePlayer(slotNum, `Голосование (День ${roundNumber})`);
                        setSelectedMobileSlot(null);
                      }}
                      className="py-2.5 bg-rose-950 hover:bg-rose-900/60 border border-rose-550/40 text-rose-400 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer"
                    >
                      ☠️ Выгнан по голосу
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        eliminatePlayer(slotNum, `Дисквалификация (День ${roundNumber})`);
                        setSelectedMobileSlot(null);
                      }}
                      className="py-2.5 bg-rose-950 hover:bg-rose-900/60 border border-rose-550/40 text-rose-400 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer"
                    >
                      ☠️ Дисквалификация
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        eliminatePlayer(slotNum, `ППК (День ${roundNumber})`);
                        setSelectedMobileSlot(null);
                      }}
                      className="py-2.5 bg-rose-950 hover:bg-rose-900/60 border border-rose-550/40 text-rose-400 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer"
                    >
                      ☠️ Сломал руку (ППК)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const reason = prompt("Укажите причину удаления игрока:", `Решение судьи (День ${roundNumber})`);
                        if (reason !== null) {
                          eliminatePlayer(slotNum, reason || `Удален (День ${roundNumber})`);
                          setSelectedMobileSlot(null);
                        }
                      }}
                      className="py-2.5 bg-rose-950 hover:bg-rose-900/60 border border-rose-550/40 text-rose-400 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer"
                    >
                      ☠️ Другая причина
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setActivePlayers((prev) =>
                      prev.map((pl) => (pl.slot_num === slotNum ? { ...pl, alive: true, eliminated_phase: "", is_pu: false, exit_reason: "alive" } : pl))
                    );
                    setProtocolMarkers((prev) => clearBestMove(prev, slotNum));
                    showToast(`Игрок #${slotNum} возвращен за стол!`, "success");
                    setSelectedMobileSlot(null);
                  }}
                  className="w-full py-3 bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-400 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
                >
                  💖 Оживить / Вернуть за стол
                </button>
              )}
            </div>

            {/* BEST MOVE (ЛХ) SELECTOR FOR RECENTLY KILLED ON DAY/NIGHT 1 */}
            {!p.alive && p.best_move_guesses && (
              <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-850 space-y-2 mt-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase block leading-none">Лучший Ход (ЛХ) убитого игрока:</span>
                <span className="text-[8px] text-slate-500 block leading-tight">Выберите 3 номера игроков, которых покинувший стол считает мафией:</span>
                <div className="flex gap-1.5 justify-center py-1">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => {
                    const isSelected = p.best_move_guesses?.includes(num);
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          const currentGuesses = p.best_move_guesses || [];
                          let nextGuesses = [...currentGuesses];
                          if (currentGuesses.includes(num)) {
                            nextGuesses = currentGuesses.filter(n => n !== num);
                          } else if (currentGuesses.length < 3) {
                            nextGuesses = [...currentGuesses, num];
                          }
                          setActivePlayers((prev) =>
                            prev.map((pl) => (pl.slot_num === slotNum ? { ...pl, best_move_guesses: nextGuesses } : pl))
                          );
                        }}
                        className={`w-7 h-7 rounded-lg font-mono font-black text-[11px] flex items-center justify-center border transition-all cursor-pointer ${
                          isSelected
                            ? getSeatColor(num)
                            : "border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                        }`}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSelectedMobileSlot(null)}
            className="mt-4 w-full h-11 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold rounded-xl text-xs uppercase tracking-wide cursor-pointer flex items-center justify-center border border-slate-700/50 shrink-0"
          >
            Закрыть Пульт
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto px-2 sm:px-4 pb-32 sm:pb-24 select-none" id="live-game-root">
      {activeBestMoveSource && activeBestMoveSlot !== null && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 flex items-center justify-center p-4 overflow-y-auto backdrop-blur-md" id="best-move-protocol-overlay">
          <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full space-y-6 shadow-2xl relative">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/25 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider">
                {activeBestMoveSource === "first_killed" ? "Первый убитый" : "Слом нулевого круга"}
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Ввод Лучшего Хода
              </h2>
              <p className="text-sm font-bold text-slate-300">
                Протокол игрока #{activeBestMoveSlot} — {activePlayers.find(pl => pl.slot_num === activeBestMoveSlot)?.nickname || "Неизвестный"}
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Выберите до 3 номеров игроков, которых покинувший стол считает мафией. Порядок выбора важен и отображается цифрами.
              </p>
            </div>

            {/* SELECTION GRID */}
            <div className="grid grid-cols-5 gap-3 max-w-md mx-auto">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => {
                const idx = pendingBestMoveSeats.indexOf(num);
                const isSelected = idx !== -1;
                const p = activePlayers.find(pl => pl.slot_num === num);
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setPendingBestMoveSeats(prev => prev.filter(n => n !== num));
                      } else {
                        if (pendingBestMoveSeats.length < 3) {
                          setPendingBestMoveSeats(prev => [...prev, num]);
                        } else {
                          showToast("Максимум 3 игрока в лучшем ходе!", "warning");
                        }
                      }
                    }}
                    className={`h-16 rounded-2xl flex flex-col items-center justify-center border-2 transition-all relative cursor-pointer select-none group ${
                      isSelected
                        ? "bg-slate-950 border-white text-white shadow-lg shadow-white/5"
                        : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    }`}
                  >
                    <span className="text-lg font-black font-mono leading-none">{num}</span>
                    <span className="text-[9px] text-slate-500 font-medium truncate max-w-[50px] mt-1">{p?.nickname || `Игрок ${num}`}</span>
                    {isSelected && (
                      <div className="absolute top-1 right-1.5 w-4 h-4 rounded-full bg-white text-slate-950 text-[10px] font-black flex items-center justify-center leading-none">
                        {idx + 1}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingBestMoveSeats([])}
                className="px-6 py-3 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold rounded-xl text-xs uppercase tracking-wide cursor-pointer transition-all border border-slate-700/50"
              >
                Сбросить выбор
              </button>
              <button
                type="button"
                onClick={() => {
                  // Confirm Best Move
                  const nextMarkers = setBestMove(protocolMarkers, activeBestMoveSource, pendingBestMoveSeats);
                  setProtocolMarkers(nextMarkers);
                  
                  // Save to activePlayers state for backward compatibility
                  setActivePlayers(prev =>
                    prev.map(p =>
                      p.slot_num === activeBestMoveSlot
                        ? { ...p, best_move_guesses: [...pendingBestMoveSeats] }
                        : p
                    )
                  );

                  // Show feedback
                  showToast(`Лучший ход для игрока #${activeBestMoveSlot} зафиксирован: ${pendingBestMoveSeats.join(", ") || "нет"}`, "success");

                  // Reset states and trigger callback if any
                  setActiveBestMoveSource(null);
                  setActiveBestMoveSlot(null);
                  setPendingBestMoveSeats([]);
                  if (onConfirmBestMove) {
                    onConfirmBestMove();
                    setOnConfirmBestMove(null);
                  }
                }}
                className="px-8 py-3 bg-white hover:bg-slate-100 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-xl transition-all"
              >
                Подтвердить протокол ЛХ
              </button>
            </div>
          </div>
        </div>
      )}
      {/* HEADER / NAVIGATION OVERVIEW (Shown only during Setup) */}
      {phase === "setup" && (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/40 p-4 rounded-3xl border border-slate-800/80 shadow-2xl backdrop-blur-md" id="game-header-panel">
          <div className="flex items-center gap-3">
            <div className="bg-rose-600/10 p-2.5 rounded-2xl border border-rose-500/25">
              <Shield className="w-6 h-6 text-rose-500 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white tracking-tight">Панель судейства игры</h1>
              <p className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider">
                Настройка состава и ролей
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (confirm("Вы уверены, что хотите завершить настройку и выйти?")) {
                onCancel();
              }
            }}
            className="px-3.5 py-2 bg-slate-900 hover:bg-rose-900/20 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-900/50 rounded-xl text-xs transition-all cursor-pointer font-bold ml-auto"
          >
            Выйти
          </button>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-xl border shadow-2xl flex items-center gap-2.5 text-xs font-bold ${
          toast.type === "success" ? "bg-emerald-950 border-emerald-500 text-emerald-400" :
          toast.type === "error" ? "bg-rose-900 border-rose-500 text-rose-400" :
          toast.type === "warning" ? "bg-amber-900 border-amber-500 text-amber-400" :
          "bg-slate-950 border-slate-700 text-slate-300"
        }`}>
          <span>{toast.message}</span>
        </div>
      )}

      {confirmDialog && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <p className="text-sm text-slate-200 font-bold">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3 text-xs">
              <button onClick={() => setConfirmDialog(null)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg font-bold">Отмена</button>
              <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} className="px-4 py-2 bg-rose-600 text-white rounded-lg font-black">Продолжить</button>
            </div>
          </div>
        </div>
      )}

      {/* PHASE-SPECIFIC VIEWS */}
      {phase === "setup" && restorableSession && (
        <div className="bg-amber-950/80 border-2 border-amber-500/60 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xl text-amber-200 text-xs my-2">
          <div className="space-y-0.5 text-center sm:text-left">
            <div className="font-extrabold text-sm text-amber-300 flex items-center justify-center sm:justify-start gap-1.5">
              <span>🔄 Обнаружена несохраненная живая игра!</span>
            </div>
            <p className="text-[11px] text-amber-200/80">
              Сохранено: <strong className="text-white">{restorableSession.savedAt || "недавно"}</strong> • Раунд: <strong className="text-amber-300">День #{restorableSession.roundNumber || 1}</strong> • Игроков: {restorableSession.activePlayers?.length || 10}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleRestoreSession}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow border border-emerald-400/40 cursor-pointer active:scale-95 transition-all"
            >
              Восстановить сессию 🔄
            </button>
            <button
              onClick={handleDiscardSavedSession}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase rounded-xl border border-slate-700 cursor-pointer active:scale-95 transition-all"
            >
              Сбросить
            </button>
          </div>
        </div>
      )}

      {phase === "setup" && (
        <SetupPhase
          players={players}
          judgeId={judgeId}
          setJudgeId={setJudgeId}
          activePlayers={activePlayers}
          handleAutoFillSetupPlayers={handleAutoFillSetupPlayers}
          handleAutoFillSetupRoles={handleAutoFillSetupRoles}
          handleSelectSetupPlayer={handleSelectSetupPlayer}
          handleSelectSetupRole={handleSelectSetupRole}
          validateSetupAndStart={validateSetupAndStart}
          onCancel={onCancel}
        />
      )}

      {/* RENDER VIEW MODE TOGGLE AND TABLE IF NOT IN SETUP */}
      {phase !== "setup" && (
        <div className="space-y-4">
          {renderViewToggle()}

          {/* Core Table / List Content */}
          {viewMode === "table" ? (
            renderVirtualTable()
          ) : (
            <div className="space-y-4">
              <CenterPanel
                phase={phase}
                roundNumber={roundNumber}
                nominations={nominations}
                activePlayers={activePlayers}
                nextSpeaker={nextSpeaker}
                handleStartNextSpeaker={handleStartNextSpeaker}
                handleTransitionToVoting={handleTransitionToVoting}
                activeSpeakerSlot={activeSpeakerSlot}
                timeLeft={timeLeft}
                setTimeLeft={setTimeLeft}
                zeroNightSubPhase={zeroNightSubPhase}
                customTimerLabel={customTimerLabel}
                isTimerRunning={isTimerRunning}
                setIsTimerRunning={setIsTimerRunning}
                setActiveSpeakerSlot={setActiveSpeakerSlot}
                markPlayerSpoken={markPlayerSpoken}
                votes={votes}
                votesByPlayer={votesByPlayer}
                isInteractiveVoting={isInteractiveVoting}
                setIsInteractiveVoting={setIsInteractiveVoting}
                currentVotingNomineeIndex={currentVotingNomineeIndex}
                selectVotingNomineeIndex={selectVotingNomineeIndex}
                handleInteractiveAutoRemainder={handleInteractiveAutoRemainder}
                handleAllocateVotes={handleAllocateVotes}
                handleResolveVoting={handleResolveVoting}
                shootoutNominees={shootoutNominees}
                votingAttempt={votingAttempt}
                handleStartReVoting={handleStartReVoting}
                handleResolveShootoutVotes={handleResolveShootoutVotes}
                nightSubPhase={nightSubPhase}
                shotPlayerSlot={shotPlayerSlot}
                donCheckSlot={donCheckSlot}
                donCheckResult={donCheckResult}
                sheriffCheckSlot={sheriffCheckSlot}
                sheriffCheckResult={sheriffCheckResult}
                bestMoveGuesses={bestMoveGuesses}
                getPrevStepAction={getPrevStepAction}
                getNextStepInfo={getNextStepInfo}
                timerMax={timerMax}
                handleAdjustTime={handleAdjustTime}
                handleStartZeroNightTimer={handleStartZeroNightTimer}
                votingSubPhase={votingSubPhase}
                setVotingSubPhase={setVotingSubPhase}
                shootoutSubPhase={shootoutSubPhase}
                setShootoutSubPhase={setShootoutSubPhase}
                bothLeaveVotes={bothLeaveVotes}
                setBothLeaveVotes={setBothLeaveVotes}
                addLogEntry={(logText: string) => setNightLogs(prev => [...prev, { round: roundNumber, log: logText }])}
                onCancel={onCancel}
                handleAdvanceNightSubPhase={handleAdvanceNightSubPhase}
                handleResolveNight={handleResolveNight}
                isMuted={isMuted}
                setIsMuted={setIsMuted}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activePlayers.map((p) => (
                  <div
                    key={p.slot_num}
                    className={`p-3 rounded-xl border bg-slate-900/40 flex flex-col justify-between gap-2.5 relative ${
                      p.alive
                        ? p.slot_num === activeSpeakerSlot
                          ? "border-rose-500 bg-rose-900/10"
                          : "border-slate-800"
                        : "border-slate-900 opacity-40 grayscale"
                    }`}
                  >
                    <span className="absolute right-3 top-3 font-mono text-[9px] font-bold text-slate-500">
                      #{p.slot_num}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white block">
                        {p.nickname}{" "}
                        {!p.alive && <span className="text-rose-500 text-[10px]">(Убит)</span>}
                      </span>
                    </div>
                    {p.alive && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-850/40 text-[10px] font-bold uppercase">
                        <button
                          onClick={() => handleStartTimer(p.slot_num, p.mute_this_round ? 0 : 60)}
                          className="bg-slate-800 text-white px-3 h-8 rounded-lg cursor-pointer hover:bg-slate-750 transition-all flex items-center justify-center text-[10px]"
                        >
                          Речь 🎙️
                        </button>
                        <button
                          onClick={() => handleNominateCandidate(p.slot_num)}
                          className={`px-2.5 h-8 rounded-lg border text-[10px] transition-all font-bold cursor-pointer ${
                            nominations.includes(p.slot_num)
                              ? "bg-rose-600 border-rose-500 text-white"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300"
                          }`}
                        >
                          {nominations.includes(p.slot_num) ? "Снять 🎯" : "Выставить 🎯"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EVENTS LOGGER PANEL AND END-GAME SCREEN */}
          <EventsPanel
            nightLogs={nightLogs}
            protocolNotes={protocolNotes}
            setProtocolNotes={setProtocolNotes}
            activePlayers={activePlayers}
            winTeam={winTeam}
            handleEndGameWithWinner={handleEndGameWithWinner}
            onUndoLastLog={handleUndoLastLog}
          />
        </div>
      )}
      {renderMobileActionSheet()}
    </div>
  );
}
