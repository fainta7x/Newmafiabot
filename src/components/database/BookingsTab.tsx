import React from "react";
import { Edit2, CheckCircle2, AlertCircle } from "lucide-react";
import { Booking, Player } from "../../types.js";

interface BookingsTabProps {
  bookings: Booking[];
  players: Player[];
  onEditBooking: (booking: Booking) => void;
  onQuickTogglePaymentStatus?: (booking: Booking) => void;
}

export const BookingsTab: React.FC<BookingsTabProps> = ({
  bookings,
  players,
  onEditBooking,
  onQuickTogglePaymentStatus,
}) => {
  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="border-b border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-500 bg-slate-950/20">
          <th className="px-6 py-4">Игрок клуба</th>
          <th className="px-6 py-4">Дата вечера</th>
          <th className="px-6 py-4">Прибытие</th>
          <th className="px-6 py-4">Оплата за вечер</th>
          <th className="px-6 py-4 text-center">Быстрая смена статуса оплаты</th>
          <th className="px-6 py-4 text-right">Опции</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800/40">
        {bookings.map((b, idx) => {
          const clubPlayer = players.find(
            (p) => p.nickname.toLowerCase() === b.nickname.toLowerCase() || p.user_id === b.user_id
          );
          const payAmount = b.payment !== undefined ? b.payment : 400;
          const payStatus = b.payment_status || "Оплачено";

          return (
            <tr key={idx} className="hover:bg-slate-950/15 transition-colors">
              <td className="px-6 py-4">
                <span className="font-display font-bold text-white block">{b.nickname}</span>
                {clubPlayer && (
                  <span className="text-[11px] text-slate-500 block font-mono">
                    {clubPlayer.full_name || (clubPlayer.username ? `@${clubPlayer.username}` : "Игрок клуба")}
                  </span>
                )}
              </td>
              <td className="px-6 py-4 font-mono text-xs text-amber-400 font-bold">{b.date}</td>
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
              <td className="px-6 py-4 font-mono font-bold text-amber-400 text-sm">
                {payAmount} ₽
              </td>
              <td className="px-6 py-4 text-center">
                <button
                  onClick={() => onQuickTogglePaymentStatus && onQuickTogglePaymentStatus(b)}
                  title="Кликните для 1-click смены статуса (Оплачено / В долг)"
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 mx-auto ${
                    payStatus === "Оплачено"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                      : payStatus === "В долг"
                      ? "bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                  }`}
                >
                  {payStatus === "Оплачено" ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Оплачено
                    </>
                  ) : payStatus === "В долг" ? (
                    <>
                      <AlertCircle className="w-3.5 h-3.5" /> В долг
                    </>
                  ) : (
                    payStatus
                  )}
                </button>
              </td>
              <td className="px-6 py-4 text-right">
                <button
                  onClick={() => onEditBooking(b)}
                  className="bg-slate-950/60 p-2 border border-slate-800 hover:border-amber-500/30 text-slate-400 hover:text-amber-400 rounded-xl transition-all shadow-neu-flat-sm hover:shadow-neu-inset cursor-pointer inline-block"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          );
        })}

        {bookings.length === 0 && (
          <tr>
            <td colSpan={6} className="py-12 text-center text-slate-500 font-mono text-xs">
              Записей игроков на данный вечер не найдено.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
};
