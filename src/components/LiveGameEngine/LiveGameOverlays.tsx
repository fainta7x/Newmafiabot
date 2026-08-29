import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PendingActionType, PlayerDiscipline } from "../../lib/gameDiscipline.js";
import type { BestMoveSource } from "../../lib/gameProtocolCore.js";
import type { ActivePlayerState } from "./types.js";

interface DisciplineConfirmationOverlayProps {
  pending: { slot: number; action: PendingActionType } | null;
  player: ActivePlayerState | null;
  onCancel: () => void;
  onConfirm: () => void;
}

const dangerousActionCopy = (action: PendingActionType) => {
  if (action === 'removal_4th_foul') return {
    title: 'Удаление по 4-му фолу',
    description: 'Игрок будет удалён из игры, а ближайшее голосование будет отменено.',
    confirmLabel: 'Подтвердить 4-й фол',
  };
  if (action === 'minor_tech_causing_removal' || action === 'major_tech_causing_removal') return {
    title: 'Удаление по второму техфолу',
    description: 'Технический фол будет зафиксирован, игрок будет удалён, а ближайшее голосование будет отменено.',
    confirmLabel: 'Подтвердить техфол',
  };
  if (action === 'direct_removal') return {
    title: 'Удаление решением судьи',
    description: 'Игрок будет удалён из игры, а ближайшее голосование будет отменено.',
    confirmLabel: 'Подтвердить удаление',
  };
  return {
    title: 'Зафиксировать ППК',
    description: 'Игра немедленно завершится победой противоположной команды, а ППК попадёт в итоговый протокол.',
    confirmLabel: 'Подтвердить ППК',
  };
};

