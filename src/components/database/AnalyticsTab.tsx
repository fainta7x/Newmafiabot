import React from "react";
import {
  TrendingUp, Coins, CreditCard, Users, Download, Calendar, DollarSign, Award, CheckCircle2
} from "lucide-react";
import { Player, GameEvening, Booking, ShopPurchase, Game } from "../../types.js";

interface AnalyticsTabProps {
  players: Player[];
  evenings: GameEvening[];
  bookings: Booking[];
  purchases: ShopPurchase[];
  games: Game[];
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  players,
  evenings,
  bookings,
  purchases,
  games,
}) => {
  // Calculations
  const totalPaidFees = bookings.reduce((acc, b) => acc + (b.payment_status === "Оплачено" ? (b.payment || 400) : 0), 0);
  const totalShopTokensSpent = purchases.reduce((acc, p) => acc + p.price, 0);
  const debtors = players.filter((p) => p.debt < 0);
  const totalOutstandingDebt = debtors.reduce((acc, p) => acc + Math.abs(p.debt), 0);
  const totalPaidAllTime = players.reduce((acc, p) => acc + (p.total_paid || 0), 0);

  const activePlayers = players.filter((p) => p.games_played > 0);
  const topRegulars = [...players].sort((a, b) => b.games_played - a.games_played).slice(0, 5);

  // CSV Exporters
  const downloadCSV = (filename: string, content: string) => {
    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPlayersCSV = () => {
    const header = "ID;Никнейм;ФИО;Telegram;Игр сыграно;Побед;ELO;Долг (руб);Всего оплачено (руб);Жетоны\n";
    const rows = players
      .map(
        (p) =>
          `${p.id};${p.nickname};${p.full_name || ""};${p.username || ""};${p.games_played};${p.games_won};${p.elo};${p.debt};${p.total_paid};${p.tokens}`
      )
      .join("\n");
    downloadCSV("Клуб_Мафия_Игроки.csv", header + rows);
  };

  const exportDebtsCSV = () => {
    const header = "ID;Никнейм;ФИО;Telegram;Задолженность (руб)\n";
    const rows = debtors
      .map((p) => `${p.id};${p.nickname};${p.full_name || ""};${p.username || ""};${Math.abs(p.debt)}`)
      .join("\n");
    downloadCSV("Клуб_Мафия_Долги.csv", header + rows);
  };

  const exportEveningsCSV = () => {
    const header = "Дата;Название;Статус;Запись игроков;Собрано (руб)\n";
    const rows = evenings
      .map((e) => {
        const eveBookings = bookings.filter((b) => b.date === e.date);
        const collected = eveBookings.reduce((sum, b) => sum + (b.payment_status === "Оплачено" ? (b.payment || 400) : 0), 0);
        return `${e.date};${e.title};${e.status};${eveBookings.length};${collected}`;
      })
      .join("\n");
    downloadCSV("Клуб_Мафия_Вечера.csv", header + rows);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Top Header & Export Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-950/40 p-4 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-lg font-display font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-400" /> Финансовая Аналитика & CSV Отчеты
          </h3>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Сводные метрики выручки, окупаемости вечеров и выгрузка базы в Excel/CSV
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportPlayersCSV}
            className="bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-amber-400 text-xs font-bold font-mono px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-neu-flat cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Игроки (.CSV)
          </button>
          <button
            onClick={exportDebtsCSV}
            className="bg-slate-900 border border-slate-800 hover:border-rose-500/40 text-rose-400 text-xs font-bold font-mono px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-neu-flat cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Должники (.CSV)
          </button>
          <button
            onClick={exportEveningsCSV}
            className="bg-slate-900 border border-slate-800 hover:border-sky-500/40 text-sky-400 text-xs font-bold font-mono px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-neu-flat cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Вечера (.CSV)
          </button>
        </div>
      </div>

      {/* Main KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-neu-inset space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-mono uppercase font-bold">Собрано оплат (Записи)</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-400 font-mono">{totalPaidFees} ₽</p>
          <span className="text-[10px] text-slate-500 font-mono">Из {bookings.length} записей на вечера</span>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-neu-inset space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-mono uppercase font-bold">Текущий долг клуба</span>
            <CreditCard className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-extrabold text-rose-400 font-mono">{totalOutstandingDebt} ₽</p>
          <span className="text-[10px] text-slate-500 font-mono">У {debtors.length} игроков</span>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-neu-inset space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-mono uppercase font-bold">Оборот внутри магазина</span>
            <Coins className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-extrabold text-amber-400 font-mono">{totalShopTokensSpent} 🪙</p>
          <span className="text-[10px] text-slate-500 font-mono">{purchases.length} транзакций</span>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-neu-inset space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-mono uppercase font-bold">Активные игроки</span>
            <Users className="w-4 h-4 text-sky-400" />
          </div>
          <p className="text-2xl font-extrabold text-white font-mono">{activePlayers.length}</p>
          <span className="text-[10px] text-slate-500 font-mono">Из {players.length} зарегистрированных</span>
        </div>
      </div>

      {/* Detailed Analysis Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Active Regulars */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-neu-inset space-y-4">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" /> Топ Постоянных Игроков (Retention)
          </h4>

          <div className="space-y-2.5">
            {topRegulars.map((p, idx) => (
              <div key={p.id} className="flex justify-between items-center bg-slate-900 border border-slate-800/80 p-3 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold font-mono flex items-center justify-center">
                    #{idx + 1}
                  </span>
                  <div>
                    <span className="font-bold text-white text-xs block">{p.nickname}</span>
                    <span className="text-[10px] text-slate-500 font-mono">ELO: {p.elo}</span>
                  </div>
                </div>
                <div className="text-right font-mono text-xs">
                  <span className="font-bold text-amber-400 block">{p.games_played} игр</span>
                  <span className="text-[10px] text-emerald-400">{p.games_won} побед</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Financial Health Summary */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-neu-inset space-y-4">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Финансовое Состояние Клуба
          </h4>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl">
              <span className="text-slate-400">Всего денег в кассе за всё время:</span>
              <span className="font-bold text-emerald-400">{totalPaidAllTime} ₽</span>
            </div>

            <div className="flex justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl">
              <span className="text-slate-400">Процент оплат вовремя:</span>
              <span className="font-bold text-emerald-400">
                {bookings.length > 0
                  ? Math.round((bookings.filter((b) => b.payment_status === "Оплачено").length / bookings.length) * 100)
                  : 100}%
              </span>
            </div>

            <div className="flex justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl">
              <span className="text-slate-400">Всего проведенных игровых вечеров:</span>
              <span className="font-bold text-white">{evenings.length} вечеров</span>
            </div>

            <div className="flex justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl">
              <span className="text-slate-400">Всего протоколированных мафия-сессий:</span>
              <span className="font-bold text-white">{games.length} игр</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
