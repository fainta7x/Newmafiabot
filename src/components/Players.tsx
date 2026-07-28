import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, Plus, Award, Shield, UserPlus, DollarSign, Coins, X, Check, Edit2, Info, ChevronRight, Trash2, Database } from "lucide-react";
import { Player } from "../types.js";

export default function Players() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [achievementsList, setAchievementsList] = useState<{ [id: string]: any }>({});
  const [search, setSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  
  // Database Editor Mode state
  const [isDbEditorMode, setIsDbEditorMode] = useState(false);

  // Full Edit Player states
  const [isEditingAll, setIsEditingAll] = useState(false);
  const [editNickname, setEditNickname] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editElo, setEditElo] = useState(1500);
  const [editGamesPlayed, setEditGamesPlayed] = useState(0);
  const [editGamesWon, setEditGamesWon] = useState(0);
  const [editTokens, setEditTokens] = useState(0);
  const [editDebt, setEditDebt] = useState(0);
  const [editAchievements, setEditAchievements] = useState<string[]>([]);
  const [editError, setEditError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Create Player state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newElo, setNewElo] = useState("1500");
  const [addError, setAddError] = useState("");

  // Edit Debt / Token states
  const [editDebtVal, setEditDebtVal] = useState("");
  const [isEditingDebt, setIsEditingDebt] = useState(false);
  const [editTokenVal, setEditTokenVal] = useState("");
  const [isEditingTokens, setIsEditingTokens] = useState(false);

  useEffect(() => {
    fetchPlayers();
    fetchAchievements();
  }, []);

  const fetchPlayers = () => {
    fetch("/api/players")
      .then((res) => res.json())
      .then((data) => setPlayers(data))
      .catch((err) => console.error("Error fetching players", err));
  };

  const fetchAchievements = () => {
    fetch("/api/achievements-list")
      .then((res) => res.json())
      .then((data) => setAchievementsList(data))
      .catch((err) => console.error("Error fetching achievements", err));
  };

  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");

    if (!newNickname.trim()) {
      setAddError("Никнейм обязателен!");
      return;
    }

    fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: newNickname.trim(),
        full_name: newFullName.trim() || newNickname.trim(),
        username: newUsername.trim(),
        elo: parseInt(newElo) || 1500
      })
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Ошибка при создании игрока");
        }
        return res.json();
      })
      .then(() => {
        setNewNickname("");
        setNewFullName("");
        setNewUsername("");
        setNewElo("1500");
        setShowAddModal(false);
        fetchPlayers();
      })
      .catch((err) => {
        setAddError(err.message);
      });
  };

  const handleUpdateDebt = (playerId: number, amount: number) => {
    fetch(`/api/players/${playerId}/debt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, action: "set" })
    })
      .then((res) => res.json())
      .then((updated) => {
        setSelectedPlayer(updated);
        setIsEditingDebt(false);
        fetchPlayers();
      })
      .catch((err) => console.error("Error setting debt", err));
  };

  const handleOpenPlayerDetails = (player: Player) => {
    setSelectedPlayer(player);
    setEditDebtVal(player.debt !== 0 ? Math.abs(player.debt).toString() : "0");
    setIsEditingDebt(false);
    setIsEditingTokens(false);

    // Pre-fill states for comprehensive database editing
    setIsEditingAll(isDbEditorMode);
    setEditNickname(player.nickname);
    setEditFullName(player.full_name);
    setEditUsername(player.username || "");
    setEditElo(player.elo);
    setEditGamesPlayed(player.games_played);
    setEditGamesWon(player.games_won);
    setEditTokens(player.tokens);
    setEditDebt(player.debt !== 0 ? Math.abs(player.debt) : 0);
    setEditAchievements(player.achievements || []);
    setEditError("");
    setConfirmDelete(false);
  };

  const handleSaveChanges = () => {
    if (!editNickname.trim()) {
      setEditError("Никнейм обязателен!");
      return;
    }
    setEditError("");

    fetch(`/api/players/${selectedPlayer?.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: editNickname.trim(),
        full_name: editFullName.trim(),
        username: editUsername.trim(),
        elo: editElo,
        games_played: editGamesPlayed,
        games_won: editGamesWon,
        tokens: editTokens,
        debt: editDebt > 0 ? -Math.abs(editDebt) : 0, // Negative for database representation
        achievements: editAchievements
      })
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Ошибка сохранения");
        }
        return res.json();
      })
      .then((updatedPlayer) => {
        setSelectedPlayer(updatedPlayer);
        setIsEditingAll(false);
        fetchPlayers();
      })
      .catch((err) => {
        setEditError(err.message);
      });
  };

  const handleDeletePlayer = (playerId: number) => {
    fetch(`/api/players/${playerId}`, {
      method: "DELETE"
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Ошибка удаления");
        }
        return res.json();
      })
      .then(() => {
        setSelectedPlayer(null);
        fetchPlayers();
      })
      .catch((err) => {
        setEditError(err.message);
      });
  };

  // League Ecosystem Tab state
  const [leagueTab, setLeagueTab] = useState<"STANDARD" | "NOVICE" | "TOURNAMENT">("STANDARD");

  // Filter players by search
  const filteredPlayers = players.filter(
    (p) =>
      p.nickname.toLowerCase().includes(search.toLowerCase()) ||
      p.full_name.toLowerCase().includes(search.toLowerCase())
  );

  // Leaderboard sorting (standard ELO or win rate)
  const leaderboard = [...filteredPlayers].sort((a, b) => {
    if (leagueTab === "NOVICE") {
      // Sort by games played / activity for novices
      return b.games_played - a.games_played;
    }
    return b.elo - a.elo;
  });

  return (
    <div className="space-y-6">
      {/* Search and Action Header */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-500" />
          <input
            type="text"
            placeholder="Поиск игрока по нику или имени..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
          />
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button
            onClick={() => setIsDbEditorMode(!isDbEditorMode)}
            className={`w-full sm:w-auto rounded-xl px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 border transition-all cursor-pointer ${
              isDbEditorMode
                ? "bg-amber-600/20 text-amber-400 border-amber-500/40 hover:bg-amber-600/30 shadow-lg shadow-amber-500/5 animate-pulse"
                : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-300 hover:border-slate-700"
            }`}
          >
            <Database className="w-4 h-4" />
            {isDbEditorMode ? "Режим редактора: ВКЛ" : "Режим редактора: ВЫКЛ"}
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="w-full sm:w-auto bg-rose-600 hover:bg-rose-500 text-white rounded-xl px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" /> Добавить игрока
          </button>
        </div>
      </div>

      {/* League Ecosystem Switcher */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => setLeagueTab("STANDARD")}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
            leagueTab === "STANDARD"
              ? "bg-amber-950/60 border-amber-500/80 text-amber-300 shadow-neu-flat"
              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
          }`}
        >
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-sm">🎩 Классический зачет</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Клубный общий ELO рейтинг</p>
          </div>
          <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
            Основной
          </span>
        </button>

        <button
          onClick={() => setLeagueTab("NOVICE")}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
            leagueTab === "NOVICE"
              ? "bg-sky-950/60 border-sky-500/80 text-sky-300 shadow-neu-flat"
              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
          }`}
        >
          <div>
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-sky-400" />
              <span className="font-bold text-sm">🔰 Лига Новичков</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Обучающие вечера и активность</p>
          </div>
          <span className="text-xs font-mono font-bold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2.5 py-1 rounded-lg">
            Обучение
          </span>
        </button>

        <button
          onClick={() => setLeagueTab("TOURNAMENT")}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
            leagueTab === "TOURNAMENT"
              ? "bg-rose-950/60 border-rose-500/80 text-rose-300 shadow-neu-flat"
              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
          }`}
        >
          <div>
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-rose-400" />
              <span className="font-bold text-sm">🏆 Турнирный зачет</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Кубковые игры и соревнование</p>
          </div>
          <span className="text-xs font-mono font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-lg">
            Турниры
          </span>
        </button>
      </div>

      {/* Leaderboard Table Card */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-800/60 bg-slate-900/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
                <Shield className={`w-5 h-5 ${isDbEditorMode ? "text-amber-500" : "text-rose-500"}`} /> 
                {isDbEditorMode ? "Редактор Базы Данных Игроков" : "Рейтинговая таблица (Эло)"}
              </h2>
              <p className="text-xs text-slate-500">
                {isDbEditorMode 
                  ? "Режим прямого администрирования. Кликните на любого игрока для редактирования" 
                  : "Список игроков, отсортированный по уровню силы"}
              </p>
            </div>
            {isDbEditorMode && (
              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-lg text-xs font-semibold self-start sm:self-center">
                ⚙️ Кликните для редактирования
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="text-xs text-slate-400 bg-slate-950/40 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 w-16 text-center">Ранг</th>
                <th className="px-6 py-4">Игрок</th>
                <th className="px-6 py-4">Рейтинг Эло</th>
                <th className="px-6 py-4 hidden md:table-cell">Игр / Побед</th>
                <th className="px-6 py-4 hidden md:table-cell">Винрейт</th>
                <th className="px-6 py-4">Баланс долга</th>
                <th className="px-6 py-4 text-right">Детали</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {leaderboard.map((p, idx) => {
                const winRate = p.games_played > 0 ? Math.round((p.games_won / p.games_played) * 100) : 0;
                return (
                  <tr
                    key={p.id}
                    className={`transition-all cursor-pointer group ${
                      isDbEditorMode 
                        ? "border-l-2 border-l-amber-500 bg-amber-500/[0.02] hover:bg-amber-500/[0.06]" 
                        : "hover:bg-slate-900/30"
                    }`}
                    onClick={() => handleOpenPlayerDetails(p)}
                  >
                    <td className="px-6 py-4 text-center font-mono">
                      {idx + 1 === 1 ? (
                        <span className="text-xl">👑</span>
                      ) : idx + 1 === 2 ? (
                        <span className="text-lg text-slate-400">🥈</span>
                      ) : idx + 1 === 3 ? (
                        <span className="text-lg text-amber-600">🥉</span>
                      ) : (
                        <span className="text-slate-500 font-bold">{idx + 1}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-semibold text-white">
                      <div className="flex flex-col">
                        <span>{p.nickname}</span>
                        <span className="text-xs text-slate-500 font-normal">{p.full_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-rose-400">
                      {p.elo}
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell font-mono">
                      {p.games_played} / <span className="text-emerald-400">{p.games_won}</span>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full"
                            style={{ width: `${winRate}%` }}
                          ></div>
                        </div>
                        <span className="text-xs font-mono">{winRate}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {p.debt < 0 ? (
                        <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-md text-xs font-semibold">
                          Долг: {Math.abs(p.debt)} ₽
                        </span>
                      ) : (
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md text-xs font-semibold">
                          Оплачено
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isDbEditorMode ? (
                        <Edit2 className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform inline-block" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-rose-500 transition-colors inline-block" />
                      )}
                    </td>
                  </tr>
                );
              })}

              {leaderboard.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-500">
                    Игроки не найдены.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Player details Modal */}
      <AnimatePresence>
        {selectedPlayer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              {isEditingAll ? (
                <div className="p-6 border-b border-slate-800 flex justify-between items-start bg-amber-500/[0.03]">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-3xl">
                      ⚙️
                    </div>
                    <div>
                      <h3 className="text-xl font-display font-bold text-amber-400">Редактирование профиля игрока</h3>
                      <p className="text-xs text-slate-500">ID: {selectedPlayer.id} • UserID: {selectedPlayer.user_id}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedPlayer(null);
                      setIsEditingAll(false);
                    }}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              ) : (
                <div className="p-6 border-b border-slate-800 flex justify-between items-start bg-slate-950/20">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-3xl animate-pulse">
                      🎭
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-2xl font-display font-bold text-white">{selectedPlayer.nickname}</h3>
                        <button
                          onClick={() => setIsEditingAll(true)}
                          className="text-slate-500 hover:text-amber-400 p-1 rounded-lg hover:bg-slate-800/80 transition-all cursor-pointer"
                          title="Редактировать все данные"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-sm text-slate-400">{selectedPlayer.full_name} {selectedPlayer.username && `@${selectedPlayer.username}`}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedPlayer(null)}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              )}

              {/* Body */}
              {isEditingAll ? (
                <div className="p-6 overflow-y-auto space-y-5">
                  {editError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 font-medium">
                      {editError}
                    </div>
                  )}

                  {/* Primary Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 font-bold uppercase block">Никнейм *</label>
                      <input
                        type="text"
                        value={editNickname}
                        onChange={(e) => setEditNickname(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 font-bold uppercase block">Полное имя</label>
                      <input
                        type="text"
                        value={editFullName}
                        onChange={(e) => setEditFullName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 font-bold uppercase block">Telegram (без @)</label>
                      <input
                        type="text"
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  {/* Numeric Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 font-bold uppercase block">Рейтинг Эло</label>
                      <input
                        type="number"
                        value={editElo}
                        onChange={(e) => setEditElo(parseInt(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 font-bold uppercase block">Всего игр</label>
                      <input
                        type="number"
                        value={editGamesPlayed}
                        onChange={(e) => setEditGamesPlayed(parseInt(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 font-bold uppercase block">Побед</label>
                      <input
                        type="number"
                        value={editGamesWon}
                        onChange={(e) => setEditGamesWon(parseInt(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 font-bold uppercase block">Жетоны 🪙</label>
                      <input
                        type="number"
                        value={editTokens}
                        onChange={(e) => setEditTokens(parseInt(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div className="space-y-1 col-span-2 sm:col-span-1">
                      <label className="text-[10px] text-slate-400 font-bold uppercase block">Долг (₽)</label>
                      <input
                        type="number"
                        value={editDebt}
                        onChange={(e) => setEditDebt(parseInt(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                        placeholder="0 - нет долга"
                      />
                    </div>
                  </div>

                  {/* Edit Achievements */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-display font-bold text-slate-300 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-500 animate-bounce" /> Достижения игрока (клик для переключения)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                      {Object.entries(achievementsList).map(([id, ach]) => {
                        const isEarned = editAchievements.includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => {
                              if (isEarned) {
                                setEditAchievements(prev => prev.filter(aid => aid !== id));
                              } else {
                                setEditAchievements(prev => [...prev, id]);
                              }
                            }}
                            className={`p-2.5 rounded-xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                              isEarned
                                ? "bg-amber-500/10 border-amber-500/40 text-amber-100 shadow-sm"
                                : "bg-slate-950/20 border-slate-800/60 text-slate-500 hover:border-slate-700 hover:bg-slate-950/40"
                            }`}
                          >
                            <span className="text-xl">{ach.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold block truncate">{ach.name}</span>
                                {isEarned && <Check className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                              </div>
                              <span className="text-[9px] leading-tight block text-slate-400 truncate">{ach.description}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Delete Zone */}
                  <div className="p-3 bg-rose-950/20 border border-rose-900/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold text-rose-400 block">Опасная зона</span>
                      <span className="text-[10px] text-slate-400">Удаление профиля из базы данных. Это действие необратимо.</span>
                    </div>
                    
                    {confirmDelete ? (
                      <div className="flex gap-2 self-end sm:self-auto">
                        <button
                          type="button"
                          onClick={() => handleDeletePlayer(selectedPlayer.id)}
                          className="bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" /> Окончательно удалить
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          className="bg-slate-850 text-slate-300 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="bg-rose-950/60 hover:bg-rose-900/60 text-rose-400 text-xs font-semibold px-4 py-1.5 rounded-lg border border-rose-900/30 transition-all cursor-pointer self-end sm:self-auto"
                      >
                        Удалить игрока
                      </button>
                    )}
                  </div>

                  {/* Footer Edit Buttons */}
                  <div className="pt-3 border-t border-slate-850 flex justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingAll(false);
                        setConfirmDelete(false);
                      }}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveChanges}
                      className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-5 py-2 rounded-xl shadow-lg shadow-amber-500/5 transition-all cursor-pointer"
                    >
                      Сохранить изменения
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-6 overflow-y-auto space-y-6">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                    <div className="p-3.5 bg-slate-950/40 border border-slate-800/80 rounded-xl">
                      <span className="text-xs text-slate-500 block">Рейтинг Эло</span>
                      <span className="text-xl font-mono font-bold text-rose-400">{selectedPlayer.elo}</span>
                    </div>
                    <div className="p-3.5 bg-slate-950/40 border border-slate-800/80 rounded-xl">
                      <span className="text-xs text-slate-500 block">Всего игр</span>
                      <span className="text-xl font-mono font-bold text-white">{selectedPlayer.games_played}</span>
                    </div>
                    <div className="p-3.5 bg-slate-950/40 border border-slate-800/80 rounded-xl">
                      <span className="text-xs text-slate-500 block">Побед</span>
                      <span className="text-xl font-mono font-bold text-emerald-400">{selectedPlayer.games_won}</span>
                    </div>
                    <div className="p-3.5 bg-slate-950/40 border border-slate-800/80 rounded-xl">
                      <span className="text-xs text-slate-500 block">Жетоны</span>
                      <span className="text-xl font-mono font-bold text-amber-400 flex items-center justify-center gap-1">
                        {selectedPlayer.tokens} 🪙
                      </span>
                    </div>
                  </div>

                  {/* Achievements Book / Achievement list */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-display font-bold text-white flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-400 animate-pulse" /> Книга достижений игрока
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
                      {Object.entries(achievementsList).map(([id, ach]) => {
                        const isEarned = selectedPlayer.achievements.includes(id);
                        return (
                          <div
                            key={id}
                            className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${
                              isEarned
                                ? "bg-amber-500/5 border-amber-500/20 text-amber-100"
                                : "bg-slate-950/20 border-slate-800/60 text-slate-500 grayscale opacity-40"
                            }`}
                          >
                            <span className="text-2xl">{ach.icon}</span>
                            <div>
                              <span className="text-xs font-bold block">{ach.name}</span>
                              <span className="text-[10px] leading-tight block">{ach.description}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Finance Admin Controls */}
                  <div className="p-4 bg-slate-950/40 border border-slate-800/60 rounded-xl space-y-4">
                    <h4 className="text-sm font-display font-bold text-slate-300 flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-emerald-500 animate-pulse" /> Финансовый пульт (Админ)
                    </h4>
                    
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                      <div>
                        <span className="text-xs text-slate-500 block">Текущий баланс долга</span>
                        {selectedPlayer.debt < 0 ? (
                          <span className="text-lg font-mono font-bold text-rose-400">
                            Долг: {Math.abs(selectedPlayer.debt)} ₽
                          </span>
                        ) : (
                          <span className="text-lg font-semibold text-emerald-400">Долгов нет (0 ₽)</span>
                        )}
                      </div>

                      <div className="flex gap-2 w-full sm:w-auto">
                        {isEditingDebt ? (
                          <div className="flex gap-1 w-full sm:w-auto">
                            <input
                              type="number"
                              value={editDebtVal}
                              onChange={(e) => setEditDebtVal(e.target.value)}
                              className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm font-mono w-24 text-white focus:outline-none"
                              placeholder="Долг ₽"
                            />
                            <button
                              onClick={() => handleUpdateDebt(selectedPlayer.id, parseInt(editDebtVal) || 0)}
                              className="bg-emerald-600 hover:bg-emerald-500 p-1.5 rounded-lg text-white transition-colors cursor-pointer"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setIsEditingDebt(false)}
                              className="bg-slate-800 hover:bg-slate-700 p-1.5 rounded-lg text-slate-300 transition-colors cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2 w-full sm:w-auto">
                            <button
                              onClick={() => setIsEditingAll(true)}
                              className="bg-amber-600/15 hover:bg-amber-600/25 text-amber-400 text-xs font-semibold px-3 py-2 rounded-lg border border-amber-500/20 flex items-center gap-1 transition-colors cursor-pointer w-full sm:w-auto justify-center"
                            >
                              <Edit2 className="w-3 h-3" /> Редактировать всё
                            </button>
                            <button
                              onClick={() => setIsEditingDebt(true)}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold px-3 py-2 rounded-lg border border-slate-700 flex items-center gap-1 transition-colors cursor-pointer w-full sm:w-auto justify-center"
                            >
                              <DollarSign className="w-3 h-3" /> Изменить долг
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Player Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/20">
                <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-rose-500" /> Добавить нового игрока
                </h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddPlayer} className="p-6 space-y-4">
                {addError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 font-medium">
                    {addError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
                    Игровой никнейм *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Например: Алоэ"
                    value={newNickname}
                    onChange={(e) => setNewNickname(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
                    Полное имя
                  </label>
                  <input
                    type="text"
                    placeholder="Например: Александр Козлов"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
                    Telegram Юзернейм
                  </label>
                  <input
                    type="text"
                    placeholder="Например: aloe_maf (без @)"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
                    Начальный Эло
                  </label>
                  <input
                    type="number"
                    value={newElo}
                    onChange={(e) => setNewElo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-rose-500 font-mono"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl py-2.5 text-sm font-semibold transition-colors cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-rose-600 hover:bg-rose-500 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors cursor-pointer"
                  >
                    Сохранить
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
