import { useEffect, useMemo, useRef, useState } from 'react';

type VkPlayerAccessProps = {
  compact?: boolean;
};

const VK_ERROR_MESSAGES: Record<string, string> = {
  vk_callback_invalid: 'VK ID вернул неполный ответ. Вход через VK нужно начать ещё раз.',
  vk_state_expired: 'Сессия входа через VK устарела или уже использована. Вход нужно начать заново.',
  vk_state_browser_mismatch: 'Вход через VK вернулся в другой браузер. Начните вход ещё раз.',
  vk_state_mismatch: 'Вход через VK не удался. Вход нужно начать заново.',
  vk_user_missing: 'VK ID не смог подтвердить аккаунт. Можно попробовать войти через VK ещё раз.',
  vk_identity_conflict: 'Этот VK уже связан с другим игровым профилем. Обратитесь к организатору.',
  vk_provider_exchange_failed: 'VK ID не завершил авторизацию. Нужно проверить вход в VK и попробовать ещё раз.',
  vk_auth_callback_failed: 'Не удалось завершить вход через VK. Можно попробовать ещё раз чуть позже.',
  vk_runtime_origin_missing: 'Вход через VK временно не настроен на сервере. Об этом нужно сообщить организатору.',
  vk_runtime_app_id_invalid: 'VK ID временно недоступен из-за настройки приложения. Об этом нужно сообщить организатору.',
  vk_runtime_https_required: 'Вход через VK сейчас не работает. Об этом нужно сообщить организатору.',
  vk_auth_start_rate_limited: 'Слишком много попыток входа через VK. Можно повторить немного позже.',
};

const safeVkErrorMessage = (value: string | null) => {
  const code = String(value || '').trim();
  if (!code) return null;
  return VK_ERROR_MESSAGES[code] || 'Не удалось завершить вход через VK. Можно попробовать ещё раз или сообщить организатору.';
};

const currentPlayerDestination = () => {
  const url = new URL(window.location.href);
  if (url.pathname !== '/player' && !url.pathname.startsWith('/player/')) return '/player';
  ['vk_error', 'vk_link_pending', 'vk_linked', 'vk_link_nickname'].forEach((key) => url.searchParams.delete(key));
  return `${url.pathname}${url.search}${url.hash}` || '/player';
};

/**
 * A VK login started here may finish in another browser (2026-11-20: on iPhones the VK app returns to Safari, not to
 * Telegram). The started login is remembered on this device and this window asks the server every 2 seconds whether it
 * was confirmed; the server gives the session only to the browser that started it.
 */
const PENDING_KEY = 'vk-login-pending:v1';
const PENDING_MS = 30 * 60_000;
const readPending = (): { state: string; at: number } | null => {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null') as { state?: unknown; at?: unknown } | null;
    if (value && typeof value.state === 'string' && typeof value.at === 'number' && Date.now() - value.at < PENDING_MS) return { state: value.state, at: value.at };
  } catch { /* storage blocked */ }
  return null;
};
const clearPending = () => { try { localStorage.removeItem(PENDING_KEY); } catch { /* storage blocked */ } };
const postVk = async (path: string, payload: Record<string, string>) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(path, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.json().catch((error) => {
      if (controller.signal.aborted) throw error;
      return {};
    });
    return { response, body };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Сервер не ответил. Проверьте интернет и попробуйте ещё раз.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
};
type TelegramLinks = { openLink?: (url: string) => void; platform?: string };
const telegramApp = (): TelegramLinks | null => {
  const app = (window as unknown as { Telegram?: { WebApp?: TelegramLinks } }).Telegram?.WebApp;
  return app && app.platform && app.platform !== 'unknown' ? app : null;
};

