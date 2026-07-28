import React, { useState } from "react";
import { MapPin, Edit2, UserCheck, Send, Sparkles, Shield, Award, Wallet } from "lucide-react";
import { GameEvening, Booking, Game } from "../../types.js";

interface EveningsTabProps {
  evenings: GameEvening[];
  bookings: Booking[];
  games: Game[];
  onSelectEvening: (date: string) => void;
  onOpenLedger: (evening: GameEvening) => void;
  onEditEvening: (evening: GameEvening) => void;
  onExportTelegram: (evening: GameEvening) => void;
}

export const EveningsTab: React.FC<EveningsTabProps> = ({
  evenings,
  bookings,
  games,
  onSelectEvening,
  onOpenLedger,
  onEditEvening,
  onExportTelegram,
}) => {
  const [formatFilter, setFormatFilter] = useState<string>("ALL");

  const filtered = evenings.filter((e) => {
    if (formatFilter === "ALL") return true;
    return (e.format || "STANDARD") === formatFilter;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Format Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-950/40 p-3 rounded-2xl border border-slate-800">
        <span className="text-[10px] text-slate-500 font-mono font-bold uppercase mr-2">
          Экосистемы вечеров:
        </span>
        <button
          onClick={() => setFormatFilter("ALL")}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            formatFilter === "ALL"
              ? "bg-amber-500 text-slate-950 shadow-neu-flat"
              : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          }`}
        >
          Все форматы
        </button>
        <button
          onClick={() => setFormatFilter("NOVICE")}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            formatFilter === "NOVICE"
              ? "bg-sky-500 text-slate-950 shadow-neu-flat"
              : "bg-slate-900 border border-slate-800 text-sky-400 hover:text-sky-300"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" /> 🔰 Для Новичков
        </button>
        <button
          onClick={() => setFormatFilter("STANDARD")}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            formatFilter === "STANDARD"
              ? "bg-amber-500 text-slate-950 shadow-neu-flat"
              : "bg-slate-900 border border-slate-800 text-amber-400 hover:text-amber-300"
          }`}
        >
          <Shield className="w-3.5 h-3.5" /> 🎩 Классические
        </button>
        <button
          onClick={() => setFormatFilter("TOURNAMENT")}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            formatFilter === "TOURNAMENT"
              ? "bg-rose-500 text-slate-950 shadow-neu-flat"
              : "bg-slate-900 border border-slate-800 text-rose-400 hover:text-rose-300"
          }`}
        >
          <Award className="w-3.5 h-3.5" /> 🏆 Турнирные / Рейтинг
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((e) => {
          const eveningBookings = bookings.filter((b) => b.date === e.date);
          const paidSum = eveningBookings.reduce(
            (sum, b) => sum + (b.payment_status === "Оплачено" ? b.payment || 400 : 0),
            0
          );
          const debtSum = eveningBookings.reduce(
            (sum, b) => sum + (b.payment_status === "В долг" ? b.payment || 400 : 0),
            0
          );

          const fmt = e.format || "STANDARD";

          return (
            <div
              key={e.id}
              className="bg-slate-950/70 border border-slate-800/80 rounded-3xl p-5 shadow-neu-inset flex flex-col justify-between space-y-4 relative group"
            >
              <div className="space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-xl">
                      {e.date}
                    </span>
                    {fmt === "NOVICE" && (
                      <span className="px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" /> Новички
                      </span>
                    )}
                    {fmt === "STANDARD" && (
                      <span className="px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                        <Shield className="w-2.5 h-2.5" /> Классика
                      </span>
                    )}
                    {fmt === "TOURNAMENT" && (
                      <span className="px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                        <Award className="w-2.5 h-2.5" /> Турнир
                      </span>
                    )}
                  </div>

                  <span
                    className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      e.status === "Идет сейчас"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse"
                        : e.status === "Завершен"
                        ? "bg-slate-800 text-slate-400 border border-slate-700"
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {e.status}
                  </span>
                </div>

                <h3 className="font-display font-extrabold text-white text-base leading-snug">
                  {e.title}
                </h3>

                {e.location && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                    <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{e.location}</span>
                  </div>
                )}

                {e.notes && (
                  <p className="text-xs text-slate-400 line-clamp-2 italic pt-1">
                    "{e.notes}"
                  </p>
                )}
              </div>

              {/* Evening Statistics */}
              <div className="pt-3 border-t border-slate-800/60 grid grid-cols-3 gap-2 text-center bg-slate-900/50 rounded-2xl p-2.5">
                <div>
                  <span className="text-[9px] text-slate-500 font-mono uppercase block">Состав</span>
                  <span className="text-xs font-bold text-white font-mono">{eveningBookings.length} игрок.</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 font-mono uppercase block">Оплачено</span>
                  <span className="text-xs font-bold text-emerald-400 font-mono">{paidSum} ₽</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 font-mono uppercase block">Долги</span>
                  <span className={`text-xs font-bold font-mono ${debtSum > 0 ? "text-rose-400" : "text-slate-500"}`}>
                    {debtSum} ₽
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => onOpenLedger(e)}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs py-2 px-3 rounded-xl shadow-neu-flat-amber transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Wallet className="w-3.5 h-3.5" /> Диспетчер оплат
                </button>

                <button
                  onClick={() => onSelectEvening(e.date)}
                  className="bg-slate-900 border border-slate-800 hover:border-amber-500/30 text-amber-400 text-xs font-bold py-2 px-3 rounded-xl shadow-neu-flat hover:shadow-neu-inset transition-all cursor-pointer flex items-center justify-center gap-1"
                  title="Записи и протоколы вечера"
                >
                  <UserCheck className="w-3.5 h-3.5" /> Записи
                </button>

                <button
                  onClick={() => onExportTelegram(e)}
                  className="p-2 bg-sky-950/40 border border-sky-800/40 text-sky-400 hover:text-white rounded-xl shadow-neu-flat cursor-pointer"
                  title="Скопировать анонс/отчет в Telegram"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => onEditEvening(e)}
                  className="p-2 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-xl shadow-neu-flat cursor-pointer"
                  title="Редактировать вечер"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500 font-mono text-xs">
            Игровые вечера данного формата не найдены. Нажмите "Создать игровой вечер", чтобы добавить новый.
          </div>
        )}
      </div>
    </div>
  );
};
