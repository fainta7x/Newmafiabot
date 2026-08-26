import { useEffect, useMemo, useState } from 'react';
import { requestJudgeGameMusicStart, requestJudgeGameMusicStop } from '../JudgeGameMusicController.tsx';

export type PhysicalRole = 'citizen' | 'sheriff' | 'mafia' | 'don';

type Seat = {
  seat_number: number;
  nickname: string;
};

type Props = {
  seats: Seat[];
  initialAssignments?: Record<number, PhysicalRole>;
  musicTrackId?: string | null;
  musicTrackTitle?: string | null;
  onCancel: () => void;
  onComplete: (assignments: Record<number, PhysicalRole>) => void;
};

const ROLE_META: Record<PhysicalRole, { label: string; max: number; marker: string; active: string; countTone: string }> = {
  citizen: {
    label: 'Мирный',
    max: 6,
    marker: 'bg-rose-400',
    active: 'border-rose-300/35 bg-rose-300/[0.10] text-rose-100',
    countTone: 'text-rose-200/80',
  },
  sheriff: {
    label: 'Шериф',
    max: 1,
    marker: 'bg-amber-300',
    active: 'border-amber-300/35 bg-amber-300/[0.10] text-amber-100',
    countTone: 'text-amber-200/80',
  },
  mafia: {
    label: 'Мафия',
    max: 2,
    marker: 'bg-white/55',
    active: 'border-white/20 bg-white/[0.08] text-white',
    countTone: 'text-white/68',
  },
  don: {
    label: 'Дон',
    max: 1,
    marker: 'bg-violet-300',
    active: 'border-violet-300/35 bg-violet-300/[0.10] text-violet-100',
    countTone: 'text-violet-200/80',
  },
};

const ROLES = Object.keys(ROLE_META) as PhysicalRole[];

