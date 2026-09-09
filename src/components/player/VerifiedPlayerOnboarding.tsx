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

export default function VerifiedPlayerOnboarding({ canOpenAdmin = false }: { canOpenAdmin?: boolean }) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [flow, setFlow] = useState<Flow>('choice');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingText, setPendingText] = useState('');

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
        setPendingText('Мы отправили подтверждение владельцу существующего профиля. После подтверждения вход будет связан с этим профилем.');
      } else {
        setPendingText('Запрос на связь с существующим профилем отправлен организатору. Новый дубликат игрока не создавался.');
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
          <h1 className="mt-3 text-2xl font-semibold">Войти в кабинет игрока</h1>
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
          <h1 className="mt-3 text-2xl font-semibold">Ждём подтверждение профиля</h1>
          <p className="mt-3 text-sm leading-6 text-white/55">{pendingText}</p>
          <a href="/player" className="mt-5 block min-h-12 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-center text-sm font-medium text-white/80">Вернуться к входу</a>
        </div>
      </main>
    );
  }

  const platform = channelLabel(status.platform);
  const choosingNickname = flow === 'new' || flow === 'existing';

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
