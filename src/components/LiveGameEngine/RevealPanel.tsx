import { useState } from 'react';
import { REVEAL_COLOR_LABELS, type LiveReveal, type RevealColor } from '../../lib/liveReveals.ts';
import type { ActivePlayerState } from './types.js';

interface RevealPanelProps {
  players: ActivePlayerState[];
  reveals: LiveReveal[];
  /** The judge may see the real roles on his screen; the hint next to a seat is shown only then. */
  rolesVisible: boolean;
  onAddReveal: (seat: number) => void;
  onRemoveReveal: (seat: number) => void;
  onSetCheck: (seat: number, target: number, color: RevealColor) => void;
  onRemoveCheck: (seat: number, target: number) => void;
  onClose: () => void;
}

const seatName = (player: ActivePlayerState | undefined, seat: number) => `#${seat} ${player?.nickname || `Игрок ${seat}`}`;

function RevealedCard({ reveal, players, rolesVisible, onRemoveReveal, onSetCheck, onRemoveCheck }: {
  reveal: LiveReveal;
  players: ActivePlayerState[];
  rolesVisible: boolean;
  onRemoveReveal: (seat: number) => void;
  onSetCheck: (seat: number, target: number, color: RevealColor) => void;
  onRemoveCheck: (seat: number, target: number) => void;
}) {
  const [target, setTarget] = useState('');
  const owner = players.find((player) => player.slot_num === reveal.seat);
  const free = players.filter((player) => player.slot_num !== reveal.seat);
  const add = (color: RevealColor) => {
    const seat = Number(target);
    if (!seat) return;
    onSetCheck(reveal.seat, seat, color);
    setTarget('');
  };
  return (
    <div data-testid={`live-reveal-card-${reveal.seat}`} className="space-y-3 rounded-2xl border border-amber-200/15 bg-amber-200/[0.05] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{seatName(owner, reveal.seat)}</div>
          <div className="text-[11px] text-amber-100/60">вскрылся шерифом{rolesVisible && owner ? ` · на самом деле ${owner.role}` : ''}</div>
        </div>
        <button type="button" onClick={() => onRemoveReveal(reveal.seat)} className="min-h-11 shrink-0 rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white/60">Снять вскрытие</button>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-[0.12em] text-white/40">Объявленные проверки</div>
        {reveal.checks.length ? (
          <ul className="mt-1.5 space-y-1.5">
            {reveal.checks.map((check) => (
              <li key={check.target} className="flex items-center justify-between gap-2 rounded-xl bg-black/25 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-white/80">{seatName(players.find((player) => player.slot_num === check.target), check.target)}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${check.color === 'black' ? 'bg-slate-200/15 text-slate-100' : 'bg-rose-400/15 text-rose-100'}`}>{REVEAL_COLOR_LABELS[check.color]}</span>
                  <button type="button" aria-label={`Убрать проверку ${check.target}`} onClick={() => onRemoveCheck(reveal.seat, check.target)} className="min-h-11 min-w-11 rounded-xl border border-white/10 bg-black/20 text-sm text-white/55">✕</button>
                </span>
              </li>
            ))}
          </ul>
        ) : <div className="mt-1.5 text-xs text-white/35">Проверок пока не объявлено.</div>}
      </div>

      <div className="space-y-2">
        <select
          aria-label={`Кого проверил ${reveal.seat}`}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white"
        >
          <option value="">Кого он назвал проверенным…</option>
          {free.map((player) => <option key={player.slot_num} value={player.slot_num}>{seatName(player, player.slot_num)}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" data-testid={`live-reveal-red-${reveal.seat}`} disabled={!target} onClick={() => add('red')} className="min-h-12 rounded-2xl border border-rose-200/20 bg-rose-400/10 text-sm font-semibold text-rose-50 disabled:opacity-35">Красный</button>
          <button type="button" data-testid={`live-reveal-black-${reveal.seat}`} disabled={!target} onClick={() => add('black')} className="min-h-12 rounded-2xl border border-slate-200/20 bg-slate-200/10 text-sm font-semibold text-slate-50 disabled:opacity-35">Чёрный</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Judge panel «Вскрытие»: who openly claimed to be the Sheriff and which checks they announced. Not the real night
 * checks: these are what the table heard, recorded by hand (BUSINESS_RULES, owner 2026-10-12).
 */
export default function RevealPanel({ players, reveals, rolesVisible, onAddReveal, onRemoveReveal, onSetCheck, onRemoveCheck, onClose }: RevealPanelProps) {
  const revealedSeats = new Set(reveals.map((item) => item.seat));
  return (
    <div className="fixed inset-0 z-[126] flex items-end justify-center bg-black/78 p-0 backdrop-blur-md sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Вскрытие">
      <div data-testid="live-reveal-panel" className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-[24px] border border-white/10 bg-[#121318] shadow-[0_24px_72px_rgba(0,0,0,0.6)] sm:rounded-[24px]">
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/65">Вскрытие</div>
            <h3 className="mt-1 text-lg font-semibold text-white">Кто назвал себя шерифом</h3>
            <p className="mt-1 text-xs leading-relaxed text-white/45">Отметьте игрока, который вскрылся, и добавьте проверки, которые он объявил. Это не настоящие ночные проверки.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="min-h-11 min-w-11 shrink-0 rounded-xl border border-white/10 bg-black/20 text-white/60">✕</button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 pb-5 pt-2">
          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-[0.12em] text-white/40">Игроки</div>
            <div className="grid grid-cols-2 gap-2">
              {players.map((player) => {
                const revealed = revealedSeats.has(player.slot_num);
                return (
                  <button
                    key={player.slot_num}
                    type="button"
                    data-testid={`live-reveal-seat-${player.slot_num}`}
                    aria-pressed={revealed}
                    onClick={() => (revealed ? onRemoveReveal(player.slot_num) : onAddReveal(player.slot_num))}
                    className={`min-h-12 truncate rounded-2xl border px-3 text-left text-sm ${revealed ? 'border-amber-200/30 bg-amber-200/12 text-amber-50' : 'border-white/10 bg-black/20 text-white/70'} ${player.alive ? '' : 'opacity-55'}`}
                  >
                    {seatName(player, player.slot_num)}{revealed ? ' · вскрылся' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {reveals.length ? (
            <div className="space-y-3">
              {reveals.map((reveal) => (
                <RevealedCard key={reveal.seat} reveal={reveal} players={players} rolesVisible={rolesVisible} onRemoveReveal={onRemoveReveal} onSetCheck={onSetCheck} onRemoveCheck={onRemoveCheck} />
              ))}
            </div>
          ) : <div className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/40">Пока никто не вскрылся.</div>}

          <button type="button" onClick={onClose} className="min-h-12 w-full rounded-2xl border border-white/10 bg-black/20 text-sm font-semibold text-white/70">Готово</button>
        </div>
      </div>
    </div>
  );
}
