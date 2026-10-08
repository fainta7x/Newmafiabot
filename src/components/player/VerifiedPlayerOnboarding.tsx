import { useEffect, useState } from 'react';
import VkPlayerAccess from './VkPlayerAccess.tsx';

type OnboardingStatus = {
  active: boolean;
  platform?: 'telegram' | 'vk';
  return_to?: string;
  display_name?: string | null;
  username?: string | null;
};

type Flow = 'choice' | 'new' | 'existing' | 'pending';

const channelLabel = (platform?: 'telegram' | 'vk') => platform === 'vk' ? 'VK' : 'Telegram';

// «Ссылка для привязки» (owner, 2026-09-30): /player?claim=<code> from the organizer.
const CLAIM_STORAGE_KEY = 'player_claim_code';
const readClaimCode = () => {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('claim');
    if (fromUrl) { window.sessionStorage.setItem(CLAIM_STORAGE_KEY, fromUrl); return fromUrl; }
    return window.sessionStorage.getItem(CLAIM_STORAGE_KEY);
  } catch {
    return new URLSearchParams(window.location.search).get('claim');
  }
};
const forgetClaimCode = () => { try { window.sessionStorage.removeItem(CLAIM_STORAGE_KEY); } catch { /* storage may be off */ } };

export default function VerifiedPlayerOnboarding({ canOpenAdmin = false }: { canOpenAdmin?: boolean }) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [flow, setFlow] = useState<Flow>('choice');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingText, setPendingText] = useState('');
  const [claimCode] = useState(() => readClaimCode());
  const [claim, setClaim] = useState<{ nickname?: string; error?: string } | null>(null);
  const [claimDeclined, setClaimDeclined] = useState(false);

  useEffect(() => {
    if (!claimCode) return;
    let active = true;
    void fetch(`/api/auth/claim/${encodeURIComponent(claimCode)}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (active) setClaim(response.ok ? { nickname: String(body.nickname || '') } : { error: String(body.error || 'Ссылка недоступна') });
      })
      .catch(() => { if (active) setClaim({ error: 'Не удалось проверить ссылку' }); });
    return () => { active = false; };
  }, [claimCode]);

  const acceptClaim = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/onboarding/claim', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: claimCode }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось привязать профиль');
      forgetClaimCode();
      const next = new URL(String(body?.return_to || '/player'), window.location.origin);
      next.searchParams.delete('claim');
      window.location.assign(`${next.pathname}${next.search}${next.hash}`);
    } catch (claimError: any) {
      setError(claimError?.message || 'Не удалось привязать профиль');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    void fetch('/api/auth/onboarding', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({ active: false }));
        if (!active) return;
        setStatus(response.ok ? body : { active: false });
      })
      .catch(() => { if (active) setStatus({ active: false }); });
    return () => { active = false; };
  }, []);

  const submit = async (kind: 'new' | 'existing') => {
    const value = nickname.trim().replace(/\s+/g, ' ');
    if (!value) {
      setError(kind === 'new' ? 'Придумайте игровой ник.' : 'Введите ник, под которым вы уже играли.');
      return;
    }
    if (value.length > 60) {
      setError('Игровой ник не должен быть длиннее 60 символов.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/auth/onboarding/${kind}`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: value }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось завершить регистрацию.');
      if (body?.status === 'linked' || body?.status === 'created') {
        window.location.assign(String(body?.return_to || '/player'));
        return;
      }
      if (body?.status === 'private_confirmation') {
        // Compatibility for requests issued before the new organizer-review
        // fallback was deployed. State the exact channel instead of implying
        // that the approval appears in the current browser.
        setPendingText('Подтверждение пришло в личный чат Telegram-бота того аккаунта, который уже связан с этим игровым профилем. Оно не приходит в VK. Если нет доступа к тому Telegram, свяжитесь с организатором клуба.');
      } else {
        setPendingText(body?.private_confirmation_sent
          ? 'Заявка на привязку VK отправлена организатору в CRM. Дополнительно в личный чат Telegram-бота старого профиля отправлена кнопка подтверждения. Достаточно одного из этих способов.'
          : 'Заявка на привязку отправлена организатору клуба в CRM. Организатор должен проверить, что это ваш профиль, и нажать «Подтвердить». Дубликат профиля не создавался.');
      }
      setFlow('pending');
    } catch (submitError: any) {
      setError(submitError?.message || 'Не удалось завершить регистрацию.');
    } finally {
      setBusy(false);
    }
  };

  if (status === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090a0d] px-4 py-8 text-white">
        <div className="text-sm text-white/45">Проверяем подтверждённый аккаунт…</div>
      </main>
    );
  }

  if (!status.active) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090a0d] px-4 py-8 text-white">
        <div className="w-full max-w-[390px] rounded-3xl border border-white/10 bg-white/[0.045] p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-white/35">2LA Noire</div>
          <h1 className="mt-3 text-2xl font-semibold">{claim?.nickname ? `Ваш профиль «${claim.nickname}»` : 'Войти в кабинет игрока'}</h1>
          {claim?.nickname ? <p className="mt-2 rounded-2xl border border-emerald-200/15 bg-emerald-300/[0.06] px-3 py-3 text-sm leading-6 text-emerald-50/80" data-testid="claim-signin-hint">Организатор клуба приготовил для вас профиль. Войдите через VK кнопкой ниже — и он станет вашим. В Telegram просто откройте ссылку из сообщения организатора.</p> : null}
          {claim?.error ? <p className="mt-2 rounded-2xl bg-rose-400/[0.08] px-3 py-3 text-sm leading-5 text-rose-100/80">{claim.error}</p> : null}
          <p className="mt-2 text-sm leading-6 text-white/50">
            Сначала подтвердите аккаунт. Если вы уже связаны с игровым профилем, кабинет откроется сразу. Новый ник понадобится только при создании нового профиля.
          </p>
          <div className="mt-5"><VkPlayerAccess compact /></div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-xs leading-5 text-white/45">
            В Telegram подтверждение выполняется автоматически при открытии Mini App. В VK используйте кнопку выше.
          </div>
          {canOpenAdmin && <a href="/admin" className="mt-4 block text-center text-xs text-white/35">Открыть панель организатора</a>}
        </div>
      </main>
    );
  }

  if (flow === 'pending') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090a0d] px-4 py-8 text-white">
        <div className="w-full max-w-[390px] rounded-3xl border border-white/10 bg-white/[0.045] p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-emerald-200/50">Аккаунт подтверждён</div>
          <h1 className="mt-3 text-2xl font-semibold">Ожидаем привязку игрового профиля</h1>
          <p className="mt-3 text-sm leading-6 text-white/70">{pendingText}</p>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 text-xs leading-5 text-white/60">
            <strong className="block text-white/80">Что делать дальше?</strong>
            Попросите организатора открыть «Управление → Игроки → ваш профиль → Привязка профиля» или проверить «Запросы на привязку» в главной панели CRM. После подтверждения снова войдите через тот же {channelLabel(status.platform)}.
          </div>
          <a href="/player" className="mt-5 block min-h-12 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-center text-sm font-medium text-white/80">Вернуться ко входу</a>
        </div>
      </main>
    );
  }

  const platform = channelLabel(status.platform);
  const choosingNickname = flow === 'new' || flow === 'existing';

  if (claim && !claimDeclined && flow === 'choice') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090a0d] px-4 py-8 text-white">
        <div className="w-full max-w-[390px] rounded-3xl border border-white/10 bg-white/[0.045] p-5" data-testid="claim-onboarding">
          <div className="text-xs uppercase tracking-[0.2em] text-emerald-200/50">{platform} подтверждён</div>
          {claim.nickname ? <>
            <h1 className="mt-3 text-2xl font-semibold">Это ваш профиль «{claim.nickname}»?</h1>
            <p className="mt-2 text-sm leading-6 text-white/50">Организатор клуба приготовил его для вас: игры, визиты и жетоны уже там. Нажмите «Да» — и он будет связан с вашим {platform}.</p>
            {error && <div className="mt-3 rounded-2xl bg-rose-400/[0.08] px-3 py-3 text-sm leading-5 text-rose-100/80">{error}</div>}
            <button type="button" disabled={busy} onClick={() => void acceptClaim()} className="mt-5 min-h-12 w-full rounded-2xl bg-white px-4 text-sm font-semibold text-black disabled:opacity-50">{busy ? 'Привязываем…' : 'Да, это я'}</button>
          </> : <>
            <h1 className="mt-3 text-2xl font-semibold">Ссылка не сработала</h1>
            <p className="mt-2 rounded-2xl bg-rose-400/[0.08] px-3 py-3 text-sm leading-5 text-rose-100/80">{claim.error}</p>
          </>}
          <button type="button" disabled={busy} onClick={() => { setClaimDeclined(true); forgetClaimCode(); }} className="mt-3 min-h-12 w-full rounded-2xl border border-white/12 bg-white/[0.06] px-4 text-sm font-semibold text-white">{claim.nickname ? 'Нет, это не мой профиль' : 'Продолжить без ссылки'}</button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090a0d] px-4 py-8 text-white">
      <div className="w-full max-w-[390px] rounded-3xl border border-white/10 bg-white/[0.045] p-5" data-testid="verified-player-onboarding">
        <div className="text-xs uppercase tracking-[0.2em] text-emerald-200/50">{platform} подтверждён</div>
        <h1 className="mt-3 text-2xl font-semibold">{choosingNickname ? (flow === 'new' ? 'Создать игровой профиль' : 'Найти мой профиль') : 'Вы уже играли в 2LA Noire?'}</h1>
        {!choosingNickname ? (
          <>
            <p className="mt-2 text-sm leading-6 text-white/50">
              Выберите подходящий вариант. Мы не объединяем профили только по совпадению ника.
            </p>
            <button type="button" onClick={() => { setFlow('existing'); setError(null); }} className="mt-5 min-h-12 w-full rounded-2xl bg-white px-4 text-sm font-semibold text-black">
              Я уже играл в клубе
            </button>
            <button type="button" onClick={() => { setFlow('new'); setError(null); }} className="mt-3 min-h-12 w-full rounded-2xl border border-white/12 bg-white/[0.06] px-4 text-sm font-semibold text-white">
              Я новый игрок
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-white/50">
              {flow === 'new'
                ? 'Придумайте ник, под которым будете отображаться в играх, рейтингах и турнирах.'
                : 'Введите точный ник, под которым вы уже играли. Связь будет подтверждена безопасно — одного совпадения ника недостаточно.'}
            </p>
            <label className="mt-5 block text-xs font-medium uppercase tracking-[0.14em] text-white/35">Игровой ник</label>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={60}
              autoFocus
              autoComplete="nickname"
              placeholder={flow === 'new' ? 'Придумайте ник' : 'Ваш существующий ник'}
              className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-base text-white outline-none placeholder:text-white/20 focus:border-white/25"
            />
            {error && <div className="mt-3 rounded-2xl bg-rose-400/[0.08] px-3 py-3 text-sm leading-5 text-rose-100/80">{error}</div>}
            <button type="button" disabled={busy} onClick={() => void submit(flow)} className="mt-4 min-h-12 w-full rounded-2xl bg-white px-4 text-sm font-semibold text-black disabled:opacity-50">
              {busy ? 'Проверяем…' : flow === 'new' ? 'Создать профиль' : 'Продолжить'}
            </button>
            <button type="button" disabled={busy} onClick={() => { setFlow('choice'); setNickname(''); setError(null); }} className="mt-2 min-h-10 w-full text-sm text-white/45">
              Назад
            </button>
          </>
        )}
      </div>
    </main>
  );
}
