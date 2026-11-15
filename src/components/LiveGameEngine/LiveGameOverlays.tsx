import { REVEAL_COLOR_LABELS, type LiveReveal, type RevealColor } from '../../lib/liveReveals.ts';
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PendingActionType, PlayerDiscipline } from "../../lib/gameDiscipline.js";
import type { BestMoveSource } from "../../lib/gameProtocolCore.js";
import { nextTrainingBestMoveSeat, TRAINING_BEST_MOVE_SEATS } from "../../lib/judgeTrainingProtocols.ts";
import type { ActivePlayerState } from "./types.js";
import { SeatBadge } from "./SeatBadge.tsx";
import { GAME_ROLE_LABELS } from "../../shared/gameRoles.ts";

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
          <p className="mt-2 text-sm font-semibold text-white/72"><SeatBadge seat={pending.slot} size="inline" /> {player?.nickname || 'Игрок'}</p>
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

interface WinnerConfirmationOverlayProps {
  winner: 'Красные' | 'Чёрные' | null;
  canUndo: boolean;
  onUndo: () => void;
  onConfirm: () => void;
}

/**
 * The game does not end on its own the moment a win condition becomes true: a misclick (a wrong removal, a wrong shot)
 * must be reversible before the result is handed over and the session is dropped (engine audit, 2026-10-04).
 */
