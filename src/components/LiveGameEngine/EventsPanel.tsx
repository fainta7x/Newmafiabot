import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronUp, ClipboardList, Copy, ScrollText, X } from "lucide-react";
import { ActivePlayerState, Phase } from "./types.js";
import LiveGameStateSheet from "../crm/LiveGameStateSheet.js";
import { LEGACY_PROTOCOL_NOTES_KEY } from "../../lib/liveClubSession.js";
import { GAME_ROLES, normalizeWinnerTeam, teamOfPlayer } from '../../shared/gameRoles.ts';

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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const restoredNotesRef = useRef<string | null | undefined>(undefined);
  const panelRef = useRef<HTMLElement | null>(null);
  // Short phones (owner, 2026-10-27, «кнопки в верхнюю панель»): when the board leaves no room for this panel under it,
  // «↩» and «Журнал» move to the game's top bar (`#live-topbar-slot`, like «Авто») and the journal opens as a sheet.
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  // On a phone «Состояние» is one of the top bar's buttons too, not a floating one over the title or the events panel.
  const [stateSlot, setStateSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const sync = () => {
      const panel = panelRef.current;
      const slot = document.getElementById("live-topbar-slot");
      const hidden = Boolean(panel) && window.innerWidth < 700 && panel!.getBoundingClientRect().bottom > window.innerHeight + 1;
      setTopbarSlot(hidden ? slot : null);
      setStateSlot(window.innerWidth < 768 ? slot : null);
    };
    sync();
    const frame = window.requestAnimationFrame(sync);
    window.addEventListener("resize", sync);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", sync);
    };
  }, [phase === "setup"]);

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
  const latestLog = nightLogs.length > 0 ? nightLogs[nightLogs.length - 1]?.log ?? null : null;

  const calculatePlayerScore = (player: ActivePlayerState) => {
    let score = 0;
    const isWin = winTeam && teamOfPlayer(player) === normalizeWinnerTeam(winTeam);
    if (isWin) score += 1.0;

    if (player.bonus_points) score += parseFloat(player.bonus_points as any) || 0;
    if (player.lh_points) score += parseFloat(player.lh_points as any) || 0;
    if (player.will_protocol_points) score += parseFloat(player.will_protocol_points as any) || 0;

    if (player.best_move_guesses && player.best_move_guesses.length === 3 && !player.lh_points) {
      const blackSlots = activePlayers.filter((p) => teamOfPlayer(p) === 'black').map((p) => p.slot_num);
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
      text += `${s.slot_num}. *${s.nickname || "Игрок " + s.slot_num}* (${GAME_ROLES[s.role].label}) — *${pts} б.*${dcText}${bmText}${noteText}\n`;
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

  const journal = (
    <div id="live-events-details" data-testid="live-events-details" className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div data-testid="live-events-filters" className="flex rounded-xl border border-white/[0.07] bg-black/20 p-0.5 text-[10px] font-semibold">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`min-h-11 min-w-11 rounded-lg px-2 transition-colors ${
              filter === "all" ? "bg-white text-[#090a0d]" : "text-white/38 active:bg-white/[0.06]"
            }`}
          >
            Все ({nightLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("day")}
            style={filter === "day" ? { backgroundColor: "rgba(232, 185, 94, 0.10)", borderColor: "rgba(232, 185, 94, 0.18)" } : undefined}
            className={`min-h-11 min-w-11 rounded-lg px-2 transition-colors ${
              filter === "day" ? "border text-amber-100" : "text-white/38 active:bg-white/[0.06]"
            }`}
          >
            Дни
          </button>
          <button
            type="button"
            onClick={() => setFilter("night")}
            style={filter === "night" ? { backgroundColor: "rgba(167, 139, 250, 0.10)", borderColor: "rgba(196, 181, 253, 0.18)" } : undefined}
            className={`min-h-11 min-w-11 rounded-lg px-2 transition-colors ${
              filter === "night" ? "border text-violet-100" : "text-white/38 active:bg-white/[0.06]"
            }`}
          >
            Ночи
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

      <textarea
        data-testid="live-protocol-notes"
        placeholder="Свободные примечания ведущего к протоколу..."
        value={protocolNotes}
        onChange={(e) => setProtocolNotes(e.target.value)}
        className="min-h-11 w-full resize-none rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-xs text-white/72 outline-none placeholder:text-white/24 focus:border-white/16"
        rows={1}
      />
    </div>
  );

  const undoButton = onUndoLastLog && latestLog ? (
    <button
      type="button"
      data-testid="live-events-undo"
      onClick={onUndoLastLog}
      className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-rose-200/12 bg-rose-300/[0.07] px-2 text-[11px] font-semibold text-rose-100/75 active:bg-rose-300/[0.11]"
      title="Отменить последнее зафиксированное событие"
      aria-label="Отменить последнее событие"
    >
      ↩
    </button>
  ) : null;

  const copyButton = (
    <button
      type="button"
      data-testid="live-copy-protocol"
      onClick={handleCopyTelegramProtocol}
      className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border border-sky-200/10 bg-sky-300/[0.07] px-2.5 text-[10px] font-semibold text-sky-100/75 active:bg-sky-300/[0.11]"
      title="Скопировать протокол для Telegram"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-300" />
          <span className="hidden sm:inline text-emerald-200">Готово</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Telegram</span>
        </>
      )}
    </button>
  );

  return (
    <div className="grid grid-cols-1 gap-3">
      {topbarSlot ? createPortal(
        <>
          {undoButton ? <span className="evening-live-topbar-tool">{undoButton}</span> : null}
          <button
            type="button"
            data-testid="live-events-toggle"
            aria-expanded={detailsOpen}
            aria-controls="live-events-details"
            onClick={() => setDetailsOpen((value) => !value)}
            className="evening-live-topbar-tool grid h-7 w-7 place-items-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400"
            title="Журнал"
            aria-label="Журнал"
          >
            <ScrollText className="h-4 w-4" />
          </button>
        </>,
        topbarSlot,
      ) : null}
      {topbarSlot && detailsOpen ? (
        <div className="fixed inset-0 z-[130] flex items-end bg-black/70 p-2 backdrop-blur-sm" onClick={() => setDetailsOpen(false)}>
          <div role="dialog" aria-label="Журнал" data-testid="live-events-sheet" className="max-h-[85dvh] w-full overflow-y-auto rounded-[24px] border border-white/10 bg-[#121318] p-3" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/72">События · {nightLogs.length}</h3>
              <div className="flex items-center gap-1.5">
                {copyButton}
                <button type="button" onClick={() => setDetailsOpen(false)} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/[0.07] bg-black/20 text-white/60" aria-label="Закрыть журнал"><X className="h-4 w-4" /></button>
              </div>
            </div>
            {journal}
          </div>
        </div>
      ) : null}
      {stateSlot ? createPortal(
        <button
          type="button"
          data-testid="live-state-button"
          onClick={() => setStateOpen(true)}
          className="evening-live-topbar-state grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-amber-200/15 bg-amber-200/[0.08] text-amber-100/75"
          title="Текущее состояние игры"
          aria-label="Текущее состояние игры"
        >
          <ClipboardList className="h-3.5 w-3.5" />
        </button>,
        stateSlot,
      ) : (
        // On wide screens it sits left of the window's header buttons (OBS, roles, close) so it never covers the OBS button.
        <button
          type="button"
          data-testid="live-state-button"
          onClick={() => setStateOpen(true)}
          className="fixed right-2 top-0 z-[111] grid h-11 w-11 place-items-center rounded-xl border border-amber-200/15 bg-amber-200/[0.08] text-amber-100/75 shadow-none backdrop-blur md:right-[140px] md:top-[6px] md:flex md:h-9 md:w-auto md:px-3 md:gap-1.5 md:rounded-xl md:text-[10px] md:font-semibold"
          title="Текущее состояние игры"
          aria-label="Текущее состояние игры"
        >
          <ClipboardList className="h-3.5 w-3.5 md:h-4 md:w-4" />
          <span className="hidden md:inline">Состояние</span>
        </button>
      )}

      <LiveGameStateSheet open={stateOpen} onClose={() => setStateOpen(false)} />

      {/* Under the screen edge on a short phone it keeps its place (the measure above) but is not drawn half-cut. */}
      <section ref={panelRef} data-testid="live-events-panel" className={`${topbarSlot ? "invisible " : ""}rounded-[24px] border border-white/10 bg-white/[0.04] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.16)]`}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/72">События</h3>
              <span className="rounded-lg bg-black/20 px-1.5 py-1 text-[10px] font-semibold text-white/30">{nightLogs.length}</span>
            </div>
            {/* Two lines for the latest event (2026-10-27: one line cut most of them to «…»); the whole log is under «Журнал». */}
            <div data-testid="live-events-feedback" className="relative mt-1 h-6 min-w-0 overflow-hidden">
              <p data-testid="live-events-latest" className={`absolute inset-0 line-clamp-2 text-[10px] leading-3 ${latestLog ? "text-white/42" : "text-white/26"}`} title={latestLog || undefined}>
                {latestLog || "Журнал и заметки не мешают текущему ходу"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {topbarSlot ? null : undoButton}

            {topbarSlot ? null : copyButton}

            {topbarSlot ? null : (
              <button
                type="button"
                data-testid="live-events-toggle"
                aria-expanded={detailsOpen}
                aria-controls="live-events-details"
                onClick={() => setDetailsOpen((value) => !value)}
                className="flex min-h-11 items-center gap-1 rounded-xl border border-white/[0.07] bg-black/20 px-2.5 text-[10px] font-semibold text-white/48 active:bg-white/[0.06]"
              >
                <span>{detailsOpen ? "Скрыть" : "Журнал"}</span>
                {detailsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>

        {detailsOpen && !topbarSlot && journal}
      </section>
    </div>
  );
}
