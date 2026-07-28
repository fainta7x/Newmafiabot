import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Play, Shield, Award, CheckCircle, User, AlertCircle, Sparkles, AlertTriangle, Eye, Heart, Star } from "lucide-react";
import confetti from "canvas-confetti";

const PistolIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M4 9h14a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H12.5l-2.5 5.5a1 1 0 0 1-1 .5H5.5a1 1 0 0 1-1-1v-3.5H4a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1z" />
    <path d="M8.5 14c0 1.5-1 2-2 1" />
    <line x1="14" y1="9" x2="14" y2="14" />
  </svg>
);

const MafiaHatIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M2 16.5c3.5-1.5 16.5-1.5 20 0" />
    <path d="M6 14.5V9c0-1.5 1.5-2.5 3.5-2.5 1 0 2 .5 2.5 1 .5-.5 1.5-1 2.5-1 2 0 3.5 1 3.5 2.5v5.5" />
    <path d="M6 12h12" />
  </svg>
);
import { Player } from "../types.js";
import LiveGameEngine from "./LiveGameEngine";

interface ActiveSlot {
  slot_num: number;
  user_id: number;
  nickname: string;
  role: "Мирный" | "Шериф" | "Мафия" | "Дон";
  team: "Красные" | "Чёрные";
  bonus_points: number;
  lh_points: number;
  will_protocol_points: number;
  will_opinion_points: number;
  dc_points: number;
  kick: boolean;
  ppk: boolean;
  fouls: number;
  pu: boolean;
  alive: boolean;
  status_reason: string;
}

