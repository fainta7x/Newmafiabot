import { useEffect, useRef, useState } from "react";
import { ClipboardList, Copy, Check } from "lucide-react";
import { ActivePlayerState, Phase } from "./types.js";
import LiveGameStateSheet from "../crm/LiveGameStateSheet.js";
import { LEGACY_PROTOCOL_NOTES_KEY } from "../../lib/liveClubSession.js";

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
  const [stateOpen, setStateOpen] = useState(false);
  const restoredNotesRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LEGACY_PROTOCOL_NOTES_KEY);
      restoredNotesRef.current = saved;
      if (saved !== null && saved !== protocolNotes) setProtocolNotes(saved);
    } catch {
      restoredNotesRef.current = null;
    }
  }, []);

  useEffect(() => {
    try {
      const restored = restoredNotesRef.current;
      if (restored !== undefined) {
        if (restored !== null && protocolNotes !== restored) return;
        restoredNotesRef.current = null;
      }
      localStorage.setItem(LEGACY_PROTOCOL_NOTES_KEY, protocolNotes);
    } catch {}
  }, [protocolNotes]);

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
    <div className="grid grid-cols-1 gap-3">
      <button
        type="button"
        data-testid="live-state-button"
        onClick={() => setStateOpen(true)}
        className="fixed right-[74px] top-[3px] z-[111] grid h-7 w-7 place-items-center rounded-lg border border-amber-200/15 bg-amber-200/[0.08] text-amber-100/75 shadow-none backdrop-blur md:right-[92px] md:top-[6px] md:flex md:h-9 md:w-auto md:px-3 md:gap-1.5 md:rounded-xl md:text-[10px] md:font-semibold"
        title="Текущее состояние игры"
        aria-label="Текущее состояние игры"
      >
        <ClipboardList className="h-3.5 w-3.5 md:h-4 md:w-4" />
        <span className="hidden md:inline">Состояние</span>
      </button>

      <LiveGameStateSheet open={stateOpen} onClose={() => setStateOpen(false)} />

      <section data-testid="live-events-panel" className="space-y-3 rounded-[24px] border border-white/10 bg-white/[0.04] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.16)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/72">События и проверки</h3>
            <div data-testid="live-events-filters" className="flex rounded-xl border border-white/[0.07] bg-black/20 p-0.5 text-[9px] font-semibold">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`min-h-7 rounded-lg px-2 transition-colors ${
                  filter === "all" ? "bg-white text-[#090a0d]" : "text-white/38 active:bg-white/[0.06]"
                }`}
              >
                Все ({nightLogs.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter("day")}
                className={`min-h-7 rounded-lg px-2 transition-colors ${
                  filter === "day" ? "border border-amber-200/15 bg-amber-200/[0.10] text-amber-100" : "text-white/38 active:bg-white/[0.06]"
                }`}
              >
                Дни
              </button>
              <button
                type="button"
                onClick={() => setFilter("night")}
                className={`min-h-7 rounded-lg px-2 transition-colors ${
                  filter === "night" ? "border border-violet-200/15 bg-violet-300/[0.10] text-violet-100" : "text-white/38 active:bg-white/[0.06]"
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
                className="flex min-h-8 items-center gap-1 rounded-xl border border-rose-200/12 bg-rose-300/[0.07] px-2.5 text-[9px] font-semibold text-rose-100/75 active:bg-rose-300/[0.11]"
                title="Отменить последнее зафиксированное событие"
              >
                <span>↩ Отменить</span>
              </button>
            )}

            <button
              type="button"
              data-testid="live-copy-protocol"
              onClick={handleCopyTelegramProtocol}
              className="flex min-h-8 items-center gap-1.5 rounded-xl border border-sky-200/10 bg-sky-300/[0.07] px-2.5 text-[9px] font-semibold text-sky-100/75 active:bg-sky-300/[0.11]"
              title="Скопировать протокол в формате Telegram Markdown"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-300" />
                  <span className="text-emerald-200">Скопировано</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Telegram</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div data-testid="live-events-log" className="max-h-36 space-y-1 overflow-y-auto rounded-2xl bg-black/20 px-3 py-2.5 pr-2 text-[10px] font-mono text-white/42">
          {filteredLogs.map((log, idx) => {
            const isDay = log.log.startsWith("Д");
            const isNight = log.log.startsWith("Н");
            if (isDay || isNight) {
              const colonIndex = log.log.indexOf(":");
              if (colonIndex !== -1) {
                const prefix = log.log.substring(0, colonIndex);
                const rest = log.log.substring(colonIndex + 1);
                return (
                  <div key={idx} className="border-b border-white/[0.055] pb-1 last:border-b-0">
                    <span className={`${isDay ? "text-amber-200/75" : "text-violet-200/75"} font-semibold`}>{prefix}:</span>{rest}
                  </div>
                );
              }
            }
            return (
              <div key={idx} className="border-b border-white/[0.055] pb-1 last:border-b-0">
                <span className="font-semibold text-rose-200/75">Н{log.round}:</span> {log.log}
              </div>
            );
          })}
          {filteredLogs.length === 0 && <span className="block py-1 text-white/25">Событий по выбранному фильтру пока нет.</span>}
        </div>

        <div className="border-t border-white/[0.06] pt-2">
          <textarea
            data-testid="live-protocol-notes"
            placeholder="Свободные примечания ведущего к протоколу..."
            value={protocolNotes}
            onChange={(e) => setProtocolNotes(e.target.value)}
            className="min-h-11 w-full resize-none rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-xs text-white/72 outline-none placeholder:text-white/24 focus:border-white/16"
            rows={1}
          />
        </div>
      </section>
    </div>
  );
}