import React, { useState, useEffect, useRef } from "react";
import { Shield, Volume2, Award, EyeOff, Eye, Play, Pause, RotateCcw } from "lucide-react";
import { Player, GameSlot } from "../types.js";

// Modularized subcomponents
import SetupPhase from "./LiveGameEngine/SetupPhase.js";
import EventsPanel from "./LiveGameEngine/EventsPanel.js";
import SeatCard from "./LiveGameEngine/SeatCard.js";
import CenterPanel from "./LiveGameEngine/CenterPanel.js";
import { ActivePlayerState, Phase } from "./LiveGameEngine/types.js";

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

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  const [activePlayers, setActivePlayers] = useState<ActivePlayerState[]>(
    Array.from({ length: 10 }, (_, i) => ({
      slot_num: i + 1, user_id: 0, nickname: "", role: "Мирный", team: "Красные", fouls: 0, alive: true,
      nominated_this_round: false, has_spoken_this_round: false, mute_this_round: false, is_pu: false,
      best_move_guesses: [], kick: false, ppk: false, bonus_points: 0, lh_points: 0, will_protocol_points: 0,
      will_opinion_points: 0, dc_points: 0, eliminated_phase: "", has_foul_penalty: false
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

  const [bestMovePlayerSlot, setBestMovePlayerSlot] = useState<number | null>(null);
  const [bestMoveGuesses, setBestMoveGuesses] = useState<number[]>([]);
  const [protocolNotes, setProtocolNotes] = useState("");
  const [hideBestMoveGlow, setHideBestMoveGlow] = useState<boolean>(false);
  const [votingAttempt, setVotingAttempt] = useState<number>(1);

  const [nominationsMap, setNominationsMap] = useState<{ [candidateSlot: number]: number }>({});
  const [votesByPlayer, setVotesByPlayer] = useState<{ [voterSlot: number]: number }>({});
  const [currentVotingNomineeIndex, setCurrentVotingNomineeIndex] = useState<number>(0);
  const [isInteractiveVoting, setIsInteractiveVoting] = useState<boolean>(true);

  // Linear Voting & Shootout subphase state managers
  const [votingSubPhase, setVotingSubPhase] = useState<"voting_intro" | "voting_active" | "voting_results">("voting_intro");
  const [shootoutSubPhase, setShootoutSubPhase] = useState<"shootout_intro" | "shootout_speeches" | "shootout_revote_intro" | "shootout_revote_active" | "shootout_revote_results" | "shootout_both_results">("shootout_intro");
  const [bothLeaveVotes, setBothLeaveVotes] = useState<number[]>([]);

  const [shootoutSeconds, setShootoutSeconds] = useState(30);
  const [shootoutSpeakerIndex, setShootoutSpeakerIndex] = useState(0);
  const [isShootoutTimerActive, setIsShootoutTimerActive] = useState(false);
  const [shootoutTimerLeft, setShootoutTimerLeft] = useState(30);

  const handleStartShootoutTimer = (duration: number) => {
    setShootoutTimerLeft(duration);
    setIsShootoutTimerActive(true);
  };

  const recalculateVotesAndSet = (voterMap: { [voterSlot: number]: number }, customNominations?: number[]) => {
    const nomis = customNominations || nominations;
    if (nomis.length === 0) return;

    const lastNominee = nomis[nomis.length - 1];
    const alivePlayers = activePlayers.filter(p => p.alive);
    const computedVotes: { [slot: number]: number } = {};

    // Initialize all nominees with 0
    nomis.forEach((n) => {
      computedVotes[n] = 0;
    });

    // Sum explicit votes for all nominees except the last one
    nomis.forEach((n) => {
      if (n !== lastNominee) {
        computedVotes[n] = Object.entries(voterMap).filter(([voter, nominee]) => {
          const voterSlot = parseInt(voter);
          const pl = alivePlayers.find(p => p.slot_num === voterSlot);
          return pl && nominee === n;
        }).length;
      }
    });

    // Remainder for the last nominee
    const otherVotesSum = nomis.reduce((sum, n) => {
      if (n === lastNominee) return sum;
      return sum + (computedVotes[n] || 0);
    }, 0);

    computedVotes[lastNominee] = Math.max(0, alivePlayers.length - otherVotesSum);
    setVotes(computedVotes);
  };

  const selectVotingNomineeIndex = (idx: number, customNominations?: number[]) => {
    const nomis = customNominations || nominations;
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

      recalculateVotesAndSet(copy, nomis);
      return copy;
    });
  };

  const playBeep = (freq: number, dur: number) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.frequency.value = freq; osc.type = "sine";
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + dur);
      osc.start(); osc.stop(audioCtx.currentTime + dur);
    } catch { }
  };

  useEffect(() => {
    if (isTimerRunning) {
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft((p) => {
          if (p <= 1) {
            setIsTimerRunning(false);
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            playBeep(880, 0.4); return 0;
          }
          if (p === 11) playBeep(440, 0.15);
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
    if (player?.has_foul_penalty) {
      finalDuration = 30;
      showToast(`Игрок #${slotNum} использует штраф 30 секунд за 3 фола!`, "info");
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
          label: "Запуск: Договорка (75с)",
          onClick: () => handleStartZeroNightTimer("agreement")
        };
      }
      if (zeroNightSubPhase === "agreement") {
        return {
          label: "Запуск: Вызов Шерифа (10с)",
          onClick: () => handleStartZeroNightTimer("sheriff")
        };
      }
      if (zeroNightSubPhase === "sheriff") {
        return {
          label: "Запуск: Свободная посадка (40с)",
          onClick: () => handleStartZeroNightTimer("seating")
        };
      }
      if (zeroNightSubPhase === "seating") {
        return {
          label: "Разбудить Город",
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
          label: `Закончить речь #${activeSpeakerSlot}`,
          onClick: () => markPlayerSpoken(activeSpeakerSlot)
        };
      }
      if (nextSpeaker) {
        return {
          label: `Речь #${nextSpeaker.slot_num} (${nextSpeaker.nickname})`,
          onClick: handleStartNextSpeaker
        };
      }
      return {
        label: "Перейти к голосованию",
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
      return {
        label: "Решение перестрелки",
        onClick: () => {
          showToast("Выберите исход перестрелки кнопками ниже", "info");
        }
      };
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
      return {
        label: "Голосование",
        onClick: () => {
          setPhase("day_voting");
        }
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
    const lastNominee = nominations[nominations.length - 1];
    if (!lastNominee) return;
    const alivePlayers = activePlayers.filter(p => p.alive);
    setVotesByPlayer((prev) => {
      const copy = { ...prev };
      alivePlayers.forEach((p) => {
        if (copy[p.slot_num] === undefined) {
          copy[p.slot_num] = lastNominee;
        }
      });
      
      recalculateVotesAndSet(copy, nominations);
      return copy;
    });
    playBeep(523, 0.05);
    showToast("Оставшиеся голоса распределены за последнего кандидата!", "success");
  };

  const handleAutoVoteRemainder = (nominee: number) => {
    const totalAlive = activePlayers.filter((p) => p.alive).length;
    setVotes((prev) => {
      const copy = { ...prev };
      const currentAllocated = Object.entries(copy)
        .filter(([s]) => parseInt(s) !== nominee)
        .reduce((a, [, v]) => a + v, 0);
      const remainder = Math.max(0, totalAlive - currentAllocated);
      copy[nominee] = remainder;
      return copy;
    });
    playBeep(523, 0.05);
  };

  const handleResolveShootoutVotes = (act: "eliminate_one" | "eliminate_all" | "no_one_leaves", slot?: number) => {
    if (act === "no_one_leaves") {
      handleCompleteShootout("leave_none");
    } else if (act === "eliminate_all") {
      handleCompleteShootout("leave_all");
    } else if (act === "eliminate_one" && slot !== undefined) {
      handleCompleteShootout("leave_one", slot);
    }
  };

  const handleStartReVoting = () => {
    setVotingAttempt(2);
    const iv: { [s: number]: number } = {};
    shootoutNominees.forEach((n) => {
      iv[n] = 0;
    });
    setVotes(iv);
    setVotesByPlayer({});
    setIsInteractiveVoting(true);
    setPhase("shootout");
    setShootoutSubPhase("shootout_revote_active");
    setCurrentVotingNomineeIndex(0);
    setBothLeaveVotes([]);
    selectVotingNomineeIndex(0, shootoutNominees);
    showToast("Запущен второй круг голосования по автокатастрофе!", "success");
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

  const handleInteractiveVoteToggle = (voterSlot: number) => {
    const currentNominee = nominations[currentVotingNomineeIndex];
    if (!currentNominee) return;

    if (voterSlot === currentNominee) {
      showToast("Игрок не может голосовать против самого себя!", "warning");
      return;
    }

    const lastNominee = nominations[nominations.length - 1];

    const alreadyVotedNominee = votesByPlayer[voterSlot];
    if (alreadyVotedNominee && alreadyVotedNominee !== currentNominee && alreadyVotedNominee !== lastNominee) {
      const nomineeIndex = nominations.indexOf(alreadyVotedNominee);
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
      const alivePlayers = activePlayers.filter(p => p.alive);
      Object.keys(copy).forEach((slotStr) => {
        const slot = parseInt(slotStr);
        const pl = alivePlayers.find(p => p.slot_num === slot);
        if (!pl || !pl.alive) {
          delete copy[slot];
        }
      });

      recalculateVotesAndSet(copy, nominations);
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
    const iv: { [s: number]: number } = {}; nominations.forEach((n) => { iv[n] = 0; });
    setVotes(iv);
    setVotesByPlayer({});
    setIsInteractiveVoting(true);
    setVotingAttempt(1);
    setPhase("day_voting");
    setVotingSubPhase("voting_intro");
    setShootoutSubPhase("shootout_intro");
    setBothLeaveVotes([]);
    selectVotingNomineeIndex(0, nominations);
  };

  const handleAllocateVotes = (nominee: number, count: number) => {
    const lastNominee = nominations[nominations.length - 1];
    const totalAlive = activePlayers.filter((p) => p.alive).length;

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
      return copy;
    });
  };

  const handleResolveVoting = () => {
    const pairs = Object.entries(votes).map(([s, c]) => ({ slot: parseInt(s), count: c }));
    const totalAlloc = pairs.reduce((sum, p) => sum + p.count, 0);
    const totalAlive = activePlayers.filter((p) => p.alive).length;

    const goResolve = () => {
      const maxVotes = Math.max(...pairs.map((p) => p.count));
      const highest = pairs.filter((p) => p.count === maxVotes);
      if (highest.length === 1) {
        eliminatePlayer(highest[0].slot, `Голосование (День ${roundNumber})`);
        startNightPhase();
      } else {
        const tied = highest.map((p) => p.slot);
        setShootoutNominees(tied);
        setPhase("shootout");
        setShootoutSpeakerIndex(0);
        setShootoutSeconds(30);
        setIsShootoutTimerActive(false);
        if (votingAttempt === 1) {
          showToast(`Ничья! Перестрелка: ${tied.join(", ")}`, "warning");
        } else {
          showToast(`Повторная ничья: ${tied.join(", ")}! Выберите решение`, "warning");
        }
      }
    };

    if (totalAlloc < totalAlive) {
      setConfirmDialog({ message: `Распределено ${totalAlloc} голосов из ${totalAlive}. Подтвердить подсчет?`, onConfirm: goResolve });
    } else goResolve();
  };

  const handleCompleteVoting = () => {
    handleResolveVoting();
  };

  const handleCompleteShootout = (action: "leave_all" | "leave_none" | "leave_one", singleSlot?: number) => {
    if (action === "leave_all") {
      shootoutNominees.forEach((s) => {
        eliminatePlayer(s, `Автокатастрофа (День ${roundNumber})`);
      });
      startNightPhase();
    } else if (action === "leave_one" && singleSlot) {
      eliminatePlayer(singleSlot, `Автокатастрофа (День ${roundNumber})`);
      startNightPhase();
    } else {
      showToast("Все игроки остались за столом", "success");
      startNightPhase();
    }
  };

  const eliminatePlayer = (slotNum: number, reason: string) => {
    const player = activePlayers.find((p) => p.slot_num === slotNum);
    if (!player) return;
    let isFirst = false;

    setActivePlayers((prev) => {
      const alreadyKilled = prev.some((p) => p.is_pu);
      isFirst = !alreadyKilled;
      return prev.map((p) => p.slot_num === slotNum ? { ...p, alive: false, eliminated_phase: reason, is_pu: isFirst } : p);
    });

    showToast(`Игрок #${slotNum} (${player.nickname}) покидает стол!`, "info");
    handleStartTimer(slotNum, 60);

    const alreadyKilled = activePlayers.some((p) => p.is_pu);
    if (!alreadyKilled && player.team === "Красные" && !reason.includes("Ночь 1")) {
      setBestMovePlayerSlot(slotNum); setBestMoveGuesses([]);
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
    } else if (phase === "day_speeches") {
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

  const handleEndGameWithWinner = (winner: "Красные" | "Чёрные") => {
    const slotsToSubmit: GameSlot[] = activePlayers.map((p) => {
      return {
        slot_num: p.slot_num, user_id: p.user_id, nickname: p.nickname, role: p.role, team: p.team,
        bonus_points: p.bonus_points, lh_points: p.lh_points, will_protocol_points: p.will_protocol_points,
        will_opinion_points: p.will_opinion_points, dc_points: p.dc_points, kick: p.kick || p.eliminated_phase.includes("Фолы"),
        ppk: p.ppk || p.eliminated_phase.includes("ППК"), fouls: p.fouls, pu: p.is_pu, alive: p.alive,
        status_reason: p.alive ? "Жив" : p.eliminated_phase || "Убит", elo_change: 0
      };
    });

    onGameFinished({
      winning_team: winner,
      protocol_text: `Спортивная игра ФСМ. Победили ${winner}.${protocolNotes.trim() ? " Примечания: " + protocolNotes.trim() : ""}`,
      slots: slotsToSubmit,
      judge_id: judgeId
    });
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

  const toggleTimer = () => {
    setIsTimerRunning(!isTimerRunning);
    playBeep(523, 0.05);
  };

  const resetTimer = () => {
    setIsTimerRunning(false);
    setTimeLeft(timerMax);
    playBeep(523, 0.05);
  };

  const setTimerLabelAndDuration = (label: string, duration: number) => {
    setCustomTimerLabel(label);
    setTimerMax(duration);
    setTimeLeft(duration);
    setIsTimerRunning(false);
    playBeep(523, 0.05);
  };

  const handleModifyTime = (dir: "up" | "down") => {
    handleAdjustTime(dir === "up" ? 5 : -5);
  };

  const renderVirtualTable = () => {
    return (
      <div className="grid grid-cols-5 gap-2 sm:gap-3 md:gap-4 max-w-7xl mx-auto w-full px-1 py-1" id="virtual-table-grid">
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
          getSeatColor={getSeatColor}
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

  const muteMultiplierApplied = activeSpeakerSlot !== null && activePlayers.find(p => p.slot_num === activeSpeakerSlot)?.mute_this_round;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 pb-12 select-none" id="live-game-root">
      {/* HEADER / NAVIGATION OVERVIEW */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/40 p-4 rounded-3xl border border-slate-800/80 shadow-2xl backdrop-blur-md" id="game-header-panel">
        <div className="flex items-center gap-3">
          <div className="bg-rose-600/10 p-2.5 rounded-2xl border border-rose-500/25">
            <Shield className="w-6 h-6 text-rose-500 animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white tracking-tight">Панель судейства игры</h1>
            <p className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider">
              {phase === "setup" ? "Настройка состава и ролей" : `Раунд ${roundNumber} • Фаза: ${phase}`}
            </p>
          </div>
        </div>

        {phase !== "setup" && (
          <div className="flex flex-wrap gap-2 items-center w-full md:w-auto" id="phase-navigation-bar">
            {/* Prev step action */}
            {(() => {
              const prev = getPrevStepAction();
              return prev ? (
                <button
                  onClick={prev.onClick}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer border border-slate-700/60"
                >
                  ← Назад ({prev.label})
                </button>
              ) : null;
            })()}

            {/* Next step action */}
            {(() => {
              const next = getNextStepInfo();
              return next ? (
                <button
                  onClick={next.onClick}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer border border-rose-500/50 shadow-lg shadow-rose-600/15"
                >
                  {next.label} →
                </button>
              ) : null;
            })()}

            <div className="h-6 w-[1px] bg-slate-800 hidden md:block" />

            <button
              onClick={() => {
                if (confirm("Вы уверены, что хотите завершить игру без результатов? Все несохраненные данные будут утеряны.")) {
                  onCancel();
                }
              }}
              className="px-3 py-1.5 bg-slate-900 hover:bg-rose-900/20 text-slate-400 hover:text-rose-400 border border-slate-850 hover:border-rose-900/50 rounded-xl text-xs transition-all cursor-pointer font-bold ml-auto md:ml-0"
            >
              Выйти
            </button>
          </div>
        )}
      </div>

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
        <div className="space-y-6">
          {/* Main Status Grid (Speech Active Timer or General Controls) */}
          <div className="hidden grid-cols-1 lg:grid-cols-3 gap-6" id="game-status-controls-grid">
            {/* Active Speaker Timer / Audio Deck */}
            <div className="lg:col-span-2 bg-slate-900/45 border border-slate-800/80 rounded-3xl p-5 shadow-2xl backdrop-blur-md flex flex-col justify-between gap-4" id="audio-deck-panel">
              <div className="flex justify-between items-center border-b border-slate-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-rose-500" />
                  <span className="text-xs text-slate-300 font-extrabold uppercase tracking-widest">Аудиопульт судейства</span>
                </div>
                {activeSpeakerSlot !== null && (
                  <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2.5 py-1 rounded-full font-black animate-pulse flex items-center gap-1.5">
                    🎙️ Говорит #{activeSpeakerSlot} ({activePlayers.find(pl => pl.slot_num === activeSpeakerSlot)?.nickname})
                  </span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-6 py-2">
                <div className="text-center sm:text-left space-y-1">
                  <span className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-widest block">Текущий Таймер</span>
                  <h2 className="text-3xl font-black text-white font-mono tracking-tight">{customTimerLabel || "Речь спикера"}</h2>
                  {muteMultiplierApplied && (
                    <span className="text-[9px] bg-rose-500/15 border border-rose-500/35 text-rose-400 px-2 py-0.5 rounded-md font-bold uppercase block w-max mx-auto sm:mx-0 animate-pulse mt-1">Фолы молчания: 0 сек!</span>
                  )}
                </div>

                {/* Gigantic Timer Clock Display */}
                <div className="relative w-32 h-32 flex items-center justify-center shrink-0" id="timer-clock-display">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="64" cy="64" r="54" strokeWidth="6" stroke="#1e293b" fill="transparent" />
                    <circle
                      cx="64"
                      cy="64"
                      r="54"
                      strokeWidth="6"
                      stroke={timeLeft <= 5 ? "#ef4444" : timeLeft <= 15 ? "#f59e0b" : "#e11d48"}
                      fill="transparent"
                      strokeDasharray={339.292}
                      strokeDashoffset={339.292 - (339.292 * (timeLeft / (timerMax || 60)))}
                      strokeLinecap="round"
                      className="transition-all duration-1000 ease-linear"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className={`text-4xl font-black font-mono tracking-tighter ${timeLeft <= 5 ? "text-rose-500 animate-ping" : "text-white"}`}>{timeLeft}</span>
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">секунд</span>
                  </div>
                </div>
              </div>

              {/* Clock Controllers */}
              <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-850/60 justify-center sm:justify-start" id="timer-controls-bar">
                <button
                  onClick={toggleTimer}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer border transition-all ${
                    isTimerRunning
                      ? "bg-amber-600/15 border-amber-500/35 text-amber-400 hover:bg-amber-600/30"
                      : "bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-600/15"
                  }`}
                >
                  {isTimerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>{isTimerRunning ? "Пауза" : "Запуск"}</span>
                </button>

                <button
                  onClick={resetTimer}
                  className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer border border-slate-700/60"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Сброс</span>
                </button>

                <div className="h-8 w-[1px] bg-slate-800 self-center mx-1 hidden sm:block" />

                <div className="flex gap-1">
                  <button onClick={() => setTimerLabelAndDuration("Речь", 60)} className="px-2.5 py-2.5 bg-slate-950 border border-slate-850 text-slate-400 hover:text-white rounded-xl text-[10px] font-bold cursor-pointer hover:border-slate-750 transition-all">🎙️ 60с</button>
                  <button onClick={() => setTimerLabelAndDuration("Штраф 30с", 30)} className="px-2.5 py-2.5 bg-slate-950 border border-slate-850 text-slate-400 hover:text-white rounded-xl text-[10px] font-bold cursor-pointer hover:border-slate-750 transition-all">⚠️ 30с</button>
                  <button onClick={() => setTimerLabelAndDuration("Речь 10с", 10)} className="px-2.5 py-2.5 bg-slate-950 border border-slate-850 text-slate-400 hover:text-white rounded-xl text-[10px] font-bold cursor-pointer hover:border-slate-750 transition-all">⏱️ 10с</button>
                </div>

                <div className="flex items-center gap-1.5 ml-auto text-xs bg-slate-950 border border-slate-850/60 px-3 py-1.5 rounded-xl font-mono text-slate-400">
                  <button onClick={() => handleModifyTime("down")} className="w-6 h-6 hover:bg-slate-850 hover:text-white rounded flex items-center justify-center font-bold font-sans">-5с</button>
                  <span className="font-bold text-slate-300">Коррекция</span>
                  <button onClick={() => handleModifyTime("up")} className="w-6 h-6 hover:bg-slate-850 hover:text-white rounded flex items-center justify-center font-bold font-sans">+5с</button>
                </div>
              </div>
            </div>

            {/* GAME STATS & PROTOCOL BRIEF CARD */}
            <div className="bg-gradient-to-br from-slate-900/60 to-slate-950/20 border border-slate-800/80 rounded-3xl p-5 shadow-2xl backdrop-blur-md flex flex-col justify-between gap-4" id="game-stats-dashboard-panel">
              <div className="flex items-center gap-2 border-b border-slate-800/60 pb-3">
                <Award className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-slate-300 font-extrabold uppercase tracking-widest">Протокол Стола</span>
              </div>

              <div className="grid grid-cols-2 gap-3.5 flex-1 justify-center content-center py-2">
                <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-850/80 space-y-1 shadow-inner text-center">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Живых игроков</span>
                  <strong className="text-xl font-black text-rose-500 font-mono tracking-tight">{activePlayers.filter(pl => pl.alive).length} <span className="text-xs text-slate-500 font-sans font-bold">/ 10</span></strong>
                </div>

                <div className="bg-slate-900/60 p-3 rounded-2xl border border-slate-850/80 space-y-1 shadow-inner text-center">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Круг Обсуждений</span>
                  <strong className="text-xl font-black text-white font-mono tracking-tight">#{roundNumber} <span className="text-xs text-slate-500 font-sans font-bold">день</span></strong>
                </div>

                <div className="bg-slate-900/60 p-3 rounded-2xl border border-slate-850/80 space-y-1 shadow-inner text-center">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Выставлено целей</span>
                  <strong className="text-xl font-black text-amber-400 font-mono tracking-tight">{nominations.length} <span className="text-xs text-slate-500 font-sans font-bold">иг.</span></strong>
                </div>

                <div className="bg-slate-900/60 p-3 rounded-2xl border border-slate-850/80 space-y-1 shadow-inner text-center">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Проверок шерифа</span>
                  <strong className="text-xl font-black text-emerald-400 font-mono tracking-tight">{nightLogs.filter(l => l.log.includes("Шериф")).length} <span className="text-xs text-slate-500 font-sans font-bold">крат.</span></strong>
                </div>
              </div>

              {/* Subphase indicator footer */}
              <div className="p-2.5 bg-slate-950/60 border border-slate-850 rounded-2xl text-center flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  {phase === "zero_night" && "Фаза: Нулевая ночь (Договорка)"}
                  {phase === "day_speeches" && "Фаза: Выступления игроков"}
                  {phase === "day_voting" && "Фаза: Голосование"}
                  {phase === "shootout" && "Фаза: Автокатастрофа (Перестрелка)"}
                  {phase === "night" && `Фаза: Ночные действия (${nightSubPhase})`}
                </span>
              </div>
            </div>
          </div>

          {/* ACTIVE CONTENT */}
          <div className="space-y-4">
            {/* Phase Subheader Banner / Info Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  {phase === "zero_night" && "🌙 Нулевая ночь (Договорка)"}
                  {phase === "day_speeches" && `☀️ Выступления игроков (День ${roundNumber})`}
                  {phase === "day_voting" && `🗳️ Голосование (День ${roundNumber})`}
                  {phase === "shootout" && `🛑 Автокатастрофа / Перестрелка (День ${roundNumber})`}
                  {phase === "night" && `🌙 Ночные действия (Ночь ${roundNumber} • ${nightSubPhase === "intro" ? "Начало" : nightSubPhase === "shooting" ? "Стрельба" : nightSubPhase === "don" ? "Проверка Дона" : nightSubPhase === "sheriff" ? "Проверка Шерифа" : nightSubPhase === "best_move" ? "Лучший ход" : "Утро"})`}
                </h2>
                <p className="text-[10px] text-slate-500">
                  {phase === "zero_night" && "Договорка мафии. Запустите таймеры подготовки."}
                  {phase === "day_speeches" && "Выступления игроков по очереди. Выставляйте кандидатов."}
                  {phase === "day_voting" && "Опрос игроков по выставленным кандидатам. Используйте пульт судейства."}
                  {phase === "shootout" && "Равное количество голосов. Речь 30 секунд для каждого номинанта."}
                  {phase === "night" && "Ночь в городе. Зафиксируйте выстрелы и проверки на виртуальном столе."}
                </p>
              </div>

              {/* Dynamic Header Action Buttons */}
              <div className="flex flex-wrap gap-2 w-full sm:w-auto text-xs">
                {phase === "day_speeches" && (
                  <>
                    {nextSpeaker ? (
                      <button
                        onClick={handleStartNextSpeaker}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        🎙️ Речь #{nextSpeaker.slot_num} {nextSpeaker.nickname}
                      </button>
                    ) : (
                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg font-bold">
                        Все выступили ✓
                      </span>
                    )}
                    {nominations.length > 0 && (
                      <button
                        onClick={handleTransitionToVoting}
                        className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        Перейти к голосованию ({nominations.length})
                      </button>
                    )}
                  </>
                )}

                {phase === "day_voting" && (
                  <button
                    onClick={handleResolveVoting}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    Подсчитать голоса 🗳️
                  </button>
                )}

                {phase === "night" && (
                  <div className="flex flex-wrap gap-1 bg-slate-950 p-1 rounded-xl border border-slate-850">
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
                          onClick={() => handleAdvanceNightSubPhase(sub)}
                          className={`px-2 py-1 rounded text-[9px] font-black uppercase transition-all cursor-pointer ${
                            active
                              ? "bg-purple-600 text-white shadow-md shadow-purple-600/15"
                              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                          }`}
                        >
                          {labels[sub]}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Sub-banners (like nominations list or night guides) */}
            {nominations.length > 0 && (phase === "day_speeches" || phase === "day_voting") && (
              <div className="bg-rose-500/5 border border-rose-500/15 rounded-xl p-2.5 flex flex-wrap gap-1.5 items-center text-[10px]">
                <span className="font-bold uppercase text-rose-400 mr-1.5">Номинанты:</span>
                {nominations.map((s) => (
                  <span
                    key={s}
                    className="bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded text-white font-mono flex items-center gap-1"
                  >
                    #{s} {activePlayers.find((p) => p.slot_num === s)?.nickname}
                  </span>
                ))}
              </div>
            )}

            {phase === "night" && (
              <div className="p-3 bg-slate-900/40 border border-slate-850 rounded-xl text-center">
                <span className="text-[10px] font-bold uppercase text-slate-300 flex items-center justify-center gap-1.5">
                  {nightSubPhase === "intro" && (
                    <>🌙 Оденьте маски. Город засыпает. Нажмите кнопку <strong className="text-purple-400">"Далее: Стрельба"</strong> в центре стола или степпер</>
                  )}
                  {nightSubPhase === "shooting" && (
                    <>🎯 Нажмите на цель на <strong className="text-rose-400">Столе</strong> для фиксации выстрела мафии</>
                  )}
                  {nightSubPhase === "don" && (
                    <>🎯 Нажмите на игрока на <strong className="text-purple-400">Столе</strong> для проверки Дона</>
                  )}
                  {nightSubPhase === "sheriff" && (
                    <>🎯 Нажмите на игрока на <strong className="text-emerald-400">Столе</strong> для проверки Шерифа</>
                  )}
                  {nightSubPhase === "best_move" && (
                    <>🏆 Нажмите на 3 номера мафии на <strong className="text-amber-400">Столе</strong> (версия убитого игрока)</>
                  )}
                  {nightSubPhase === "morning" && (
                    <>🌅 Проверьте итоги ночи в центре стола и нажмите <strong className="text-rose-400">"Утро! Начать новый день"</strong></>
                  )}
                </span>
              </div>
            )}

            {/* Core Table / List Content */}
            {viewMode === "table" ? (
              renderVirtualTable()
            ) : (
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
            )}
          </div>

          {/* EVENTS LOGGER PANEL AND END-GAME SCREEN */}
          <EventsPanel
            nightLogs={nightLogs}
            protocolNotes={protocolNotes}
            setProtocolNotes={setProtocolNotes}
            activePlayers={activePlayers}
            winTeam={winTeam}
            handleEndGameWithWinner={handleEndGameWithWinner}
          />
        </div>
      )}
    </div>
  );
}
