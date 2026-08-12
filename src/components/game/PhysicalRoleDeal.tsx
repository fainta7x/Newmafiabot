import React, { useMemo, useState } from 'react';

export type PhysicalRole = 'citizen' | 'sheriff' | 'mafia' | 'don';

type Seat = {
  seat_number: number;
  nickname: string;
};

type Props = {
  seats: Seat[];
  initialAssignments?: Record<number, PhysicalRole>;
  onCancel: () => void;
  onComplete: (assignments: Record<number, PhysicalRole>) => void;
};

const ROLE_META: Record<PhysicalRole, { label: string; icon: string; max: number; active: string }> = {
  citizen: { label: 'Мирный', icon: '🔴', max: 6, active: 'border-rose-400/50 bg-rose-400/15 text-rose-100' },
  sheriff: { label: 'Шериф', icon: '⭐', max: 1, active: 'border-amber-300/50 bg-amber-300/15 text-amber-100' },
  mafia: { label: 'Мафия', icon: '⚫', max: 2, active: 'border-slate-300/40 bg-slate-200/10 text-slate-100' },
  don: { label: 'Дон', icon: '🎩', max: 1, active: 'border-violet-300/50 bg-violet-300/15 text-violet-100' },
};

const ROLES = Object.keys(ROLE_META) as PhysicalRole[];

