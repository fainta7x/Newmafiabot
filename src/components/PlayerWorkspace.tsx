import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { User, Trophy, CalendarCheck, Coins, Award, CheckCircle, Clock, Users, FileText } from "lucide-react";
import { Player, Booking } from "../types.ts";
import Players from "./Players.tsx";
import Shop from "./Shop.tsx";
import GameProtocolsView from "./GameProtocolsView.tsx";

export default function PlayerWorkspace() {
  const [subTab, setSubTab] = useState<"profile" | "rsvp" | "protocols" | "leaderboard" | "shop">("profile");
  const [players, setPlayers] = useState<Player[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [myPlayerId, setMyPlayerId] = useState<number>(0);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pRes, bRes] = await Promise.all([
        fetch("/api/players").then(r => r.json()),
        fetch("/api/bookings").then(r => r.json())
      ]);
      setPlayers(pRes);
      setBookings(bRes);
      if (pRes.length > 0 && !myPlayerId) {
        setMyPlayerId(pRes[0].user_id); // Default to first player as "current user"
      }
    } catch (e) {
      console.error("Error loading player workspace data", e);
    } finally {
      setLoading(false);
    }
  };

  const currentPlayer = players.find(p => p.user_id === myPlayerId) || players[0];
  const myBooking = bookings.find(b => b.user_id === myPlayerId || (currentPlayer && b.nickname.toLowerCase() === currentPlayer.nickname.toLowerCase()));

  const handleRSVP = async (status: "Вовремя" | "Позже" | "Отмена") => {
    if (!currentPlayer) return;
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: currentPlayer.user_id,
          nickname: currentPlayer.nickname,
          status
        })
      });
      const data = await res.json();
      setBookings(data);
      setMessage(status === "Отмена" ? "Запись отменена" : `Вы записаны на вечер (${status})!`);
      setTimeout(() => setMessage(null), 3000);
    } catch (e) {
      console.error("Error updating RSVP", e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Player Selector */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-rose-950/40 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-amber-600 flex items-center justify-center text-white font-black text-2xl shadow-lg border border-rose-400/30">
              {currentPlayer?.nickname?.slice(0, 2) || "PL"}
            </div>
            <div className="absolute -bottom-1 -right-1 bg-slate-950 border border-amber-500/50 text-amber-400 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md">
              #{currentPlayer?.elo || 1500}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-display font-black text-white">{currentPlayer?.nickname || "Игрок"}</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full">
                {currentPlayer?.tag || "Игрок"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{currentPlayer?.full_name} • Баланс: <span className="text-amber-400 font-bold">{currentPlayer?.tokens || 0} 🪙</span></p>
          </div>
        </div>

        {/* Switch active player view drop-down */}
        <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5 self-stretch md:self-auto">
          <User className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs text-slate-400 font-medium whitespace-nowrap">Профиль:</span>
          <select
            value={myPlayerId}
            onChange={(e) => setMyPlayerId(Number(e.target.value))}
            className="bg-transparent text-xs text-rose-300 font-bold focus:outline-none cursor-pointer w-full"
          >
            {players.map(p => (
              <option key={p.id} value={p.user_id} className="bg-slate-900 text-white">
                {p.nickname} ({p.elo} ELO)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Workspace Sub-Navigation Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/80 pb-3">
        <button
          onClick={() => setSubTab("profile")}
          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
            subTab === "profile"
              ? "bg-rose-600 text-white shadow-lg shadow-rose-600/20"
              : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
          }`}
        >
          <User className="w-4 h-4" /> Профиль & Статистика
        </button>

        <button
          onClick={() => setSubTab("rsvp")}
          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer relative ${
            subTab === "rsvp"
              ? "bg-rose-600 text-white shadow-lg shadow-rose-600/20"
              : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
          }`}
        >
          <CalendarCheck className="w-4 h-4" /> Запись на Вечер
          {myBooking && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          )}
        </button>

        <button
          onClick={() => setSubTab("protocols")}
          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer relative ${
            subTab === "protocols"
              ? "bg-rose-600 text-white shadow-lg shadow-rose-600/20"
              : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
          }`}
        >
          <FileText className="w-4 h-4 text-sky-400" /> Протоколы Игр & Баллы
        </button>

        <button
          onClick={() => setSubTab("leaderboard")}
          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
            subTab === "leaderboard"
              ? "bg-rose-600 text-white shadow-lg shadow-rose-600/20"
              : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
          }`}
        >
          <Trophy className="w-4 h-4" /> Таблица Лидеров
        </button>

        <button
          onClick={() => setSubTab("shop")}
          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
            subTab === "shop"
              ? "bg-rose-600 text-white shadow-lg shadow-rose-600/20"
              : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
          }`}
        >
          <Coins className="w-4 h-4 text-amber-400" /> Магазин Жетонов
        </button>
      </div>

      {/* Sub-Tab Content Rendering */}
      <AnimatePresence mode="wait">
        {subTab === "profile" && (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {/* Left 2 Cols: Stats Cards */}
            <div className="md:col-span-2 space-y-6">
              {/* Stat grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-center">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Рейтинг ELO</span>
                  <span className="text-2xl font-black text-rose-400 font-mono mt-1 block">{currentPlayer?.elo || 1500}</span>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-center">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Игр сыграно</span>
                  <span className="text-2xl font-black text-white font-mono mt-1 block">{currentPlayer?.games_played || 0}</span>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-center">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Побед (% Винрейт)</span>
                  <span className="text-2xl font-black text-emerald-400 font-mono mt-1 block">
                    {currentPlayer?.games_played ? Math.round((currentPlayer.games_won / currentPlayer.games_played) * 100) : 0}%
                  </span>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-center">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Баланс Счета</span>
                  <span className={`text-2xl font-black font-mono mt-1 block ${currentPlayer?.debt && currentPlayer.debt < 0 ? "text-rose-500" : "text-emerald-400"}`}>
                    {currentPlayer?.debt || 0} ₽
                  </span>
                </div>
              </div>

              {/* Achievements Section */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-display font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-400" /> Достижения & Медали ({currentPlayer?.achievements?.length || 0})
                </h3>
                {(!currentPlayer?.achievements || currentPlayer.achievements.length === 0) ? (
                  <p className="text-xs text-slate-500 italic">У игрока пока нет разблокированных наград.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {currentPlayer.achievements.map((ach, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-950 border border-amber-500/20 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-300 flex items-center gap-2 shadow-sm"
                      >
                        <span>🏆</span>
                        <span className="capitalize">{ach.replace(/_/g, " ")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Col: Quick Status & RSVP Card */}
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-display font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4 text-rose-500" /> Статус на ближайший вечер
                </h3>

                {myBooking ? (
                  <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-4 space-y-2 text-center">
                    <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
                    <span className="text-xs font-bold text-emerald-300 block">Вы записаны!</span>
                    <span className="text-[11px] text-slate-400 block font-mono">Статус: {myBooking.status}</span>
                    <button
                      onClick={() => handleRSVP("Отмена")}
                      className="mt-2 text-[10px] text-rose-400 hover:underline font-bold uppercase tracking-wider"
                    >
                      Отменить запись
                    </button>
                  </div>
                ) : (
                  <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-4 space-y-3 text-center">
                    <Clock className="w-8 h-8 text-amber-400 mx-auto" />
                    <p className="text-xs text-slate-400">Вы еще не подтвердили участие в ближайшую пятницу.</p>
                    <button
                      onClick={() => handleRSVP("Вовремя")}
                      className="w-full bg-rose-600 hover:bg-rose-500 text-white rounded-xl py-2 text-xs font-bold uppercase tracking-wider shadow-lg transition-colors cursor-pointer"
                    >
                      Записаться (Вовремя)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {subTab === "rsvp" && (
          <motion.div
            key="rsvp"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {message && (
              <div className="bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> {message}
              </div>
            )}

            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-6 max-w-2xl mx-auto">
              <div className="text-center space-y-1">
                <h3 className="text-lg font-display font-bold text-white flex items-center justify-center gap-2">
                  <CalendarCheck className="w-5 h-5 text-rose-500" /> Подтверждение Записи на Вечер
                </h3>
                <p className="text-xs text-slate-400">Выберите подходящее время прибытия для игры</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleRSVP("Вовремя")}
                  className={`p-5 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                    myBooking?.status === "Вовремя"
                      ? "bg-rose-600 border-rose-400 text-white shadow-xl shadow-rose-600/30 scale-105"
                      : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                  <span className="font-bold text-sm">Приду Вовремя</span>
                  <span className="text-[10px] text-slate-300">к 19:00 (+500 🪙 жетонов)</span>
                </button>

                <button
                  onClick={() => handleRSVP("Позже")}
                  className={`p-5 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                    myBooking?.status === "Позже"
                      ? "bg-amber-600 border-amber-400 text-white shadow-xl shadow-amber-600/30 scale-105"
                      : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <Clock className="w-8 h-8 text-amber-400" />
                  <span className="font-bold text-sm">Приду Позже</span>
                  <span className="text-[10px] text-slate-300">после 20:00 (+400 🪙 жетонов)</span>
                </button>
              </div>

              {myBooking && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => handleRSVP("Отмена")}
                    className="text-xs text-rose-400 hover:text-rose-300 font-bold uppercase tracking-wider underline cursor-pointer"
                  >
                    Отменить мою запись
                  </button>
                </div>
              )}
            </div>

            {/* List of already booked players */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-rose-500" /> Уже записались ({bookings.length} чел):
              </h4>
              <div className="flex flex-wrap gap-2">
                {bookings.map((b) => (
                  <span
                    key={b.user_id}
                    className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-200 flex items-center gap-2"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    {b.nickname}
                    <span className="text-[10px] text-slate-500 font-mono">({b.status})</span>
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {subTab === "protocols" && (
          <motion.div
            key="protocols"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <GameProtocolsView filterPlayerNickname={currentPlayer?.nickname} />
          </motion.div>
        )}

        {subTab === "leaderboard" && (
          <motion.div
            key="leaderboard"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Players />
          </motion.div>
        )}

        {subTab === "shop" && (
          <motion.div
            key="shop"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Shop />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
