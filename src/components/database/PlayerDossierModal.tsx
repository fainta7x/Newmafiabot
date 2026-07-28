import React, { useState } from "react";
import { motion } from "motion/react";
import {
  X, User, ShieldAlert, Award, Calendar, Coins, CreditCard,
  History, ShoppingBag, CheckCircle, Plus, Minus, Tag
} from "lucide-react";
import { Player, Booking, Game, ShopPurchase } from "../../types.js";

interface PlayerDossierModalProps {
  player: Player;
  bookings: Booking[];
  games: Game[];
  purchases: ShopPurchase[];
  onClose: () => void;
  onUpdateDebt: (player: Player, newDebt: number) => void;
  onUpdateTokens: (player: Player, newTokens: number) => void;
  onEditProfile: (player: Player) => void;
}

export const PlayerDossierModal: React.FC<PlayerDossierModalProps> = ({
  player,
  bookings,
  games,
  purchases,
  onClose,
  onUpdateDebt,
  onUpdateTokens,
  onEditProfile,
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "evenings" | "games" | "purchases">("overview");

  // Player specific data
  const playerBookings = bookings.filter(
    (b) => b.nickname.toLowerCase() === player.nickname.toLowerCase() || b.user_id === player.user_id
  );

  const playerGames = games.filter((g) =>
    g.slots.some(
      (s) => s.nickname.toLowerCase() === player.nickname.toLowerCase() || s.user_id === player.user_id
    )
  );

  const playerPurchases = purchases.filter(
    (p) => p.nickname.toLowerCase() === player.nickname.toLowerCase() || p.user_id === player.user_id
  );

  const winRate = player.games_played > 0 ? Math.round((player.games_won / player.games_played) * 100) : 0;
  const debtVal = Math.abs(player.debt);

  // Advanced role and team statistics from player's game protocols
  const redGames = playerGames.filter((g) => {
    const slot = g.slots.find((s) => s.nickname.toLowerCase() === player.nickname.toLowerCase() || s.user_id === player.user_id);
    return slot?.team === "Красные";
  });
  const redWins = redGames.filter((g) => g.winner_label === "Красные").length;

  const blackGames = playerGames.filter((g) => {
    const slot = g.slots.find((s) => s.nickname.toLowerCase() === player.nickname.toLowerCase() || s.user_id === player.user_id);
    return slot?.team === "Чёрные";
  });
  const blackWins = blackGames.filter((g) => g.winner_label === "Чёрные").length;

  const sheriffGames = playerGames.filter((g) => {
    const slot = g.slots.find((s) => s.nickname.toLowerCase() === player.nickname.toLowerCase() || s.user_id === player.user_id);
    return slot?.role === "Шериф";
  });
  const sheriffWins = sheriffGames.filter((g) => g.winner_label === "Красные").length;

  const donGames = playerGames.filter((g) => {
    const slot = g.slots.find((s) => s.nickname.toLowerCase() === player.nickname.toLowerCase() || s.user_id === player.user_id);
    return slot?.role === "Дон";
  });
  const donWins = donGames.filter((g) => g.winner_label === "Чёрные").length;

  const totalFouls = playerGames.reduce((sum, g) => {
    const slot = g.slots.find((s) => s.nickname.toLowerCase() === player.nickname.toLowerCase() || s.user_id === player.user_id);
    return sum + (slot?.fouls || 0);
  }, 0);

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-neu-flat flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-950/40 flex justify-between items-start">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-3xl shadow-neu-inset">
              🎭
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-extrabold text-white text-xl">{player.nickname}</h2>
                {player.tag && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    {player.tag}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {player.full_name || "ФИО не указано"} • {player.username ? `@${player.username}` : "TG не привязан"}
              </p>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                ID: {player.id} • UserID: {player.user_id} • Последний визит: {player.last_visit || "Неизвестно"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onEditProfile(player)}
              className="px-3 py-1.5 bg-slate-800 border border-slate-700 hover:border-amber-500/40 text-amber-400 text-xs font-bold rounded-xl shadow-neu-flat cursor-pointer"
            >
              Редактировать
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-4 bg-slate-950/20 border-b border-slate-800/60 font-mono text-center">
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-2.5 shadow-neu-inset">
            <span className="text-[9px] text-slate-500 uppercase block">Рейтинг ELO</span>
            <span className="text-sm font-bold text-rose-400">{player.elo}</span>
          </div>
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-2.5 shadow-neu-inset">
            <span className="text-[9px] text-slate-500 uppercase block">Игры (Победы)</span>
            <span className="text-sm font-bold text-white">
              {player.games_played} <span className="text-emerald-400">({winRate}%)</span>
            </span>
          </div>
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-2.5 shadow-neu-inset">
            <span className="text-[9px] text-slate-500 uppercase block">Баланс долга</span>
            <span className={`text-sm font-bold ${player.debt < 0 ? "text-rose-400" : "text-emerald-400"}`}>
              {player.debt < 0 ? `-${debtVal} ₽` : "0 ₽"}
            </span>
          </div>
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-2.5 shadow-neu-inset">
            <span className="text-[9px] text-slate-500 uppercase block">Жетоны клуба</span>
            <span className="text-sm font-bold text-amber-400 flex items-center justify-center gap-1">
              {player.tokens} <Coins className="w-3 h-3" />
            </span>
          </div>
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-2.5 shadow-neu-inset col-span-2 sm:col-span-1">
            <span className="text-[9px] text-slate-500 uppercase block">Всего оплатил</span>
            <span className="text-sm font-bold text-emerald-400">{player.total_paid} ₽</span>
          </div>
        </div>

        {/* Dossier Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 gap-2 pt-2">
          {[
            { id: "overview", label: "Обзор & Финансы", icon: User },
            { id: "evenings", label: `Вечера (${playerBookings.length})`, icon: Calendar },
            { id: "games", label: `Игры (${playerGames.length})`, icon: History },
            { id: "purchases", label: `Покупки (${playerPurchases.length})`, icon: ShoppingBag },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === tab.id
                  ? "border-amber-400 text-amber-400 bg-slate-900/60 rounded-t-xl"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Financial controls card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Debt management */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-neu-inset space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-rose-400" /> Финансовый долг
                    </h4>
                    <span className={`font-mono text-sm font-bold ${player.debt < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                      {player.debt < 0 ? `-${debtVal} ₽` : "Долгов нет"}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    {player.debt < 0 && (
                      <button
                        onClick={() => onUpdateDebt(player, 0)}
                        className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 py-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer flex items-center justify-center gap-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Погасить долг
                      </button>
                    )}
                    <button
                      onClick={() => onUpdateDebt(player, player.debt - 400)}
                      className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 px-3 py-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer"
                    >
                      +400 ₽ в долг
                    </button>
                  </div>
                </div>

                {/* Token management */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-neu-inset space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-amber-400" /> Жетоны игрока
                    </h4>
                    <span className="font-mono text-sm font-bold text-amber-400">
                      {player.tokens} 🪙
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => onUpdateTokens(player, player.tokens + 100)}
                      className="flex-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 py-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Начислить 100
                    </button>
                    {player.tokens >= 100 && (
                      <button
                        onClick={() => onUpdateTokens(player, Math.max(0, player.tokens - 100))}
                        className="bg-slate-900 border border-slate-800 text-slate-400 hover:text-white px-3 py-2 rounded-xl text-xs font-bold font-mono cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Detailed Performance Breakdown */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-neu-inset space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-400" /> Аналитика результатов по ролям
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-center text-xs">
                  <div className="bg-slate-900 border border-rose-900/30 rounded-xl p-2.5">
                    <span className="text-[9px] text-rose-400 uppercase font-bold block">За Красных</span>
                    <span className="font-extrabold text-white text-sm">
                      {redWins}/{redGames.length}{" "}
                      <span className="text-[10px] text-emerald-400 font-normal">
                        ({redGames.length > 0 ? Math.round((redWins / redGames.length) * 100) : 0}%)
                      </span>
                    </span>
                  </div>

                  <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-2.5">
                    <span className="text-[9px] text-slate-400 uppercase font-bold block">За Чёрных</span>
                    <span className="font-extrabold text-white text-sm">
                      {blackWins}/{blackGames.length}{" "}
                      <span className="text-[10px] text-emerald-400 font-normal">
                        ({blackGames.length > 0 ? Math.round((blackWins / blackGames.length) * 100) : 0}%)
                      </span>
                    </span>
                  </div>

                  <div className="bg-slate-900 border border-emerald-900/30 rounded-xl p-2.5">
                    <span className="text-[9px] text-emerald-400 uppercase font-bold block">За Шерифа</span>
                    <span className="font-extrabold text-white text-sm">
                      {sheriffWins}/{sheriffGames.length}{" "}
                      <span className="text-[10px] text-emerald-400 font-normal">
                        ({sheriffGames.length > 0 ? Math.round((sheriffWins / sheriffGames.length) * 100) : 0}%)
                      </span>
                    </span>
                  </div>

                  <div className="bg-slate-900 border border-purple-900/30 rounded-xl p-2.5">
                    <span className="text-[9px] text-purple-400 uppercase font-bold block">За Дона</span>
                    <span className="font-extrabold text-white text-sm">
                      {donWins}/{donGames.length}{" "}
                      <span className="text-[10px] text-emerald-400 font-normal">
                        ({donGames.length > 0 ? Math.round((donWins / donGames.length) * 100) : 0}%)
                      </span>
                    </span>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400 font-mono border-t border-slate-900">
                  <span>Всего фолов за все время: <strong className="text-rose-400">{totalFouls}</strong></span>
                  <span>Средний профит за игру: <strong className="text-amber-400">{playerGames.length > 0 ? (player.elo - 1500) > 0 ? `+${Math.round((player.elo - 1500) / playerGames.length)}` : Math.round((player.elo - 1500) / playerGames.length) : 0} ELO</strong></span>
                </div>
              </div>

              {/* Notes & Achievements */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-neu-inset space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-amber-400" /> Достижения ({player.achievements?.length || 0})
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {player.achievements && player.achievements.length > 0 ? (
                    player.achievements.map((ach, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 bg-slate-900 border border-slate-800 text-slate-300 text-[11px] font-mono rounded-lg"
                      >
                        🏆 {ach}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500 font-mono italic">Достижений пока нет</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "evenings" && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase font-mono">История посещений игровых вечеров</h4>
              <div className="space-y-2">
                {playerBookings.map((b, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-950 border border-slate-800 rounded-2xl p-3 shadow-neu-inset flex justify-between items-center"
                  >
                    <div>
                      <span className="font-mono text-xs font-bold text-amber-400 block">{b.date}</span>
                      <span className="text-[11px] text-slate-400">
                        Прибытие: <strong className="text-white">{b.status}</strong>
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-xs font-bold text-emerald-400 block">
                        {b.payment !== undefined ? b.payment : 400} ₽
                      </span>
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                          b.payment_status === "Оплачено"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-rose-500/10 text-rose-400"
                        }`}
                      >
                        {b.payment_status || "Оплачено"}
                      </span>
                    </div>
                  </div>
                ))}

                {playerBookings.length === 0 && (
                  <p className="text-xs text-slate-500 font-mono py-8 text-center">
                    Игрок еще не записан ни на один игровой вечер.
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "games" && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase font-mono">Сыгранные мафия-игры</h4>
              <div className="space-y-2">
                {playerGames.map((g) => {
                  const slot = g.slots.find(
                    (s) => s.nickname.toLowerCase() === player.nickname.toLowerCase() || s.user_id === player.user_id
                  );
                  if (!slot) return null;

                  const isWinner =
                    (slot.team === "Красные" && g.winner_label === "Красные") ||
                    (slot.team === "Чёрные" && g.winner_label === "Чёрные");

                  return (
                    <div
                      key={g.id}
                      className="bg-slate-950 border border-slate-800 rounded-2xl p-3 shadow-neu-inset flex justify-between items-center"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-amber-400">
                            Игра #{g.global_game_number} ({g.game_date})
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              isWinner ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            }`}
                          >
                            {isWinner ? "Победа" : "Поражение"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300">
                          Слот #{slot.slot_num} • Роль: <strong className="text-amber-300">{slot.role}</strong> ({slot.team}) • Фолы: {slot.fouls}
                        </p>
                      </div>

                      <div className="text-right font-mono text-xs">
                        <span className={`font-bold block ${slot.elo_change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {slot.elo_change >= 0 ? `+${slot.elo_change}` : slot.elo_change} ELO
                        </span>
                        <span className="text-[10px] text-slate-500">Судья: {g.judge_name}</span>
                      </div>
                    </div>
                  );
                })}

                {playerGames.length === 0 && (
                  <p className="text-xs text-slate-500 font-mono py-8 text-center">
                    В базе нет записанных протоколов игр для этого игрока.
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "purchases" && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase font-mono">История покупок в магазине</h4>
              <div className="space-y-2">
                {playerPurchases.map((p) => (
                  <div
                    key={p.id}
                    className="bg-slate-950 border border-slate-800 rounded-2xl p-3 shadow-neu-inset flex justify-between items-center"
                  >
                    <div>
                      <span className="font-bold text-white text-xs block">{p.item_name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{p.timestamp}</span>
                    </div>
                    <span className="font-mono text-xs font-bold text-amber-400">
                      -{p.price} 🪙
                    </span>
                  </div>
                ))}

                {playerPurchases.length === 0 && (
                  <p className="text-xs text-slate-500 font-mono py-8 text-center">
                    Покупок в магазине пока не совершалось.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/20 flex justify-end">
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-5 py-2.5 rounded-2xl shadow-neu-flat cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </motion.div>
    </div>
  );
};
