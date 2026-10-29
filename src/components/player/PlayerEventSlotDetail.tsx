import ConfirmDialog from '../ui/ConfirmDialog.tsx';
import PlayerEveningSeatBooking from './PlayerEveningSeatBooking.tsx';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges.ts';
import { confirmPageLeave } from '../../lib/pageLeave.ts';
import { countGames, countPlayers } from '../../lib/russianPlural';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { normalizeEveningFormat, noviceScheduleLine } from '../../lib/eveningFormat.ts';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';
import PlayerTournamentEveningDetail from './PlayerTournamentEveningDetail.tsx';
import VenueAddress from '../public/VenueAddress.tsx';
import PlayerEveningWorkspace from './PlayerEveningWorkspace.tsx';
import { getJson } from '../../lib/requestJson.ts';
import { formatRubles } from '../../lib/formatRubleAmount.ts';
import { DEFAULT_EVENING_PRICES, eveningSelectionPrice, type EveningPrices } from '../../lib/eveningPrices.ts';

type EventItem = {
  id: string;
  title: string;
  starts_at: string;
  venue?: string | null;
  format?: string;
  status?: string;
  event_type: 'evening' | 'tournament' | 'custom' | 'poker';
  participant_count?: number;
};

type Slot = {
  id: string;
  slot_number: number;
  starts_at: string;
  price: number;
  registered_count: number;
  target_players?: number;
  participants: Array<{ id: string; nickname: string; is_guest?: boolean }>;
};

type Plan = {
  event: EventItem & { assembled: boolean; assembled_slots: number; max_evening_price?: number | null; price_per_game?: number; required_slots?: number; required_players_per_slot?: number };
  pricing?: EveningPrices;
  first_application_required?: boolean;
  slots: Slot[];
  selection: { slot_ids: string[]; games: number; total: number };
};

const isPlanFor = (body: any, id: string): body is Plan => String(body?.event?.id) === id
  && Array.isArray(body?.slots) && Array.isArray(body?.selection?.slot_ids);