export default function GameWizard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [judgeId, setJudgeId] = useState<number>(0);
  const [winningTeam, setWinningTeam] = useState<"Красные" | "Чёрные">("Красные");
  const [protocolText, setProtocolText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveGameKey, setLiveGameKey] = useState(0);
  const [livePhase, setLivePhase] = useState<string>("setup");

  // Seating slots (10 players)
  const [slots, setSlots] = useState<ActiveSlot[]>(
    Array.from({ length: 10 }, (_, i) => ({
      slot_num: i + 1,
      user_id: 0,
      nickname: "",
      role: "Мирный",
      team: "Красные",
      bonus_points: 0,
      lh_points: 0,
      will_protocol_points: 0,
      will_opinion_points: 0,
      dc_points: 0,
      kick: false,
      ppk: false,
      fouls: 0,
      pu: false,
      alive: true,
      status_reason: "Жив"
    }))
  );

  // Live ELO Delta Previews
  const [eloPreviews, setEloPreviews] = useState<{ [slotNum: number]: number }>({});
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetch("/api/players")
      .then((res) => res.json())
      .then((data) => setPlayers(data))
      .catch((err) => console.error("Error fetching players", err));
  }, []);

  const handlePlayerSelect = (slotNum: number, userId: number) => {
    const p = players.find((pl) => pl.user_id === userId);
    setSlots((prev) =>
      prev.map((s) =>
        s.slot_num === slotNum
          ? { ...s, user_id: userId, nickname: p ? p.nickname : "" }
          : s
      )
    );
    setShowPreview(false);
  };

  const handleRoleSelect = (slotNum: number, role: "Мирный" | "Шериф" | "Мафия" | "Дон") => {
    const team = (role === "Мирный" || role === "Шериф") ? "Красные" : "Чёрные";
    setSlots((prev) =>
      prev.map((s) =>
        s.slot_num === slotNum
          ? { ...s, role, team }
          : s
      )
    );
    setShowPreview(false);
  };

  const handleFoulChange = (slotNum: number, fouls: number) => {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.slot_num === slotNum) {
          const alive = fouls < 4;
          const status_reason = fouls >= 4 ? "Удален за фолы" : s.status_reason === "Удален за фолы" ? "Жив" : s.status_reason;
          return { ...s, fouls, alive, status_reason };
        }
        return s;
      })
    );
  };

  const handleToggleState = (slotNum: number, field: "kick" | "ppk" | "pu" | "alive") => {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.slot_num === slotNum) {
          const val = !s[field];
          let status_reason = s.status_reason;
          if (field === "alive") {
            status_reason = val ? "Жив" : "Убит ночью";
          }
          return { ...s, [field]: val, status_reason };
        }
        return s;
      })
    );
  };

  const handlePointsChange = (slotNum: number, field: keyof ActiveSlot, val: number) => {
    setSlots((prev) =>
      prev.map((s) => (s.slot_num === slotNum ? { ...s, [field]: val } : s))
    );
    setShowPreview(false);
  };

  // Live ELO preview calculation using the exact logic coded server-side
  const handleCalculatePreview = () => {
    const previewDeltas: { [slotNum: number]: number } = {};
    const teamElos: { [team: string]: number[] } = { "Красные": [], "Чёрные": [] };

    // Group current ELOs
    slots.forEach((s) => {
      const player = players.find((p) => p.user_id === s.user_id);
      const currentElo = player ? player.elo : 1500;
      teamElos[s.team].push(currentElo);
    });

    const K_FACTOR = 32;
    const BONUS_TO_ELO_RATIO = 10;

    slots.forEach((s) => {
      if (!s.user_id) return;
      const player = players.find((p) => p.user_id === s.user_id);
      const currentElo = player ? player.elo : 1500;
      const isWin = s.team === winningTeam;

      const opponentTeam = s.team === "Красные" ? "Чёрные" : "Красные";
      const opponentElos = teamElos[opponentTeam];
      const opponentAvg = opponentElos.length > 0 ? opponentElos.reduce((a, b) => a + b, 0) / opponentElos.length : 1500;

      // ELO Expected Score
      const expected = 1 / (1 + Math.pow(10, (opponentAvg - currentElo) / 400));
      const actual = isWin ? 1.0 : 0.0;
      const rawDelta = K_FACTOR * (actual - expected);

      // Role coefficient
      let roleMod = 1.0;
      if (isWin) {
        roleMod = s.team === "Красные" ? 1.2 : 0.9;
      } else {
        roleMod = s.team === "Красные" ? 0.9 : 1.1;
      }

      // Carry coefficient
      let carryMod = 1.0;
      const myTeamElos = teamElos[s.team];
      if (myTeamElos.length >= 2) {
        const teamAvg = myTeamElos.reduce((a, b) => a + b, 0) / myTeamElos.length;
        const diff = currentElo - teamAvg;
        const normalized = Math.min(1.0, Math.max(-1.0, diff / 200));
        if (isWin) {
          carryMod = diff > 0 ? (1 + normalized * 0.3) : (1 - Math.abs(normalized) * 0.2);
        } else {
          carryMod = diff > 0 ? (1 - normalized * 0.4) : (1 + Math.abs(normalized) * 0.2);
        }
      }

      const gameDelta = Math.round(rawDelta * roleMod * carryMod);

      // Bonus ELO delta (extra points total * 10)
      const totalBonus = parseFloat((s.bonus_points || 0).toString()) +
                         parseFloat((s.lh_points || 0).toString()) +
                         parseFloat((s.will_protocol_points || 0).toString()) +
                         parseFloat((s.will_opinion_points || 0).toString()) +
                         parseFloat((s.dc_points || 0).toString());
      const bonusDelta = Math.round(totalBonus * BONUS_TO_ELO_RATIO);

      previewDeltas[s.slot_num] = gameDelta + bonusDelta;
    });

    setEloPreviews(previewDeltas);
    setShowPreview(true);
  };

  const handleSaveGame = () => {
    // Basic validations
    const selectedPlayers = slots.filter((s) => s.user_id > 0);
    if (selectedPlayers.length < 10) {
      alert("Необходимо выбрать игроков для всех 10 слотов!");
      return;
    }

    // Check duplicate players
    const ids = selectedPlayers.map((s) => s.user_id);
    if (new Set(ids).size !== ids.length) {
      alert("Некоторые игроки выбраны несколько раз! Каждый игрок за столом должен быть уникальным.");
      return;
    }

    if (!judgeId) {
      alert("Выберите судью игры!");
      return;
    }

    setIsSaving(true);

    fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        winning_team: winningTeam,
        protocol_text: protocolText.trim() || "Обычная игра",
        judge_id: judgeId,
        slots: slots
      })
    })
      .then((res) => res.json())
      .then((data) => {
        setIsSaving(false);
        setSuccessData(data);
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 }
        });
      })
      .catch((err) => {
        console.error("Error saving game", err);
        setIsSaving(false);
        alert("Ошибка при сохранении игры.");
      });
  };

  const handleLiveGameFinished = (gameData: { winning_team: "Красные" | "Чёрные"; protocol_text: string; slots: any[]; judge_id?: number }) => {
    setWinningTeam(gameData.winning_team);
    setProtocolText(gameData.protocol_text);
    if (gameData.judge_id) {
      setJudgeId(gameData.judge_id);
    }
    
    const mappedSlots: ActiveSlot[] = gameData.slots.map((s) => ({
      slot_num: s.slot_num,
      user_id: s.user_id,
      nickname: s.nickname,
      role: s.role,
      team: s.team,
      bonus_points: s.bonus_points,
      lh_points: s.lh_points,
      will_protocol_points: s.will_protocol_points,
      will_opinion_points: s.will_opinion_points,
      dc_points: s.dc_points,
      kick: s.kick,
      ppk: s.ppk,
      fouls: s.fouls,
      pu: s.pu,
      alive: s.alive,
      status_reason: s.status_reason
    }));

    setSlots(mappedSlots);
    setIsLiveMode(false);
    
    setTimeout(() => {
      calculateDeltasForSlots(mappedSlots, gameData.winning_team);
    }, 100);
  };

  const calculateDeltasForSlots = (targetSlots: ActiveSlot[], winTeam: "Красные" | "Чёрные") => {
    const previewDeltas: { [slotNum: number]: number } = {};
    const teamElos: { [team: string]: number[] } = { "Красные": [], "Чёрные": [] };

    targetSlots.forEach((s) => {
      const player = players.find((p) => p.user_id === s.user_id);
      const currentElo = player ? player.elo : 1500;
      teamElos[s.team].push(currentElo);
    });

    const K_FACTOR = 32;
    const BONUS_TO_ELO_RATIO = 10;

    targetSlots.forEach((s) => {
      if (!s.user_id) return;
      const player = players.find((p) => p.user_id === s.user_id);
      const currentElo = player ? player.elo : 1500;
      const isWin = s.team === winTeam;

      const opponentTeam = s.team === "Красные" ? "Чёрные" : "Красные";
      const opponentElos = teamElos[opponentTeam];
      const opponentAvg = opponentElos.length > 0 ? opponentElos.reduce((a, b) => a + b, 0) / opponentElos.length : 1500;

      const expected = 1 / (1 + Math.pow(10, (opponentAvg - currentElo) / 400));
      const actual = isWin ? 1.0 : 0.0;
      const rawDelta = K_FACTOR * (actual - expected);

      let roleMod = 1.0;
      if (isWin) {
        roleMod = s.team === "Красные" ? 1.2 : 0.9;
      } else {
        roleMod = s.team === "Красные" ? 0.9 : 1.1;
      }

      let carryMod = 1.0;
      const myTeamElos = teamElos[s.team];
      if (myTeamElos.length >= 2) {
        const teamAvg = myTeamElos.reduce((a, b) => a + b, 0) / myTeamElos.length;
        const diff = currentElo - teamAvg;
        const normalized = Math.min(1.0, Math.max(-1.0, diff / 200));
        if (isWin) {
          carryMod = diff > 0 ? (1 + normalized * 0.3) : (1 - Math.abs(normalized) * 0.2);
        } else {
          carryMod = diff > 0 ? (1 - normalized * 0.4) : (1 + Math.abs(normalized) * 0.2);
        }
      }

      const gameDelta = Math.round(rawDelta * roleMod * carryMod);

      const totalBonus = parseFloat((s.bonus_points || 0).toString()) +
                         parseFloat((s.lh_points || 0).toString()) +
                         parseFloat((s.will_protocol_points || 0).toString()) +
                         parseFloat((s.will_opinion_points || 0).toString()) +
                         parseFloat((s.dc_points || 0).toString());
      const bonusDelta = Math.round(totalBonus * BONUS_TO_ELO_RATIO);

      previewDeltas[s.slot_num] = gameDelta + bonusDelta;
    });

    setEloPreviews(previewDeltas);
    setShowPreview(true);
  };

  const handleResetWizard = () => {
    setSuccessData(null);
    setProtocolText("");
    setSlots((prev) =>
      prev.map((s) => ({
        ...s,
        user_id: 0,
        nickname: "",
        role: "Мирный",
        team: "Красные",
        bonus_points: 0,
        lh_points: 0,
        will_protocol_points: 0,
        will_opinion_points: 0,
        dc_points: 0,
        kick: false,
        ppk: false,
        fouls: 0,
        pu: false,
        alive: true,
        status_reason: "Жив"
      }))
    );
    setEloPreviews({});
    setShowPreview(false);
    setLiveGameKey((prev) => prev + 1);
  };

  // Get available players for slot choice (excluding judge and other slots if needed, but keeping it simple)
  const getAvailablePlayers = (currentSlotId: number) => {
    const selectedIds = slots
      .filter((s) => s.slot_num !== currentSlotId && s.user_id > 0)
      .map((s) => s.user_id);
    if (judgeId > 0) {
      selectedIds.push(judgeId);
    }
    return players.filter((p) => !selectedIds.includes(p.user_id));
  };

  if (successData) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl"
      >
        <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center text-4xl mx-auto text-emerald-400">
          🎉
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-display font-bold text-white">Игра успешно записана!</h2>
          <p className="text-sm text-slate-400">
            Все рейтинги Эло пересчитаны, жетоны начислены, достижения проверены.
          </p>
        </div>

        {/* Unlocked Achievements list */}
        {successData.achievementsUnlocked && successData.achievementsUnlocked.length > 0 && (
          <div className="p-5 bg-amber-500/5 border border-amber-500/10 rounded-xl space-y-3 text-left">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <Award className="w-3.5 h-3.5" /> Открыты новые достижения!
            </h3>
            <div className="space-y-2.5">
              {successData.achievementsUnlocked.map((p: any, idx: number) => (
                <div key={idx} className="flex flex-col gap-1.5 border-b border-slate-800/40 pb-2 last:border-0 last:pb-0">
                  <span className="text-sm font-semibold text-white">{p.nickname}:</span>
                  <div className="flex flex-wrap gap-2">
                    {p.unlocked.map((ach: any, aIdx: number) => (
                      <div key={aIdx} className="bg-slate-950/60 border border-slate-800 px-3 py-1 rounded-lg flex items-center gap-2">
                        <span className="text-lg">{ach.icon}</span>
                        <div>
                          <span className="text-xs font-bold block text-amber-100">{ach.name}</span>
                          <span className="text-[10px] text-slate-400 block">{ach.description}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 flex justify-center gap-4">
          <button
            onClick={handleResetWizard}
            className="bg-rose-600 hover:bg-rose-500 text-white rounded-xl px-6 py-3 text-sm font-semibold transition-colors cursor-pointer"
          >
            Записать следующую игру
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mode Selector Panel */}
      {(!isLiveMode || livePhase === "setup") && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <h3 className="text-md font-display font-bold text-white flex items-center gap-2">
              ⭐ Выбор Режима Судейства
            </h3>
            <p className="text-xs text-slate-500">Проводите игру в реальном времени или быстро запишите готовый протокол</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setIsLiveMode(false)}
              className={`flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                !isLiveMode
                  ? "bg-rose-600/15 border-rose-500 text-rose-400"
                  : "bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-200"
              }`}
            >
              📋 Быстрая Запись
            </button>
            <button
              onClick={() => {
                setIsLiveMode(true);
              }}
              className={`flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                isLiveMode
                  ? "bg-rose-600/15 border-rose-500 text-rose-400"
                  : "bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-200"
              }`}
            >
              ⏱️ Живое Судейство (ФСМ)
            </button>
          </div>
        </div>
      )}

      <div className={isLiveMode ? "block" : "hidden"}>
        <LiveGameEngine
          key={liveGameKey}
          players={players}
          initialJudgeId={judgeId}
          onGameFinished={handleLiveGameFinished}
          onCancel={() => {
            setIsLiveMode(false);
            setLiveGameKey((prev) => prev + 1);
            setLivePhase("setup");
          }}
          onPhaseChange={setLivePhase}
        />
      </div>

      {!isLiveMode && (
        <>
          {/* If they just completed a live game, show a banner allowing them to go back and resume! */}
          {protocolText && slots.some((s) => s.user_id > 0) && (
            <div className="bg-amber-600/10 border-2 border-amber-500/35 p-5 rounded-3xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-xl mb-6">
              <div className="space-y-1">
                <span className="text-xs font-black uppercase text-amber-400 block tracking-wider flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  Живая игра приостановлена / завершена
                </span>
                <span className="text-xs text-slate-300 block">
                  Вы можете продолжить настройки протокола или вернуться в живой судейский пульт без потери состояния стола.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsLiveMode(true)}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-2xl text-xs uppercase cursor-pointer shrink-0 transition-all shadow-lg shadow-amber-500/10"
              >
                Вернуться к живому судейству ⏱️
              </button>
            </div>
          )}

          {/* Configuration panel */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
              <Play className="w-5 h-5 text-rose-500" /> Настройка Протокола Игры
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Judge choice */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
                  Судья Вечера
                </label>
                <select
                  value={judgeId}
                  onChange={(e) => setJudgeId(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-rose-500"
                >
                  <option value={0}>-- Выбрать судью --</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.user_id}>
                      {p.nickname} ({p.full_name})
                    </option>
                  ))}
                </select>
              </div>

              {/* Winner Choice */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
                  Победившая Команда
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setWinningTeam("Красные"); setShowPreview(false); }}
                    className={`py-2 px-4 rounded-xl text-xs font-semibold uppercase tracking-wide border transition-all cursor-pointer ${
                      winningTeam === "Красные"
                        ? "bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-600/10"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    Красные
                  </button>
                  <button
                    type="button"
                    onClick={() => { setWinningTeam("Чёрные"); setShowPreview(false); }}
                    className={`py-2 px-4 rounded-xl text-xs font-semibold uppercase tracking-wide border transition-all cursor-pointer ${
                      winningTeam === "Чёрные"
                        ? "bg-slate-800 border-slate-700 text-white shadow-lg shadow-slate-800/20"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    Чёрные
                  </button>
                </div>
              </div>

              {/* Summary notes */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
                  Протокольный текст / Описание
                </label>
                <input
                  type="text"
                  placeholder="Например: Победа мафии по критическому кругу"
                  value={protocolText}
                  onChange={(e) => setProtocolText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>
          </div>

          {/* 10-player table seeding */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-md font-display font-bold text-white uppercase tracking-wider">
                Игровой стол (Слоты 1-10)
              </h3>
              <p className="text-xs text-slate-500">Заполните данные по каждому из 10 слотов</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {slots.map((s) => {
                const available = getAvailablePlayers(s.slot_num);
                const previewEloDelta = eloPreviews[s.slot_num];

                const isMir = s.role === "Мирный";
                const isSheriff = s.role === "Шериф";
                const isMafia = s.role === "Мафия";
                const isDon = s.role === "Дон";

                return (
                  <div
                    key={s.slot_num}
                    className={`p-4 rounded-2xl border bg-slate-900/60 backdrop-blur-md flex flex-col gap-3.5 relative overflow-hidden transition-all ${
                      isMir ? "border-rose-500/15 hover:border-rose-500/30" :
                      isSheriff ? "border-emerald-500/15 hover:border-emerald-500/30" :
                      isMafia ? "border-slate-700 hover:border-slate-600 bg-slate-900/80" :
                      "border-purple-500/15 hover:border-purple-500/30"
                    }`}
                  >
                    {/* Seating Seat Badge */}
                    <div className={`absolute right-3 top-3 w-7 h-7 rounded-lg font-mono font-bold text-xs flex items-center justify-center border transition-all ${
                      isMir ? "bg-rose-950/80 border-rose-800/60 text-rose-400" :
                      isSheriff ? "bg-emerald-950/80 border-emerald-800/60 text-emerald-400" :
                      isMafia ? "bg-slate-200 border-slate-400 text-slate-950 shadow-inner" :
                      "bg-purple-950/80 border-purple-800/60 text-purple-400"
                    }`}>
                      #{s.slot_num}
                    </div>

                    {/* Seating Row info */}
                    <div className="flex gap-3 items-center">
                      {/* Select Player dropdown */}
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase block">
                          Игрок
                        </label>
                        <select
                          value={s.user_id}
                          onChange={(e) => handlePlayerSelect(s.slot_num, parseInt(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-200 focus:outline-none"
                        >
                          <option value={0}>-- Слот {s.slot_num} --</option>
                          {available.map((p) => (
                            <option key={p.id} value={p.user_id}>
                              {p.nickname} (Эло: {p.elo})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Select Role */}
                      <div className="space-y-1 shrink-0">
                        <label className="text-[10px] text-slate-500 font-bold uppercase block">
                          Роль
                        </label>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => handleRoleSelect(s.slot_num, "Мирный")}
                            className={`p-1.5 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                              s.role === "Мирный"
                                ? "bg-rose-500/15 border-rose-500/50 text-rose-500 scale-105 shadow-md shadow-rose-500/5"
                                : "bg-slate-950 border-slate-850 text-slate-500 hover:text-slate-400 hover:bg-slate-900"
                            }`}
                            title="Мирный"
                          >
                            <Heart className={`w-3.5 h-3.5 ${s.role === "Мирный" ? "fill-current" : ""}`} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRoleSelect(s.slot_num, "Шериф")}
                            className={`p-1.5 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                              s.role === "Шериф"
                                ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-400 scale-105 shadow-md shadow-emerald-500/5"
                                : "bg-slate-950 border-slate-850 text-slate-500 hover:text-slate-400 hover:bg-slate-900"
                            }`}
                            title="Шериф"
                          >
                            <Star className={`w-3.5 h-3.5 ${s.role === "Шериф" ? "fill-current" : ""}`} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRoleSelect(s.slot_num, "Мафия")}
                            className={`p-1.5 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                              s.role === "Мафия"
                                ? "bg-slate-200 border-slate-400 text-slate-950 scale-105 shadow-md shadow-slate-200/5"
                                : "bg-slate-950 border-slate-850 text-slate-500 hover:text-slate-400 hover:bg-slate-900"
                            }`}
                            title="Мафия"
                          >
                            <PistolIcon className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRoleSelect(s.slot_num, "Дон")}
                            className={`p-1.5 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                              s.role === "Дон"
                                ? "bg-purple-500/15 border-purple-500/50 text-purple-400 scale-105 shadow-md shadow-purple-500/5"
                                : "bg-slate-950 border-slate-850 text-slate-500 hover:text-slate-400 hover:bg-slate-900"
                            }`}
                            title="Дон"
                          >
                            <MafiaHatIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Additional detailed scores (fouls, best move etc.) */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {/* Fouls count */}
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-500 font-bold block uppercase">Фолы</span>
                        <select
                          value={s.fouls}
                          onChange={(e) => handleFoulChange(s.slot_num, parseInt(e.target.value))}
                          className="bg-slate-950 border border-slate-850 rounded-lg w-full px-2 py-1 text-xs text-slate-300 focus:outline-none font-mono"
                        >
                          <option value={0}>0 фолов</option>
                          <option value={1}>1 фол</option>
                          <option value={2}>2 фола</option>
                          <option value={3}>3 фола</option>
                          <option value={4}>4 фола 🛑</option>
                        </select>
                      </div>

                      {/* Bonus points input */}
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-500 font-bold block uppercase">Доп. балл</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="1"
                          value={s.bonus_points}
                          onChange={(e) => handlePointsChange(s.slot_num, "bonus_points", parseFloat(e.target.value) || 0)}
                          className="bg-slate-950 border border-slate-850 rounded-lg w-full px-2 py-1 text-xs text-slate-300 focus:outline-none font-mono"
                          placeholder="0.0"
                        />
                      </div>

                      {/* LCh / Best Move points */}
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-500 font-bold block uppercase">Балл ЛХ</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="1"
                          value={s.lh_points}
                          onChange={(e) => handlePointsChange(s.slot_num, "lh_points", parseFloat(e.target.value) || 0)}
                          className="bg-slate-950 border border-slate-850 rounded-lg w-full px-2 py-1 text-xs text-slate-300 focus:outline-none font-mono"
                          placeholder="0.0"
                        />
                      </div>

                      {/* Prophetic Protocol / ПП */}
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-500 font-bold block uppercase">Балл ПП</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="1"
                          value={s.will_protocol_points}
                          onChange={(e) => handlePointsChange(s.slot_num, "will_protocol_points", parseFloat(e.target.value) || 0)}
                          className="bg-slate-950 border border-slate-850 rounded-lg w-full px-2 py-1 text-xs text-slate-300 focus:outline-none font-mono"
                          placeholder="0.0"
                        />
                      </div>

                      {/* Disciplinary / DC points */}
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-500 font-bold block uppercase">Штраф ДЦ</span>
                        <input
                          type="number"
                          step="0.1"
                          max="0"
                          min="-1"
                          value={s.dc_points}
                          onChange={(e) => handlePointsChange(s.slot_num, "dc_points", parseFloat(e.target.value) || 0)}
                          className="bg-slate-950 border border-slate-850 rounded-lg w-full px-2 py-1 text-xs text-slate-300 focus:outline-none font-mono"
                          placeholder="0.0"
                        />
                      </div>
                    </div>

                    {/* State flags row (Kicked, ppk, pu, alive) */}
                    <div className="flex flex-wrap justify-between items-center gap-2 pt-1 border-t border-slate-850/40">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleState(s.slot_num, "pu")}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                            s.pu
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                              : "bg-slate-950 border-slate-850 text-slate-600 hover:text-slate-400"
                          }`}
                        >
                          ПУ 🎯
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleState(s.slot_num, "ppk")}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                            s.ppk
                              ? "bg-rose-500/10 border-rose-500/30 text-rose-400 animate-pulse"
                              : "bg-slate-950 border-slate-850 text-slate-600 hover:text-slate-400"
                          }`}
                        >
                          ППК 🚨
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleState(s.slot_num, "kick")}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                            s.kick
                              ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                              : "bg-slate-950 border-slate-850 text-slate-600 hover:text-slate-400"
                          }`}
                        >
                          Удален ⚖️
                        </button>
                      </div>

                      {/* Live ELO preview display */}
                      {showPreview && s.user_id > 0 && (
                        <span
                          className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg ${
                            previewEloDelta >= 0
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/10"
                          }`}
                        >
                          {previewEloDelta >= 0 ? `+${previewEloDelta}` : previewEloDelta} Эло
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Preview and Record controls */}
          <div className="flex flex-col sm:flex-row justify-end items-center gap-4 pt-6 border-t border-slate-800">
            <button
              type="button"
              onClick={handleCalculatePreview}
              className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl px-6 py-3 text-sm font-semibold border border-slate-700 transition-colors cursor-pointer"
            >
              Калькулировать Эло дельты
            </button>

            <button
              type="button"
              onClick={handleSaveGame}
              disabled={isSaving}
              className="w-full sm:w-auto bg-rose-600 hover:bg-rose-500 text-white rounded-xl px-8 py-3 text-sm font-bold shadow-lg shadow-rose-600/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? "Запись..." : "Подтвердить & Сохранить Игру"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