export default function VkPlayerAccess({ compact = false }: VkPlayerAccessProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Storage only resumes a login after reload. Safari may deny it even though this tab can still finish the handoff.
  const [pending, setPending] = useState(readPending);
  const waiting = pending !== null;
  const pollRef = useRef<number | null>(null);
  const callbackError = useMemo(() => {
    return safeVkErrorMessage(new URLSearchParams(window.location.search).get('vk_error'));
  }, []);

  useEffect(() => {
    if (!pending) return undefined;
    let stopped = false;
    const check = async () => {
      if (Date.now() - pending.at >= PENDING_MS) { clearPending(); setPending(null); setBusy(false); return; }
      try {
        const { body } = await postVk('/api/integrations/player/vk/handoff', { state: pending.state });
        if (stopped) return;
        if (body?.status === 'done') { clearPending(); window.location.replace(String(body.return_to || '/player')); return; }
        // Finished in this browser (another tab got the session): this tab only needs to reload.
        if (body?.status === 'finished') { clearPending(); window.location.reload(); return; }
        if (body?.status === 'error') { clearPending(); setPending(null); setBusy(false); setError(safeVkErrorMessage(body.code)); return; }
        // Another browser that does not hold this login, or it ran out: nothing to wait for here.
        if (body?.status === 'unknown' || body?.status === 'expired') { clearPending(); setPending(null); setBusy(false); return; }
      } catch { /* the next check tries again */ }
      if (!stopped) pollRef.current = window.setTimeout(() => void check(), 2000);
    };
    void check();
    return () => { stopped = true; if (pollRef.current) window.clearTimeout(pollRef.current); };
  }, [pending]);

  const startVk = async () => {
    setBusy(true);
    setError(null);
    // Outside Telegram VK opens in a new tab and this one waits, so the login reaches here wherever VK comes back. The tab
    // is opened now, in the tap, or the browser would block it after the request below.
    const telegram = telegramApp();
    let tab: Window | null = null;
    if (!telegram) { try { tab = window.open('', '_blank'); } catch { tab = null; } }
    try {
      const { response, body } = await postVk('/api/integrations/player/vk/start', { return_to: currentPlayerDestination() });
      if (!response.ok || !body?.authorize_url) {
        throw new Error(body?.error || safeVkErrorMessage(body?.code) || 'Не удалось открыть VK ID.');
      }
      const url = String(body.authorize_url);
      const state = new URL(url).searchParams.get('state') || '';
      const nextPending = state ? { state, at: Date.now() } : null;
      try { if (nextPending) localStorage.setItem(PENDING_KEY, JSON.stringify(nextPending)); } catch { /* storage blocked */ }
      if (telegram?.openLink && nextPending) {
        // Inside Telegram the app stays open and waits: VK opens outside, wherever it comes back, the login reaches here.
        telegram.openLink(url);
        setPending(nextPending);
        return;
      }
      if (tab && !tab.closed && nextPending) {
        tab.location.href = url;
        setPending(nextPending);
        return;
      }
      window.location.assign(url);
    } catch (startError: any) {
      try { tab?.close(); } catch { /* already closed */ }
      clearPending();
      setPending(null);
      setError(startError?.message || 'Не удалось открыть VK ID.');
      setBusy(false);
    }
  };

  if (waiting) {
    return <section className={compact ? '' : 'mt-5 border-t border-white/10 pt-5'} data-testid="vk-player-access-waiting">
      <p className="text-sm leading-6 text-white/80">Подтвердите вход в VK. Потом вернитесь сюда — кабинет откроется сам.</p>
      <button type="button" onClick={() => { clearPending(); setPending(null); setBusy(false); }} className="mt-3 min-h-11 w-full rounded-2xl border border-white/10 px-4 text-sm font-semibold text-white/80">Отменить</button>
    </section>;
  }

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
        Сначала VK ID подтвердит аккаунт. Если профиль уже связан — кабинет откроется сразу. Если нет, после подтверждения можно будет найти старый профиль или создать новый ник.
      </p>
      {(error || callbackError) && (
        <div className="mt-3 rounded-2xl bg-rose-400/[0.08] px-3 py-3 text-sm leading-5 text-rose-100/80">
          {error || callbackError}
        </div>
      )}
    </section>
  );
}
