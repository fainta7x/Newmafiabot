import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Link2, RefreshCw } from 'lucide-react';

type VkDestination = {
  key: string;
  name: string;
  active: boolean;
  supported: boolean;
  reason: string | null;
  configured_url: string | null;
  published: boolean;
  status: string;
  external_url: string | null;
  post_id: number | null;
  last_error: string | null;
};

type VkState = {
  integration: {
    configured: boolean;
    oauth?: { managed_connected: boolean; api_compatible?: boolean; token_source?: string | null };
    mode?: string;
  };
  destinations: VkDestination[];
};

interface Props { eveningId: string; status: string; readonly?: boolean; }

const request = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
  return body;
};

export const EveningVkCard: React.FC<Props> = ({ eveningId, status, readonly }) => {
  const [state, setState] = useState<VkState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (!silent) setBusy('load');
    try {
      setState(await request(`/api/integrations/vk/evenings/${encodeURIComponent(eveningId)}`));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить VK');
    } finally {
      if (!silent) setBusy(null);
    }
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    const connected = url.searchParams.get('vk_connected');
    const oauthError = url.searchParams.get('vk_error');
    if (connected) setMessage('Автопубликация VK подключена.');
    if (oauthError) setError(`VK: ${oauthError}`);
    if (connected || oauthError) {
      url.searchParams.delete('vk_connected');
      url.searchParams.delete('vk_error');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
    void load();
  }, [eveningId]);

  const supported = useMemo(() => state?.destinations.filter((item) => item.active && item.supported) || [], [state]);
  const canPublish = !readonly && ['published', 'active'].includes(status);

  const connectVk = async () => {
    if (busy) return;
    setBusy('connect'); setError(null); setMessage(null);
    try {
      const body = await request('/api/integrations/vk/api-oauth/start', {
        method: 'POST',
        body: JSON.stringify({ return_to: `${window.location.pathname}${window.location.search}${window.location.hash}` }),
      });
      if (!body?.authorize_url) throw new Error('Сервер не вернул ссылку VK API');
      window.location.assign(String(body.authorize_url));
    } catch (err: any) {
      setError(err?.message || 'Не удалось подключить автопубликацию VK');
      setBusy(null);
    }
  };

  const sync = async () => {
    if (busy || !canPublish) return;
    setBusy('sync'); setError(null); setMessage(null);
    try {
      const body = await request(`/api/integrations/vk/evenings/${encodeURIComponent(eveningId)}/sync`, { method: 'POST' });
      if (body?.state) setState(body.state);
      else await load(true);
      const ok = Array.isArray(body?.results) ? body.results.filter((item: any) => item.success && !item.skipped).length : supported.length;
      setMessage(`VK синхронизирован${ok ? `: ${ok} направл.` : ''}`);
    } catch (err: any) {
      setError(err?.message || 'Не удалось синхронизировать VK');
    } finally { setBusy(null); }
  };

  if (!state && busy === 'load') return <section className="rounded-[14px] border border-border-soft bg-surface-2 p-3 text-[11px] text-text-muted"><RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />Загружаем VK…</section>;
  if (!state) return <section className="rounded-[14px] border border-border-soft bg-surface-2 p-3 text-[11px] text-danger">{error || 'VK недоступен'}</section>;

  return (
    <section className="rounded-[14px] border border-border-soft bg-surface-2 p-3">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#2688eb]/10 text-[12px] font-black text-[#2688eb]">VK</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-black text-text-primary">VK · анонс и запись</h3>
          <p className="mt-1 text-[10px] leading-4 text-text-muted">Анонс ведёт на страницу 2LA Noire. Игрок подтверждает себя через VK ID, выбирает ответ — и он сразу попадает в общую БД.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={Boolean(busy)} className="rounded-full bg-surface-1 p-2 text-text-muted disabled:opacity-40" aria-label="Обновить VK"><RefreshCw className={`h-4 w-4 ${busy === 'load' ? 'animate-spin' : ''}`} /></button>
      </div>

      {!state.integration.configured ? (
        <div className="mt-3 rounded-xl bg-warning-soft px-3 py-2.5 text-[10px] leading-4 text-warning">
          <div>Запись игроков через VK ID уже готова. Для автоматической публикации постов нужно отдельно подключить VK API.</div>
          {!readonly ? <button type="button" disabled={Boolean(busy)} onClick={() => void connectVk()} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-[#2688eb] px-3 text-[10px] font-bold text-white disabled:opacity-40"><Link2 className="h-3.5 w-3.5" />{busy === 'connect' ? 'Открываем VK…' : 'Подключить автопубликацию'}</button> : null}
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-success-soft px-3 py-2 text-[10px] leading-4 text-success"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Автопубликация VK подключена. Запись игроков работает через VK ID.</div>
      )}

      <div className="mt-3 space-y-1.5">
        {state.destinations.map((destination) => {
          const openUrl = destination.external_url || destination.configured_url;
          const publicationLabel = destination.key === 'channel' ? 'Сообщение' : 'Пост';
          return <div key={destination.key} className="rounded-xl border border-border-soft bg-surface-1 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`h-4 w-4 shrink-0 ${destination.published ? 'text-success' : 'text-text-muted'}`} />
              <strong className="min-w-0 flex-1 text-[11px] text-text-primary">{destination.name}</strong>
              {openUrl ? <a href={openUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-surface-2 px-2 text-[9px] font-bold text-accent">Открыть <ExternalLink className="h-3 w-3" /></a> : null}
            </div>
            <div className={`mt-1 text-[9px] leading-4 ${destination.last_error ? 'text-danger' : 'text-text-muted'}`}>{destination.last_error || (destination.published ? `${publicationLabel} #${destination.post_id} · ссылка на запись активна` : destination.reason || 'Готово к публикации')}</div>
          </div>;
        })}
      </div>

      {error ? <div className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[10px] leading-4 text-danger">{error}</div> : null}
      {message ? <div className="mt-3 rounded-xl bg-success-soft px-3 py-2 text-[10px] leading-4 text-success">{message}</div> : null}

      <button type="button" disabled={Boolean(busy) || !state.integration.configured || !canPublish} onClick={() => void sync()} className="mt-3 min-h-11 w-full rounded-[12px] bg-accent px-3 text-[11px] font-black text-white disabled:opacity-40">{busy === 'sync' ? 'Синхронизируем…' : 'Синхронизировать VK'}</button>
      {!state.integration.configured ? <p className="mt-2 text-center text-[9px] text-text-muted">Сначала подключи автопубликацию.</p> : null}
      {!canPublish && status === 'draft' ? <p className="mt-2 text-center text-[9px] text-text-muted">Сначала опубликуй вечер.</p> : null}
    </section>
  );
};

export default EveningVkCard;
