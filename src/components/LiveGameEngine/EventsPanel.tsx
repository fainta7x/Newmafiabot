import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { ActivePlayerState, Phase } from "./types.js";

interface EventsPanelProps {
  phase?: Phase;
  activePlayers: ActivePlayerState[];
  nightLogs: { round: number; log: string }[];
  protocolNotes: string;
  setProtocolNotes: (notes: string) => void;
  winTeam: "Красные" | "Чёрные" | null;
  handleEndGameWithWinner: (winner: "Красные" | "Чёрные") => void;
  onUndoLastLog?: () => void;
}

export default function EventsPanel({
  phase,
  activePlayers,
  nightLogs,
  protocolNotes,
  setProtocolNotes,
  winTeam,
  onUndoLastLog,
}: EventsPanelProps) {
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<"all" | "day" | "night">("all");

  if (phase === "setup") return null;

  const filteredLogs = nightLogs.filter((l) => {
    if (filter === "day") return l.log.startsWith("Д");
    if (filter === "night") return l.log.startsWith("Н") || !l.log.startsWith("Д");
    return true;
  });

  const calculatePlayerScore = (player: ActivePlayerState) => {
    let score = 0;
    const isWin = winTeam && player.team === winTeam;
    if (isWin) score += 1.0;

    if (player.bonus_points) score += parseFloat(player.bonus_points as any) || 0;
    if (player.lh_points) score += parseFloat(player.lh_points as any) || 0;
    if (player.will_protocol_points) score += parseFloat(player.will_protocol_points as any) || 0;

    if (player.best_move_guesses && player.best_move_guesses.length === 3 && !player.lh_points) {
      const blackSlots = activePlayers.filter((p) => p.team === "Чёрные").map((p) => p.slot_num);
      const correctGuesses = player.best_move_guesses.filter((g) => blackSlots.includes(g)).length;
      if (correctGuesses === 3) score += 0.5;
      else if (correctGuesses === 2) score += 0.25;
    }

    if (player.dc_points) score += parseFloat(player.dc_points as any) || 0;
    if (player.has_foul_penalty || player.fouls >= 4) score -= 0.5;

    return Math.max(0, score).toFixed(2);
  };

  const handleCopyTelegramProtocol = () => {
    const resultHeader = winTeam ? `ПОБЕДА ${winTeam.toUpperCase()} 🏆` : "В процессе ⏳";
    let text = `🏆 *ПРОТОКОЛ ИГРЫ ФСМ*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🎯 *Результат:* ${resultHeader}\n`;
    text += `📅 *Дата:* ${new Date().toLocaleDateString("ru-RU")}\n\n`;

    text += `👥 *ИТОГОВАЯ ТАБЛИЦА И БАЛЛЫ:*\n`;
    activePlayers.forEach((s) => {
      const pts = winTeam ? calculatePlayerScore(s) : "—";
      const bmText = s.best_move_guesses && s.best_move_guesses.length > 0 ? ` | ЛХ: [${s.best_move_guesses.join(", ")}]` : "";
      const dcText = s.dc_points ? ` (Доп: ${s.dc_points > 0 ? "+" : ""}${s.dc_points})` : "";
      const noteText = s.note ? ` [Заметка: ${s.note}]` : "";
      text += `${s.slot_num}. *${s.nickname || "Игрок " + s.slot_num}* (${s.role}) — *${pts} б.*${dcText}${bmText}${noteText}\n`;
    });

    if (nightLogs.length > 0) {
      text += `\n📜 *ХРОНИКА СОБЫТИЙ:*\n`;
      nightLogs.forEach((l) => {
        text += `• ${l.log}\n`;
      });
    }

    if (protocolNotes.trim()) {
      text += `\n📝 *ПРИМЕЧАНИЯ ВЕДУЩЕГО:* ${protocolNotes.trim()}\n`;
    }

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-wider">События и Проверки</h3>
            <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[9px] font-bold">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`px-2 py-0.5 rounded ${
                  filter === "all" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Все ({nightLogs.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter("day")}
                className={`px-2 py-0.5 rounded ${
                  filter === "day" ? "bg-amber-950 text-amber-300 border border-amber-800/40" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Дни
              </button>
              <button
                type="button"
                onClick={() => setFilter("night")}
                className={`px-2 py-0.5 rounded ${
                  filter === "night" ? "bg-purple-950 text-purple-300 border border-purple-800/40" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Ночи
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onUndoLastLog && nightLogs.length > 0 && (
              <button
                type="button"
                onClick={onUndoLastLog}
                className="px-2 py-1 text-[10px] font-bold rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/50 transition-all cursor-pointer flex items-center gap-1 shadow"
                title="Отменить последнее зафиксированное событие"
              >
                <span>↩ Отменить</span>
              </button>
            )}

            <button
              onClick={handleCopyTelegramProtocol}
              className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-all flex items-center gap-1.5 cursor-pointer"
              title="Скопировать протокол в формате Telegram Markdown"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Скопировано!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-rose-400" />
                  <span>Протокол в Telegram</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 text-[10px] font-mono text-slate-400">
          {filteredLogs.map((log, idx) => {
            const isDay = log.log.startsWith("Д");
            const isNight = log.log.startsWith("Н");
            if (isDay || isNight) {
              const colonIndex = log.log.indexOf(":");
              if (colonIndex !== -1) {
                const prefix = log.log.substring(0, colonIndex);
                const rest = log.log.substring(colonIndex + 1);
                return (
                  <div key={idx} className="border-b border-slate-850/40 pb-1">
                    <span className={`${isDay ? "text-amber-500" : "text-purple-400"} font-bold`}>{prefix}:</span>{rest}
                  </div>
                );
              }
            }
            return (
              <div key={idx} className="border-b border-slate-850/40 pb-1">
                <span className="text-rose-500 font-bold">Н{log.round}:</span> {log.log}
              </div>
            );
          })}
          {filteredLogs.length === 0 && <span className="italic text-slate-500 block">Событий по выбранному фильтру не зафиксировано...</span>}
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
    </div>
  );
}
