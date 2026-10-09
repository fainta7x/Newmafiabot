import { useState } from 'react';
import { Clock } from 'lucide-react';

/**
 * «Перенести начало»: moves a draft or published evening to a new date/time.
 * All game slots move with it; published evenings receive separate notices.
 */
const moscowParts = (value: string) => {
  const date = new Date(value);
  return {
    day: date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' }),
    time: date.toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }),
  };
};

const authHeaders = (json = false) => {
  const headers: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {};
  const token = typeof window !== 'undefined' ? localStorage.getItem('organizer_token') : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

export const EveningStartTimeEditor = ({ eveningId, startsAt, onMoved }: {
  eveningId: string;
  startsAt: string;
  onMoved: (event: { starts_at: string; ends_at: string | null }) => void;
}) => {
  const current = moscowParts(startsAt);
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(current.time);
  const [day, setDay] = useState(current.day);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    if (busy || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const url = `/api/evenings/${encodeURIComponent(eveningId)}/slots`;
      const planResponse = await fetch(url, { credentials: 'include', headers: authHeaders() });
      const plan = await planResponse.json().catch(() => ({}));
      if (!planResponse.ok) throw new Error(plan?.error || 'Не удалось загрузить игры вечера');
      const response = await fetch(url, {
        method: 'PUT',
        credentials: 'include',
        headers: authHeaders(true),
        body: JSON.stringify({
          planned_slots: plan.event.slot_count,
          slot_duration_minutes: plan.event.slot_duration_minutes,
          price_per_game: plan.event.price_per_game,
          starts_at: `${day}T${time}:00+03:00`,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось перенести начало');
      onMoved({ starts_at: body.event.starts_at, ends_at: body.event.ends_at ?? null });
      setMessage(`Начало перенесено на ${day} в ${time}. Игры вечера сдвинулись вместе с ним.`);
      setOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Не удалось перенести начало');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="evening-start-time">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[12px] text-text-secondary"><Clock className="h-4 w-4" /> Начало: <b className="text-text-primary">{current.day} · {current.time}</b></span>
        {!open ? <button type="button" onClick={() => { setTime(current.time); setDay(current.day); setOpen(true); }} className="min-h-[40px] rounded-[10px] border border-border-soft bg-surface-2 px-3 text-[12px] font-semibold text-text-primary">Перенести начало</button> : null}
      </div>
      {open ? <div className="mt-2 flex flex-wrap items-center gap-2">
        <input type="date" value={day} onChange={(event) => setDay(event.target.value)} aria-label="Новая дата вечера" className="min-h-[44px] min-w-[136px] flex-1 rounded-[10px] border border-border-soft bg-surface-2 px-3 font-mono text-[14px] text-text-primary" />
        <input type="time" value={time} onChange={(event) => setTime(event.target.value)} aria-label="Новое время начала" className="min-h-[44px] flex-1 rounded-[10px] border border-border-soft bg-surface-2 px-3 font-mono text-[14px] text-text-primary" />
        <button type="button" disabled={busy || (day === current.day && time === current.time)} onClick={() => void save()} className="min-h-[44px] rounded-[10px] bg-accent px-3 text-[12px] font-bold text-white disabled:opacity-50">Сохранить</button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="min-h-[44px] rounded-[10px] px-2 text-[12px] text-text-muted">Отмена</button>
      </div> : null}
      {message ? <p className="mt-2 rounded-[12px] bg-success-soft px-3 py-2 text-[11px] text-success">{message}</p> : null}
      {error ? <p className="mt-2 rounded-[12px] bg-danger-soft px-3 py-2 text-[11px] text-danger">{error}</p> : null}
    </div>
  );
};

export default EveningStartTimeEditor;