export default function PhysicalRoleDeal({
  seats,
  initialAssignments = {},
  musicTrackId,
  musicTrackTitle,
  onCancel,
  onComplete,
}: Props) {
  const sortedSeats = useMemo(() => seats.slice().sort((a, b) => a.seat_number - b.seat_number).slice(0, 10), [seats]);
  const [started, setStarted] = useState(false);
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

  useEffect(() => () => {
    requestJudgeGameMusicStop();
  }, []);

  const counts = useMemo(() => ROLES.reduce<Record<PhysicalRole, number>>((acc, role) => {
    acc[role] = Object.values(assignments).filter((value) => value === role).length;
    return acc;
  }, { citizen: 0, sheriff: 0, mafia: 0, don: 0 }), [assignments]);

  const activeSeat = sortedSeats[activeIndex] || null;
  const assignedCount = Object.keys(assignments).length;
  const exactComplete = sortedSeats.length === 10
    && assignedCount === 10
    && ROLES.every((role) => counts[role] === ROLE_META[role].max);
  const musicDisabled = musicTrackId === null;

  const cancel = () => {
    requestJudgeGameMusicStop();
    onCancel();
  };

  const complete = () => {
    requestJudgeGameMusicStop();
    onComplete(assignments);
  };

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
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-[#090a0d]/95 p-3 backdrop-blur-xl">
        <div className="w-full max-w-md rounded-[28px] border border-rose-300/15 bg-white/[0.045] p-5 text-center shadow-2xl">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-200/55">Раздача недоступна</div>
          <div className="mt-2 text-lg font-semibold text-white">Для раздачи нужны 10 игроков</div>
          <p className="mt-2 text-[11px] leading-4 text-white/38">Сначала сформируйте полный стол, затем откройте раздачу ролей.</p>
          <button type="button" onClick={cancel} className="mt-5 min-h-12 w-full rounded-[16px] bg-white text-[12px] font-semibold text-[#090a0d]">Вернуться</button>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-[#090a0d]/95 p-3 backdrop-blur-xl">
        <section data-testid="physical-role-deal-intro" className="w-full max-w-md rounded-[28px] border border-white/[0.09] bg-[#121318] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.48)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Раздача ролей</div>
              <h2 className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em] text-white">Подготовьте 10 карт</h2>
              <p className="mt-1 text-[11px] leading-4 text-white/38">6 мирных · 1 шериф · 2 мафии · 1 дон</p>
            </div>
            <button type="button" onClick={cancel} aria-label="Закрыть раздачу" className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-white/[0.08] bg-black/20 text-lg text-white/38 active:bg-white/[0.06]">×</button>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-1.5">
            {ROLES.map((role) => {
              const meta = ROLE_META[role];
              return (
                <div key={role} className="rounded-[14px] border border-white/[0.06] bg-black/15 px-2 py-2.5 text-center">
                  <span className={`mx-auto block h-2 w-2 rounded-full ${meta.marker}`} />
                  <div className="mt-1.5 text-[9px] font-semibold text-white/48">{meta.label}</div>
                  <div className="mt-0.5 text-[13px] font-semibold text-white/82">{meta.max}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 rounded-[16px] bg-black/15 px-3 py-2.5 text-[10px] leading-4 text-white/34">Перемешайте физические карты. После каждой вытянутой карты просто отметьте роль игрока.</div>

          {!musicDisabled && (
            <div className="mt-2.5 flex items-center justify-between gap-3 rounded-[14px] border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
              <span className="text-[9px] font-semibold text-white/30">Музыка раздачи</span>
              <strong className="min-w-0 truncate text-[10px] font-semibold text-white/60">{musicTrackTitle || 'Выбранный трек'}</strong>
            </div>
          )}

          <button
            data-testid="physical-role-deal-start"
            type="button"
            onClick={() => {
              if (!musicDisabled) requestJudgeGameMusicStart(musicTrackId || undefined);
              setStarted(true);
            }}
            className="mt-4 min-h-[52px] w-full rounded-[16px] bg-white px-4 text-[12px] font-semibold text-[#090a0d] active:bg-white/90"
          >
            {musicDisabled || !musicTrackId ? 'Начать раздачу' : 'Включить музыку и начать раздачу'}
          </button>
        </section>
      </div>
    );
  }

  return (
    <div data-testid="physical-role-deal-active" className="fixed inset-0 z-[150] overflow-y-auto bg-[#090a0d]/95 p-2.5 backdrop-blur-xl sm:p-4">
      <div className="mx-auto w-full max-w-lg space-y-2.5">
        <section className="rounded-[24px] border border-white/[0.08] bg-[#121318] p-3.5 shadow-[0_18px_52px_rgba(0,0,0,0.34)]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/28">Раздача ролей</div>
              <div className="mt-1 text-[17px] font-semibold tracking-[-0.01em] text-white">Фиксируйте фактическую карту</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="rounded-[12px] bg-black/20 px-2.5 py-2 text-center">
                <div className="text-[14px] font-semibold text-white/82">{assignedCount}/10</div>
                <div className="text-[7.5px] text-white/26">готово</div>
              </div>
              <button type="button" onClick={cancel} aria-label="Закрыть раздачу" className="grid h-11 w-11 place-items-center rounded-[14px] border border-white/[0.08] bg-black/20 text-lg text-white/38 active:bg-white/[0.06]">×</button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {ROLES.map((role) => {
              const meta = ROLE_META[role];
              const done = counts[role] === meta.max;
              return (
                <div key={role} className={`rounded-[12px] border px-1.5 py-2 text-center ${done ? 'border-emerald-300/15 bg-emerald-300/[0.06]' : 'border-white/[0.055] bg-black/15'}`}>
                  <div className="flex items-center justify-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.marker}`} />
                    <span className="text-[8px] font-semibold text-white/38">{meta.label}</span>
                  </div>
                  <div className={`mt-1 text-[11px] font-semibold ${done ? 'text-emerald-200/80' : meta.countTone}`}>{counts[role]}/{meta.max}</div>
                </div>
              );
            })}
          </div>
        </section>

        {activeSeat && (
          <section className="rounded-[26px] border border-white/[0.09] bg-white/[0.045] p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-white/28">Карту тянет</div>
                <div className="mt-1 flex min-w-0 items-baseline gap-2">
                  <span className="font-mono text-[24px] font-semibold tracking-[-0.05em] text-white">#{activeSeat.seat_number}</span>
                  <span className="truncate text-[17px] font-semibold text-white/78">{activeSeat.nickname || `Игрок ${activeSeat.seat_number}`}</span>
                </div>
              </div>
              <span className="shrink-0 rounded-[10px] bg-black/20 px-2 py-1 text-[8px] font-semibold text-white/28">{activeIndex + 1} из 10</span>
            </div>

            <div className="mt-2.5 text-[10px] leading-4 text-white/34">Игрок посмотрел карту → нажмите полученную роль.</div>

            <div className="mt-3 grid grid-cols-2 gap-2">
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
                    className={`min-h-[64px] rounded-[16px] border px-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-20 ${selected ? meta.active : 'border-white/[0.08] bg-black/20 text-white/62 active:bg-white/[0.055]'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${meta.marker}`} />
                      <span className="text-[9px] font-semibold text-white/26">{counts[role]}/{meta.max}</span>
                    </div>
                    <div className="mt-2 text-[13px] font-semibold">{meta.label}</div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-2.5">
          <div className="grid grid-cols-5 gap-1.5">
            {sortedSeats.map((seat, index) => {
              const role = assignments[seat.seat_number];
              const meta = role ? ROLE_META[role] : null;
              return (
                <button
                  key={seat.seat_number}
                  type="button"
                  aria-label={`Место ${seat.seat_number} · ${seat.nickname}`}
                  onClick={() => goToSeat(index)}
                  className={`min-h-[52px] min-w-0 rounded-[11px] border px-1 py-1.5 text-center ${index === activeIndex ? 'border-white/22 bg-white/[0.08]' : role ? 'border-emerald-300/10 bg-emerald-300/[0.035]' : 'border-white/[0.055] bg-black/15'}`}
                >
                  <div className="text-[10px] font-semibold text-white/72">{seat.seat_number}</div>
                  <span className={`mx-auto mt-1 block h-1.5 w-1.5 rounded-full ${meta?.marker || 'bg-white/12'}`} />
                  <div className="mt-1 truncate text-[7px] text-white/24">{seat.nickname}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" disabled={activeIndex === 0} onClick={() => goToSeat(activeIndex - 1)} className="min-h-11 rounded-[14px] border border-white/[0.07] bg-black/15 text-[10px] font-semibold text-white/42 disabled:opacity-20">← Предыдущее</button>
            <button type="button" disabled={activeIndex >= sortedSeats.length - 1} onClick={() => goToSeat(activeIndex + 1)} className="min-h-11 rounded-[14px] border border-white/[0.07] bg-black/15 text-[10px] font-semibold text-white/42 disabled:opacity-20">Следующее →</button>
          </div>
        </section>

        <button
          type="button"
          disabled={!exactComplete}
          onClick={complete}
          className="min-h-[52px] w-full rounded-[16px] bg-white px-4 text-[12px] font-semibold text-[#090a0d] disabled:bg-white/[0.055] disabled:text-white/22"
        >
          {exactComplete ? 'Роли зафиксированы — перейти к договорке' : `Распределите 6 / 1 / 2 / 1 · ${assignedCount}/10`}
        </button>
      </div>
    </div>
  );
}
