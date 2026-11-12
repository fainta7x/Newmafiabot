import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ExternalLink, MapPin, MessageCircle, Send, Ticket } from 'lucide-react';

type Evening = {
  id: string; title: string; starts_at: string; venue: { name: string; address: string | null; mapUrl: string | null }; schedule: string | null;
  price: string; join_url: string; telegram_url: string | null;
};
type Welcome = {
  content: { title: string; lead: string; about: string; sections: Array<{ title: string; items: string[] }> };
  hero_photos?: string[];
  evening: Evening | null; contacts: Array<{ label: 'Telegram' | 'VK'; url: string }>; vk_group: string | null; telegram_group: string | null;
};
type SeatGame = { number: number; starts_at: string; target: number; taken: number; people: string[] };
type Seats = { evening_id: string | null; games: SeatGame[]; going: number; updated_at: string };
type Kind = 'telegram' | 'vk' | 'phone';

const VISITOR_KEY = 'welcome_visitor';
const POLL_MS = 10_000;
const visitorId = () => {
  try {
    const saved = localStorage.getItem(VISITOR_KEY);
    if (saved) return saved;
    const fresh = (crypto.randomUUID?.() || `${Date.now()}${Math.random().toString(16).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
    localStorage.setItem(VISITOR_KEY, fresh);
    return fresh;
  } catch { return `v${Date.now()}${Math.random().toString(16).slice(2, 10)}`; }
};
const whenText = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', ...options }).format(date);
  const text = `${part({ weekday: 'long' })}, ${part({ day: 'numeric', month: 'long' })}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const clock = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const countdown = (value: string, now: number) => {
  const left = new Date(value).getTime() - now;
  if (!Number.isFinite(left) || left <= 0) return 'уже идёт';
  const days = Math.floor(left / 86_400_000), hours = Math.floor((left % 86_400_000) / 3_600_000), minutes = Math.floor((left % 3_600_000) / 60_000);
  return days > 0 ? `${days} дн. ${hours} ч.` : hours > 0 ? `${hours} ч. ${minutes} мин.` : `${minutes} мин.`;
};
const PLACEHOLDER: Record<Kind, string> = { telegram: '@ваш_ник', vk: 'vk.com/ваша_страница', phone: '+7 900 123-45-67' };

/** Top of the page: the club's own photos, one after another (still when the viewer asks for less motion). */
function Hero({ photos, title, lead }: { photos: string[]; title: string; lead: string }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (photos.length < 2 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % photos.length), 5000);
    return () => window.clearInterval(timer);
  }, [photos.length]);
  return <header className="relative -mx-4 -mt-7 overflow-hidden bg-[#14090b]" data-testid="welcome-hero">
    <div className="relative h-[340px] w-full sm:h-[420px]">
      {photos.map((src, i) => <img key={src} src={src} alt="" loading={i === 0 ? 'eager' : 'lazy'} className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000" style={{ opacity: i === index ? 1 : 0 }} />)}
      <div className="absolute inset-0 bg-gradient-to-t from-[#090a0d] via-[#090a0d]/55 to-[#090a0d]/20" />
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md space-y-2 px-4 pb-5">
        <p className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.16em] text-white/80"><span className="h-2.5 w-2.5 rounded-full bg-[#e5383b]" /><span className="h-2.5 w-2.5 rounded-full bg-black ring-1 ring-white/40" />2LA Noire</p>
        <h1 className="text-[30px] font-black leading-[1.05] text-white drop-shadow">{title}</h1>
        <p className="text-[16px] font-semibold leading-6 text-white/90">{lead}</p>
      </div>
    </div>
  </header>;
}

/** Numbered seat cards like the ones on the real tables; a taken seat carries the player's name. */
function SeatBoard({ seats, fresh }: { seats: Seats; fresh: Set<string> }) {
  return <div className="space-y-4" data-testid="welcome-seats">
    {seats.games.map((game) => {
      const free = Math.max(0, game.target - game.taken);
      const cells = Array.from({ length: Math.max(game.target, game.taken) }, (_, i) => game.people[i] ?? null);
      return <div key={game.number} className="space-y-2" data-testid={`welcome-game-${game.number}`}>
        <div className="flex items-baseline justify-between gap-2"><strong className="text-[14px]">Игра {game.number} · {clock(game.starts_at)}</strong>
          <span className={`text-[13px] font-semibold ${free === 0 ? 'text-emerald-300' : 'text-white/70'}`}>{free === 0 ? 'Стол собран' : `свободно ${free} из ${game.target}`}</span></div>
        <ol className="grid grid-cols-5 gap-1.5">
          {cells.map((name, i) => {
            const isFresh = name ? fresh.has(name) : false;
            return <li key={i} className={`relative flex min-h-[64px] flex-col items-center justify-center rounded-xl px-1 py-1.5 text-center ${name ? 'bg-[#e5383b]/90 text-white' : 'border border-dashed border-white/25 text-white/35'} ${isFresh ? 'welcome-pop' : ''}`} aria-label={name ? `Место ${i + 1}: ${name}` : `Место ${i + 1}: свободно`}>
              <span className={`text-[11px] font-bold ${name ? 'text-white/70' : ''}`}>{i + 1}</span>
              <span className={`w-full truncate font-semibold leading-4 ${name ? 'text-[11px]' : 'text-[18px]'}`}>{name || '+'}</span>
            </li>;
          })}
        </ol>
      </div>;
    })}
  </div>;
}

/**
 * The page for newcomers (owner, 2026-11-11): a real club photo on top, the nearest training with seats that fill up live, a contact form
 * and the two quick ways in (Telegram / VK). After a contact is left the person is told what happens next.
 */
export function WelcomePage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const source = ['vk', 'telegram', 'friend'].includes(params.get('src') || '') ? String(params.get('src')) : 'other';
  const [data, setData] = useState<Welcome | null>(null);
  const [seats, setSeats] = useState<Seats | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [announce, setAnnounce] = useState('');
  const known = useRef<Set<string> | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');
  const [kind, setKind] = useState<Kind>('telegram');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [friend, setFriend] = useState(params.get('ref') || '');
  const [trap, setTrap] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { kind: Kind }>(null);
  const formRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void fetch('/api/public/welcome', { cache: 'no-store' }).then((response) => response.ok ? response.json() : Promise.reject(new Error('load'))).then(setData).catch(() => setError('Не удалось загрузить страницу. Обновите её чуть позже.'));
    void fetch('/api/public/welcome/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor_id: visitorId(), source }) }).catch(() => undefined);
  }, [source]);

  // Seats are read again every few seconds while the page is open; a name that appears since the last read is marked as new.
  const loadSeats = useCallback(async () => {
    try {
      const response = await fetch('/api/public/welcome/seats', { cache: 'no-store' });
      if (!response.ok) return;
      const next: Seats = await response.json();
      const names = new Set(next.games.flatMap((game) => game.people));
      if (known.current) {
        const added = [...names].filter((nick) => !known.current!.has(nick));
        if (added.length) { setFresh(new Set(added)); setAnnounce(`Новая запись: ${added.join(', ')}`); window.setTimeout(() => setFresh(new Set()), 6000); }
      }
      known.current = names;
      setSeats(next);
    } catch { /* the board keeps the last picture */ }
  }, []);
  useEffect(() => {
    void loadSeats();
    const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') void loadSeats(); setNow(Date.now()); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadSeats]);

  const send = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/public/welcome/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, contact_kind: kind, contact_value: contact, source, referred_by: friend, website: trap }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось сохранить. Попробуйте ещё раз');
      setDone({ kind });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить'); }
    finally { setBusy(false); }
  };

  const evening = data?.evening || null;
  const channel = (value: Kind) => value === 'telegram' ? 'в Telegram' : value === 'vk' ? 'во ВКонтакте' : 'по телефону';
  const freeTotal = seats ? seats.games.reduce((sum, game) => sum + Math.max(0, game.target - game.taken), 0) : null;
  const photos = data?.hero_photos?.length ? data.hero_photos : [];
  return <main data-testid="welcome-page" className="min-h-screen bg-[#090a0d] px-4 py-7 pb-28 text-white">
    <style>{`@keyframes welcome-pop{0%{transform:scale(.7);box-shadow:0 0 0 0 rgba(229,56,59,.8)}60%{transform:scale(1.06);box-shadow:0 0 0 10px rgba(229,56,59,0)}100%{transform:scale(1)}}.welcome-pop{animation:welcome-pop .9s ease-out 2}@media (prefers-reduced-motion:reduce){.welcome-pop{animation:none}}`}</style>
    {photos.length > 0
      ? <Hero photos={photos} title={data?.content.title || 'Школа спортивной мафии | Тула'} lead={data?.content.lead || ''} />
      : <header className="space-y-2 pt-2"><p className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/60">2LA Noire</p><h1 className="text-[30px] font-black leading-[1.05]">{data?.content.title || 'Школа спортивной мафии | Тула'}</h1><p className="text-[16px] font-semibold leading-6 text-white/90">{data?.content.lead}</p></header>}
    <div className="mx-auto mt-4 w-full max-w-md space-y-4">
      {data?.content.about && <p className="text-[14px] leading-6 text-white/70">{data.content.about}</p>}

      {evening ? <section className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.045] p-4" aria-label="Ближайшее обучение">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-white/50">Ближайшее обучение</h2>
          <span className="shrink-0 rounded-full bg-[#e5383b]/20 px-2.5 py-1 text-[12px] font-bold text-[#ff8a8d]" data-testid="welcome-countdown">через {countdown(evening.starts_at, now)}</span>
        </div>
        <div className="flex items-start gap-3"><CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-white/55" /><div><div className="text-[16px] font-semibold">{whenText(evening.starts_at)}</div>{evening.schedule && <div className="mt-0.5 text-[13px] text-white/60">{evening.schedule}</div>}</div></div>
        <div className="flex items-start gap-3"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-white/55" /><div className="min-w-0 text-[14px]"><div className="font-semibold">{evening.venue.name}</div>{evening.venue.address && <div className="text-[13px] text-white/60">{evening.venue.address}</div>}{evening.venue.mapUrl && <a className="mt-1 inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-sky-300" href={evening.venue.mapUrl} target="_blank" rel="noreferrer">Как добраться <ExternalLink className="h-3.5 w-3.5" /></a>}</div></div>
        <div className="flex items-start gap-3"><Ticket className="mt-0.5 h-5 w-5 shrink-0 text-white/55" /><div className="text-[14px]">{evening.price}</div></div>

        {seats && seats.games.length > 0 && <div className="space-y-3 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[15px] font-bold">Кто уже записался{seats.going > 0 ? ` · ${seats.going}` : ''}</h3>
          </div>
          {seats.going === 0 && <p className="text-[13px] leading-5 text-white/60">Пока никого. Займи первое место.</p>}
          <SeatBoard seats={seats} fresh={fresh} />
          <p role="status" aria-live="polite" className="min-h-5 text-[13px] font-semibold text-[#ff8a8d]">{announce}</p>
        </div>}
      </section> : data ? <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 text-[14px] leading-6 text-white/75">Дата ближайшего обучения пока не объявлена. Оставь контакт, и мы напишем, когда она появится.</section> : null}

      {done ? <section data-testid="welcome-done" className="space-y-2 rounded-3xl border border-emerald-300/20 bg-emerald-300/[0.06] p-4">
        <div className="flex items-center gap-2 text-[16px] font-bold text-emerald-100"><Check className="h-5 w-5" />Спасибо!</div>
        <p className="text-[14px] leading-6 text-white/80">Мы напишем тебе {channel(done.kind)} в течение дня.</p>
      </section> : <section ref={formRef} id="welcome-form" className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.045] p-4" aria-label="Знакомство">
        <h2 className="text-[18px] font-bold">Хочешь прийти?</h2>
        <p className="text-[13px] leading-5 text-white/60">Оставь имя и контакт. Мы напишем и запишем тебя.</p>
        <label className="block text-[12px] text-white/60">Как тебя зовут
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} autoComplete="given-name" className="mt-1 min-h-12 w-full rounded-xl border border-white/10 bg-[#202126] px-3 text-[15px] text-white" /></label>
        <div role="radiogroup" aria-label="Где тебе удобнее общаться" className="grid grid-cols-3 gap-2">
          {([['telegram', 'Telegram'], ['vk', 'ВКонтакте'], ['phone', 'Телефон']] as const).map(([id, label]) =>
            <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => { setKind(id); setContact(''); }} className={`min-h-11 rounded-xl border px-2 text-[13px] font-semibold ${kind === id ? 'border-white/40 bg-white/15 text-white' : 'border-white/10 text-white/60'}`}>{label}</button>)}
        </div>
        <label className="block text-[12px] text-white/60">{kind === 'telegram' ? 'Твой ник в Telegram' : kind === 'vk' ? 'Ссылка на твою страницу ВК' : 'Твой номер телефона'}
          <input value={contact} onChange={(event) => setContact(event.target.value)} maxLength={120} inputMode={kind === 'phone' ? 'tel' : 'text'} placeholder={PLACEHOLDER[kind]} className="mt-1 min-h-12 w-full rounded-xl border border-white/10 bg-[#202126] px-3 text-[15px] text-white" /></label>
        <label className="block text-[12px] text-white/60">Тебя кто-то пригласил? Напиши, кто
          <input value={friend} onChange={(event) => setFriend(event.target.value)} maxLength={60} className="mt-1 min-h-12 w-full rounded-xl border border-white/10 bg-[#202126] px-3 text-[15px] text-white" /></label>
        <input value={trap} onChange={(event) => setTrap(event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0" name="website" />
        {error && <p role="alert" className="text-[13px] text-amber-200">{error}</p>}
        <button type="button" disabled={busy || name.trim().length < 2 || !contact.trim()} onClick={() => void send()} className="min-h-12 w-full rounded-xl bg-[#e5383b] px-4 text-[15px] font-bold text-white disabled:opacity-40">{busy ? 'Отправляем…' : 'Отправить заявку'}</button>
      </section>}

      {evening && <section className="space-y-2 rounded-3xl border border-white/10 bg-white/[0.045] p-4" aria-label="Записаться сразу">
        <h2 className="text-[16px] font-bold">Или запишись сразу</h2>
        <p className="text-[13px] leading-5 text-white/60">Через Telegram или ВКонтакте.</p>
        {evening.telegram_url && <a href={evening.telegram_url} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#2688eb] px-4 text-[15px] font-bold text-white"><Send className="h-4 w-4" />Telegram</a>}
        <a href={evening.join_url} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-[15px] font-bold text-white">ВКонтакте</a>
      </section>}

      {data?.content.sections.map((section) => <details key={section.title} className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
        <summary className="min-h-11 cursor-pointer list-none text-[16px] font-bold">{section.title}</summary>
        <div className="mt-2 space-y-2 text-[14px] leading-6 text-white/75">{section.items.map((item) => <p key={item}>{item}</p>)}</div>
      </details>)}

      {data && (data.contacts.length > 0 || data.vk_group || data.telegram_group) && <section className="space-y-2 rounded-3xl border border-white/10 bg-white/[0.045] p-4"><h2 className="flex items-center gap-2 text-[16px] font-bold"><MessageCircle className="h-4 w-4" />Вопросы?</h2>
        <div className="flex flex-wrap gap-2">{data.contacts.map((item) => <a key={item.url} href={item.url} className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-3 text-[13px] font-semibold">Написать в {item.label}</a>)}
          {data.telegram_group && <a href={data.telegram_group} className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-3 text-[13px] font-semibold">Группа новичков в Telegram</a>}
          {data.vk_group && <a href={data.vk_group} className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-3 text-[13px] font-semibold">Группа клуба в ВК</a>}</div></section>}
      {!data && error && <p role="alert" className="text-center text-[13px] text-amber-200">{error}</p>}
    </div>

    {evening && !done && <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#090a0d]/95 px-4 pt-3 backdrop-blur" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
      <div className="mx-auto flex w-full max-w-md items-center gap-3">
        <div className="min-w-0 flex-1 text-[13px] leading-4"><div className="truncate font-semibold">{whenText(evening.starts_at)}</div><div className="text-white/60">{freeTotal === null ? evening.venue.name : freeTotal > 0 ? `Свободно мест: ${freeTotal}` : 'Столы собраны, можно в резерв'}</div></div>
        <button type="button" onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="min-h-12 shrink-0 rounded-xl bg-[#e5383b] px-5 text-[15px] font-bold text-white">Занять место</button>
      </div>
    </div>}
  </main>;
}
export default WelcomePage;
