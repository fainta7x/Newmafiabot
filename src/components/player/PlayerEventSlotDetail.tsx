import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';

type EventItem = {
  id: string;
  title: string;
  starts_at: string;
  venue?: string | null;
  format?: string;
  event_type: 'evening' | 'tournament';
  participant_count?: number;
};

type Slot = {
  id: string;
  slot_number: number;
  starts_at: string;
  price: number;
  registered_count: number;
  participants: Array<{ id: string; nickname: string }>;
};

type Plan = {
  event: EventItem & { assembled: boolean; assembled_slots: number; max_evening_price?: number | null };
  slots: Slot[];
  selection: { slot_ids: string[]; games: number; total: number };
};

const eventDate = (value: string) => new Date(value).toLocaleString('ru-RU', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const slotTime = (value: string) => new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export default function PlayerEventSlotDetail({
  event,
  onBack,
  onSaved,
}: {
  event: EventItem;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = async () => {
    if (event.event_type === 'tournament') return;
    setError('');
    try {
      const response = await fetch(`/api/player/evenings/${encodeURIComponent(event.id)}/slots`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить игры');
      setPlan(body as Plan);
      setDraft(Array.isArray(body?.selection?.slot_ids) ? body.selection.slot_ids : []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить игры');
    }
  };

  useEffect(() => {
    setPlan(null);
    setDraft([]);
    setSaved(false);
    void load();
  }, [event.id]);

  const total = useMemo(() => {
    if (!plan) return 0;
    const rawTotal = plan.slots
      .filter((slot) => draft.includes(slot.id))
      .reduce((sum, slot) => sum + Number(slot.price || 0), 0);
    const cap = Number(plan.event.max_evening_price || 0);
    return cap > 0 ? Math.min(rawTotal, cap) : rawTotal;
  }, [draft, plan]);
  const changed = Boolean(plan && (draft.length !== plan.selection.slot_ids.length || draft.some((id) => !plan.selection.slot_ids.includes(id))));

  const toggleSlot = (slotId: string) => {
    setSaved(false);
    setDraft((current) => current.includes(slotId) ? current.filter((id) => id !== slotId) : [...current, slotId]);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const response = await fetch(`/api/player/evenings/${encodeURIComponent(event.id)}/slots`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_ids: draft }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось сохранить');
      setPlan(body as Plan);
      setDraft(Array.isArray(body?.selection?.slot_ids) ? body.selection.slot_ids : []);
      setSaved(true);
      onSaved();
    } catch (saveError: any) {
      setError(saveError?.message || 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  if (event.event_type === 'tournament') {
    return (
      <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
        <div className="mx-auto max-w-[430px]">
          <button type="button" onClick={onBack} className="min-h-10 rounded-xl bg-white/[0.05] px-3 text-xs font-semibold text-white/50">← События</button>
          <section className="mt-3 rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-100/40">Турнир</div>
            <h1 className="mt-2 text-2xl font-semibold">{event.title}</h1>
            <p className="mt-2 text-sm text-white/45">{eventDate(event.starts_at)}{event.venue ? ` · ${event.venue}` : ''}</p>
            <div className="mt-4 rounded-2xl bg-black/20 p-4 text-sm text-white/50">Участников: {event.participant_count || 0}. Турниры используют отдельную регистрацию.</div>
          </section>
        </div>
      </main>
    );
  }

  const price = plan?.slots[0]?.price ?? 100;
  const maxEveningPrice = Number(plan?.event.max_evening_price || 0);

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto max-w-[430px]">
        <button type="button" onClick={onBack} className="min-h-10 rounded-xl bg-white/[0.05] px-3 text-xs font-semibold text-white/50">← События</button>

        <header className="mt-3 px-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30">Запись на вечер</div>
          <h1 className="mt-1 text-2xl font-semibold">{event.title}</h1>
          <p className="mt-1 text-xs leading-5 text-white/40">{eventDate(event.starts_at)}{event.venue ? ` · ${event.venue}` : ''}</p>
        </header>

        {error && <div className="mt-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] px-3 py-3 text-xs text-rose-100">{error}</div>}

        {!plan && !error && <div className="mt-3 rounded-2xl bg-white/[0.035] px-3 py-6 text-center text-sm text-white/35">Загружаем игры вечера…</div>}

        {plan && (
          <>
            <section className="mt-3 rounded-[24px] border border-white/[0.07] bg-white/[0.035] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{plan.event.assembled ? 'Стол собран' : 'Стол собирается'}</div>
                  <div className="mt-1 text-[10px] text-white/30">
                    {price} ₽ за игру{maxEveningPrice > 0 ? ` · максимум ${maxEveningPrice} ₽ за вечер` : ''} · нужно 4 собранные игры
                  </div>
                </div>
                <div className="rounded-xl bg-black/20 px-3 py-2 text-center"><div className="text-base font-black">{plan.event.assembled_slots}/4</div><div className="text-[8px] text-white/25">игр</div></div>
              </div>
            </section>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setSaved(false); setDraft(plan.slots.map((slot) => slot.id)); }} className="min-h-10 rounded-xl bg-white/[0.07] text-xs font-semibold text-white/60">Весь вечер</button>
              <button type="button" onClick={() => { setSaved(false); setDraft([]); }} className="min-h-10 rounded-xl bg-white/[0.035] text-xs font-semibold text-white/35">Ни одной игры</button>
            </div>

            <div className="mt-3 space-y-2">
              {plan.slots.map((slot) => {
                const selected = draft.includes(slot.id);
                const ready = slot.registered_count >= 11;
                return (
                  <button key={slot.id} type="button" onClick={() => toggleSlot(slot.id)} className={`w-full rounded-2xl border p-3 text-left transition ${selected ? 'border-white/30 bg-white/[0.10]' : 'border-white/[0.07] bg-black/20'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">Игра {slot.slot_number} · {slotTime(slot.starts_at)}</div>
                        <div className={`mt-1 text-xs ${ready ? 'text-emerald-200/60' : 'text-white/35'}`}>{slot.registered_count} игроков{ready ? ' · собрано' : ''}</div>
                      </div>
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${selected ? 'bg-white text-black' : 'bg-white/[0.05] text-white/20'}`}>{selected ? <Check className="h-4 w-4" /> : ''}</span>
                    </div>
                    {slot.participants.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {slot.participants.map((participant) => <span key={participant.id} className="rounded-full bg-white/[0.05] px-2 py-1 text-[9px] text-white/45">{participant.nickname}</span>)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <section className="mt-3 rounded-[24px] border border-white/10 bg-[#15171d] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.22)]">
              <div className="flex items-end justify-between gap-3">
                <div><div className="text-[9px] uppercase tracking-[0.14em] text-white/25">Твой план</div><div className="mt-1 text-sm font-semibold">{draft.length} игр</div></div>
                <div className="text-right"><div className="text-[9px] uppercase tracking-[0.14em] text-white/25">К оплате</div><div className="mt-1 text-lg font-black">{total} ₽</div></div>
              </div>
              {maxEveningPrice > 0 && draft.length > 4 && (
                <div className="mt-2 text-right text-[10px] text-emerald-200/60">Лимит клубного вечера применён: не больше {maxEveningPrice} ₽</div>
              )}
              {saved && <div className="mt-2 rounded-xl bg-emerald-300/[0.08] px-3 py-2 text-center text-[10px] font-semibold text-emerald-200/70">План сохранён</div>}
              <button disabled={busy || !changed} type="button" onClick={() => void save()} className="mt-2 min-h-12 w-full rounded-xl bg-white text-sm font-semibold text-black disabled:bg-white/[0.07] disabled:text-white/30">
                {busy ? 'Сохраняю…' : changed ? 'Сохранить мой план' : 'Изменений нет'}
              </button>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
