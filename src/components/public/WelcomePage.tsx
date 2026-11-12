import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ExternalLink, MapPin, MessageCircle, Send, Ticket } from 'lucide-react';

type Evening = {
  id: string; title: string; starts_at: string; venue: { name: string; address: string | null; mapUrl: string | null }; schedule: string | null;
  price: string; join_url: string; telegram_url: string | null;
};
type Welcome = {
  promo: { headline: string; firstTimeTitle: string; firstTimeText: string; title: string; intro: string; reasonsTitle: string; reasons: string[] };
  evening: Evening | null; contacts: Array<{ label: 'Telegram' | 'VK'; url: string }>; vk_group: string | null; telegram_group: string | null;
};
type Kind = 'telegram' | 'vk' | 'phone';

const VISITOR_KEY = 'welcome_visitor';
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
const PLACEHOLDER: Record<Kind, string> = { telegram: '@ваш_ник', vk: 'vk.com/ваша_страница', phone: '+7 900 123-45-67' };

/**
 * The page for newcomers (owner, 2026-11-11): what the game is, the nearest novice evening and the two quick ways in — a contact left
 * without any login, or a sign-in through Telegram / VK and a seat at once. After it the person is told what happens next.
 */
export function WelcomePage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const source = ['vk', 'telegram', 'friend'].includes(params.get('src') || '') ? String(params.get('src')) : 'other';
  const [data, setData] = useState<Welcome | null>(null);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<Kind>('telegram');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [friend, setFriend] = useState(params.get('ref') || '');
  const [trap, setTrap] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { kind: Kind }>(null);

  useEffect(() => {
    void fetch('/api/public/welcome', { cache: 'no-store' }).then((response) => response.ok ? response.json() : Promise.reject(new Error('load'))).then(setData).catch(() => setError('Не удалось загрузить страницу. Обновите её чуть позже.'));
    void fetch('/api/public/welcome/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor_id: visitorId(), source }) }).catch(() => undefined);
  }, [source]);

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
  return <main data-testid="welcome-page" className="min-h-screen bg-[#090a0d] px-4 py-7 text-white">
    <div className="mx-auto w-full max-w-md space-y-4">
      <header className="space-y-2 pt-2">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-white/45">2LA Noire · мафия в Туле</p>
        <h1 className="text-[26px] font-black leading-tight">Вечер мафии для новичков</h1>
        <p className="text-[15px] leading-6 text-white/75">Играть уметь не нужно: всё объясним на месте. Можно прийти одному.</p>
      </header>

      {evening ? <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.045] p-4" aria-label="Ближайший вечер для новичков">
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-white/45">Ближайший вечер для новичков</h2>
        <div className="flex items-start gap-3"><CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-white/55" /><div><div className="text-[15px] font-semibold">{whenText(evening.starts_at)}</div>{evening.schedule && <div className="mt-0.5 text-[13px] text-white/60">{evening.schedule}</div>}</div></div>
        <div className="flex items-start gap-3"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-white/55" /><div className="min-w-0 text-[14px]"><div className="font-semibold">{evening.venue.name}</div>{evening.venue.address && <div className="text-[13px] text-white/60">{evening.venue.address}</div>}{evening.venue.mapUrl && <a className="mt-1 inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-sky-300" href={evening.venue.mapUrl} target="_blank" rel="noreferrer">Как добраться <ExternalLink className="h-3.5 w-3.5" /></a>}</div></div>
        <div className="flex items-start gap-3"><Ticket className="mt-0.5 h-5 w-5 shrink-0 text-white/55" /><div className="text-[14px]">{evening.price}</div></div>
      </section> : data ? <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 text-[14px] leading-6 text-white/75">Дата ближайшего вечера пока не объявлена. Оставьте контакт, и мы напишем, когда она появится.</section> : null}

      {done ? <section data-testid="welcome-done" className="space-y-2 rounded-3xl border border-emerald-300/20 bg-emerald-300/[0.06] p-4">
        <div className="flex items-center gap-2 text-[16px] font-bold text-emerald-100"><Check className="h-5 w-5" />Спасибо!</div>
        <p className="text-[14px] leading-6 text-white/80">Мы напишем вам {channel(done.kind)} в течение дня.</p>
      </section> : <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.045] p-4" aria-label="Знакомство">
        <h2 className="text-[16px] font-bold">Хотите прийти?</h2>
        <p className="text-[13px] leading-5 text-white/60">Оставьте имя и контакт. Мы напишем и запишем вас.</p>
        <label className="block text-[12px] text-white/60">Как вас зовут
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} autoComplete="given-name" className="mt-1 min-h-12 w-full rounded-xl border border-white/10 bg-[#202126] px-3 text-[15px] text-white" /></label>
        <div role="radiogroup" aria-label="Где вам удобнее общаться" className="grid grid-cols-3 gap-2">
          {([['telegram', 'Telegram'], ['vk', 'ВКонтакте'], ['phone', 'Телефон']] as const).map(([id, label]) =>
            <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => { setKind(id); setContact(''); }} className={`min-h-11 rounded-xl border px-2 text-[13px] font-semibold ${kind === id ? 'border-white/40 bg-white/15 text-white' : 'border-white/10 text-white/60'}`}>{label}</button>)}
        </div>
        <label className="block text-[12px] text-white/60">{kind === 'telegram' ? 'Ваш ник в Telegram' : kind === 'vk' ? 'Ссылка на вашу страницу ВК' : 'Ваш номер телефона'}
          <input value={contact} onChange={(event) => setContact(event.target.value)} maxLength={120} inputMode={kind === 'phone' ? 'tel' : 'text'} placeholder={PLACEHOLDER[kind]} className="mt-1 min-h-12 w-full rounded-xl border border-white/10 bg-[#202126] px-3 text-[15px] text-white" /></label>
        <label className="block text-[12px] text-white/60">Вас кто-то пригласил? Напишите, кто
          <input value={friend} onChange={(event) => setFriend(event.target.value)} maxLength={60} className="mt-1 min-h-12 w-full rounded-xl border border-white/10 bg-[#202126] px-3 text-[15px] text-white" /></label>
        <input value={trap} onChange={(event) => setTrap(event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0" name="website" />
        {error && <p role="alert" className="text-[13px] text-amber-200">{error}</p>}
        <button type="button" disabled={busy || name.trim().length < 2 || !contact.trim()} onClick={() => void send()} className="min-h-12 w-full rounded-xl bg-white px-4 text-[15px] font-bold text-black disabled:opacity-40">{busy ? 'Отправляем…' : 'Отправить'}</button>
      </section>}

      {evening && <section className="space-y-2 rounded-3xl border border-white/10 bg-white/[0.045] p-4" aria-label="Записаться сразу">
        <h2 className="text-[16px] font-bold">Или запишитесь сразу</h2>
        <p className="text-[13px] leading-5 text-white/60">Через Telegram или ВКонтакте.</p>
        {evening.telegram_url && <a href={evening.telegram_url} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#2688eb] px-4 text-[15px] font-bold text-white"><Send className="h-4 w-4" />Telegram</a>}
        <a href={evening.join_url} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-[15px] font-bold text-white">ВКонтакте</a>
      </section>}

      {data && (data.contacts.length > 0 || data.vk_group || data.telegram_group) && <section className="space-y-2 rounded-3xl border border-white/10 bg-white/[0.045] p-4"><h2 className="flex items-center gap-2 text-[16px] font-bold"><MessageCircle className="h-4 w-4" />Вопросы?</h2>
        <div className="flex flex-wrap gap-2">{data.contacts.map((item) => <a key={item.url} href={item.url} className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-3 text-[13px] font-semibold">Написать в {item.label}</a>)}
          {data.telegram_group && <a href={data.telegram_group} className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-3 text-[13px] font-semibold">Группа новичков в Telegram</a>}
          {data.vk_group && <a href={data.vk_group} className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-3 text-[13px] font-semibold">Группа клуба в ВК</a>}</div></section>}
      {!data && error && <p role="alert" className="text-center text-[13px] text-amber-200">{error}</p>}
    </div>
  </main>;
}
export default WelcomePage;
