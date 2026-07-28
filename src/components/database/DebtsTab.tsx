import React from "react";
import { CheckCircle, Edit2, Send } from "lucide-react";
import { Player } from "../../types.js";

interface DebtsTabProps {
  debtors: Player[];
  totalClubDebt: number;
  onClearDebt: (player: Player) => void;
  onEditDebt: (player: Player) => void;
  onExportDebtsTelegram?: () => void;
}

export const DebtsTab: React.FC<DebtsTabProps> = ({
  debtors,
  totalClubDebt,
  onClearDebt,
  onEditDebt,
  onExportDebtsTelegram,
}) => {
  return (
    <div className="p-6 space-y-6">
      <div className="bg-slate-950 border border-rose-500/20 rounded-3xl p-6 shadow-neu-inset flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-2xl text-rose-400">
            💳
          </div>
          <div>
            <h2 className="font-display font-extrabold text-white text-lg">
              Реестр задолженностей игроков
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Игроки с непогашенным балансом за игровые вечера
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onExportDebtsTelegram && debtors.length > 0 && (
            <button
              onClick={onExportDebtsTelegram}
              className="bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold font-mono px-4 py-3 rounded-2xl shadow-neu-flat cursor-pointer flex items-center gap-2 transition-all"
            >
              <Send className="w-4 h-4" /> Должники в TG
            </button>
          )}

          <div className="bg-slate-900 border border-slate-800 px-5 py-3 rounded-2xl font-mono text-right">
            <span className="text-[10px] text-slate-400 uppercase block font-bold">Сумма всех долгов</span>
            <span className="text-xl font-black text-rose-400">{totalClubDebt} ₽</span>
          </div>
        </div>
      </div>

      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-500 bg-slate-950/20">
            <th className="px-6 py-4">Игрок клуба</th>
            <th className="px-6 py-4">Телеграм</th>
            <th className="px-6 py-4 text-center">Сумма долга</th>
            <th className="px-6 py-4 text-center">Всего оплачено</th>
            <th className="px-6 py-4 text-right">Быстрые действия</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/40">
          {debtors.map((p) => {
            const debtVal = Math.abs(p.debt);
            return (
              <tr key={p.id} className="hover:bg-slate-950/15 transition-colors">
                <td className="px-6 py-4">
                  <span className="font-display font-bold text-white block">{p.nickname}</span>
                  <span className="text-xs text-slate-500 block">{p.full_name || "—"}</span>
                </td>
                <td className="px-6 py-4 font-mono text-xs text-slate-400">
                  {p.username ? `@${p.username}` : "—"}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="font-mono font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-xl text-sm inline-block">
                    -{debtVal} ₽
                  </span>
                </td>
                <td className="px-6 py-4 text-center font-mono text-xs text-emerald-400 font-bold">
                  {p.total_paid} ₽
                </td>
                <td className="px-6 py-4 text-right space-x-2">
                  <button
                    onClick={() => onClearDebt(p)}
                    className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer inline-flex items-center gap-1"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Погасить долг
                  </button>
                  <button
                    onClick={() => onEditDebt(p)}
                    className="bg-slate-950/60 p-1.5 border border-slate-800 hover:border-amber-500/30 text-slate-400 hover:text-amber-400 rounded-xl transition-all cursor-pointer inline-block"
                    title="Изменить сумму"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}

          {debtors.length === 0 && (
            <tr>
              <td colSpan={5} className="py-12 text-center text-slate-500 font-mono text-xs">
                🎉 В клубе нет игроков с задолженностями! Все счета оплачены.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
