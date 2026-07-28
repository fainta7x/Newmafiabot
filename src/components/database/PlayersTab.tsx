import React, { useState } from "react";
import { Edit2, Coins, Eye, Tag } from "lucide-react";
import { Player } from "../../types.js";

interface PlayersTabProps {
  players: Player[];
  onEditPlayer: (player: Player) => void;
  onOpenDossier: (player: Player) => void;
}

export const PlayersTab: React.FC<PlayersTabProps> = ({ players, onEditPlayer, onOpenDossier }) => {
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>("ALL");

  const filtered = players.filter((p) => {
    if (selectedTagFilter === "ALL") return true;
    if (selectedTagFilter === "NO_TAG") return !p.tag;
    return p.tag === selectedTagFilter;
  });

  return (
    <div className="space-y-4">
      {/* Tag filters bar */}
      <div className="px-6 pt-4 flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-slate-500 font-mono font-bold uppercase flex items-center gap-1 mr-2">
          <Tag className="w-3 h-3" /> Фильтр по ролям:
        </span>
        {[
          { id: "ALL", label: "Все" },
          { id: "Регуляр", label: "Регуляры" },
          { id: "Новичок", label: "Новички" },
          { id: "Судья", label: "Судьи" },
          { id: "VIP", label: "VIP" },
          { id: "Организатор", label: "Организаторы" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedTagFilter(t.id)}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedTagFilter === t.id
                ? "bg-amber-500 text-slate-950 shadow-neu-flat"
                : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-500 bg-slate-950/20">
            <th className="px-6 py-4">ID</th>
            <th className="px-6 py-4">Никнейм / Имя</th>
            <th className="px-6 py-4">Телеграм</th>
            <th className="px-6 py-4 text-center">ЭЛО</th>
            <th className="px-6 py-4 text-center">Игр (Побед)</th>
            <th className="px-6 py-4 text-right">Жетоны</th>
            <th className="px-6 py-4 text-right">Баланс долга</th>
            <th className="px-6 py-4 text-right">Действия</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/40">
          {filtered.map((p) => (
            <tr key={p.id} className="hover:bg-slate-950/15 transition-colors group">
              <td className="px-6 py-4 font-mono text-xs text-slate-500">{p.id}</td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-slate-200">{p.nickname}</span>
                  {p.tag && (
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {p.tag}
                    </span>
                  )}
                </div>
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
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => onOpenDossier(p)}
                    title="Открыть 360° Досье"
                    className="bg-slate-950/60 p-2 border border-slate-800 hover:border-sky-500/40 text-slate-400 hover:text-sky-400 rounded-xl transition-all shadow-neu-flat-sm hover:shadow-neu-inset cursor-pointer flex items-center gap-1 text-xs font-mono"
                  >
                    <Eye className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Досье</span>
                  </button>
                  <button
                    onClick={() => onEditPlayer(p)}
                    title="Редактировать"
                    className="bg-slate-950/60 p-2 border border-slate-800 hover:border-amber-500/30 text-slate-400 hover:text-amber-400 rounded-xl transition-all shadow-neu-flat-sm hover:shadow-neu-inset cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}

          {filtered.length === 0 && (
            <tr>
              <td colSpan={8} className="py-12 text-center text-slate-500 font-mono text-xs">
                Игроки не найдены.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
