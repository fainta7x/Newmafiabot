import { useMemo, useState } from 'react';

type VkPlayerAccessProps = {
  compact?: boolean;
};

const VK_ERROR_MESSAGES: Record<string, string> = {
  vk_callback_invalid: 'VK ID вернул неполный ответ. Начните вход через VK ещё раз.',
  vk_state_expired: 'Сессия входа через VK устарела или уже использована. Начните вход заново.',
  vk_state_browser_mismatch: 'Вход через VK вернулся в другой браузер. Откройте ссылку и завершите вход в одном окне.',
  vk_state_mismatch: 'VK ID вернул неподходящую сессию. Начните вход заново.',
  vk_user_missing: 'VK ID не смог подтвердить аккаунт. Попробуйте войти через VK ещё раз.',
  vk_identity_conflict: 'Этот VK уже связан с другим игровым профилем. Обратитесь к организатору.',
  vk_provider_exchange_failed: 'VK ID не завершил авторизацию. Проверьте вход в VK и попробуйте ещё раз.',
  vk_auth_callback_failed: 'Не удалось завершить вход через VK. Попробуйте ещё раз чуть позже.',
  vk_runtime_origin_missing: 'Вход через VK временно не настроен на сервере. Сообщите организатору.',
  vk_runtime_app_id_invalid: 'VK ID временно недоступен из-за настройки приложения. Сообщите организатору.',
  vk_runtime_https_required: 'VK ID требует защищённый HTTPS-вход. Сообщите организатору.',
  vk_auth_start_rate_limited: 'Слишком много попыток входа через VK. Повторите немного позже.',
};

const safeVkErrorMessage = (value: string | null) => {
  const code = String(value || '').trim();
  if (!code) return null;
  return VK_ERROR_MESSAGES[code] || 'Не удалось завершить вход через VK. Попробуйте ещё раз или сообщите организатору.';
};

const currentPlayerDestination = () => {
  const url = new URL(window.location.href);
  if (url.pathname !== '/player' && !url.pathname.startsWith('/player/')) return '/player';
  ['vk_error', 'vk_link_pending', 'vk_linked', 'vk_link_nickname'].forEach((key) => url.searchParams.delete(key));
  return `${url.pathname}${url.search}${url.hash}` || '/player';
};

export default function VkPlayerAccess({ compact = false }: VkPlayerAccessProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbackError = useMemo(() => {
    return safeVkErrorMessage(new URLSearchParams(window.location.search).get('vk_error'));
  }, []);

  const startVk = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/integrations/player/vk/start', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_to: currentPlayerDestination() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.authorize_url) {
        throw new Error(body?.error || safeVkErrorMessage(body?.code) || 'Не удалось открыть VK ID.');
      }
      window.location.assign(String(body.authorize_url));
    } catch (startError: any) {
      setError(startError?.message || 'Не удалось открыть VK ID.');
      setBusy(false);
    }
  };

  return (
    <section className={compact ? '' : 'mt-5 border-t border-white/10 pt-5'} data-testid="vk-player-access">
      {!compact && <div className="mb-3 text-center text-xs uppercase tracking-[0.14em] text-white/30">или</div>}
      <button
        type="button"
        disabled={busy}
        onClick={() => void startVk()}
        className="min-h-12 w-full rounded-2xl bg-[#2688eb] px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Открываем VK ID…' : 'Продолжить через VK'}
      </button>
      <p className="mt-3 text-xs leading-5 text-white/40">
        Сначала VK ID подтвердит ваш аккаунт. Если профиль уже связан — кабинет откроется сразу. Если нет, после подтверждения вы сможете найти старый профиль или создать новый ник.
      </p>
      {(error || callbackError) && (
        <div className="mt-3 rounded-2xl bg-rose-400/[0.08] px-3 py-3 text-sm leading-5 text-rose-100/80">
          {error || callbackError}
        </div>
      )}
    </section>
  );
}
