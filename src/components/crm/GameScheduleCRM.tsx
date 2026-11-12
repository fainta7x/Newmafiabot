import { useEffect, useState } from 'react';
import { requestJson } from '../../lib/requestJson.ts';

type Schedule = { weekday: number; weekday_name: string; novice_first_game: string; times: { briefing: string; first_game: string; novice_end: string; club_start: string }; upcoming_on_old_day?: number };
const request = (url: string, init?: RequestInit) => requestJson(url, init, 'Не получилось');
const DAYS: Array<[number, string]> = [[1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [0, 'Вс']];

/**
 * «Ещё → Расписание игр» (owner, 2026-11-12): the day and the time of the regular games. The automatic calendar, the site and the posts read it.
 * Evenings that already exist stay where they are.
 */
export function GameScheduleCRM() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [weekday, setWeekday] = useState(5);
  const [time, setTime] = useState('19:00');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const apply = (data: Schedule) => { setSchedule(data); setWeekday(data.weekday); setTime(data.novice_first_game); };
  useEffect(() => { void request('/api/game-schedule').then(apply).catch((e) => setError(e?.message || 'Не удалось загрузить')); }, []);

  const save = async () => {
    if (busy) return;
    setBusy(true); setError(''); setNote('');
    try {
      const data = await request('/api/game-schedule', { method: 'PUT', body: JSON.stringify({ weekday, novice_first_game: time }) });
      apply(data);
      setNote(data.upcoming_on_old_day ? `Сохранили. Новые вечера пойдут в новый день. Уже созданных вечеров на прежний день: ${data.upcoming_on_old_day}. Они остались, отмените их в «Вечерах», если не нужны.` : 'Сохранили. Новые вечера пойдут в этот день.');
    } catch (e: any) { setError(e?.message || 'Не получилось сохранить'); } finally { setBusy(false); }
  };

  if (!schedule) return <section className="rounded-[16px] border border-border-soft bg-surface-1 p-4 text-[13px] text-text-secondary">{error || 'Загружаем расписание…'}</section>;
  const changed = weekday !== schedule.weekday || time !== schedule.novice_first_game;
  return (
    <section className="space-y-4 rounded-[16px] border border-border-soft bg-surface-1 p-4" data-testid="game-schedule">
      <p className="text-[13px] leading-5 text-text-secondary">В какой день проходят игры. По этому дню приложение само создаёт вечера, а сайт и посты показывают его. Уже созданные вечера не двигаются.</p>
      <div>
        <strong className="mb-2 block text-[14px] text-text-primary">День недели</strong>
        <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="День недели">
          {DAYS.map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={weekday === value} onClick={() => setWeekday(value)} className={`min-h-11 rounded-[10px] border text-[13px] font-bold ${weekday === value ? 'border-accent bg-accent text-white' : 'border-border-soft bg-surface-2 text-text-primary'}`}>{label}</button>)}
        </div>
      </div>
      <label className="block">
        <strong className="mb-2 block text-[14px] text-text-primary">Первая игра вечера новичков</strong>
        <input type="time" value={time} onChange={(event) => setTime(event.target.value)} aria-label="Время первой игры" className="min-h-11 w-full rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[15px] text-text-primary" />
      </label>
      <p className="rounded-[12px] bg-surface-2 p-3 text-[12px] leading-5 text-text-secondary">Сбор и объяснение правил в {schedule.times.briefing}, две игры, окончание в {schedule.times.novice_end}. Клубный вечер начинается в {schedule.times.club_start}. Сейчас: {schedule.weekday_name}, первая игра в {schedule.novice_first_game}.</p>
      <button type="button" disabled={busy || !changed} onClick={() => void save()} className="min-h-11 w-full rounded-[12px] bg-accent text-[14px] font-bold text-white disabled:opacity-40">Сохранить</button>
      {note ? <p className="rounded-[12px] bg-success-soft px-3 py-2 text-[13px] text-success">{note}</p> : null}
      {error ? <p role="alert" className="rounded-[12px] bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p> : null}
    </section>
  );
}

export default GameScheduleCRM;
