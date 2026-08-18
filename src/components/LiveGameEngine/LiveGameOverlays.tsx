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
    <div className="fixed inset-0 z-[126] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="live-discipline-confirmation w-full max-w-md rounded-3xl border bg-slate-900 shadow-2xl p-5 space-y-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-rose-400">Требуется подтверждение</div>
          <h3 className="text-lg font-black text-white mt-1">{copy.title}</h3>
          <p className="text-sm font-bold text-slate-200 mt-2">#{pending.slot} · {player?.nickname || 'Игрок'}</p>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">{copy.description}</p>
        </div>
        <div className="rounded-2xl border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-[11px] text-amber-200">
          Действие будет применено только после подтверждения.
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="min-h-12 rounded-xl bg-slate-950 border border-slate-700 text-slate-300 text-xs font-black">Отмена</button>
          <button type="button" onClick={onConfirm} className="min-h-12 rounded-xl bg-rose-600 border border-rose-500 text-white text-xs font-black uppercase tracking-wide">{copy.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

interface PlayerActionOverlayProps {
  player: ActivePlayerState | null;
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
                <div className="text-[7px] uppercase font-black tracking-wider text-slate-500">Малый тех</div>
                <div className="text-sm font-mono font-black text-yellow-300">{minorTech}</div>
              </div>
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/[.05] px-2 py-1.5 text-center">
                <div className="text-[7px] uppercase font-black tracking-wider text-slate-500">Большой тех</div>
                <div className="text-sm font-mono font-black text-rose-300">{majorTech}</div>
              </div>
            </div>
            <div className="sr-only">Фолы: {regularFouls} · Малый тех: {minorTech} · Большой тех: {majorTech}</div>
            {activeSpeakerSlot && <div className="text-[10px] text-amber-300 mt-2">Речь #{activeSpeakerSlot}</div>}
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-700 text-slate-300 font-black shrink-0">×</button>
        </div>

        {player.alive ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { onAddRegularFoul(player.slot_num); onClose(); }} className="min-h-12 rounded-xl bg-amber-950/60 border border-amber-700/70 text-amber-200 text-xs font-black">+ Обычный фол</button>
            <button type="button" disabled={regularFouls <= 0} onClick={() => { onRemoveRegularFoul(player.slot_num); onClose(); }} className="min-h-12 rounded-xl bg-slate-950 border border-slate-700 text-slate-300 text-xs font-black disabled:opacity-30">− Снять фол</button>
            <button type="button" onClick={() => { onAddTechFoul(player.slot_num, 'minor'); onClose(); }} className="min-h-12 rounded-xl bg-yellow-950/45 border border-yellow-700/60 text-yellow-200 text-xs font-black">Малый тех</button>
            <button type="button" onClick={() => { onAddTechFoul(player.slot_num, 'major'); onClose(); }} className="min-h-12 rounded-xl bg-rose-950/55 border border-rose-700/70 text-rose-200 text-xs font-black">Большой тех</button>
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
  onConfirm: () => void;
}

export function BestMoveProtocolOverlay({ source, slot, nickname, pendingSeats, onToggleSeat, onReset, onConfirm }: BestMoveProtocolOverlayProps) {
  if (!source || slot === null) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/95 flex items-center justify-center p-4 overflow-y-auto backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-2xl w-full space-y-5 shadow-2xl">
        <div className="text-center space-y-1.5">
          <div className="text-[10px] uppercase font-black text-amber-400">{source === 'first_killed' ? 'Первый убитый' : 'Заголосован на нулевом круге'}</div>
          <h2 className="text-xl font-black text-white">Протокол ЛХ</h2>
          <p className="text-sm text-slate-300 font-bold">Игрок #{slot} · {nickname || 'Игрок'}</p>
          <p className="text-xs text-slate-500">Выберите до трёх номеров. Порядок выбора сохраняется.</p>
        </div>
        <div className="grid grid-cols-5 gap-2 max-w-md mx-auto">
          {Array.from({ length: 10 }, (_, index) => index + 1).map((seat) => {
            const order = pendingSeats.indexOf(seat);
            return (
              <button key={seat} type="button" onClick={() => onToggleSeat(seat)} className={`live-seat-mini-number h-14 rounded-xl border font-mono font-black relative ${order >= 0 ? 'ring-2 ring-white/70' : 'opacity-70'}`} data-seat={seat}>
                {seat}
                {order >= 0 && <span className="absolute top-1 right-1 text-[9px] rounded-full bg-white text-slate-950 w-4 h-4 flex items-center justify-center">{order + 1}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 justify-center">
          <button type="button" onClick={onReset} className="px-5 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold">Сбросить</button>
          <button type="button" onClick={onConfirm} className="px-6 py-2 rounded-xl bg-white text-slate-950 text-xs font-black">Подтвердить протокол</button>
        </div>
      </div>
    </div>
  );
}

export function LiveGameToast({ toast }: { toast: { message: string; type: "error" | "warning" | "success" | "info" } | null }) {
  if (!toast) return null;
  if (toast.type === 'success' && /^#\d+ выставлен \d+-м на речи #\d+$/.test(toast.message)) return null;
  return <div className={`fixed bottom-4 right-4 z-[130] px-4 py-2.5 rounded-xl border shadow-2xl text-xs font-bold ${toast.type === 'error' ? 'bg-rose-950 border-rose-500 text-rose-300' : toast.type === 'warning' ? 'bg-amber-950 border-amber-500 text-amber-300' : toast.type === 'success' ? 'bg-emerald-950 border-emerald-500 text-emerald-300' : 'bg-slate-950 border-slate-700 text-slate-300'}`}>{toast.message}</div>;
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
    <div className="bg-amber-950/70 border border-amber-500/50 rounded-2xl p-4 flex flex-wrap justify-between items-center gap-3 text-xs text-amber-200">
      <span>Найдена незавершённая игра · {savedAt || 'недавно'}</span>
      <div className="flex gap-2">
        <button type="button" onClick={onRestore} className="px-3 py-2 rounded-xl bg-emerald-600 text-white font-black">Восстановить</button>
        <button type="button" onClick={onDiscard} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold">Сбросить</button>
      </div>
    </div>
  );
}