export default function PhysicalRoleDeal({ seats, initialAssignments = {}, onCancel, onComplete }: Props) {
  const sortedSeats = useMemo(() => seats.slice().sort((a, b) => a.seat_number - b.seat_number).slice(0, 10), [seats]);
  const [assignments, setAssignments] = useState<Record<number, PhysicalRole>>(() => {
    const allowed = new Set(sortedSeats.map((seat) => seat.seat_number));
    return Object.fromEntries(
      Object.entries(initialAssignments)
        .map(([seat, role]) => [Number(seat), role] as const)
        .filter(([seat, role]) => allowed.has(seat) && ROLES.includes(role)),
    );
  });
  const [activeIndex, setActiveIndex] = useState(() => {
    const firstMissing = sortedSeats.findIndex((seat) => !initialAssignments[seat.seat_number]);
    return firstMissing >= 0 ? firstMissing : Math.max(0, sortedSeats.length - 1);
  });

  const counts = useMemo(() => ROLES.reduce<Record<PhysicalRole, number>>((acc, role) => {
    acc[role] = Object.values(assignments).filter((value) => value === role).length;
    return acc;
  }, { citizen: 0, sheriff: 0, mafia: 0, don: 0 }), [assignments]);

  const activeSeat = sortedSeats[activeIndex] || null;
  const assignedCount = Object.keys(assignments).length;
  const exactComplete = sortedSeats.length === 10
    && assignedCount === 10
    && ROLES.every((role) => counts[role] === ROLE_META[role].max);

  const chooseRole = (role: PhysicalRole) => {
    if (!activeSeat) return;
    const previous = assignments[activeSeat.seat_number];
    const nextCount = counts[role] - (previous === role ? 1 : 0) + 1;
    if (nextCount > ROLE_META[role].max) return;

    const next = { ...assignments, [activeSeat.seat_number]: role };
    setAssignments(next);
    const nextMissing = sortedSeats.findIndex((seat, index) => index > activeIndex && !next[seat.seat_number]);
    if (nextMissing >= 0) setActiveIndex(nextMissing);
  };

  const goToSeat = (index: number) => {
    if (index < 0 || index >= sortedSeats.length) return;
    setActiveIndex(index);
  };

  if (sortedSeats.length !== 10) {
    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/95 p-4 backdrop-blur-md">
        <div className="w-full max-w-md rounded-3xl border border-rose-400/20 bg-slate-900 p-5 text-center">
          <div className="text-2xl">🃏</div>
          <div className="mt-2 text-lg font-black text-white">Для раздачи нужны 10 игроков</div>
          <p className="mt-2 text-sm text-slate-400">Сначала сформируйте полный стол, затем откройте раздачу ролей.</p>
          <button type="button" onClick={onCancel} className="mt-5 min-h-11 w-full rounded-2xl bg-white text-sm font-bold text-black">Вернуться</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[150] overflow-y-auto bg-slate-950/95 p-3 backdrop-blur-md sm:p-5">
      <div className="mx-auto w-full max-w-lg space-y-3">
        <section className="rounded-3xl border border-white/10 bg-slate-900 p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300/60">🃏 Раздача ролей</div>
              <h2 className="mt-1 text-xl font-black text-white">Физические карты</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">Игрок вслепую тянет карту со стола. Вы только фиксируете в приложении роль, которую он получил.</p>
            </div>
            <button type="button" onClick={onCancel} className="h-9 w-9 shrink-0 rounded-xl border border-white/10 bg-white/5 text-slate-400">✕</button>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-1.5">
            {ROLES.map((role) => {
              const meta = ROLE_META[role];
              const done = counts[role] === meta.max;
              return (
                <div key={role} className={`rounded-xl border px-2 py-2 text-center ${done ? 'border-emerald-300/20 bg-emerald-300/10' : 'border-white/10 bg-black/20'}`}>
                  <div className="text-base">{meta.icon}</div>
                  <div className="mt-0.5 text-[9px] font-bold text-slate-300">{meta.label}</div>
                  <div className={`mt-0.5 text-xs font-black ${done ? 'text-emerald-300' : 'text-white'}`}>{counts[role]}/{meta.max}</div>
                </div>
              );
            })}
          </div>
        </section>

        {activeSeat && (
          <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Карту тянет</div>
                <div className="mt-1 text-2xl font-black text-white">Место №{activeSeat.seat_number}</div>
                <div className="mt-1 text-sm font-semibold text-slate-300">{activeSeat.nickname || `Игрок ${activeSeat.seat_number}`}</div>
              </div>
              <div className="rounded-2xl bg-black/30 px-3 py-2 text-center">
                <div className="text-xl font-black text-white">{assignedCount}/10</div>
                <div className="text-[9px] text-slate-500">зафиксировано</div>
              </div>
            </div>

            <p className="mt-4 rounded-2xl border border-violet-300/10 bg-violet-300/[0.05] px-3 py-3 text-xs leading-5 text-violet-100/60">После того как игрок посмотрел физическую карту, нажмите его роль. Приложение ничего не разыгрывает и не меняет состав колоды.</p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {ROLES.map((role) => {
                const meta = ROLE_META[role];
                const selected = assignments[activeSeat.seat_number] === role;
                const usedByOthers = counts[role] - (selected ? 1 : 0);
                const unavailable = !selected && usedByOthers >= meta.max;
                return (
                  <button
                    key={role}
                    type="button"
                    disabled={unavailable}
                    onClick={() => chooseRole(role)}
                    className={`min-h-16 rounded-2xl border px-3 text-left transition disabled:cursor-not-allowed disabled:opacity-25 ${selected ? meta.active : 'border-white/10 bg-slate-900 text-slate-300'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xl">{meta.icon}</span>
                      <span className="text-[10px] font-black text-white/35">{counts[role]}/{meta.max}</span>
                    </div>
                    <div className="mt-1 text-sm font-black">{meta.label}</div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-3xl border border-white/10 bg-slate-900 p-3">
          <div className="grid grid-cols-5 gap-1.5">
            {sortedSeats.map((seat, index) => {
              const role = assignments[seat.seat_number];
              const meta = role ? ROLE_META[role] : null;
              return (
                <button
                  key={seat.seat_number}
                  type="button"
                  onClick={() => goToSeat(index)}
                  className={`min-h-14 rounded-xl border px-1.5 py-1.5 text-center ${index === activeIndex ? 'border-white/35 bg-white/10' : role ? 'border-emerald-300/15 bg-emerald-300/[0.05]' : 'border-white/10 bg-black/20'}`}
                >
                  <div className="text-xs font-black text-white">{seat.seat_number}</div>
                  <div className="mt-0.5 text-base leading-none">{meta?.icon || '·'}</div>
                  <div className="mt-1 truncate text-[8px] text-slate-500">{seat.nickname}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={activeIndex === 0} onClick={() => goToSeat(activeIndex - 1)} className="min-h-11 rounded-2xl border border-white/10 bg-white/[0.04] text-xs font-bold text-slate-300 disabled:opacity-25">← Предыдущее место</button>
            <button type="button" disabled={activeIndex >= sortedSeats.length - 1} onClick={() => goToSeat(activeIndex + 1)} className="min-h-11 rounded-2xl border border-white/10 bg-white/[0.04] text-xs font-bold text-slate-300 disabled:opacity-25">Следующее место →</button>
          </div>
        </section>

        <button
          type="button"
          disabled={!exactComplete}
          onClick={() => onComplete(assignments)}
          className="min-h-14 w-full rounded-2xl bg-white px-4 text-sm font-black text-black shadow-xl disabled:bg-slate-800 disabled:text-slate-500"
        >
          {exactComplete ? '✓ Раздача завершена — сохранить роли' : `Нужно распределить 6 / 1 / 2 / 1 · ${assignedCount}/10`}
        </button>
      </div>
    </div>
  );
}