const eventDate = (value: string) => new Date(value).toLocaleString('ru-RU', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit', timeZone: 'Europe/Moscow' });

const slotTime = (value: string) => new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

export default function PlayerEventSlotDetail({
  event,
  onBack,
  onSaved,
  onFirstApplication,
  onOpenGame,
}: {
  event: EventItem;
  onBack: () => void;
  onSaved: () => void;
  onFirstApplication: () => void;
  onOpenGame?: (gameKey: string, eveningId: string) => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [openedSlotId, setOpenedSlotId] = useState<string | null>(null);
  const [seatSummary, setSeatSummary] = useState<Array<{ slot_id: string; tableId: string; seat: number }>>([]);
  const [seatTables, setSeatTables] = useState<Array<{ id: string; name: string }>>([]);
  const [draft, setDraft] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [workspaceRefreshKey, setWorkspaceRefreshKey] = useState(0);
  const [registrationLocked, setRegistrationLocked] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; needsFirstApplication: boolean } | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  const requestSeq = useRef(0);
  const scope = useRef(0);
  const savePending = useRef(false);
  const eventId = useRef(event.id);
  eventId.current = event.id;

  const load = useCallback(async () => {
    if (event.event_type === 'tournament') return;
    const requestId = ++requestSeq.current;
    setError('');
    try {
      const body = await getJson<any>(`/api/player/evenings/${encodeURIComponent(event.id)}/slots`, 'Не удалось загрузить игры');
      if (requestId !== requestSeq.current || eventId.current !== event.id) return;
      if (!isPlanFor(body, event.id)) throw new Error('Не удалось загрузить игры. Повторите запрос.');
      setPlan(body);
      setSaveError(body.first_application_required ? { message: '', needsFirstApplication: true } : null);
      setDraft(Array.isArray(body?.selection?.slot_ids) ? body.selection.slot_ids : []);
    } catch (loadError: any) {
      if (requestId === requestSeq.current && eventId.current === event.id) setError(loadError?.message || 'Не удалось загрузить игры');
    }
  }, [event.id, event.event_type]);

  const refreshSeats = useCallback(async () => {
    try {
      const [mine, options] = await Promise.all([
        getJson<any>(`/api/evenings/${encodeURIComponent(event.id)}/seating/me`, 'Не удалось загрузить брони'),
        getJson<any>(`/api/evenings/${encodeURIComponent(event.id)}/seating/options`, 'Не удалось загрузить столы'),
      ]);
      setSeatSummary(mine.seats || []);
      setSeatTables(options.tables || []);
    } catch { setSeatSummary([]); }
  }, [event.id]);
  useEffect(() => { void refreshSeats(); }, [refreshSeats]);

  useEffect(() => {
    setOpenedSlotId(null);
    setPlan(null);
    setDraft([]);
    setSaved(false);
    setRegistrationLocked(false);
    setSaveError(null);
    setBusy(false);
    savePending.current = false;
    scope.current += 1;
    void load();
    // The list above keeps its scroll position; open the evening from its title.
    for (let node: HTMLElement | null = rootRef.current; node; node = node.parentElement) {
      if (node.scrollTop) node.scrollTop = 0;
    }
    window.scrollTo(0, 0);
    return () => { requestSeq.current += 1; scope.current += 1; };
  }, [load]);

  const total = useMemo(() => {
    if (!plan) return 0;
    // Prefer the server's current policy; older responses retain their field-based quote.
    const policy = plan.pricing || { ...DEFAULT_EVENING_PRICES,
      casual_cap: plan.event.max_evening_price ?? Infinity,
      novice_cap: plan.event.max_evening_price ?? null,
      rating_entry: plan.event.price_per_game ?? plan.slots[0]?.price ?? 0,
    };
    return eveningSelectionPrice(plan.event.format, plan.slots.filter((slot) => draft.includes(slot.id)).map((slot) => slot.price), policy);
  }, [draft, plan]);
  const changed = Boolean(plan && (draft.length !== plan.selection.slot_ids.length || draft.some((id) => !plan.selection.slot_ids.includes(id))));

  useUnsavedChanges(changed || busy, busy ? 'Сохранение записи ещё не подтверждено. Выйти со страницы?' : 'Изменения записи не сохранены. Выйти и отбросить их? Чтобы сохранить, нажмите «Отмена» и затем «Сохранить мой план».');

  const save = async (selection = draft) => {
    if (registrationLocked || savePending.current || !plan || (selection.length === plan.selection.slot_ids.length && selection.every(id => plan.selection.slot_ids.includes(id)))) return;
    const saveScope = scope.current;
    savePending.current = true;
    setBusy(true);
    setError('');
    setSaveError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/player/evenings/${encodeURIComponent(event.id)}/slots`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_ids: selection }),
      });
      const body = await response.json().catch(() => ({}));
      if (saveScope !== scope.current || eventId.current !== event.id) return;
      if (!response.ok) {
        setSaveError({ message: body?.error || 'Не удалось сохранить', needsFirstApplication: body?.code === 'first_application_required' });
        return;
      }
      if (!isPlanFor(body, event.id)) throw new Error('Не удалось подтвердить сохранение. Повторите запрос.');
      setPlan(body);
      setDraft(Array.isArray(body?.selection?.slot_ids) ? body.selection.slot_ids : []);
      setSaved(true);
      setCancelOpen(false);
      setWorkspaceRefreshKey(value => value + 1);
      onSaved();
    } catch (saveError: any) {
      if (saveScope === scope.current && eventId.current === event.id) setSaveError({ message: saveError?.message || 'Не удалось сохранить', needsFirstApplication: false });
    } finally {
      if (saveScope === scope.current && eventId.current === event.id) { savePending.current = false; setBusy(false); }
    }
  };

  if (event.event_type === 'tournament') {
    return <PlayerTournamentEveningDetail tournamentId={event.id} onBack={onBack} onSaved={onSaved} />;
  }

  const ratingEvening = normalizeEveningFormat(plan?.event.format || event.format) === 'RATING';
  const price = ratingEvening ? plan?.pricing?.rating_entry ?? plan?.event.price_per_game ?? plan?.slots[0]?.price ?? 0 : plan?.slots[0]?.price ?? 0;
  const requiredSlots = plan?.event.required_slots;
  const selectionLocked = registrationLocked || busy;
  const maxEveningPrice = Number(plan?.event.max_evening_price || 0);
  const hasBooking = Boolean(plan?.selection.slot_ids.length);
  const workspaceFirst = (plan?.event.status || event.status) === 'active' || (plan?.event.status || event.status) === 'completed';
  const workspace = <PlayerEveningWorkspace eveningId={event.id} onOpenGame={(key, id) => { if (confirmPageLeave()) onOpenGame?.(key, id); }} onCanChangeSelection={(allowed) => setRegistrationLocked(!allowed)} refreshKey={workspaceRefreshKey} />;

  const openedSlot = plan?.slots.find(slot => slot.id === openedSlotId);
  const enrollOpenedSlot = async (): Promise<boolean> => {
    if (!openedSlot || !plan || busy || registrationLocked || changed) return false;
    if (plan.selection.slot_ids.includes(openedSlot.id)) return true;
    setBusy(true);
    try {
      const response = await fetch(`/api/player/evenings/${encodeURIComponent(event.id)}/slots`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_ids: [...plan.selection.slot_ids, openedSlot.id] }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !isPlanFor(body, event.id)) {
        setSaveError({ message: body.error || 'Не удалось записаться на игру', needsFirstApplication: body.code === 'first_application_required' });
        return false;
      }
      setPlan(body); setDraft(body.selection.slot_ids); onSaved();
      return true;
    } catch { return false; }
    finally { setBusy(false); }
  };
  if (openedSlot && plan) return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto max-w-[430px]">
        <PlayerEveningSeatBooking key={openedSlot.id} eveningId={event.id}
          slotId={openedSlot.id} gameNumber={openedSlot.slot_number} startsAt={openedSlot.starts_at}
          registered={plan.selection.slot_ids.includes(openedSlot.id)}
          onBack={() => { setOpenedSlotId(null); void refreshSeats(); }}
          onEnroll={enrollOpenedSlot} onChanged={() => void refreshSeats()} />
        {saveError && <p role="alert" className="mt-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">
          {saveError.needsFirstApplication ? 'Сначала подай заявку на участие.' : saveError.message}
        </p>}
      </div>
    </main>
  );

  return (
    <main ref={rootRef} className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto max-w-[430px]">
        <button type="button" onClick={() => { if (confirmPageLeave()) onBack(); }} className="min-h-11 rounded-xl bg-white/[0.05] px-3 text-xs font-semibold text-white/50">← События</button>

        <header className="mt-3 px-1">
          <h1 className="mt-1 text-xl font-semibold">{event.title}</h1>
          <p className="mt-1 text-xs leading-5 text-white/40">{eventDate(event.starts_at)}</p>
          {event.venue ? <details className="mt-1 text-xs text-white/60"><summary className="flex min-h-11 cursor-pointer items-center">{event.venue} · адрес и маршрут ▾</summary><VenueAddress venue={event.venue} className="mt-1 block leading-5" /></details> : null}
          {normalizeEveningFormat(event.format) === 'NOVICE' && noviceScheduleLine(event.starts_at)
            ? <p className="mt-2 rounded-xl bg-sky-300/[0.08] px-3 py-2 text-[12px] leading-5 text-sky-100/80">{noviceScheduleLine(event.starts_at)}. Опыт не нужен.</p>
            : null}
        </header>

        {error && <div role="alert" className="mt-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] px-3 py-3 text-xs text-rose-100"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-2 min-h-11 w-full rounded-xl bg-white/10 px-3 font-semibold">Повторить</button></div>}

        {!plan && !error && <div className="mt-3 rounded-2xl bg-white/[0.035] px-3 py-6 text-center text-sm text-white/35">Загружаем игры вечера…</div>}

        {workspaceFirst && workspace}

        {plan && (
          <section aria-label="Выбор игр и стоимость">
            <section className="mt-3 rounded-[24px] border border-white/[0.07] bg-white/[0.035] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{plan.event.assembled ? 'Стол собран' : 'Стол собирается'}</div>
                  <div className="mt-1 text-[11px] text-white/30">
                    {price > 0 ? `${formatRubles(price)} ${ratingEvening ? 'за вечер' : 'за игру'}` : 'Бесплатно'}{maxEveningPrice > 0 ? ` · максимум ${formatRubles(maxEveningPrice)} за вечер` : ''}{requiredSlots ? ` · нужно ${countGames(requiredSlots)}` : ''}
                  </div>
                </div>
                <div className="rounded-xl bg-black/20 px-3 py-2 text-center"><div className="text-base font-black">{plan.event.assembled_slots}{requiredSlots ? `/${requiredSlots}` : ''}</div><div className="text-[11px] text-white/25">игр</div></div>
              </div>
            </section>

            <section className="sticky top-16 z-20 mt-3 rounded-[24px] border border-white/10 bg-[#15171d] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.22)]">
              <div className="flex items-center justify-between gap-3">
                <div className="shrink-0"><div className="text-[11px] text-white/55">{countGames(draft.length)}</div><div className="text-lg font-semibold">{formatRubles(total)}</div></div>
                <button disabled={busy || !changed || registrationLocked} type="button" onClick={() => { if (hasBooking && draft.length === 0) { setSaveError(null); setCancelOpen(true); } else void save(); }} className="min-h-12 flex-1 rounded-xl bg-white px-3 text-xs font-semibold text-black disabled:bg-white/[0.07] disabled:text-white/50">{registrationLocked ? 'Запись закрыта' : busy ? 'Сохраняю…' : changed ? draft.length ? 'Сохранить мой план' : 'Отменить запись' : 'Изменений нет'}</button>
              </div>
              {maxEveningPrice > 0 && plan.slots.filter((slot) => draft.includes(slot.id)).reduce((sum, slot) => sum + slot.price, 0) > total && (
                <div className="mt-2 text-right text-[11px] text-emerald-200/60">Лимит клубного вечера применён: не больше {formatRubles(maxEveningPrice)}</div>
              )}
              {changed && <p role="status" className="mt-2 text-xs text-amber-100">Выбор изменён, но ещё не сохранён.</p>}
              {saved && <div className="mt-2 rounded-xl bg-emerald-300/[0.08] px-3 py-2 text-center text-[11px] font-semibold text-emerald-200/70">{plan.selection.slot_ids.length ? 'План сохранён' : 'Запись отменена'}</div>}
              {saveError ? (
                <div className="mt-2 rounded-xl border border-rose-300/15 bg-rose-300/[0.07] px-3 py-2.5 text-xs leading-5 text-rose-100" role="alert">
                  {saveError.needsFirstApplication ? 'Сначала выбери путь в разделе «События»: новичок сможет записаться сразу, опытного игрока проверит организатор.' : saveError.message}
                  {saveError.needsFirstApplication ? <button type="button" onClick={onFirstApplication} className="mt-2 min-h-11 w-full rounded-lg bg-white/10 text-xs font-semibold text-white">К первой заявке</button> : null}
                </div>
              ) : null}

            </section>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button disabled={selectionLocked} type="button" onClick={() => { setSaved(false); setDraft(plan.slots.map((slot) => slot.id)); }} className="min-h-11 rounded-xl bg-white/[0.07] text-xs font-semibold text-white/60">Весь вечер</button>
              <button disabled={selectionLocked} type="button" onClick={() => { if (hasBooking) { setSaveError(null); setCancelOpen(true); } else { setSaved(false); setDraft([]); } }} className="min-h-11 rounded-xl bg-white/[0.035] text-xs font-semibold text-white/35">{hasBooking ? 'Отменить запись' : 'Очистить выбор'}</button>
            </div>

            <div className="mt-3 space-y-2">
              {plan.slots.map((slot) => {
                const selected = draft.includes(slot.id);
                const target = slot.target_players ?? plan.event.required_players_per_slot;
                const ready = typeof target === 'number' && target > 0 && slot.registered_count >= target;
                return (
                  <button key={slot.id} disabled={selectionLocked} type="button" onClick={() => { if (!changed) setOpenedSlotId(slot.id); }} className={`w-full rounded-2xl border p-3 text-left transition ${selected ? 'border-white/30 bg-white/[0.10]' : 'border-white/[0.07] bg-black/20'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">Игра {slot.slot_number} · {slotTime(slot.starts_at)}</div>
                        <div className={`mt-1 text-xs ${ready ? 'text-emerald-200/60' : 'text-white/35'}`}>{countPlayers(slot.registered_count)}{ready ? ' · собрано' : ''}</div>
                        {seatSummary.find(item => item.slot_id === slot.id) && <div className="mt-1 text-xs font-semibold text-emerald-200">{seatTables.find(t => t.id === seatSummary.find(item => item.slot_id === slot.id)?.tableId)?.name || 'Стол'} · место №{seatSummary.find(item => item.slot_id === slot.id)?.seat}</div>}
                      </div>
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${selected ? 'bg-white text-black' : 'bg-white/[0.05] text-white/20'}`}>{selected ? <Check className="h-4 w-4" /> : ''}</span>
                    </div>
                    {slot.participants.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {slot.participants.map((participant) => participant.is_guest ? <span key={participant.id} className="rounded-full bg-white/[0.05] px-2 py-1 text-[11px] text-white/45">{participant.nickname}</span> : <span key={participant.id} role="link" tabIndex={0} onClick={(event) => { event.stopPropagation(); openCanonicalPlayerProfile(participant.id); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); openCanonicalPlayerProfile(participant.id); } }} className="rounded-full bg-white/[0.05] px-2 py-1 text-[11px] text-white/45 underline-offset-2 hover:underline">{participant.nickname}</span>)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>


          </section>
        )}
        {!workspaceFirst && workspace}
        <ConfirmDialog open={cancelOpen} title="Отменить запись на игры?" description={saveError ? `Не удалось отменить запись: ${saveError.message}. Можно повторить или закрыть окно — запись пока сохранена.` : 'Выбранные игры будут сняты, организатор увидит отмену записи. Ответ «Не иду» не ставится автоматически. Можно будет записаться заново.'} confirmLabel="Отменить запись" busy={busy} onCancel={() => !busy && setCancelOpen(false)} onConfirm={() => save([])} />
      </div>
    </main>
  );
}
