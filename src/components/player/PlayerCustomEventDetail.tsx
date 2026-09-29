import { useEffect, useState } from 'react';
import VenueAddress from '../public/VenueAddress.tsx';

type CustomEvent = {
  id: string; title: string; description?: string; cover_image_data_url?: string | null;
  starts_at: string; ends_at: string; signup_deadline?: string | null; venue?: string | null;
  price_rub: number; participant_limit: number; participant_count: number; remaining_places?: number;
  registration_open: number; registration_status?: string | null; allow_guest: number; guest_count?: number;
};

const date = (value: string) => new Date(value).toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

export default function PlayerCustomEventDetail({ eventId, onBack, onSaved }: { eventId: string; onBack: () => void; onSaved: () => void }) {
  const [event, setEvent] = useState<CustomEvent | null>(null);
  const [guest, setGuest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    const response = await fetch(`/api/custom-events/${encodeURIComponent(eventId)}`, { credentials: 'include' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Не удалось открыть событие');
    setEvent(body); setGuest(Number(body.guest_count || 0) === 1);
  };
  useEffect(() => { window.scrollTo(0,0); void load().catch((e) => setError(e.message)); }, [eventId]);
  const registered = event?.registration_status === 'registered';
  const save = async () => {
    if (!event) return; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/custom-events/${encodeURIComponent(event.id)}/register`, { method: registered ? 'DELETE' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: registered ? undefined : JSON.stringify({ with_guest: guest }) });
      const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Не удалось сохранить запись');
      await load(); onSaved();
    } catch (e: any) { setError(e.message || 'Не удалось сохранить запись'); } finally { setBusy(false); }
  };
  return <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white"><div className="mx-auto max-w-[430px]">
    <button type="button" onClick={onBack} className="min-h-10 rounded-xl bg-white/[0.05] px-3 text-xs font-semibold text-white/50">← События</button>
    {event ? <>
      {event.cover_image_data_url ? <img src={event.cover_image_data_url} alt="" className="mt-3 aspect-[16/9] w-full rounded-[24px] object-cover" /> : null}
      <header className="mt-3 px-1"><div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-200/60">Ивент</div><h1 className="mt-1 text-2xl font-semibold">{event.title}</h1><p className="mt-2 text-sm text-white/55">{date(event.starts_at)} — {date(event.ends_at)}</p>{event.venue ? <VenueAddress venue={event.venue} className="mt-1 block text-sm text-white/55" /> : null}</header>
      {event.description ? <section className="mt-3 whitespace-pre-wrap rounded-[20px] border border-white/[0.07] bg-white/[0.035] p-3.5 text-sm leading-6 text-white/75">{event.description}</section> : null}
      <section className="mt-3 rounded-[20px] border border-white/[0.07] bg-white/[0.035] p-3.5 text-sm">
        <div className="flex justify-between gap-3"><span className="text-white/45">Участники</span><b>{event.participant_count}/{event.participant_limit}</b></div>
        <div className="mt-2 flex justify-between gap-3"><span className="text-white/45">Стоимость</span><b>{Number(event.price_rub) ? `${event.price_rub} ₽` : 'Бесплатно'}</b></div>
        {event.signup_deadline ? <div className="mt-2 flex justify-between gap-3"><span className="text-white/45">Запись до</span><b className="text-right">{date(event.signup_deadline)}</b></div> : null}
      </section>
      {!registered && Number(event.allow_guest) ? <label className="mt-3 flex min-h-12 items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-3.5 text-sm"><span>Возьму с собой +1</span><input type="checkbox" checked={guest} onChange={(e) => setGuest(e.target.checked)} className="h-5 w-5" /></label> : null}
      {error ? <p className="mt-3 rounded-xl bg-rose-300/[0.08] px-3 py-2 text-sm text-rose-100">{error}</p> : null}
      <button type="button" disabled={busy || (!registered && (!Number(event.registration_open) || Number(event.participant_count) >= Number(event.participant_limit)))} onClick={() => void save()} className={`mt-3 min-h-12 w-full rounded-2xl text-sm font-semibold disabled:opacity-40 ${registered ? 'bg-white/[0.08] text-white' : 'bg-white text-black'}`}>{busy ? 'Сохраняем…' : registered ? 'Отменить запись' : Number(event.registration_open) ? 'Записаться' : 'Запись закрыта'}</button>
      {registered ? <p className="mt-2 text-center text-xs text-emerald-200/70">Вы записаны{Number(event.guest_count) ? ' вместе с гостем' : ''}</p> : null}
    </> : !error ? <p className="mt-4 text-sm text-white/45">Загружаем событие…</p> : null}
    {!event && error ? <p className="mt-4 rounded-xl bg-rose-300/[0.08] px-3 py-2 text-sm text-rose-100">{error}</p> : null}
  </div></main>;
}
