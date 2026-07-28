import React from "react";
import { Edit2 } from "lucide-react";
import { Game } from "../../types.js";

interface GamesTabProps {
  games: Game[];
  onEditGame: (game: Game) => void;
}

export const GamesTab: React.FC<GamesTabProps> = ({ games, onEditGame }) => {
  return (
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
        {games.map((g) => (
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
                onClick={() => onEditGame(g)}
                className="bg-slate-950/60 p-2 border border-slate-800 hover:border-amber-500/30 text-slate-400 hover:text-amber-400 rounded-xl transition-all shadow-neu-flat-sm hover:shadow-neu-inset cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </td>
          </tr>
        ))}

        {games.length === 0 && (
          <tr>
            <td colSpan={6} className="py-12 text-center text-slate-500 font-mono text-xs">
              Протоколы игр не найдены.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
};
