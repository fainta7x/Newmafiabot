import { useState } from 'react';
import type { ActivePlayerState } from './types.ts';

/**
 * «Вы никого не выбрали» (owner, 2026-11-02): a night step left without a choice asks what happened instead of passing silently.
 * - shooting: a miss — tactics (no penalty), a mistake (name who missed, any of the blacks at the table) or go back and choose;
 * - Don / Sheriff: «не просыпался?» — continue or go back and choose.
 */
export type NightPromptKind = 'miss' | 'don' | 'sheriff';

export function NightPrompt({ kind, blacks, onMiss, onContinue, onChoose }: {
  kind: NightPromptKind;
  blacks: ActivePlayerState[];
  onMiss: (reason: 'error' | 'intentional', seats: number[]) => void;
  onContinue: () => void;
  onChoose: () => void;
}) {
  const [blaming, setBlaming] = useState(false);
  const [seats, setSeats] = useState<number[]>([]);
  const toggle = (slot: number) => setSeats((current) => current.includes(slot) ? current.filter((seat) => seat !== slot) : [...current, slot]);
  const title = kind === 'miss' ? 'Вы никого не выбрали' : kind === 'don' ? 'Проверка Дона не выбрана' : 'Проверка Шерифа не выбрана';
  const text = kind === 'miss' ? 'Мафия никого не убила — это промах?' : kind === 'don' ? 'Дон не просыпался?' : 'Шериф не просыпался?';
  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/65 p-4" data-testid="night-prompt" role="alertdialog" aria-label={title}>
      <div className="w-full max-w-sm space-y-3 rounded-3xl border border-white/15 bg-[#14151b] p-4 text-white shadow-2xl">
        <div className="text-[17px] font-black">{title}</div>
        <p className="text-[13px] leading-snug text-white/70">{text}</p>
        {kind === 'miss' ? (
          blaming ? (
            <>
              <p className="text-[12px] text-white/60">Кто промахнулся? Отметьте одного, нескольких или всю команду (стреляли по-разному).</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Кто промахнулся">
                {blacks.map((player) => (
                  <button key={player.slot_num} type="button" data-testid={`night-miss-seat-${player.slot_num}`} aria-pressed={seats.includes(player.slot_num)} onClick={() => toggle(player.slot_num)}
                    className={`min-h-11 rounded-xl border px-3 text-[13px] font-bold ${seats.includes(player.slot_num) ? 'border-violet-300 bg-violet-400/20 text-violet-100' : 'border-white/20 text-white/80'}`}>
                    #{player.slot_num} {player.nickname || `Игрок ${player.slot_num}`}
                  </button>
                ))}
                <button type="button" onClick={() => setSeats(blacks.map((player) => player.slot_num))} className="min-h-11 rounded-xl border border-white/20 px-3 text-[13px] font-bold text-white/80">Вся команда</button>
              </div>
              <button type="button" data-testid="night-miss-save" disabled={!seats.length} onClick={() => onMiss('error', seats)} className="min-h-12 w-full rounded-xl bg-white text-[14px] font-black text-black disabled:opacity-40">Записать промах</button>
              <button type="button" onClick={() => setBlaming(false)} className="min-h-11 w-full rounded-xl border border-white/20 text-[13px] font-bold">Назад</button>
            </>
          ) : (
            <>
              <button type="button" data-testid="night-miss-tactic" onClick={() => onMiss('intentional', [])} className="min-h-12 w-full rounded-xl bg-white text-[14px] font-black text-black">Тактика — промах без штрафа</button>
              <button type="button" data-testid="night-miss-error" onClick={() => setBlaming(true)} className="min-h-12 w-full rounded-xl border border-white/25 text-[14px] font-bold">Ошибка — выбрать, кто промахнулся</button>
              <button type="button" data-testid="night-prompt-choose" onClick={onChoose} className="min-h-12 w-full rounded-xl border border-white/15 text-[13px] font-bold text-white/70">Нет, выбрать цель</button>
            </>
          )
        ) : (
          <>
            <button type="button" data-testid="night-prompt-continue" onClick={onContinue} className="min-h-12 w-full rounded-xl bg-white text-[14px] font-black text-black">Да, продолжить</button>
            <button type="button" data-testid="night-prompt-choose" onClick={onChoose} className="min-h-12 w-full rounded-xl border border-white/25 text-[14px] font-bold">Нет — выбрать, кого проверил {kind === 'don' ? 'Дон' : 'Шериф'}</button>
          </>
        )}
      </div>
    </div>
  );
}
