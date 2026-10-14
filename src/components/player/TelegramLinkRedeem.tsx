import { useEffect, useState } from 'react';

const QUERY = 'tglink';

/** True when the page was opened from the bot's «Подтвердить через ВКонтакте» link. */
export const hasTelegramLinkCode = () => typeof window !== 'undefined' && Boolean(new URLSearchParams(window.location.search).get(QUERY));

/**
 * «Подтвердить через ВК» (owner, 2026-10-14): the bot sent this link to a Telegram account. Once the player is signed in
 * (VK ID did that) the code attaches that Telegram account to the profile; the result is shown at the top of the page.
 */
export default function TelegramLinkRedeem() {
  const [code] = useState(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(QUERY)));
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/player/telegram-link/redeem', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
        });
        const body = await response.json().catch(() => ({}));
        if (cancelled) return;
        setResult(response.ok
          ? { ok: true, text: `Telegram привязан к профилю «${body?.nickname || ''}». Теперь уведомления будут приходить и в бота.` }
          : { ok: false, text: String(body?.error || 'Не удалось привязать Telegram. Запросите ссылку у бота ещё раз.') });
      } catch {
        if (!cancelled) setResult({ ok: false, text: 'Не удалось привязать Telegram. Проверьте интернет и откройте ссылку ещё раз.' });
      } finally {
        // The code is spent (or dead): it must not stay in the address bar.
        try {
          const next = new URL(window.location.href);
          next.searchParams.delete(QUERY);
          window.history.replaceState(window.history.state, '', `${next.pathname}${next.search}${next.hash}`);
        } catch { /* the address bar is cosmetic */ }
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (!result) return null;
  return <div role="status" data-testid="telegram-link-result" className={`fixed inset-x-0 top-0 z-[80] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] `}>
    <div className={`mx-auto flex max-w-[390px] items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-5 shadow-lg ${result.ok ? 'border-emerald-300/30 bg-emerald-950/90 text-emerald-100' : 'border-rose-300/30 bg-rose-950/90 text-rose-100'}`}>
      <span className="min-w-0 flex-1">{result.text}</span>
      <button type="button" onClick={() => setResult(null)} aria-label="Закрыть" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10">×</button>
    </div>
  </div>;
}
