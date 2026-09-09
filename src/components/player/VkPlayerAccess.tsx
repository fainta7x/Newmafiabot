import { useMemo, useState } from 'react';

type VkPlayerAccessProps = {
  initialNickname?: string;
  compact?: boolean;
};

const currentPlayerDestination = () => {
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return path.startsWith('/player') ? path : '/player';
};

export default function VkPlayerAccess({ initialNickname = '', compact = false }: VkPlayerAccessProps) {
  const [nickname, setNickname] = useState(initialNickname);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbackError = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get('vk_error');
    return value ? String(value).slice(0, 240) : null;
  }, []);

  const startVk = async () => {
    const value = nickname.trim().replace(/\s+/g, ' ');
    if (!value) {
      setError('Введите игровой ник, чтобы безопасно сопоставить профиль.');
      return;
    }
    if (value.length > 60) {
      setError('Игровой ник не должен быть длиннее 60 символов.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/integrations/player/vk/start', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: value, return_to: currentPlayerDestination() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.authorize_url) throw new Error(body?.error || 'Не удалось открыть VK ID.');
      window.location.assign(String(body.authorize_url));
    } catch (startError: any) {
      setError(startError?.message || 'Не удалось открыть VK ID.');
      setBusy(false);
    }
  };

  return (
    <section className={compact ? '' : 'mt-5 border-t border-white/10 pt-5'} data-testid="vk-player-access">
      {!compact && <div className="mb-3 text-center text-xs uppercase tracking-[0.14em] text-white/30">или</div>}
      <label className="block text-xs font-medium uppercase tracking-[0.14em] text-white/35">Игровой ник</label>
      <input
        value={nickname}
        onChange={(event) => setNickname(event.target.value)}
        maxLength={60}
        autoComplete="nickname"
        placeholder="Ваш ник в 2LA Noire"
        className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-base text-white outline-none placeholder:text-white/20 focus:border-white/25"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => void startVk()}
        className="mt-3 min-h-12 w-full rounded-2xl bg-[#2688eb] px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Открываем VK ID…' : 'Войти через VK'}
      </button>
      <p className="mt-3 text-xs leading-5 text-white/40">
        VK используется только для подтверждения вашей личности. Если профиль с таким ником уже существует, приложение не создаст дубликат без подтверждения связи.
      </p>
      {(error || callbackError) && (
        <div className="mt-3 rounded-2xl bg-rose-400/[0.08] px-3 py-3 text-sm leading-5 text-rose-100/80">
          {error || callbackError}
        </div>
      )}
    </section>
  );
}
