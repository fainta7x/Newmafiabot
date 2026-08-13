import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, ExternalLink, MapPin, Sparkles } from 'lucide-react';
import { api } from '../../lib/api.ts';

interface PublicJoinViewProps { eveningId: string; }

type SlotPerson = { id: string; nickname: string };
type GameSlot = { id: string; slot_number: number; starts_at: string; ends_at: string; price: number; target_players: number; registered_count: number; selected: boolean; participants: SlotPerson[] };
type SlotPlan = { event: { price_per_game: number; assembled: boolean; assembled_slots: number; required_slots: number; required_players_per_slot: number }; slots: GameSlot[]; selection: { slot_ids: string[]; games: number; total: number } };

const request = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body?.error || `HTTP ${response.status}`), { status: response.status });
  return body;
};
const slotTime = (value: string) => new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export const PublicJoinView: React.FC<PublicJoinViewProps> = ({ eveningId }) => {
  const [evening, setEvening] = useState<any>(null);
  const [slotPlan, setSlotPlan] = useState<SlotPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nickname, setNickname] = useState(() => sessionStorage.getItem('2la_vk_nickname') || '');
  const [busy, setBusy] = useState(false);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [vkReady, setVkReady] = useState(false);
  const [vkAuthenticated, setVkAuthenticated] = useState(false);
  const [linkPending, setLinkPending] = useState(() => params.get('vk_link_pending') === '1');
  const [linkNickname, setLinkNickname] = useState(() => params.get('vk_link_nickname') || '');
  const [confirmedNickname, setConfirmedNickname] = useState('');
  const oauthError = params.get('vk_error');

  const loadSlots = async () => {
    const plan = await request(`/api/public/evenings/${encodeURIComponent(eveningId)}/slots`);
    setSlotPlan(plan as SlotPlan);
    return plan as SlotPlan;
  };

  const applyJoinState = (state: any) => {
    const ready = Boolean(state?.vk_authenticated && state?.authenticated);
    setVkAuthenticated(Boolean(state?.vk_authenticated));
    setVkReady(ready);
    setLinkPending(Boolean(state?.link_pending && !ready));
    setLinkNickname(String(state?.link_player_nickname || ''));
    if (ready) setConfirmedNickname(String(state?.player?.nickname || ''));
    return ready;
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getPublicEvening(eveningId),
      request(`/api/public/evenings/${encodeURIComponent(eveningId)}/join-state`).catch(() => null),
      request(`/api/public/evenings/${encodeURIComponent(eveningId)}/slots`).catch(() => null),
    ]).then(([event, state, plan]) => {
      if (cancelled) return;
      setEvening(event);
      if (state) applyJoinState(state);
      if (plan) setSlotPlan(plan as SlotPlan);
    }).catch((err: any) => { if (!cancelled) setError(err?.message || 'Игровой вечер не найден или ссылка устарела'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [eveningId]);

  useEffect(() => {
    if (!linkPending) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const state = await request(`/api/public/evenings/${encodeURIComponent(eveningId)}/join-state`);
        if (cancelled) return;
        if (applyJoinState(state)) {
          await loadSlots();
          setError('');
          const url = new URL(window.location.href);
          url.searchParams.delete('vk_link_pending');
          url.searchParams.delete('vk_link_nickname');
          window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
        }
      } catch {}
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [eveningId, linkPending]);

  const startVk = async () => {
    const value = nickname.trim().replace(/\s+/g, ' ');
    if (!value) { setError('Введите игровой ник'); return; }
    setBusy(true); setError('');
    try {
      sessionStorage.setItem('2la_vk_nickname', value);
      if (vkAuthenticated) {
        const claim = await request(`/api/public/evenings/${encodeURIComponent(eveningId)}/vk/claim`, { method: 'POST', body: JSON.stringify({ nickname: value }) });
        if (claim?.linked) {
          applyJoinState(await request(`/api/public/evenings/${encodeURIComponent(eveningId)}/join-state`));
          await loadSlots();
        } else {
          setLinkPending(true);
          setLinkNickname(String(claim?.nickname || value));
        }
        setBusy(false);
        return;
      }
      const body = await request(`/api/public/evenings/${encodeURIComponent(eveningId)}/vk/start`, { method: 'POST', body: JSON.stringify({ nickname: value }) });
      window.location.assign(String(body.authorize_url));
    } catch (err: any) {
      setError(err?.message || 'Не удалось открыть VK ID');
      setBusy(false);
    }
  };

  const toggleSlot = async (slotId: string) => {
    if (!vkReady || busy || !slotPlan) return;
    const current = new Set(slotPlan.selection.slot_ids);
    if (current.has(slotId)) current.delete(slotId); else current.add(slotId);
    setBusy(true); setError('');
    try {
      const body = await request(`/api/public/evenings/${encodeURIComponent(eveningId)}/slots`, { method: 'POST', body: JSON.stringify({ slot_ids: Array.from(current) }) });
      setSlotPlan(body as SlotPlan);
    } catch (err: any) {
      if (err?.status === 401) setVkReady(false);
      setError(err?.message || 'Не удалось сохранить выбор игр');
    } finally { setBusy(false); }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#090a0d] p-4 text-white"><div className="text-sm text-white/45">Загружаем вечер…</div></main>;
  if (error && !evening) return <main className="flex min-h-screen items-center justify-center bg-[#090a0d] p-4 text-white"><div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.045] p-6 text-center"><h1 className="text-xl font-semibold">Ссылка недействительна</h1><p className="mt-2 text-sm text-white/45">{error}</p></div></main>;

  const date = new Date(evening.starts_at);
  const formattedDate = date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const formattedTime = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const price = Number(slotPlan?.event.price_per_game ?? evening.default_price ?? 0);
  const displayNickname = confirmedNickname || sessionStorage.getItem('2la_vk_nickname') || nickname || 'Игрок';

  return <main className="min-h-screen bg-[#090a0d] px-4 py-7 text-white"><div className="mx-auto w-full max-w-md space-y-4">
    <header className="pt-2 text-center"><div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55"><Sparkles className="h-3.5 w-3.5" />2LA Noire · Тула</div><h1 className="mt-4 text-2xl font-semibold leading-tight">{evening.title}</h1></header>

    <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4"><div className="space-y-2">
      <div className="flex items-center gap-3 rounded-2xl bg-black/20 p-3"><Calendar className="h-5 w-5 text-white/55" /><div><div className="text-[10px] uppercase tracking-wide text-white/30">Дата и начало</div><div className="mt-0.5 text-sm font-medium capitalize">{formattedDate}, {formattedTime}</div></div></div>
      <div className="flex items-center gap-3 rounded-2xl bg-black/20 p-3"><MapPin className="h-5 w-5 text-white/55" /><div><div className="text-[10px] uppercase tracking-wide text-white/30">Место</div><div className="mt-0.5 text-sm font-medium">{evening.venue || 'Суп с Котом'}</div></div></div>
    </div><div className="mt-3 flex items-center justify-between rounded-2xl bg-black/20 px-3 py-3 text-sm"><span className="text-white/40">Стоимость</span><strong>{price ? `${price.toLocaleString('ru-RU')} ₽ / игра` : 'Без оплаты'}</strong></div></section>

    {slotPlan ? <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">Выбери игры</h2><p className="mt-1 text-xs leading-5 text-white/35">{vkReady ? 'Нажимай на игры, в которые приедешь. Изменения сохраняются сразу.' : 'Загрузка каждой игры видна заранее. После подтверждения VK можно выбрать нужные слоты.'}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${slotPlan.event.assembled ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/[0.06] text-white/45'}`}>{slotPlan.event.assembled ? 'Стол собран' : `${slotPlan.event.assembled_slots}/${slotPlan.event.required_slots} собрано`}</span></div>
      <div className="mt-3 grid gap-2">{slotPlan.slots.map((slot) => { const ready = slot.registered_count >= slot.target_players; return <button key={slot.id} type="button" disabled={!vkReady || busy} onClick={() => void toggleSlot(slot.id)} className={`rounded-2xl border p-3 text-left transition ${slot.selected ? 'border-[#2688eb]/55 bg-[#2688eb]/[0.12]' : ready ? 'border-emerald-300/20 bg-emerald-400/[0.05]' : 'border-white/[0.08] bg-black/20'} ${!vkReady ? 'cursor-default' : ''}`}>
        <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold">Игра {slot.slot_number} · {slotTime(slot.starts_at)}–{slotTime(slot.ends_at)}</div><div className={`mt-1 text-xs ${ready ? 'text-emerald-300/75' : 'text-white/35'}`}>{slot.registered_count}/{slot.target_players} игроков{ready ? ' · собрано' : ''}</div></div><div className="flex items-center gap-2"><span className="text-xs text-white/35">{slot.price} ₽</span>{slot.selected ? <span className="grid h-7 w-7 place-items-center rounded-full bg-[#2688eb] text-white"><Check className="h-4 w-4" /></span> : null}</div></div>
        {slot.participants.length ? <div className="mt-2 flex flex-wrap gap-1.5">{slot.participants.map((person) => <span key={person.id} className="rounded-full bg-white/[0.055] px-2 py-1 text-[10px] text-white/55">{person.nickname}</span>)}</div> : <div className="mt-2 text-[10px] text-white/25">Пока никто не записался</div>}
      </button>; })}</div>
      {vkReady ? <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/[0.06] px-4 py-3"><div><div className="text-xs text-white/35">Твоя запись</div><div className="mt-0.5 text-sm font-semibold">{slotPlan.selection.games ? `${slotPlan.selection.games} игр` : 'Игры не выбраны'}</div></div><strong className="text-lg">{slotPlan.selection.total.toLocaleString('ru-RU')} ₽</strong></div> : null}
    </section> : null}

    {params.get('vk_linked') === '1' ? <div className="rounded-2xl border border-emerald-300/10 bg-emerald-400/[0.08] px-4 py-3 text-sm leading-5 text-emerald-100/80">VK успешно связан с игровым профилем.</div> : null}
    {oauthError && !linkPending ? <div className="rounded-2xl border border-rose-300/10 bg-rose-400/[0.08] px-4 py-3 text-sm leading-5 text-rose-100/80">VK: {oauthError}</div> : null}
    {error && evening ? <div className="rounded-2xl border border-rose-300/10 bg-rose-400/[0.08] px-4 py-3 text-sm leading-5 text-rose-100/80">{error}</div> : null}

    {linkPending ? <section className="rounded-3xl border border-[#2688eb]/25 bg-[#2688eb]/[0.07] p-5"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#75baff]">Остался один шаг</div><h2 className="mt-2 text-lg font-semibold">Подтверди профиль в MafiaBot</h2><p className="mt-2 text-sm leading-6 text-white/50">Мы отправили личное сообщение в Telegram владельцу профиля{linkNickname ? ` «${linkNickname}»` : ''}. Нажми там «Это я — связать VK».</p><div className="mt-4 rounded-2xl bg-black/20 px-4 py-3 text-sm leading-5 text-white/45">Эта страница проверяет подтверждение автоматически. Новый игрок и второй профиль созданы не будут.</div><button type="button" onClick={() => window.location.reload()} className="mt-3 min-h-11 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/75">Проверить сейчас</button></section>
    : !vkReady ? <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-5"><h2 className="text-lg font-semibold">Записаться через VK</h2><p className="mt-1 text-sm leading-6 text-white/45">{vkAuthenticated ? 'VK ID подтверждён. Для существующего профиля осталось подтвердить связь личным сообщением в MafiaBot.' : 'Укажи игровой ник один раз. После подтверждения VK выберешь конкретные игры выше.'}</p><label className="mt-4 block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Игровой ник</label><input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={60} placeholder="Например: Чагин" className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-base outline-none placeholder:text-white/20 focus:border-white/25" /><button type="button" disabled={busy} onClick={() => void startVk()} className="mt-3 min-h-12 w-full rounded-2xl bg-[#2688eb] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? (vkAuthenticated ? 'Отправляем в MafiaBot…' : 'Открываем VK…') : (vkAuthenticated ? 'Подтвердить через MafiaBot' : 'Продолжить через VK ID')}</button><a href={`/player/events?event=${encodeURIComponent(eveningId)}`} className="mt-3 flex min-h-11 items-center justify-center gap-2 text-xs text-white/40">Уже вошли через Telegram? Открыть событие <ExternalLink className="h-3.5 w-3.5" /></a></section>
    : <section className="rounded-3xl border border-emerald-300/10 bg-emerald-400/[0.045] p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-xs text-white/35">VK ID подтверждён</div><h2 className="mt-1 text-lg font-semibold">{displayNickname}</h2></div><span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check className="h-5 w-5" /></span></div><p className="mt-2 text-xs leading-5 text-white/35">Выбирай нужные игры в расписании выше. Можно менять планы в любой момент, пока запись открыта.</p></section>}
  </div></main>;
};
