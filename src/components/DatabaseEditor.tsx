import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, Plus, Award, Shield, UserPlus, DollarSign, Coins, X, Check,
  Edit2, Info, ChevronRight, Trash2, Database, CalendarRange, ShoppingBag,
  History, FileText, CheckCircle2, User, RefreshCw
} from "lucide-react";
import { Player, Booking, Game, ShopPurchase } from "../types.js";

type EditorTab = "players" | "bookings" | "games" | "purchases";

export default function DatabaseEditor() {
  const [activeTab, setActiveTab] = useState<EditorTab>("players");
  const [searchQuery, setSearchQuery] = useState("");

  // Data states
  const [players, setPlayers] = useState<Player[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [purchases, setPurchases] = useState<ShopPurchase[]>([]);
  const [achievementsList, setAchievementsList] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal / Editing states
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);

  // Player Form states
  const [pNickname, setPNickname] = useState("");
  const [pFullName, setPFullName] = useState("");
  const [pUsername, setPUsername] = useState("");
  const [pElo, setPElo] = useState(1500);
  const [pGamesPlayed, setPGamesPlayed] = useState(0);
  const [pGamesWon, setPGamesWon] = useState(0);
  const [pTokens, setPTokens] = useState(0);
  const [pDebt, setPDebt] = useState(0);
  const [pAchievements, setPAchievements] = useState<string[]>([]);
  const [pError, setPError] = useState("");

  // Booking Form states
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [bookingOldKeys, setBookingOldKeys] = useState<{ nickname: string; date: string } | null>(null);
  const [showAddBookingModal, setShowAddBookingModal] = useState(false);
  const [bNickname, setBNickname] = useState("");
  const [bStatus, setBStatus] = useState<"Вовремя" | "Позже" | "Отмена">("Вовремя");
  const [bDate, setBDate] = useState("");

  // Game Form states
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [gDate, setGDate] = useState("");
  const [gWinner, setGWinner] = useState<"Красные" | "Чёрные">("Красные");
  const [gProtocol, setGProtocol] = useState("");
  const [gJudge, setGJudge] = useState("");
  const [gGlobalNumber, setGGlobalNumber] = useState(100);

  // Purchase Form states
  const [editingPurchase, setEditingPurchase] = useState<ShopPurchase | null>(null);
  const [purNickname, setPurNickname] = useState("");
  const [purItemName, setPurItemName] = useState("");
  const [purPrice, setPurPrice] = useState(0);
  const [purTimestamp, setPurTimestamp] = useState("");

  // Confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<any>(null);

  // Fetch all database tables
  const fetchData = async () => {
    setLoading(true);
    try {
      const [resPlayers, resBookings, resGames, resPurchases, resAch] = await Promise.all([
        fetch("/api/players").then(r => r.json()),
        fetch("/api/bookings").then(r => r.json()),
        fetch("/api/games").then(r => r.json()),
        fetch("/api/admin/purchases").then(r => r.json()),
        fetch("/api/achievements-list").then(r => r.json())
      ]);

      setPlayers(resPlayers);
      setBookings(resBookings);
      setGames(resGames);
      setPurchases(resPurchases);
      setAchievementsList(resAch);
    } catch (err) {
      console.error("Failed to load admin editor data", err);
      showToast("Ошибка загрузки данных базы");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // ==========================================
  // PLAYER CRUD OPERATIONS
  // ==========================================
  const handleOpenAddPlayer = () => {
    setPNickname("");
    setPFullName("");
    setPUsername("");
    setPElo(1500);
    setPGamesPlayed(0);
    setPGamesWon(0);
    setPTokens(0);
    setPDebt(0);
    setPAchievements([]);
    setPError("");
    setShowAddPlayerModal(true);
  };

  const handleOpenEditPlayer = (p: Player) => {
    setEditingPlayer(p);
    setPNickname(p.nickname);
    setPFullName(p.full_name);
    setPUsername(p.username || "");
    setPElo(p.elo);
    setPGamesPlayed(p.games_played);
    setPGamesWon(p.games_won);
    setPTokens(p.tokens);
    setPDebt(p.debt !== 0 ? Math.abs(p.debt) : 0);
    setPAchievements(p.achievements || []);
    setPError("");
  };

  const handleSavePlayer = async () => {
    if (!pNickname.trim()) {
      setPError("Никнейм обязателен!");
      return;
    }
    setPError("");

    const payload = {
      nickname: pNickname.trim(),
      full_name: pFullName.trim(),
      username: pUsername.trim(),
      elo: pElo,
      games_played: pGamesPlayed,
      games_won: pGamesWon,
      tokens: pTokens,
      debt: pDebt > 0 ? -Math.abs(pDebt) : 0, // Negative for database representation
      achievements: pAchievements
    };

    try {
      const url = editingPlayer ? `/api/players/${editingPlayer.id}` : `/api/admin/players`;
      const method = editingPlayer ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка сохранения");
      }

      showToast(editingPlayer ? "Профиль игрока обновлен" : "Новый игрок добавлен в базу");
      setEditingPlayer(null);
      setShowAddPlayerModal(false);
      fetchData();
    } catch (err: any) {
      setPError(err.message);
    }
  };

  const handleDeletePlayer = async (id: number) => {
    try {
      const res = await fetch(`/api/players/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка удаления");
      }
      showToast("Игрок удален из базы данных");
      setEditingPlayer(null);
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  // ==========================================
  // BOOKING CRUD OPERATIONS
  // ==========================================
  const handleOpenAddBooking = () => {
    setBNickname("");
    setBStatus("Вовремя");
    // Default to coming Friday's date
    const d = new Date();
    d.setDate(d.getDate() + ((5 + 7 - d.getDay()) % 7));
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    setBDate(`${day}.${month}.${year}`);
    setShowAddBookingModal(true);
  };

  const handleOpenEditBooking = (b: Booking) => {
    setEditingBooking(b);
    setBookingOldKeys({ nickname: b.nickname, date: b.date });
    setBNickname(b.nickname);
    setBStatus(b.status);
    setBDate(b.date);
  };

  const handleSaveBooking = async () => {
    if (!bNickname.trim() || !bDate.trim()) {
      showToast("Заполните никнейм и дату!");
      return;
    }

    try {
      if (editingBooking && bookingOldKeys) {
        const res = await fetch("/api/admin/bookings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            oldNickname: bookingOldKeys.nickname,
            oldDate: bookingOldKeys.date,
            nickname: bNickname.trim(),
            status: bStatus,
            date: bDate.trim()
          })
        });
        if (!res.ok) throw new Error("Ошибка обновления записи");
        showToast("Запись бронирования обновлена");
      } else {
        const player = players.find(p => p.nickname.toLowerCase() === bNickname.toLowerCase());
        const res = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: player ? player.user_id : 9999,
            nickname: bNickname.trim(),
            status: bStatus
          })
        });
        if (!res.ok) throw new Error("Ошибка создания записи");
        showToast("Новое бронирование создано");
      }
      setEditingBooking(null);
      setShowAddBookingModal(false);
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleDeleteBooking = async (b: Booking) => {
    try {
      const res = await fetch(`/api/admin/bookings?nickname=${encodeURIComponent(b.nickname)}&date=${b.date}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Не удалось удалить бронирование");
      showToast("Запись бронирования удалена");
      setEditingBooking(null);
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  // ==========================================
  // GAME CRUD OPERATIONS
  // ==========================================
  const handleOpenEditGame = (g: Game) => {
    setEditingGame(g);
    setGDate(g.game_date);
    setGWinner(g.winner_label);
    setGProtocol(g.protocol_text);
    setGJudge(g.judge_name);
    setGGlobalNumber(g.global_game_number);
  };

  const handleSaveGame = async () => {
    if (!editingGame) return;
    try {
      const res = await fetch(`/api/admin/games/${editingGame.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game_date: gDate,
          winner_label: gWinner,
          protocol_text: gProtocol,
          judge_name: gJudge,
          global_game_number: gGlobalNumber
        })
      });
      if (!res.ok) throw new Error("Ошибка изменения игры");
      showToast("Протокол игры успешно изменен");
      setEditingGame(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleDeleteGame = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/games/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Не удалось удалить игру");
      showToast("Игра удалена из истории");
      setEditingGame(null);
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  // ==========================================
  // PURCHASE CRUD OPERATIONS
  // ==========================================
  const handleOpenEditPurchase = (p: ShopPurchase) => {
    setEditingPurchase(p);
    setPurNickname(p.nickname);
    setPurItemName(p.item_name);
    setPurPrice(p.price);
    setPurTimestamp(p.timestamp);
  };

  const handleSavePurchase = async () => {
    if (!editingPurchase) return;
    try {
      const res = await fetch(`/api/admin/purchases/${editingPurchase.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: purNickname,
          item_name: purItemName,
          price: purPrice,
          timestamp: purTimestamp
        })
      });
      if (!res.ok) throw new Error("Ошибка изменения покупки");
      showToast("Транзакция магазина изменена");
      setEditingPurchase(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleDeletePurchase = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/purchases/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Не удалось удалить транзакцию");
      showToast("Транзакция удалена из базы");
      setEditingPurchase(null);
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  // Filter lists based on search
  const filteredPlayers = players.filter(p =>
    p.nickname.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredBookings = bookings.filter(b =>
    b.nickname.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.date.includes(searchQuery)
  );

  const filteredGames = games.filter(g =>
    g.judge_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.winner_label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.protocol_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.game_date.includes(searchQuery)
  );

  const filteredPurchases = purchases.filter(p =>
    p.nickname.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.item_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Dynamic Toast Alert */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 z-50 bg-amber-500 text-slate-950 font-bold px-4 py-3 rounded-xl shadow-neu-flat-amber flex items-center gap-2 border border-amber-400"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Banner (Neumorphic Style) */}
      <div className="bg-slate-900 border border-slate-800/40 rounded-3xl p-6 md:p-8 shadow-neu-flat">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4.5">
            <div className="w-16 h-16 rounded-2xl bg-amber-600/10 border border-amber-500/35 flex items-center justify-center text-3xl shadow-neu-inset text-amber-400">
              ⚙️
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-extrabold text-white tracking-tight">
                Панель Управления БД
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Административный CRM-пульт: прямой доступ и CRUD операции для таблиц клуба
              </p>
            </div>
          </div>
          
          <button
            onClick={fetchData}
            disabled={loading}
            className="self-start md:self-auto bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-white px-4 py-2.5 rounded-2xl text-xs font-mono font-bold text-slate-300 flex items-center gap-2 transition-all shadow-neu-flat hover:shadow-neu-inset cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            ОБНОВИТЬ БАЗУ
          </button>
        </div>
      </div>

      {/* Database Selector (Neumorphic Tabs) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { id: "players", label: "Игроки (Players)", count: players.length, icon: User },
          { id: "bookings", label: "Брони (Bookings)", count: bookings.length, icon: CalendarRange },
          { id: "games", label: "Протоколы (Games)", count: games.length, icon: History },
          { id: "purchases", label: "Покупки (Purchases)", count: purchases.length, icon: ShoppingBag },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as EditorTab);
                setSearchQuery("");
              }}
              className={`p-5 rounded-3xl border text-left transition-all relative cursor-pointer ${
                isActive
                  ? "bg-slate-900 border-amber-500/30 text-amber-400 shadow-neu-inset"
                  : "bg-slate-900 border-slate-800/40 text-slate-400 hover:text-slate-200 shadow-neu-flat hover:shadow-neu-inset"
              }`}
            >
              <div className="flex items-center justify-between">
                <tab.icon className={`w-5 h-5 ${isActive ? "text-amber-400" : "text-slate-500"}`} />
                <span className="text-xs font-mono bg-slate-950/60 px-2 py-0.5 rounded-lg border border-slate-800/80 font-bold text-slate-400">
                  {tab.count}
                </span>
              </div>
              <h3 className="font-display font-bold text-sm text-white mt-4">{tab.label}</h3>
              <p className="text-[10px] text-slate-500 mt-1 uppercase font-semibold tracking-wider font-mono">
                {isActive ? "Просмотр и Редакт" : "Клик для перехода"}
              </p>
            </button>
          );
        })}
      </div>

      {/* Main Table Card */}
      <div className="bg-slate-900 border border-slate-800/40 rounded-3xl overflow-hidden shadow-neu-flat">
        {/* Controls header */}
        <div className="p-6 border-b border-slate-800/60 bg-slate-950/10 flex flex-col sm:flex-row gap-4 items-center justify-between">
          {/* Search bar inside inset neumorphic container */}
          <div className="relative w-full sm:max-w-md bg-slate-950 border border-slate-800/80 rounded-2xl p-0.5 shadow-neu-inset">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder={`Быстрый поиск по базе (${activeTab})...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent pl-11 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
            />
          </div>

          {/* Table actions */}
          <div>
            {activeTab === "players" && (
              <button
                onClick={handleOpenAddPlayer}
                className="w-full sm:w-auto bg-slate-900 border border-slate-800 hover:border-slate-700 text-amber-400 rounded-2xl px-5 py-3 text-xs font-bold font-mono tracking-wider flex items-center justify-center gap-2 transition-all shadow-neu-flat hover:shadow-neu-inset cursor-pointer uppercase"
              >
                <UserPlus className="w-4 h-4" /> Добавить нового игрока
              </button>
            )}
            {activeTab === "bookings" && (
              <button
                onClick={handleOpenAddBooking}
                className="w-full sm:w-auto bg-slate-900 border border-slate-800 hover:border-slate-700 text-amber-400 rounded-2xl px-5 py-3 text-xs font-bold font-mono tracking-wider flex items-center justify-center gap-2 transition-all shadow-neu-flat hover:shadow-neu-inset cursor-pointer uppercase"
              >
                <Plus className="w-4 h-4" /> Создать бронь вручную
              </button>
            )}
          </div>
        </div>

        {/* Dynamic content tables */}
        <div className="overflow-x-auto">
          {/* PLAYERS TABLE */}
          {activeTab === "players" && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-500 bg-slate-950/20">
                  <th className="px-6 py-4">ID</th>
                  <th className="px-6 py-4">Никнейм / Имя</th>
                  <th className="px-6 py-4">Телеграм</th>
                  <th className="px-6 py-4 text-center">ЭЛО</th>
                  <th className="px-6 py-4 text-center">Игр (Побед)</th>
                  <th className="px-6 py-4 text-right">Жетоны</th>
                  <th className="px-6 py-4 text-right">Финансы</th>
                  <th className="px-6 py-4 text-right">Опции</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredPlayers.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-950/15 transition-colors group">
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{p.id}</td>
                    <td className="px-6 py-4">
                      <span className="font-display font-bold text-slate-200 block">{p.nickname}</span>
                      <span className="text-xs text-slate-500 block">{p.full_name || "—"}</span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-400">
                      {p.username ? `@${p.username}` : "—"}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-mono font-bold text-rose-400 bg-rose-500/5 border border-rose-500/10 px-2.5 py-1 rounded-xl">
                        {p.elo}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center font-mono text-xs text-slate-300">
                      {p.games_played} <span className="text-emerald-500 font-bold">({p.games_won})</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-mono text-amber-400 font-bold flex items-center justify-end gap-1 text-sm">
                        {p.tokens} <Coins className="w-3.5 h-3.5" />
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {p.debt < 0 ? (
                        <span className="font-mono text-rose-400 font-bold bg-rose-500/5 px-2.5 py-1 rounded-xl text-xs border border-rose-500/10">
                          {p.debt} ₽
                        </span>
                      ) : (
                        <span className="text-emerald-500 font-semibold text-xs font-mono">0 ₽</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleOpenEditPlayer(p)}
                        className="bg-slate-950/60 p-2 border border-slate-800 hover:border-amber-500/30 text-slate-400 hover:text-amber-400 rounded-xl transition-all shadow-neu-flat-sm hover:shadow-neu-inset cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* BOOKINGS TABLE */}
          {activeTab === "bookings" && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-500 bg-slate-950/20">
                  <th className="px-6 py-4">Игрок (Никнейм)</th>
                  <th className="px-6 py-4">Планируемая дата</th>
                  <th className="px-6 py-4">Статус визита</th>
                  <th className="px-6 py-4">User ID</th>
                  <th className="px-6 py-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredBookings.map((b, idx) => (
                  <tr key={idx} className="hover:bg-slate-950/15 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-display font-bold text-white block">{b.nickname}</span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-300">{b.date}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                          b.status === "Вовремя"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : b.status === "Позже"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{b.user_id}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleOpenEditBooking(b)}
                        className="bg-slate-950/60 p-2 border border-slate-800 hover:border-amber-500/30 text-slate-400 hover:text-amber-400 rounded-xl transition-all shadow-neu-flat-sm hover:shadow-neu-inset cursor-pointer inline-block mr-1"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* GAMES HISTORY TABLE */}
          {activeTab === "games" && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-500 bg-slate-950/20">
                  <th className="px-6 py-4">Глоб №</th>
                  <th className="px-6 py-4">Дата вечера</th>
                  <th className="px-6 py-4">Судья вечера</th>
                  <th className="px-6 py-4">Победитель</th>
                  <th className="px-6 py-4">Протокол игры (Итог)</th>
                  <th className="px-6 py-4 text-right">Опции</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredGames.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-950/15 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-amber-400 font-bold">#{g.global_game_number}</td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-300">{g.game_date}</td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-slate-200 font-semibold">{g.judge_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                          g.winner_label === "Красные"
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            : "bg-slate-950 border border-slate-800 text-slate-300"
                        }`}
                      >
                        {g.winner_label}
                      </span>
                    </td>
                    <td className="px-6 py-4 max-w-xs truncate text-xs text-slate-400">
                      {g.protocol_text || "Нет описания"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleOpenEditGame(g)}
                        className="bg-slate-950/60 p-2 border border-slate-800 hover:border-amber-500/30 text-slate-400 hover:text-amber-400 rounded-xl transition-all shadow-neu-flat-sm hover:shadow-neu-inset cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* PURCHASES TABLE */}
          {activeTab === "purchases" && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-500 bg-slate-950/20">
                  <th className="px-6 py-4">Транзакция ID</th>
                  <th className="px-6 py-4">Никнейм покупателя</th>
                  <th className="px-6 py-4">Купленный товар</th>
                  <th className="px-6 py-4 font-mono">Цена (Tokens)</th>
                  <th className="px-6 py-4">Время заказа</th>
                  <th className="px-6 py-4 text-right">Опции</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredPurchases.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-950/15 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{p.id}</td>
                    <td className="px-6 py-4 font-display font-bold text-slate-200">{p.nickname}</td>
                    <td className="px-6 py-4 text-xs text-amber-100 font-semibold">{p.item_name}</td>
                    <td className="px-6 py-4 font-mono text-xs text-amber-400 font-bold">
                      {p.price} 🪙
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-400">{p.timestamp}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleOpenEditPurchase(p)}
                        className="bg-slate-950/60 p-2 border border-slate-800 hover:border-amber-500/30 text-slate-400 hover:text-amber-400 rounded-xl transition-all shadow-neu-flat-sm hover:shadow-neu-inset cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ==========================================
          MODALS / DRAWERS (ELEGANT INSET/NEUMORPHIC STYLE)
          ========================================== */}
      <AnimatePresence>
        {/* PLAYER EDIT / CREATION MODAL */}
        {(editingPlayer || showAddPlayerModal) && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-neu-flat flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-800 bg-slate-950/20 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-600/10 border border-amber-500/30 flex items-center justify-center text-xl text-amber-400 shadow-neu-inset">
                    🎭
                  </div>
                  <div>
                    <h3 className="font-display font-extrabold text-white text-lg">
                      {editingPlayer ? `Редактирование: ${editingPlayer.nickname}` : "Добавление игрока в базу"}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {editingPlayer ? `ID: ${editingPlayer.id} • UserID: ${editingPlayer.user_id}` : "Регистрация нового профиля"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setEditingPlayer(null); setShowAddPlayerModal(false); }}
                  className="p-1 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition-all shadow-neu-flat cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Body */}
              <div className="p-6 overflow-y-auto space-y-5">
                {pError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-400 font-medium">
                    {pError}
                  </div>
                )}

                {/* Primary Info */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Никнейм *</label>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                      <input
                        type="text"
                        value={pNickname}
                        onChange={(e) => setPNickname(e.target.value)}
                        className="w-full bg-transparent px-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Полное имя</label>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                      <input
                        type="text"
                        value={pFullName}
                        onChange={(e) => setPFullName(e.target.value)}
                        className="w-full bg-transparent px-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Telegram (без @)</label>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                      <input
                        type="text"
                        value={pUsername}
                        onChange={(e) => setPUsername(e.target.value)}
                        className="w-full bg-transparent px-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Numeric Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Рейтинг Эло</label>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                      <input
                        type="number"
                        value={pElo}
                        onChange={(e) => setPElo(parseInt(e.target.value) || 0)}
                        className="w-full bg-transparent px-3 py-2 text-xs text-rose-400 font-mono font-bold text-center focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Всего игр</label>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                      <input
                        type="number"
                        value={pGamesPlayed}
                        onChange={(e) => setPGamesPlayed(parseInt(e.target.value) || 0)}
                        className="w-full bg-transparent px-3 py-2 text-xs text-white font-mono text-center focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Побед</label>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                      <input
                        type="number"
                        value={pGamesWon}
                        onChange={(e) => setPGamesWon(parseInt(e.target.value) || 0)}
                        className="w-full bg-transparent px-3 py-2 text-xs text-emerald-400 font-mono text-center focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Жетоны 🪙</label>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                      <input
                        type="number"
                        value={pTokens}
                        onChange={(e) => setPTokens(parseInt(e.target.value) || 0)}
                        className="w-full bg-transparent px-3 py-2 text-xs text-amber-400 font-mono text-center focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Долг (₽)</label>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                      <input
                        type="number"
                        value={pDebt}
                        onChange={(e) => setPDebt(parseInt(e.target.value) || 0)}
                        className="w-full bg-transparent px-3 py-2 text-xs text-rose-400 font-mono text-center focus:outline-none"
                        placeholder="0 - нет долга"
                      />
                    </div>
                  </div>
                </div>

                {/* Achievements list toggles */}
                <div className="space-y-2">
                  <h4 className="text-xs font-display font-extrabold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                    <Award className="w-4 h-4 text-amber-500 animate-pulse" /> Награды / Достижения игрока
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    {Object.entries(achievementsList).map(([id, ach]: any) => {
                      const isEarned = pAchievements.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            if (isEarned) {
                              setPAchievements(prev => prev.filter(aid => aid !== id));
                            } else {
                              setPAchievements(prev => [...prev, id]);
                            }
                          }}
                          className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                            isEarned
                              ? "bg-slate-900 border-amber-500/40 text-amber-100 shadow-neu-inset"
                              : "bg-slate-900 border-slate-800/40 text-slate-500 hover:border-slate-700 hover:text-slate-300 shadow-neu-flat"
                          }`}
                        >
                          <span className="text-2xl">{ach.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold block truncate">{ach.name}</span>
                              {isEarned && <Check className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                            </div>
                            <span className="text-[9px] leading-tight block text-slate-400 truncate">{ach.description}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Dangerous Delete Zone */}
                {editingPlayer && (
                  <div className="p-4 bg-rose-950/10 border border-rose-900/35 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-neu-inset">
                    <div>
                      <span className="text-xs font-bold text-rose-400 block font-display">Опасная зона базы данных</span>
                      <span className="text-[10px] text-slate-400">Удаление профиля необратимо стирает всю статистику игрока.</span>
                    </div>

                    {deleteConfirmId === editingPlayer.id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDeletePlayer(editingPlayer.id)}
                          className="bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl uppercase transition-all shadow-neu-flat cursor-pointer"
                        >
                          Подтвердить удаление
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(editingPlayer.id)}
                        className="bg-rose-950/60 hover:bg-rose-900/60 text-rose-400 text-xs font-semibold px-4 py-2 rounded-xl border border-rose-900/30 transition-all cursor-pointer"
                      >
                        Удалить игрока
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-800 flex justify-end gap-3 bg-slate-950/10">
                <button
                  type="button"
                  onClick={() => { setEditingPlayer(null); setShowAddPlayerModal(false); }}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-bold px-5 py-3 rounded-2xl shadow-neu-flat cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleSavePlayer}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-amber-400 text-xs font-bold px-6 py-3 rounded-2xl shadow-neu-flat hover:text-white cursor-pointer"
                >
                  Сохранить в БД
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* BOOKING EDIT / CREATION MODAL */}
        {(editingBooking || showAddBookingModal) && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-neu-flat flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-800 bg-slate-950/20 flex justify-between items-center">
                <h3 className="font-display font-extrabold text-white text-md uppercase">
                  {editingBooking ? "Редактировать запись брони" : "Создать запись брони вручную"}
                </h3>
                <button
                  onClick={() => { setEditingBooking(null); setShowAddBookingModal(false); }}
                  className="p-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">Никнейм игрока *</label>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                    <input
                      type="text"
                      value={bNickname}
                      onChange={(e) => setBNickname(e.target.value)}
                      placeholder="Например: Алоэ"
                      className="w-full bg-transparent px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">Статус прибытия</label>
                  <div className="grid grid-cols-3 gap-2 bg-slate-950 border border-slate-850 p-1 rounded-2xl shadow-neu-inset">
                    {["Вовремя", "Позже", "Отмена"].map((status) => {
                      const isSel = bStatus === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setBStatus(status as any)}
                          className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                            isSel
                              ? "bg-amber-500 text-slate-950 shadow-neu-flat"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          {status}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">Дата визита (ДД.ММ.ГГГГ) *</label>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                    <input
                      type="text"
                      value={bDate}
                      onChange={(e) => setBDate(e.target.value)}
                      className="w-full bg-transparent px-3 py-2 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>

                {editingBooking && (
                  <div className="pt-2">
                    {deleteConfirmId === "booking" ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDeleteBooking(editingBooking)}
                          className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-3 py-2 rounded-xl uppercase cursor-pointer"
                        >
                          Подтвердить удаление
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="bg-slate-800 text-slate-300 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer"
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId("booking")}
                        className="bg-rose-950/40 text-rose-400 border border-rose-900/30 text-xs font-bold px-3 py-2 rounded-xl w-full cursor-pointer hover:bg-rose-900/40"
                      >
                        Удалить бронирование из базы
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-800 flex justify-end gap-3 bg-slate-950/10">
                <button
                  onClick={() => { setEditingBooking(null); setShowAddBookingModal(false); }}
                  className="bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold px-4 py-2.5 rounded-2xl shadow-neu-flat cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSaveBooking}
                  className="bg-slate-900 border border-slate-800 text-amber-400 text-xs font-bold px-5 py-2.5 rounded-2xl shadow-neu-flat hover:text-white cursor-pointer"
                >
                  Сохранить
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* GAME EDIT MODAL */}
        {editingGame && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-neu-flat flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-800 bg-slate-950/20 flex justify-between items-center">
                <h3 className="font-display font-extrabold text-white text-md uppercase">
                  Протокол игры #{editingGame.global_game_number}
                </h3>
                <button
                  onClick={() => setEditingGame(null)}
                  className="p-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">Дата игры</label>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                    <input
                      type="text"
                      value={gDate}
                      onChange={(e) => setGDate(e.target.value)}
                      className="w-full bg-transparent px-3 py-2 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">Глобальный номер игры</label>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                    <input
                      type="number"
                      value={gGlobalNumber}
                      onChange={(e) => setGGlobalNumber(parseInt(e.target.value) || 0)}
                      className="w-full bg-transparent px-3 py-2 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">Судья игры</label>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                    <input
                      type="text"
                      value={gJudge}
                      onChange={(e) => setGJudge(e.target.value)}
                      className="w-full bg-transparent px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">Команда-победитель</label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-950 border border-slate-850 p-1 rounded-2xl shadow-neu-inset">
                    {["Красные", "Чёрные"].map((win) => {
                      const isSel = gWinner === win;
                      return (
                        <button
                          key={win}
                          type="button"
                          onClick={() => setGWinner(win as any)}
                          className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                            isSel
                              ? "bg-amber-500 text-slate-950 shadow-neu-flat"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          {win}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">Текст протокола / Описание</label>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                    <textarea
                      value={gProtocol}
                      onChange={(e) => setGProtocol(e.target.value)}
                      rows={3}
                      className="w-full bg-transparent px-3 py-2 text-xs text-white resize-none focus:outline-none"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  {deleteConfirmId === "game" ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeleteGame(editingGame.id)}
                        className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-3 py-2 rounded-xl uppercase cursor-pointer"
                      >
                        Подтвердить удаление
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="bg-slate-800 text-slate-300 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId("game")}
                      className="bg-rose-950/40 text-rose-400 border border-rose-900/30 text-xs font-bold px-3 py-2 rounded-xl w-full cursor-pointer hover:bg-rose-900/40"
                    >
                      Удалить протокол игры из истории
                    </button>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-800 flex justify-end gap-3 bg-slate-950/10">
                <button
                  onClick={() => setEditingGame(null)}
                  className="bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold px-4 py-2.5 rounded-2xl shadow-neu-flat cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSaveGame}
                  className="bg-slate-900 border border-slate-800 text-amber-400 text-xs font-bold px-5 py-2.5 rounded-2xl shadow-neu-flat hover:text-white cursor-pointer"
                >
                  Сохранить
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* PURCHASE EDIT MODAL */}
        {editingPurchase && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-neu-flat flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-800 bg-slate-950/20 flex justify-between items-center">
                <h3 className="font-display font-extrabold text-white text-md uppercase">
                  Транзакция #{editingPurchase.id}
                </h3>
                <button
                  onClick={() => setEditingPurchase(null)}
                  className="p-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">Никнейм покупателя</label>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                    <input
                      type="text"
                      value={purNickname}
                      onChange={(e) => setPurNickname(e.target.value)}
                      className="w-full bg-transparent px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">Купленный товар</label>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                    <input
                      type="text"
                      value={purItemName}
                      onChange={(e) => setPurItemName(e.target.value)}
                      className="w-full bg-transparent px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">Списанные жетоны</label>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                    <input
                      type="number"
                      value={purPrice}
                      onChange={(e) => setPurPrice(parseInt(e.target.value) || 0)}
                      className="w-full bg-transparent px-3 py-2 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">Метка времени</label>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-0.5 shadow-neu-inset">
                    <input
                      type="text"
                      value={purTimestamp}
                      onChange={(e) => setPurTimestamp(e.target.value)}
                      className="w-full bg-transparent px-3 py-2 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  {deleteConfirmId === "purchase" ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeletePurchase(editingPurchase.id)}
                        className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-3 py-2 rounded-xl uppercase cursor-pointer"
                      >
                        Подтвердить удаление
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="bg-slate-800 text-slate-300 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId("purchase")}
                      className="bg-rose-950/40 text-rose-400 border border-rose-900/30 text-xs font-bold px-3 py-2 rounded-xl w-full cursor-pointer hover:bg-rose-900/40"
                    >
                      Аннулировать транзакцию
                    </button>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-800 flex justify-end gap-3 bg-slate-950/10">
                <button
                  onClick={() => setEditingPurchase(null)}
                  className="bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold px-4 py-2.5 rounded-2xl shadow-neu-flat cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSavePurchase}
                  className="bg-slate-900 border border-slate-800 text-amber-400 text-xs font-bold px-5 py-2.5 rounded-2xl shadow-neu-flat hover:text-white cursor-pointer"
                >
                  Сохранить
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
