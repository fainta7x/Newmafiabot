export type PokerScheduleRow = {
  level: number; small: number; big: number; startMinute: number; startsAt: string | null; startingStackBb: number;
  lateRegOpen: boolean; rebuyOpen: boolean;
};

const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) : '');
const bb = (value: number) => String(value).replace('.', ',');

/**
 * The levels of a poker tournament with the time each one starts and what is still possible (owner, 2026-10-11: «табличка,
 * чтобы было понимание, насколько времени пройдёт»). The times are exact for the blind clock; how long the tournament
 * lasts depends on the players and is not promised.
 */
export default function PokerTournamentSchedule({ rows, current = null, started = false }: { rows: PokerScheduleRow[]; current?: number | null; started?: boolean }) {
  if (!rows.length) return null;
  const lastLate = [...rows].reverse().find((row) => row.lateRegOpen);
  const lastRebuy = [...rows].reverse().find((row) => row.rebuyOpen);
  const closes = (row: PokerScheduleRow | undefined, next: PokerScheduleRow | undefined) => (row && next?.startsAt ? clock(next.startsAt) : '');
  return (
    <div data-testid="poker-tournament-schedule" className="text-[11px] text-white/70">
      <div className="grid grid-cols-[1.4rem_3.8rem_3.3rem_2.1rem_1fr] gap-x-1.5 border-b border-white/10 pb-1 text-[10px] uppercase tracking-[.08em] text-white/40">
        <span>Ур.</span><span>Блайнды</span><span>{started ? 'Время' : 'Старт'}</span><span>Стек ББ</span><span>Можно</span>
      </div>
      <ol>
        {rows.map((row) => (
          <li key={row.level} aria-current={current === row.level ? 'step' : undefined}
            className={`grid grid-cols-[1.4rem_3.8rem_3.3rem_2.1rem_1fr] items-center gap-x-1.5 border-b border-white/[.05] py-1 ${current === row.level ? 'rounded bg-amber-300/10 text-amber-100' : ''}`}>
            <b>{row.level}</b>
            <span className="tabular-nums">{row.small}/{row.big}</span>
            <span className="whitespace-nowrap tabular-nums">{row.startsAt ? clock(row.startsAt) : `${row.startMinute} мин`}</span>
            <span className="tabular-nums">{bb(row.startingStackBb)}</span>
            <span className="flex flex-wrap gap-1">
              {row.lateRegOpen ? <i className="rounded-full bg-emerald-400/15 px-1.5 text-[10px] not-italic text-emerald-200">вход</i> : null}
              {row.rebuyOpen ? <i className="rounded-full bg-amber-300/15 px-1.5 text-[10px] not-italic text-amber-100">докупка</i> : null}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 leading-5 text-white/45">
        Время по Москве, уровни идут без пауз. Метка «вход» — можно войти в идущий турнир, «докупка» — можно докупиться.
        {lastLate ? ` Поздняя запись закрывается после ${lastLate.level}-го уровня${closes(lastLate, rows[lastLate.level]) ? ` (в ${closes(lastLate, rows[lastLate.level])})` : ''}.` : ''}
        {lastRebuy ? ` Докупка закрывается после ${lastRebuy.level}-го уровня${closes(lastRebuy, rows[lastRebuy.level]) ? ` (в ${closes(lastRebuy, rows[lastRebuy.level])})` : ''}.` : ''}
        {' '}Сколько продлится весь турнир, зависит от игроков: чем меньше фишек относительно блайндов, тем быстрее вылеты.
      </p>
    </div>
  );
}
