import React, { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, Send, TriangleAlert } from 'lucide-react';

type DestinationStatus = {
  id: string;
  name: string;
  active: boolean;
  configured: boolean;
  published: boolean;
  message_id: number | null;
  updated_at: string | null;
};

type StatusPayload = {
  canonical_format: string;
  desired_destination_ids: string[];
  destinations: DestinationStatus[];
};

interface EveningTelegramCardProps {
  eveningId: string;
  embedded?: boolean;
}

const request = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
  return body;
};

export const EveningTelegramCard: React.FC<EveningTelegramCardProps> = ({ eveningId, embedded = false }) => {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    try {
      setData(await request(`/api/telegram-settings/evenings/${encodeURIComponent(eveningId)}`));
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить Telegram-статус');
    }
  };

  useEffect(() => { void load(); }, [eveningId]);

  const sync = async () => {
    if (busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await request(`/api/telegram-settings/actions/sync-evening/${encodeURIComponent(eveningId)}`, { method: 'POST' });
      const actions = Array.isArray(result?.results) ? result.results : [];
      const createdOrEdited = actions.filter((item: any) => item.action === 'created' || item.action === 'edited').length;
      const skipped = actions.filter((item: any) => item.action === 'skipped').length;
      setMessage(createdOrEdited
        ? `Telegram синхронизирован: ${createdOrEdited} публикац.`
        : skipped
          ? 'Нужные Telegram-направления пока не включены в «Ещё → Telegram».'
          : 'Telegram-публикации актуальны.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Не удалось синхронизировать Telegram');
    } finally { setBusy(false); }
  };

  if (!data || (!data.desired_destination_ids.length && !error)) return null;

  return (
    <section className={embedded ? 'rounded-[14px] border border-border-soft bg-surface-2 p-3' : 'rounded-[18px] border border-border-soft bg-surface-1 p-4'}>
      <div className="flex items-start gap-3">
        <span className={`grid shrink-0 place-items-center rounded-xl bg-accent-soft text-accent ${embedded ? 'h-9 w-9' : 'h-10 w-10'}`}><Send className="h-4.5 w-4.5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-black text-text-primary">Публикация в канал</h3>
          <p className="mt-1 text-[10px] leading-4 text-text-muted">Анонс вечера синхронизируется с включёнными Telegram-направлениями.</p>
        </div>
      </div>

      {data?.destinations?.length ? <div className="mt-3 space-y-1.5">
        {data.destinations.map((destination) => {
          const ready = destination.active && destination.configured;
          return <div key={destination.id} className="flex min-h-[38px] items-center gap-2 rounded-xl border border-border-soft bg-surface-1 px-3 text-[11px]">
            {destination.published ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : ready ? <RefreshCw className="h-4 w-4 shrink-0 text-accent" /> : <TriangleAlert className="h-4 w-4 shrink-0 text-warning" />}
            <span className="min-w-0 flex-1 font-bold text-text-primary">{destination.name}</span>
            <span className="shrink-0 text-[9px] text-text-muted">{destination.published ? `#${destination.message_id}` : ready ? 'готово' : 'не настроено'}</span>
          </div>;
        })}
      </div> : null}

      {message ? <p className="mt-3 rounded-xl bg-success-soft px-3 py-2 text-[10px] text-success">{message}</p> : null}
      {error ? <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[10px] text-danger">{error}</p> : null}

      <button type="button" disabled={busy} onClick={() => void sync()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border-soft bg-surface-1 text-[11px] font-bold text-text-primary disabled:opacity-50">
        <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> {busy ? 'Синхронизируем…' : 'Синхронизировать'}
      </button>
    </section>
  );
};

export default EveningTelegramCard;