export function WinnerConfirmationOverlay({ winner, canUndo, onUndo, onConfirm }: WinnerConfirmationOverlayProps) {
  if (!winner) return null;
  return (
    <div className="fixed inset-0 z-[127] flex items-center justify-center bg-black/78 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md">
      <div data-testid="live-winner-confirmation" className="w-full max-w-md space-y-4 rounded-[24px] border border-white/10 bg-[#121318] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.58)]">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/70">Условие победы выполнено</div>
          <h3 className="mt-1 text-xl font-semibold text-white">Победили {winner}</h3>
          <p className="mt-2 text-xs leading-relaxed text-white/45">Проверьте, что это не случайное нажатие. После подтверждения игра завершится и результат уйдёт в протокол.</p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <button type="button" data-testid="live-winner-confirm" onClick={onConfirm} className="min-h-12 rounded-2xl border border-emerald-200/20 bg-emerald-300/[0.12] text-sm font-semibold text-emerald-50/90">Завершить игру</button>
          {canUndo ? <button type="button" data-testid="live-winner-undo" onClick={onUndo} className="min-h-12 rounded-2xl border border-white/[0.07] bg-black/20 text-xs font-semibold text-white/60">Вернуть последнее действие</button> : null}
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
  onRemoveTechFoul: (slot: number, kind: 'minor' | 'major') => void;
  onToggleNomination: (slot: number) => void;
  onDirectRemove: (slot: number) => void;
  onPpk: (slot: number) => void;
  /** Saves the judge's note for the player (empty text clears it). */
  onEditNote: (player: ActivePlayerState, note: string) => void;
  onRestorePlayer: (slot: number) => void;
  /** «Вскрытие»: the player openly claims to be the Sheriff; the judge records the announced checks right in the sheet. */
  reveal?: LiveReveal | null;
  seats?: number[];
  onReveal?: (slot: number) => void;
  onRemoveReveal?: (slot: number) => void;
  onSetAnnouncedCheck?: (slot: number, target: number, color: RevealColor) => void;
  onRemoveAnnouncedCheck?: (slot: number, target: number) => void;
  /** Elo tags of the judge (owner, 2026-11-03): «Вскрылся чёрному» −10 on this circle, «Убил шерифа в нуле» +10. */
  eloTags?: Array<'revealed_to_black' | 'killed_sheriff_zero' | 'false_sheriff_red_sheriff'>;
  onToggleEloTag?: (slot: number, tag: 'revealed_to_black' | 'killed_sheriff_zero' | 'false_sheriff_red_sheriff') => void;
  /** The role in the header only when the roles are not hidden (owner, 2026-11-15). */
  showRole?: boolean;
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
  onRemoveTechFoul,
  onToggleNomination,
  onDirectRemove,
  onPpk,
  onEditNote,
  onRestorePlayer,
  reveal = null,
  seats = [],
  onReveal,
  onRemoveReveal,
  onSetAnnouncedCheck,
  onRemoveAnnouncedCheck,
  eloTags = [],
  onToggleEloTag,
  showRole = false,
}: PlayerActionOverlayProps) {
  if (!player) return null;
  const isNominated = nominations.includes(player.slot_num);
  const nominationDisabled = !isNominated && (!activeSpeakerSlot || nominationBlockedBySpeaker);
  const regularFouls = disciplinePlayer?.regularFouls ?? player.fouls;
  const minorTech = disciplinePlayer?.minorTechFouls ?? 0;
  const majorTech = disciplinePlayer?.majorTechFouls ?? 0;
  const canEditFouls = player.alive || mode === 'farewell';
  const canDirectRemove = !disciplinePlayer?.isRemoved && !player.removal_reason && !player.kick;

  const roleLabel = showRole && player.role ? GAME_ROLE_LABELS[player.role as keyof typeof GAME_ROLE_LABELS] : '';
  const blackRole = player.role === 'don' || player.role === 'mafia';
  const stepper = (label: string, value: number, onMinus: () => void, onPlus: () => void, ids: { plus?: string; minus?: string } = {}, names: { plus: string; minus: string } = { plus: `Добавить: ${label}`, minus: `Снять: ${label}` }) => (
    <div className="flex min-h-[52px] items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.05] pl-4 pr-1.5">
      <span className="text-sm font-bold text-white">{label}</span>
      <span className="flex items-center gap-1.5">
        <button type="button" data-testid={ids.minus} aria-label={names.minus} disabled={value <= 0} onClick={() => { onMinus(); onClose(); }} className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.08] text-lg font-black text-white disabled:opacity-25">−</button>
        <span className="min-w-6 text-center font-mono text-lg font-black text-white">{value}</span>
        <button type="button" data-testid={ids.plus} data-seat={player.slot_num} aria-label={names.plus} onClick={() => { onPlus(); onClose(); }} className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.08] text-lg font-black text-white">+</button>
      </span>
    </div>
  );
  const sectionLabel = (text: string) => <div className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-white/45">{text}</div>;

  return (
    <div className="fixed inset-0 z-[112] bg-slate-950/60 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
      {/* Owner, 2026-11-15: the old grid of mixed buttons looked dated. One header, the frequent actions large, the rest in calm rows. */}
      <div data-testid="live-player-action-sheet" className="live-player-action-sheet max-h-[100dvh] w-full max-w-md overflow-y-auto rounded-t-3xl md:rounded-3xl border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(event) => event.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15 md:hidden" />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-lg font-black text-white"><SeatBadge seat={player.slot_num} /><span className="min-w-0 break-words">{player.nickname}</span></div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-white/55">
              {roleLabel ? <span className={`rounded-full px-2 py-0.5 font-bold ${blackRole ? 'bg-rose-500/15 text-rose-300' : 'bg-white/10 text-white/75'}`}>{roleLabel}</span> : null}
              <span className="inline-flex items-center gap-1">Фолы <span className="inline-flex gap-0.5">{[0, 1, 2, 3].map((index) => <i key={index} className={`block h-2 w-2 rounded-full ${index < regularFouls ? 'bg-amber-400' : 'bg-white/15'}`} />)}</span></span>
              {activeSpeakerSlot ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-bold text-amber-300">Говорит #{activeSpeakerSlot}</span> : null}
              {!player.alive ? <span className="rounded-full bg-white/10 px-2 py-0.5 font-bold text-white/60">Не за столом</span> : null}
            </div>
            <div className="sr-only">Фолы: {regularFouls} · Малый тех: {minorTech} · Большой тех: {majorTech}</div>
          </div>
          <button type="button" data-testid="live-player-actions-close" aria-label="Закрыть" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-white/70">✕</button>
        </div>

        {(player.alive && mode === 'standard') || canEditFouls ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {player.alive && mode === 'standard' ? (
              <button
                type="button"
                aria-label={isNominated ? 'Снять выставление' : 'Выставить'}
                disabled={nominationDisabled}
                onClick={() => { onToggleNomination(player.slot_num); onClose(); }}
                className={`min-h-[52px] rounded-2xl text-sm font-black disabled:opacity-35 ${isNominated ? 'border border-white/15 bg-white/[0.05] text-white/80' : 'bg-[#e5484d] text-white'}`}
              >{isNominated ? 'Снять выставление' : 'Выставить'}</button>
            ) : null}
            {canEditFouls ? (
              <div className={player.alive && mode === 'standard' ? '' : 'col-span-2'}>
                {stepper('Фол', regularFouls, () => onRemoveRegularFoul(player.slot_num), () => onAddRegularFoul(player.slot_num), { plus: 'live-player-add-regular-foul' }, { plus: '+ Обычный фол', minus: '− Снять фол' })}
              </div>
            ) : null}
          </div>
        ) : null}

        {canEditFouls ? (
          <div className="mt-4">
            {sectionLabel('Техфолы')}
            <div className="grid gap-2">
              {stepper('Малый техфол', minorTech, () => onRemoveTechFoul(player.slot_num, 'minor'), () => onAddTechFoul(player.slot_num, 'minor'), { minus: 'live-player-remove-minor-tech' }, { plus: 'Малый тех', minus: '− Малый тех' })}
              {stepper('Большой техфол', majorTech, () => onRemoveTechFoul(player.slot_num, 'major'), () => onAddTechFoul(player.slot_num, 'major'), { minus: 'live-player-remove-major-tech' }, { plus: 'Большой тех', minus: '− Большой тех' })}
            </div>
          </div>
        ) : null}

        {mode === 'standard' && (onToggleEloTag || onReveal) ? (
          <div className="mt-4">
            {sectionLabel('Отметки')}
            <div className="overflow-hidden rounded-2xl border border-white/10">
              {onToggleEloTag ? <div data-testid="live-player-elo-tags">
                {([['false_sheriff_red_sheriff', 'Вскрылся шерифом с шерифом красным', '−20'], ['revealed_to_black', 'Вскрылся чёрному', '−10'], ['killed_sheriff_zero', 'Убил шерифа в нуле', '+10']] as const).map(([tag, label, points], index) => {
                  const on = eloTags.includes(tag);
                  return (
                    <button key={tag} type="button" data-testid={`live-player-tag-${tag}`} aria-pressed={on} onClick={() => onToggleEloTag(player.slot_num, tag)}
                      className={`flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm text-white ${index ? 'border-t border-white/[0.07]' : ''}`}>
                      <span className="min-w-0 flex-1 break-words">{label}</span>
                      <span className={`w-10 text-right font-mono text-xs font-black ${points.startsWith('+') ? 'text-emerald-400' : 'text-rose-300'}`}>{points}</span>
                      <span className={`relative h-[22px] w-[38px] shrink-0 rounded-full ${on ? 'bg-[#e5484d]' : 'bg-white/15'}`}><span className={`absolute top-[3px] h-4 w-4 rounded-full ${on ? 'left-[19px] bg-white' : 'left-[3px] bg-white/55'}`} /></span>
                    </button>
                  );
                })}
              </div> : null}
              {onReveal ? (
                <div data-testid="live-player-reveal-section" className={onToggleEloTag ? 'border-t border-white/[0.07]' : ''}>
                  {reveal ? (
                    <div className="space-y-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-bold text-amber-200">Вскрылся шерифом</div>
                        <button type="button" data-testid="live-player-reveal-remove" onClick={() => onRemoveReveal?.(player.slot_num)} className="min-h-9 rounded-lg border border-white/10 bg-black/20 px-3 text-[11px] font-bold text-white/60">Снять вскрытие</button>
                      </div>
                      <div className="text-[11px] text-white/45">Объявленные проверки — один тап по номеру</div>
                      {(['red', 'black'] as const).map((color) => (
                        <div key={color} className="space-y-1">
                          <div className={`text-[11px] font-bold ${color === 'red' ? 'text-rose-200' : 'text-slate-200'}`}>{REVEAL_COLOR_LABELS[color] === 'красный' ? 'Назвал красным' : 'Назвал чёрным'}</div>
                          <div className="grid grid-cols-9 gap-1">
                            {seats.filter((seat) => seat !== player.slot_num).map((seat) => {
                              const current = reveal.checks.find((check) => check.target === seat);
                              const active = current?.color === color;
                              return (
                                <button
                                  key={seat}
                                  type="button"
                                  data-testid={`live-player-reveal-${color}-${seat}`}
                                  aria-pressed={active}
                                  onClick={() => (active ? onRemoveAnnouncedCheck?.(player.slot_num, seat) : onSetAnnouncedCheck?.(player.slot_num, seat, color))}
                                  className={`min-h-10 rounded-lg border text-xs font-black ${active
                                    ? color === 'red' ? 'border-rose-300 bg-rose-500/35 text-white' : 'border-slate-100 bg-slate-100 text-slate-900'
                                    : current ? 'border-white/5 bg-black/30 text-white/25' : 'border-white/10 bg-black/25 text-white/75'}`}
                                >{seat}</button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <button type="button" data-testid="live-player-reveal" onClick={() => onReveal(player.slot_num)} className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm text-white">
                      <span className="flex-1">Вскрылся шерифом <span className="text-white/45">· объявил проверки</span></span><span className="text-white/45">›</span>
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {mode === 'standard' ? (
          <label className="mt-4 block">
            {sectionLabel('Заметка')}
            <textarea
              key={player.slot_num}
              data-testid="live-player-note"
              rows={2}
              maxLength={300}
              defaultValue={player.note || ''}
              onBlur={(event) => { if (event.target.value.trim() !== (player.note || '')) onEditNote(player, event.target.value); }}
              placeholder="Что заметили за столом"
              className="w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/35"
            />
          </label>
        ) : null}

        <div className="mt-4 flex gap-2 border-t border-white/[0.07] pt-4">
          {!player.alive ? (
            <button type="button" onClick={() => onRestorePlayer(player.slot_num)} className="min-h-11 flex-1 rounded-2xl border border-emerald-500/40 text-sm font-bold text-emerald-300">Вернуть за стол</button>
          ) : null}
          {canDirectRemove ? (
            <button type="button" aria-label="Удалить" onClick={() => onDirectRemove(player.slot_num)} className="min-h-11 flex-1 rounded-2xl border border-rose-500/35 text-sm font-bold text-rose-300">Удалить из игры</button>
          ) : null}
          <button type="button" aria-label="ППК" onClick={() => onPpk(player.slot_num)} className="min-h-11 flex-1 rounded-2xl border border-violet-500/35 text-sm font-bold text-violet-300">ППК</button>
        </div>
      </div>
    </div>
  );
}

interface BestMoveProtocolOverlayProps {
  source: BestMoveSource | null;
  slot: number | null;
  nickname: string;
  pendingSeats: number[];
  /** Seats at the table: 10, or 8–9 at a novice table. */
  tableSize?: number;
  onToggleSeat: (slot: number) => void;
  onReset: () => void;
  onBack: () => void;
  onConfirm: () => void;
  training?: boolean;
}

export function BestMoveProtocolOverlay({ source, slot, nickname, pendingSeats, tableSize = 10, onToggleSeat, onReset, onBack, onConfirm, training = false }: BestMoveProtocolOverlayProps) {
  if (!source || slot === null) return null;
  const target = training ? nextTrainingBestMoveSeat(pendingSeats) : null;
  const trainingComplete = target === null && pendingSeats.length === TRAINING_BEST_MOVE_SEATS.length;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/82 p-4 backdrop-blur-md">
      <div data-testid="live-best-move-sheet" className="w-full max-w-2xl space-y-5 rounded-[24px] border border-white/10 bg-[#121318] p-6 shadow-[0_24px_72px_rgba(0,0,0,0.58)]">
        <div className="space-y-1.5 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/62">{source === 'first_killed' ? 'Первый убитый' : 'Заголосован на нулевом круге'}</div>
          <h2 className="text-xl font-semibold text-white">Лучший ход</h2>
          <p className="text-sm font-semibold text-white/60">Игрок #{slot} · {nickname || 'Игрок'}</p>
          <p className="text-xs text-white/30">Выберите до трёх номеров. Порядок выбора сохраняется.</p>
          {training && (
            <div data-testid="judge-training-best-move-task" role="status" className="mt-3 rounded-xl border border-emerald-300/35 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-100">
              {target !== null
                ? `Задание ЛХ: первый убитый #${slot} назвал три номера. Нажми #${target} (${pendingSeats.length + 1} из 3). Порядок: #3 → #5 → #9.`
                : 'Верно: ЛХ #3 → #5 → #9. Нажми «Подтвердить лучший ход».'}
            </div>
          )}
        </div>
        <div className="mx-auto grid max-w-md grid-cols-5 gap-2">
          {Array.from({ length: tableSize }, (_, index) => index + 1).map((seat) => {
            const order = pendingSeats.indexOf(seat);
            return (
              <button key={seat} type="button" disabled={training && target !== seat && order < 0} aria-label={training ? `ЛХ игрок #${seat}` : undefined} data-training-next={training && target === seat ? 'true' : undefined} onClick={() => onToggleSeat(seat)} className={`live-seat-mini-number relative h-14 rounded-xl border font-mono font-bold transition-opacity disabled:opacity-25 ${training && target === seat ? 'ring-4 ring-emerald-300 shadow-[0_0_18px_rgba(110,231,183,.3)]' : order >= 0 ? 'ring-2 ring-white/55' : 'opacity-60'}`} data-seat={seat}>
                {seat}
                {order >= 0 && <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[#090a0d]">{order + 1}</span>}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onBack} className="min-h-11 rounded-2xl border border-white/[0.10] bg-black/30 px-3 text-xs font-semibold text-white/72">← Назад</button>
          <button type="button" onClick={onReset} className="min-h-11 rounded-2xl border border-white/[0.07] bg-black/20 px-3 text-xs font-semibold text-white/46">Сбросить</button>
          <button type="button" disabled={training && !trainingComplete} onClick={onConfirm} data-testid="live-best-move-confirm" className="col-span-2 min-h-12 rounded-2xl bg-white px-4 text-sm font-semibold text-[#090a0d] disabled:opacity-35">Подтвердить лучший ход</button>
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

    // On a short phone the events panel stays in place but is not drawn (its tools are in the top bar): a message written
    // into it would be invisible, so it then shows as the floating toast instead (2026-10-27).
    const findTarget = () => {
      const target = document.querySelector<HTMLElement>('[data-testid="live-events-feedback"]');
      return target && window.getComputedStyle(target).visibility === 'visible' ? target : null;
    };
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

  // A removed foul is already visible on the seat card. Where the events panel is not on screen (a short phone) the notice would float
  // over the buttons of the top row, so it is not shown there (found by the stress walk, 2026-11-02).
  if (!feedbackTarget && toast.type === 'info' && /^С игрока #\d+ снят (малый |большой )?(тех)?фол$/.test(toast.message)) return null;

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
        className={`absolute inset-0 z-10 block line-clamp-2 bg-[#101116] text-[10px] font-semibold leading-3 pointer-events-none ${inlineTone}`}
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
  return <div role="status" aria-live="polite" data-testid="live-game-floating-toast" className={`fixed bottom-4 right-4 z-[130] max-w-[calc(100vw-2rem)] rounded-2xl border px-4 py-2.5 text-xs font-semibold shadow-[0_16px_48px_rgba(0,0,0,0.42)] ${tone}`}>{toast.message}</div>;
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
