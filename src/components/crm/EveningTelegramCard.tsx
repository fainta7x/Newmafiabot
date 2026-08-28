import React, { useEffect, useState } from 'react';
import { CheckCircle2, Megaphone, RefreshCw, Send, TriangleAlert } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';

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

type RecruitmentState = {
  target_players: number;
  confirmed_players: number;
  needed_players: number;
  unanswered_players: number;
  thinking_players: number;
  can_recruit: boolean;
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
  const [recruitment, setRecruitment] = useState<RecruitmentState | null>(null);
  const [busy, setBusy] = useState<'sync' | 'recruit' | null>(null);
  const [confirmRecruit, setConfirmRecruit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    try {
      const [telegram, recruiting] = await Promise.all([
        request(`/api/telegram-settings/evenings/${encodeURIComponent(eveningId)}`),
        request(`/api/evenings/${encodeURIComponent(eveningId)}/recruitment-state`),
      ]);
      setData(telegram);
      setRecruitment(recruiting);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить Telegram-статус');
    }
  };

  useEffect(() => { void load(); }, [eveningId]);

  const sync = async () => {
    if (busy) return;
    setBusy('sync'); setError(null); setMessage(null);
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
    } finally { setBusy(null); }
  };

  const recruit = async () => {
    if (busy || !recruitment?.can_recruit) return;
    setConfirmRecruit(false);
    setBusy('recruit'); setError(null); setMessage(null);
    try {
      const result = await request(`/api/evenings/${encodeURIComponent(eveningId)}/announce-group`, { method: 'POST' });
      const sent = Number(result?.sent || 0);
      setMessage(sent > 0
        ? `Короткий анонс о доборе отправлен${sent > 1 ? ` в ${sent} Telegram-направления` : ''}.`
        : 'Добирающий анонс отправлен.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Не удалось отправить добирающий анонс');
    } finally { setBusy(null); }
  };

  if (!data || (!data.desired_destination_ids.length && !error)) return null;

  return (
    <section className={embedded ? 'rounded-[14px] border border-border-soft bg-surface-2 p-3' : 'rounded-[18px] border border-border-soft bg-surface-1 p-4'}>
      <div className="flex items-start gap-3">
        <span className={`grid shrink-0 place-items-center rounded-xl bg-accent-soft text-accent ${embedded ? 'h-9 w-9' : 'h-10 w-10'}`}><Send className="h-4.5 w-4.5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-black text-text-primary">Публикация в канал</h3>
          <p className="mt-1 text-[10px] leading-4 text-text-muted">Основной анонс и быстрый добор используют те же Telegram-направления.</p>
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

      {recruitment ? <div className={`mt-3 rounded-xl border px-3 py-3 ${recruitment.needed_players > 0 ? 'border-warning/30 bg-warning-soft' : 'border-success/30 bg-success-soft'}`}>
        <div className="flex items-center gap-2">
          <Megaphone className={`h-4 w-4 ${recruitment.needed_players > 0 ? 'text-warning' : 'text-success'}`} />
          <strong className="text-[11px] text-text-primary">{recruitment.needed_players > 0 ? 'Добор на вечер' : 'Состав набран'}</strong>
        </div>
        <p className="mt-1.5 text-[10px] leading-4 text-text-secondary">
          {recruitment.needed_players > 0
            ? `Подтвердили ${recruitment.confirmed_players} из ${recruitment.target_players}. Не хватает ${recruitment.needed_players}.`
            : `Подтвердили ${recruitment.confirmed_players} игроков — короткий добирающий анонс не нужен.`}
        </p>
        {recruitment.can_recruit ? <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => setConfirmRecruit(true)}
          className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-warning px-3 text-[11px] font-bold text-black disabled:opacity-50"
        >
          <Megaphone className="h-4 w-4" />
          {busy === 'recruit' ? 'Публикуем…' : `Позвать в общий чат · нужно ${recruitment.needed_players}`}
        </button> : null}
      </div> : null}

      {message ? <p className="mt-3 rounded-xl bg-success-soft px-3 py-2 text-[10px] text-success">{message}</p> : null}
      {error ? <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[10px] text-danger">{error}</p> : null}

      <button type="button" disabled={Boolean(busy)} onClick={() => void sync()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border-soft bg-surface-1 text-[11px] font-bold text-text-primary disabled:opacity-50">
        <RefreshCw className={`h-4 w-4 ${busy === 'sync' ? 'animate-spin' : ''}`} /> {busy === 'sync' ? 'Синхронизируем…' : 'Синхронизировать основной анонс'}
      </button>

      <ConfirmDialog
        open={confirmRecruit}
        title="Дать короткий анонс о доборе?"
        description={`В общий Telegram уйдёт отдельное короткое сообщение: до полного стола не хватает ${recruitment?.needed_players || 0}. Основной анонс вечера не изменится.`}
        confirmLabel="Опубликовать"
        busy={busy === 'recruit'}
        onCancel={() => setConfirmRecruit(false)}
        onConfirm={() => void recruit()}
      />
    </section>
  );
};

export default EveningTelegramCard;
