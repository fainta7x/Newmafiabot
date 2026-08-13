import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, ExternalLink, MapPin, Sparkles } from 'lucide-react';
import { api } from '../../lib/api.ts';

interface PublicJoinViewProps { eveningId: string; }
type ResponseStatus = 'going' | 'late' | 'thinking' | 'declined' | 'unanswered';
type Counts = { going: number; late: number; thinking: number; declined: number };

const choices: Array<{ status: Exclude<ResponseStatus, 'unanswered'>; label: string; hint: string }> = [
  { status: 'going', label: 'Иду', hint: 'Буду вовремя' },
  { status: 'late', label: 'Приду позже', hint: 'Подъеду после начала' },
  { status: 'thinking', label: 'Пока думаю', hint: 'Решу чуть позже' },
  { status: 'declined', label: 'Не иду', hint: 'В этот раз пропускаю' },
];

const request = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body?.error || `HTTP ${response.status}`), { status: response.status });
  return body;
};

export const PublicJoinView: React.FC<PublicJoinViewProps> = ({ eveningId }) => {
  const [evening, setEvening] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nickname, setNickname] = useState(() => sessionStorage.getItem('2la_vk_nickname') || '');
  const [busy, setBusy] = useState(false);
  const [responseStatus, setResponseStatus] = useState<ResponseStatus>('unanswered');
  const [counts, setCounts] = useState<Counts | null>(null);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [vkReady, setVkReady] = useState(false);
  const [vkAuthenticated, setVkAuthenticated] = useState(false);
  const [linkPending, setLinkPending] = useState(() => params.get('vk_link_pending') === '1');
  const [linkNickname, setLinkNickname] = useState(() => params.get('vk_link_nickname') || '');
  const [confirmedNickname, setConfirmedNickname] = useState('');
  const oauthError = params.get('vk_error');

  const applyJoinState = (state: any) => {
    const ready = Boolean(state?.vk_authenticated && state?.authenticated);
    setVkAuthenticated(Boolean(state?.vk_authenticated));
    setVkReady(ready);
    setLinkPending(Boolean(state?.link_pending && !ready));
    setLinkNickname(String(state?.link_player_nickname || ''));
    if (ready) {
      setResponseStatus((state.response_status || 'unanswered') as ResponseStatus);
      setCounts(state.counts || null);
      setConfirmedNickname(String(state?.player?.nickname || ''));
    }
    return ready;
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getPublicEvening(eveningId),
      request(`/api/public/evenings/${encodeURIComponent(eveningId)}/join-state`).catch(() => null),
    ]).then(([event, state]) => {
      if (cancelled) return;
      setEvening(event);
      if (state) applyJoinState(state);
    }).catch((err: any) => {
      if (!cancelled) setError(err?.message || 'Игровой вечер не найден или ссылка устарела');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [eveningId]);

  useEffect(() => {
    if (!linkPending) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const state = await request(`/api/public/evenings/${encodeURIComponent(eveningId)}/join-state`);
        if (cancelled) return;
        const ready = applyJoinState(state);
        if (ready) {
          setError('');
          const url = new URL(window.location.href);
          url.searchParams.delete('vk_link_pending');
          url.searchParams.delete('vk_link_nickname');
          window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
        }
      } catch {
        // The page keeps polling while the user confirms the private Telegram message.
      }
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
        const claim = await request(`/api/public/evenings/${encodeURIComponent(eveningId)}/vk/claim`, {
          method: 'POST', body: JSON.stringify({ nickname: value }),
        });
        if (claim?.linked) {
          const state = await request(`/api/public/evenings/${encodeURIComponent(eveningId)}/join-state`);
          applyJoinState(state);
        } else {
          setLinkPending(true);
          setLinkNickname(String(claim?.nickname || value));
        }
        setBusy(false);
        return;
      }
      const body = await request(`/api/public/evenings/${encodeURIComponent(eveningId)}/vk/start`, {
        method: 'POST', body: JSON.stringify({ nickname: value }),
      });
      window.location.assign(String(body.authorize_url));
    } catch (err: any) {
      setError(err?.message || 'Не удалось открыть VK ID');
      setBusy(false);
    }
  };

  const respond = async (status: Exclude<ResponseStatus, 'unanswered'>) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const body = await request(`/api/public/evenings/${encodeURIComponent(eveningId)}/vk-respond`, {
        method: 'POST', body: JSON.stringify({ status }),
      });
      setResponseStatus(body.response_status || status);
      if (body.counts) setCounts(body.counts);
    } catch (err: any) {
      if (err?.status === 401) setVkReady(false);
      setError(err?.message || 'Не удалось сохранить ответ');
    } finally { setBusy(false); }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#090a0d] p-4 text-white"><div className="text-sm text-white/45">Загружаем вечер…</div></main>;
  if (error && !evening) return <main className="flex min-h-screen items-center justify-center bg-[#090a0d] p-4 text-white"><div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.045] p-6 text-center"><h1 className="text-xl font-semibold">Ссылка недействительна</h1><p className="mt-2 text-sm text-white/45">{error}</p></div></main>;

  const date = new Date(evening.starts_at);
  const formattedDate = date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const formattedTime = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const price = Number(evening.default_price || 0);
  const displayNickname = confirmedNickname || sessionStorage.getItem('2la_vk_nickname') || nickname || 'Игрок';
  const goingCount = counts ? counts.going + counts.late : null;

  return (
    <main className="min-h-screen bg-[#090a0d] px-4 py-7 text-white">
      <div className="mx-auto w-full max-w-md space-y-4">
        <header className="pt-2 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55"><Sparkles className="h-3.5 w-3.5" />2LA Noire · Тула</div>
          <h1 className="mt-4 text-2xl font-semibold leading-tight">{evening.title}</h1>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-2xl bg-black/20 p-3"><Calendar className="h-5 w-5 text-white/55" /><div><div className="text-[10px] uppercase tracking-wide text-white/30">Дата и время</div><div className="mt-0.5 text-sm font-medium capitalize">{formattedDate}, {formattedTime}</div></div></div>
            <div className="flex items-center gap-3 rounded-2xl bg-black/20 p-3"><MapPin className="h-5 w-5 text-white/55" /><div><div className="text-[10px] uppercase tracking-wide text-white/30">Место</div><div className="mt-0.5 text-sm font-medium">{evening.venue || 'Суп с Котом'}</div></div></div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-black/20 px-3 py-3 text-sm"><span className="text-white/40">Стоимость</span><strong>{price ? `${price.toLocaleString('ru-RU')} ₽` : 'Без оплаты'}</strong></div>
        </section>

        {params.get('vk_linked') === '1' ? <div className="rounded-2xl border border-emerald-300/10 bg-emerald-400/[0.08] px-4 py-3 text-sm leading-5 text-emerald-100/80">VK успешно связан с игровым профилем.</div> : null}
        {oauthError && !linkPending ? <div className="rounded-2xl border border-rose-300/10 bg-rose-400/[0.08] px-4 py-3 text-sm leading-5 text-rose-100/80">VK: {oauthError}</div> : null}
        {error && evening ? <div className="rounded-2xl border border-rose-300/10 bg-rose-400/[0.08] px-4 py-3 text-sm leading-5 text-rose-100/80">{error}</div> : null}

        {linkPending ? (
          <section className="rounded-3xl border border-[#2688eb]/25 bg-[#2688eb]/[0.07] p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#75baff]">Остался один шаг</div>
            <h2 className="mt-2 text-lg font-semibold">Подтверди профиль в MafiaBot</h2>
            <p className="mt-2 text-sm leading-6 text-white/50">Мы отправили личное сообщение в Telegram владельцу профиля{linkNickname ? ` «${linkNickname}»` : ''}. Нажми там «Это я — связать VK».</p>
            <div className="mt-4 rounded-2xl bg-black/20 px-4 py-3 text-sm leading-5 text-white/45">Эта страница проверяет подтверждение автоматически. Новый игрок и второй ответ созданы не будут.</div>
            <button type="button" onClick={() => window.location.reload()} className="mt-3 min-h-11 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/75">Проверить сейчас</button>
          </section>
        ) : !vkReady ? (
          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-5">
            <h2 className="text-lg font-semibold">Записаться через VK</h2>
            <p className="mt-1 text-sm leading-6 text-white/45">{vkAuthenticated ? 'VK ID подтверждён. Для существующего профиля осталось подтвердить связь личным сообщением в MafiaBot.' : 'Укажи игровой ник один раз. VK ID подтвердит, что ответ принадлежит именно тебе.'}</p>
            <label className="mt-4 block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Игровой ник</label>
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={60} placeholder="Например: Чагин" className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-base outline-none placeholder:text-white/20 focus:border-white/25" />
            <button type="button" disabled={busy} onClick={() => void startVk()} className="mt-3 min-h-12 w-full rounded-2xl bg-[#2688eb] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? (vkAuthenticated ? 'Отправляем в MafiaBot…' : 'Открываем VK…') : (vkAuthenticated ? 'Подтвердить через MafiaBot' : 'Продолжить через VK ID')}</button>
            <a href="/player" className="mt-3 flex min-h-11 items-center justify-center gap-2 text-xs text-white/40">Уже вошли через Telegram? Открыть кабинет <ExternalLink className="h-3.5 w-3.5" /></a>
          </section>
        ) : (
          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-5">
            <div className="flex items-center justify-between gap-3"><div><div className="text-xs text-white/35">VK ID подтверждён</div><h2 className="mt-1 text-lg font-semibold">{displayNickname}</h2></div>{responseStatus !== 'unanswered' ? <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check className="h-5 w-5" /></span> : null}</div>
            <p className="mt-4 text-sm text-white/45">Как планируешь?</p>
            <div className="mt-3 grid gap-2">
              {choices.map((choice) => {
                const selected = responseStatus === choice.status;
                return <button key={choice.status} type="button" disabled={busy} onClick={() => void respond(choice.status)} className={`flex min-h-14 items-center justify-between rounded-2xl border px-4 text-left transition ${selected ? 'border-white/30 bg-white text-black' : 'border-white/10 bg-black/20 text-white'}`}><span><span className="block text-sm font-semibold">{choice.label}</span><span className={`mt-0.5 block text-xs ${selected ? 'text-black/50' : 'text-white/30'}`}>{choice.hint}</span></span>{selected ? <Check className="h-5 w-5" /> : null}</button>;
              })}
            </div>
            {counts ? <div className="mt-4 rounded-2xl bg-black/20 px-3 py-3 text-center text-xs text-white/45">Уже идут: <strong className="text-white">{goingCount}</strong> · думают: <strong className="text-white">{counts.thinking}</strong></div> : <p className="mt-4 text-center text-xs leading-5 text-white/30">Ответ сразу попадёт в общую запись 2LA Noire.</p>}
          </section>
        )}
      </div>
    </main>
  );
};
