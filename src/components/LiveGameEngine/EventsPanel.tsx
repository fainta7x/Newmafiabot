import React from "react";
import { ActivePlayerState, Phase } from "./types.js";

interface EventsPanelProps {
  phase: Phase;
  activePlayers: ActivePlayerState[];
  nightLogs: { round: number; log: string }[];
  protocolNotes: string;
  setProtocolNotes: (notes: string) => void;
  winTeam: "Красные" | "Чёрные" | null;
  handleEndGameWithWinner: (winner: "Красные" | "Чёрные") => void;
}

export default function EventsPanel({
  phase,
  activePlayers,
  nightLogs,
  protocolNotes,
  setProtocolNotes,
  winTeam,
  handleEndGameWithWinner,
}: EventsPanelProps) {
  if (phase === "setup") return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-2 bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-3">
        <h3 className="text-[10px] font-bold text-white uppercase tracking-wider">События и Проверки</h3>
        <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 text-[10px] font-mono text-slate-400">
          {nightLogs.map((log, idx) => (
            <div key={idx} className="border-b border-slate-850/40 pb-1">
              <span className="text-rose-500 font-bold">Н{log.round}:</span> {log.log}
            </div>
          ))}
          {nightLogs.length === 0 && <span className="italic text-slate-500 block">Ночных событий еще не зафиксировано...</span>}
        </div>
        <div className="space-y-1 pt-1.5 border-t border-slate-800/40">
          <textarea
            placeholder="Свободные примечания ведущего к протоколу..."
            value={protocolNotes}
            onChange={(e) => setProtocolNotes(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 focus:outline-none"
            rows={1}
          />
        </div>
      </div>

      <div className="bg-gradient-to-br from-rose-900/10 to-slate-900 border border-rose-500/10 rounded-xl p-4 flex flex-col justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider">Завершить игру</h3>
          <div className="mt-1.5 p-2 bg-slate-900/60 rounded border border-slate-800 text-[10px] flex justify-between">
            <span>
              Красных: <strong className="text-rose-400">{activePlayers.filter((p) => p.alive && p.team === "Красные").length}</strong>
            </span>
            <span>
              Черных: <strong className="text-slate-400">{activePlayers.filter((p) => p.alive && p.team === "Чёрные").length}</strong>
            </span>
          </div>
        </div>
        <div className="text-[10px] font-bold">
          {winTeam ? (
            <div className="space-y-1.5">
              <div className="p-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-emerald-400 text-center uppercase tracking-wider text-[9px]">
                Авто-победа: {winTeam}!
              </div>
              <button
                onClick={() => handleEndGameWithWinner(winTeam)}
                className="w-full bg-rose-600 text-white py-1.5 rounded uppercase tracking-wider cursor-pointer"
              >
                Применить авто-победу
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => handleEndGameWithWinner("Красные")}
                className="bg-rose-600 text-white py-1.5 rounded uppercase text-[9px] tracking-wider cursor-pointer"
              >
                Победа Красных
              </button>
              <button
                onClick={() => handleEndGameWithWinner("Чёрные")}
                className="bg-slate-800 text-slate-300 py-1.5 rounded uppercase text-[9px] tracking-wider cursor-pointer"
              >
                Победа Чёрных
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
