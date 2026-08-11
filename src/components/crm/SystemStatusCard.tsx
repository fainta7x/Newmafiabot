import React, { useEffect, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Database, RefreshCw, Send, Server } from 'lucide-react';

type StatusData = {
  checked_at: string;
  overall_ok: boolean;
  web: { ok: boolean };
  database: { ok: boolean; latency_ms: number | null; error: string | null };
  bot: { ok: boolean; latency_ms: number | null; error: string | null };
  telegram: { ok: boolean; configured: number; active: number; total: number; error: string | null };
};

const label = (ok: boolean) => ok ? 'Работает' : 'Проблема';

export const SystemStatusCard: React.FC = () => {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => { void load(); }, []);

  const rows = data ? [
    { key: 'web', name: 'Приложение', ok: data.web.ok, icon: Server, detail: 'Web-сервис отвечает' },
    { key: 'db', name: 'База', ok: data.database.ok, icon: Database, detail: data.database.ok ? `${data.database.latency_ms ?? 0} мс` : data.database.error || 'Нет ответа' },
    { key: 'bot', name: 'MafiaBot', ok: data.bot.ok, icon: Bot, detail: data.bot.ok ? `${data.bot.latency_ms ?? 0} мс` : data.bot.error || 'Нет ответа' },
    { key: 'telegram', name: 'Telegram', ok: data.telegram.ok, icon: Send, detail: `${data.telegram.active}/${data.telegram.total} направлений включено` },
  ] : [];

  return (
    <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {data?.overall_ok ? <CheckCircle2 className="h-5 w-5 text-success" /> : <AlertTriangle className="h-5 w-5 text-warning" />}
            <h3 className="text-[14px] font-black text-text-primary">Состояние системы</h3>
          </div>
          <p className="mt-1 text-[10px] leading-4 text-text-muted">Быстрая проверка приложения, бота и Telegram-публикаций.</p>
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

      {data ? <p className="mt-3 text-[9px] text-text-muted">Проверено {new Date(data.checked_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</p> : null}
    </section>
  );
};

export default SystemStatusCard;