export function DisciplineConfirmationOverlay({ pending, player, onCancel, onConfirm }: DisciplineConfirmationOverlayProps) {
  if (!pending) return null;
  const copy = dangerousActionCopy(pending.action);

  return (
    <div className="fixed inset-0 z-[126] flex items-center justify-center bg-black/78 p-4 backdrop-blur-md">
      <div data-testid="live-discipline-confirmation" className="live-discipline-confirmation w-full max-w-md space-y-4 rounded-[24px] border border-white/10 bg-[#121318] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.58)]">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-200/65">Требуется подтверждение</div>
          <h3 className="mt-1 text-lg font-semibold text-white">{copy.title}</h3>
          <p className="mt-2 text-sm font-semibold text-white/72">#{pending.slot} · {player?.nickname || 'Игрок'}</p>
          <p className="mt-2 text-xs leading-relaxed text-white/38">{copy.description}</p>
        </div>
        <div className="rounded-2xl border border-amber-200/10 bg-amber-200/[0.06] px-3 py-2 text-[11px] text-amber-50/62">
          Действие будет применено только после подтверждения.
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="min-h-12 rounded-2xl border border-white/[0.07] bg-black/20 text-xs font-semibold text-white/52">Отмена</button>
          <button type="button" onClick={onConfirm} className="min-h-12 rounded-2xl border border-rose-200/14 bg-rose-300/[0.10] text-xs font-semibold text-rose-50/82">{copy.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

interface PlayerActionOverlayProps {
  player: ActivePlayerState | null;
  mode?: 'standard' | 'farewell';
  disciplinePlayer: PlayerDiscipline | null;
  activeSpeakerSlot: number | null;
  nominations: number[];
  nominationBlockedBySpeaker: boolean;
  onClose: () => void;
  onAddRegularFoul: (slot: number) => void;
  onRemoveRegularFoul: (slot: number) => void;
  onAddTechFoul: (slot: number, kind: 'minor' | 'major') => void;
  onToggleNomination: (slot: number) => void;
  onDirectRemove: (slot: number) => void;
  onPpk: (slot: number) => void;
  onEditNote: (player: ActivePlayerState) => void;
  onRestorePlayer: (slot: number) => void;
}

export function PlayerActionOverlay({
  player,
  mode = 'standard',
  disciplinePlayer,
  activeSpeakerSlot,
  nominations,
  nominationBlockedBySpeaker,
  onClose,
  onAddRegularFoul,
  onRemoveRegularFoul,
  onAddTechFoul,
  onToggleNomination,
  onDirectRemove,
  onPpk,
  onEditNote,
  onRestorePlayer,
}: PlayerActionOverlayProps) {
  if (!player) return null;
  const isNominated = nominations.includes(player.slot_num);
  const nominationDisabled = !isNominated && (!activeSpeakerSlot || nominationBlockedBySpeaker);
  const regularFouls = disciplinePlayer?.regularFouls ?? player.fouls;
  const minorTech = disciplinePlayer?.minorTechFouls ?? 0;
  const majorTech = disciplinePlayer?.majorTechFouls ?? 0;

  return (
    <div className="fixed inset-0 z-[112] bg-slate-950/60 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
      <div className="live-player-action-sheet w-full max-w-md rounded-t-3xl md:rounded-3xl border p-4 space-y-4" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-base font-black text-white truncate">#{player.slot_num} · {player.nickname}</div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/[.06] px-2 py-1.5 text-center">
                <div className="text-[7px] uppercase font-black tracking-wider text-slate-500">Фолы</div>
                <div className="text-sm font-mono font-black text-amber-300">{regularFouls}</div>
              </div>
              <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/[.05] px-2 py-1.5 text-center">
                <div className="text-[7px] uppercase font-black tracking-wider text-slate-500">Малый техфол</div>
                <div className="text-sm font-mono font-black text-yellow-300">{minorTech}</div>
              </div>
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/[.05] px-2 py-1.5 text-center">
                <div className="text-[7px] uppercase font-black tracking-wider text-slate-500">Большой техфол</div>
                <div className="text-sm font-mono font-black text-rose-300">{majorTech}</div>
              </div>
            </div>
            <div className="sr-only">Фолы: {regularFouls} · Малый тех: {minorTech} · Большой тех: {majorTech}</div>
            {activeSpeakerSlot && <div className="text-[10px] text-amber-300 mt-2">Речь #{activeSpeakerSlot}</div>}
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-700 text-slate-300 font-black shrink-0">×</button>
        </div>

        {player.alive || mode === 'farewell' ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { onAddRegularFoul(player.slot_num); onClose(); }} className="min-h-12 rounded-xl bg-amber-950/60 border border-amber-700/70 text-amber-200 text-xs font-black">+ Обычный фол</button>
            <button type="button" disabled={regularFouls <= 0} onClick={() => { onRemoveRegularFoul(player.slot_num); onClose(); }} className="min-h-12 rounded-xl bg-slate-950 border border-slate-700 text-slate-300 text-xs font-black disabled:opacity-30">− Снять фол</button>
            <button type="button" onClick={() => { onAddTechFoul(player.slot_num, 'minor'); onClose(); }} className="min-h-12 rounded-xl bg-yellow-950/45 border border-yellow-700/60 text-yellow-200 text-xs font-black">Малый тех</button>
            <button type="button" onClick={() => { onAddTechFoul(player.slot_num, 'major'); onClose(); }} className="min-h-12 rounded-xl bg-rose-950/55 border border-rose-700/70 text-rose-200 text-xs font-black">Большой тех</button>
            {mode === 'standard' && (
              <>
                <button
                  type="button"
                  disabled={nominationDisabled}
                  onClick={() => { onToggleNomination(player.slot_num); onClose(); }}
                  className={`min-h-12 rounded-xl border text-xs font-black disabled:opacity-30 ${isNominated ? 'bg-slate-950 border-slate-600 text-slate-300' : 'bg-fuchsia-950/40 border-fuchsia-700/60 text-fuchsia-200'}`}
                >
                  {isNominated ? 'Снять выставление' : 'Выставить'}
                </button>
                <button type="button" onClick={() => onEditNote(player)} className="min-h-12 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 text-xs font-black">Заметка</button>
                <button type="button" onClick={() => onDirectRemove(player.slot_num)} className="min-h-12 rounded-xl bg-red-950/60 border border-red-700/70 text-red-200 text-xs font-black">Удалить</button>
                <button type="button" aria-label="ППК" onClick={() => onPpk(player.slot_num)} className="min-h-12 rounded-xl bg-purple-950/60 border border-purple-700/70 text-purple-200 text-xs font-black">ППК</button>
              </>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => onRestorePlayer(player.slot_num)} className="w-full min-h-12 rounded-xl bg-emerald-950 border border-emerald-700 text-emerald-200 text-xs font-black">Вернуть за стол</button>
        )}
      </div>
    </div>
  );
}

interface BestMoveProtocolOverlayProps {
  source: BestMoveSource | null;
  slot: number | null;
  nickname: string;
  pendingSeats: number[];
  onToggleSeat: (slot: number) => void;
  onReset: () => void;
  onBack: () => void;
  onConfirm: () => void;
}

export function BestMoveProtocolOverlay({ source, slot, nickname, pendingSeats, onToggleSeat, onReset, onBack, onConfirm }: BestMoveProtocolOverlayProps) {
  if (!source || slot === null) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/82 p-4 backdrop-blur-md">
      <div data-testid="live-best-move-sheet" className="w-full max-w-2xl space-y-5 rounded-[24px] border border-white/10 bg-[#121318] p-6 shadow-[0_24px_72px_rgba(0,0,0,0.58)]">
        <div className="space-y-1.5 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/62">{source === 'first_killed' ? 'Первый убитый' : 'Заголосован на нулевом круге'}</div>
          <h2 className="text-xl font-semibold text-white">Протокол ЛХ</h2>
          <p className="text-sm font-semibold text-white/60">Игрок #{slot} · {nickname || 'Игрок'}</p>
          <p className="text-xs text-white/30">Выберите до трёх номеров. Порядок выбора сохраняется.</p>
        </div>
        <div className="mx-auto grid max-w-md grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, index) => index + 1).map((seat) => {
            const order = pendingSeats.indexOf(seat);
            return (
              <button key={seat} type="button" onClick={() => onToggleSeat(seat)} className={`live-seat-mini-number relative h-14 rounded-xl border font-mono font-bold transition-opacity ${order >= 0 ? 'ring-2 ring-white/55' : 'opacity-60'}`} data-seat={seat}>
                {seat}
                {order >= 0 && <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-bold text-[#090a0d]">{order + 1}</span>}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={onBack} className="min-h-11 rounded-2xl border border-white/[0.10] bg-black/30 px-4 text-xs font-semibold text-white/72">← Назад</button>
          <button type="button" onClick={onReset} className="min-h-11 rounded-2xl border border-white/[0.07] bg-black/20 px-4 text-xs font-semibold text-white/46">Сбросить</button>
          <button type="button" onClick={onConfirm} className="min-h-11 rounded-2xl bg-white px-4 text-xs font-semibold text-[#090a0d]">Подтвердить протокол</button>
        </div>
      </div>
    </div>
  );
}

export function LiveGameToast({ toast }: { toast: { message: string; type: "error" | "warning" | "success" | "info" } | null }) {
  const [feedbackTarget, setFeedbackTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!toast || typeof document === 'undefined') {
      setFeedbackTarget(null);
      return;
    }

    const findTarget = () => document.querySelector<HTMLElement>('[data-testid="live-events-feedback"]');
    const immediateTarget = findTarget();
    if (immediateTarget) {
      setFeedbackTarget(immediateTarget);
      return;
    }

    const frame = window.requestAnimationFrame(() => setFeedbackTarget(findTarget()));
    return () => window.cancelAnimationFrame(frame);
  }, [toast?.message]);

  if (!toast) return null;
  if (toast.type === 'success' && /^#\d+ выставлен \d+-м на речи #\d+$/.test(toast.message)) return null;

  if (feedbackTarget) {
    const inlineTone = toast.type === 'error'
      ? 'text-rose-200/90'
      : toast.type === 'warning'
        ? 'text-amber-200/90'
        : toast.type === 'success'
          ? 'text-emerald-200/90'
          : 'text-white/62';

    return createPortal(
      <span
        data-testid="live-game-inline-toast"
        role="status"
        aria-live="polite"
        className={`absolute inset-0 z-10 block truncate bg-[#101116] text-[9px] font-semibold leading-3 pointer-events-none ${inlineTone}`}
        title={toast.message}
      >
        {toast.message}
      </span>,
      feedbackTarget,
    );
  }

  const tone = toast.type === 'error'
    ? 'border-rose-200/14 bg-rose-300/[0.10] text-rose-50/82'
    : toast.type === 'warning'
      ? 'border-amber-200/14 bg-amber-200/[0.10] text-amber-50/82'
      : toast.type === 'success'
        ? 'border-emerald-200/14 bg-emerald-300/[0.10] text-emerald-50/82'
        : 'border-white/10 bg-[#15161a] text-white/68';
  return <div className={`fixed bottom-4 right-4 z-[130] rounded-2xl border px-4 py-2.5 text-xs font-semibold shadow-[0_16px_48px_rgba(0,0,0,0.42)] ${tone}`}>{toast.message}</div>;
}

interface RestorableSessionBannerProps {
  visible: boolean;
  savedAt?: string | null;
  onRestore: () => void;
  onDiscard: () => void;
}

export function RestorableSessionBanner({ visible, savedAt, onRestore, onDiscard }: RestorableSessionBannerProps) {
  if (!visible) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-amber-200/12 bg-amber-200/[0.07] p-4 text-xs text-amber-50/68">
      <span>Найдена незавершённая игра · {savedAt || 'недавно'}</span>
      <div className="flex gap-2">
        <button type="button" onClick={onRestore} className="min-h-10 rounded-xl bg-white px-3 text-xs font-semibold text-[#090a0d]">Восстановить</button>
        <button type="button" onClick={onDiscard} className="min-h-10 rounded-xl border border-white/[0.07] bg-black/20 px-3 text-xs font-semibold text-white/46">Сбросить</button>
      </div>
    </div>
  );
}