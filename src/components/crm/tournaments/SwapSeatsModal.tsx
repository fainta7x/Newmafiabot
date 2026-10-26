import React from 'react';
import { AlertCircle, ArrowLeftRight, X } from 'lucide-react';
import type { TournamentGameSeat } from '../../../lib/api.ts';

type Props = {
  seats: TournamentGameSeat[];
  gameNumber: number | undefined;
  swapSeat1: number;
  setSwapSeat1: (seat: number) => void;
  swapSeat2: number;
  setSwapSeat2: (seat: number) => void;
  actionLoading: boolean;
  onSwap: () => void;
  onClose: () => void;
};

/** Swap two players between seats of a game; roles and protocol actions stay with the seat numbers. */
export const SwapSeatsModal: React.FC<Props> = ({ seats, gameNumber, swapSeat1, setSwapSeat1, swapSeat2, setSwapSeat2, actionLoading, onSwap, onClose }) => {
  const seat1Obj = seats.find((s) => s.seat_number === swapSeat1);
  const seat2Obj = seats.find((s) => s.seat_number === swapSeat2);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-surface-1 border border-border-soft rounded-3xl max-w-md w-full p-6 space-y-4 text-text-primary shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-soft pb-3">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-accent" />
            <h3 className="text-base font-bold">Исправить игроков на местах</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary p-1 rounded-full cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-text-secondary">
          Выберите два слота в Игра №{gameNumber}, которые следует поменять местами:
        </p>

        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-text-secondary font-semibold mb-1">Первое место</label>
              <select
                value={swapSeat1}
                onChange={(e) => setSwapSeat1(parseInt(e.target.value))}
                className="w-full bg-surface-2 border border-border-soft rounded-xl p-2.5 text-text-primary font-bold focus:outline-none"
              >
                {seats.map((s) => (
                  <option key={s.id} value={s.seat_number}>
                    Место #{s.seat_number} — {s.display_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-text-secondary font-semibold mb-1">Второе место</label>
              <select
                value={swapSeat2}
                onChange={(e) => setSwapSeat2(parseInt(e.target.value))}
                className="w-full bg-surface-2 border border-border-soft rounded-xl p-2.5 text-text-primary font-bold focus:outline-none"
              >
                {seats.map((s) => (
                  <option key={s.id} value={s.seat_number}>
                    Место #{s.seat_number} — {s.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {seat1Obj && seat2Obj && swapSeat1 !== swapSeat2 && (
            <div className="bg-surface-2 p-3.5 rounded-2xl border border-border-soft space-y-2">
              <span className="text-[11px] font-bold text-accent uppercase tracking-wider block">
                Подтверждение назначения игроков:
              </span>
              <div className="space-y-1.5 text-xs font-medium">
                <div className="flex items-center justify-between">
                  <span>Место #{swapSeat1}: <strong className="text-text-primary">{seat1Obj.display_name}</strong></span>
                  <span className="text-accent font-bold">➔ станет {seat2Obj.display_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Место #{swapSeat2}: <strong className="text-text-primary">{seat2Obj.display_name}</strong></span>
                  <span className="text-accent font-bold">➔ станет {seat1Obj.display_name}</span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-surface-2 p-3 rounded-xl border border-border-soft text-[11px] text-text-muted flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Роли и все действия протокола остаются у своих номеров мест
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onSwap}
              disabled={actionLoading || swapSeat1 === swapSeat2}
              className={`flex-1 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer min-h-[44px] flex items-center justify-center ${
                actionLoading || swapSeat1 === swapSeat2
                  ? 'bg-surface-2 text-text-muted border border-border-soft cursor-not-allowed opacity-60'
                  : 'bg-accent hover:bg-accent-hover text-white shadow-lg shadow-accent/20'
              }`}
            >
              {actionLoading ? 'Выполнение...' : 'Исправить игроков на местах'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bg-surface-2 hover:bg-surface-hover text-text-secondary font-bold px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer min-h-[44px]"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
