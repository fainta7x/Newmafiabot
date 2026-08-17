import React, { useEffect, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Database, Globe2, RefreshCw, Send, Server } from 'lucide-react';

type StatusData = {
  checked_at: string;
  overall_ok: boolean;
  web: { ok: boolean };
  database: { ok: boolean; latency_ms: number | null; error: string | null };
  bot: { ok: boolean; latency_ms: number | null; error: string | null };
  telegram: { ok: boolean; configured: number; active: number; total: number; error: string | null };
  sync_queue: {
    ok: boolean;
    pending: number;
    retrying: number;
    last_attempt_at: string | null;
    next_attempt_at: string | null;
    last_error: string | null;
  };
};

type VkRuntimeHealth = {
  ok: boolean;
  checked_at: string;
  vk: {
    configured: boolean;
    reachable: boolean;
    group_id: string | null;
    group_name: string | null;
    screen_name: string | null;
    token_source: string | null;
    api_version: string;
    error: string | null;
  };
  oauth: {
    connected: boolean;
    api_compatible: boolean;
    token_source: string | null;
    user_id: string | null;
    expires_at: string | null;
  };
  callback: {
    configured: boolean;
    status: string;
    group_id: string | null;
    server_id: number | null;
    callback_url: string | null;
    last_error: string | null;
    updated_at: string | null;
  };
};

const label = (ok: boolean) => ok ? 'Работает' : 'Проблема';

const queueDetail = (queue: StatusData['sync_queue']) => {
  if (queue.retrying > 0) {
    const retryAt = queue.next_attempt_at
      ? ` · повтор ${new Date(queue.next_attempt_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
      : '';
    return `${queue.retrying} на повторе${retryAt}${queue.last_error ? ` · ${queue.last_error}` : ''}`;
  }
  if (queue.pending > 0) return `${queue.pending} ждут отправки`;
  return 'Очередь пуста';
};

const vkDetail = (data: VkRuntimeHealth) => {
  const parts: string[] = [];
  if (data.vk.group_name) parts.push(data.vk.group_name);
  else if (data.vk.group_id) parts.push(`сообщество ${data.vk.group_id}`);
  if (!data.vk.configured) parts.push('нет токена');
  else if (!data.vk.reachable) parts.push(data.vk.error || 'VK API недоступен');
  if (!data.callback.configured) parts.push(data.callback.last_error || `Callback: ${data.callback.status}`);
  return parts.join(' · ') || 'VK проверен';
};

export const SystemStatusCard: React.FC = () => {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vkData, setVkData] = useState<VkRuntimeHealth | null>(null);
  const [vkLoading, setVkLoading] = useState(false);
  const [vkError, setVkError] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/system-status', { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось проверить систему');
      setData(body as StatusData);
    } catch (err: any) {
      setError(err?.message || 'Не удалось проверить систему');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const checkVk = async () => {
    if (vkLoading) return;
    setVkLoading(true);
    setVkError(null);
    try {
      const response = await fetch('/api/integrations/vk/runtime-health', {
        method: 'POST',
        credentials: 'include',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось проверить VK');
      setVkData(body as VkRuntimeHealth);
    } catch (err: any) {
      setVkError(err?.message || 'Не удалось проверить VK');
    } finally {
      setVkLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const rows = data ? [
    { key: 'web', name: 'Приложение', ok: data.web.ok, icon: Server, detail: 'Web-сервис отвечает' },
    { key: 'db', name: 'База', ok: data.database.ok, icon: Database, detail: data.database.ok ? `${data.database.latency_ms ?? 0} мс` : data.database.error || 'Нет ответа' },
    { key: 'bot', name: 'MafiaBot', ok: data.bot.ok, icon: Bot, detail: data.bot.ok ? `${data.bot.latency_ms ?? 0} мс` : data.bot.error || 'Нет ответа' },
    { key: 'telegram', name: 'Telegram', ok: data.telegram.ok, icon: Send, detail: `${data.telegram.active}/${data.telegram.total} направлений включено` },
    { key: 'sync', name: 'Синхронизация', ok: data.sync_queue.ok, icon: RefreshCw, detail: queueDetail(data.sync_queue) },
  ] : [];

  return (
    <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {data?.overall_ok ? <CheckCircle2 className="h-5 w-5 text-success" /> : <AlertTriangle className="h-5 w-5 text-warning" />}
            <h3 className="text-[14px] font-black text-text-primary">Состояние системы</h3>
          </div>
          <p className="mt-1 text-[10px] leading-4 text-text-muted">Приложение, база, бот, Telegram и очередь синхронизации.</p>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={loading} className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-text-muted disabled:opacity-40" aria-label="Обновить статус"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      {error ? <div className="mt-3 rounded-[11px] bg-danger-soft px-3 py-2 text-[11px] text-danger">{error}</div> : null}
      {loading && !data ? <div className="mt-4 text-[11px] text-text-muted">Проверяем сервисы…</div> : null}

      {data ? <div className="mt-4 grid grid-cols-2 gap-2">
        {rows.map(({ key, name, ok, icon: Icon, detail }) => <div key={key} className={`rounded-[13px] border p-3 ${ok ? 'border-border-soft bg-surface-2' : 'border-warning/30 bg-warning-soft'}`}>
          <div className="flex items-center gap-2"><Icon className={`h-4 w-4 ${ok ? 'text-success' : 'text-warning'}`} /><strong className="text-[11px] text-text-primary">{name}</strong></div>
          <div className={`mt-2 text-[12px] font-black ${ok ? 'text-success' : 'text-warning'}`}>{label(ok)}</div>
          <div className="mt-0.5 line-clamp-2 text-[9px] leading-3 text-text-muted">{detail}</div>
        </div>)}
      </div> : null}

      <div className="mt-3 rounded-[13px] border border-border-soft bg-surface-2 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><Globe2 className={`h-4 w-4 ${vkData?.ok ? 'text-success' : 'text-text-muted'}`} /><strong className="text-[11px] text-text-primary">VK</strong></div>
            {vkData ? <div className={`mt-1 text-[11px] font-black ${vkData.ok ? 'text-success' : vkData.vk.reachable ? 'text-warning' : 'text-danger'}`}>{vkData.ok ? 'Работает' : vkData.vk.reachable ? 'Частично' : 'Проблема'}</div> : <div className="mt-1 text-[9px] text-text-muted">Без публикаций и сообщений</div>}
          </div>
          <button
            type="button"
            onClick={() => void checkVk()}
            disabled={vkLoading}
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-border-soft bg-surface-1 px-3 text-[10px] font-bold text-text-primary disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${vkLoading ? 'animate-spin' : ''}`} /> Проверить VK
          </button>
        </div>
        {vkData ? <div className="mt-2 text-[9px] leading-4 text-text-muted">{vkDetail(vkData)}</div> : null}
        {vkError ? <div className="mt-2 text-[9px] leading-4 text-danger">{vkError}</div> : null}
      </div>

      {data ? <p className="mt-3 text-[9px] text-text-muted">Проверено {new Date(data.checked_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</p> : null}
    </section>
  );
};

export default SystemStatusCard;