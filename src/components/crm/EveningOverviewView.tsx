import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Play, RefreshCw, Settings2 } from 'lucide-react';
import { api, type EveningParticipant, type GameEvening } from '../../lib/api.ts';
import EveningAnnouncementSettings from './EveningAnnouncementSettings.tsx';
import EveningPersonalInvites from './EveningPersonalInvites.tsx';

interface EveningOverviewViewProps {
  eveningId: string;
  onStatusChange?: () => void;
  /** The route above already offers «Опубликовать» / «Начать вечер». */
  hideStatusActions?: boolean;
}

type EveningData = GameEvening & {
  participants?: EveningParticipant[];
  games?: Array<{ id: number | string; status?: string | null; protocol_status?: string | null; winner_team?: string | null }>;
};


export const EveningOverviewView: React.FC<EveningOverviewViewProps> = ({ eveningId, onStatusChange, hideStatusActions = false }) => {
  const [evening, setEvening] = useState<EveningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showAnnouncementSettings, setShowAnnouncementSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setEvening(await api.getEvening(eveningId) as EveningData);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить вечер');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [eveningId]);

  const updateStatus = async (status: 'published' | 'active') => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.updateEvening(eveningId, { status });
      setEvening((current) => current ? { ...current, ...updated } : current);
      setMessage(status === 'published' ? 'Вечер опубликован.' : 'Вечер переведён в активный режим.');
      onStatusChange?.();
    } catch (err: any) {
      setError(err?.message || 'Не удалось изменить статус вечера');
    } finally {
      setBusy(false);
    }
  };

  // Re-evaluated every minute so «Начать вечер» turns primary once the evening is near.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (evening?.status !== 'published') return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [evening?.status]);

  if (loading) return <div className="flex min-h-[45vh] items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-accent" /></div>;
  if (!evening) return <div className="rounded-[18px] border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger">{error || 'Вечер не найден'}</div>;

  const readonly = evening.status === 'completed' || Boolean(evening.settled_at);

  return (
    <div className="space-y-3.5 pb-4">
      {(!hideStatusActions && !readonly && ['draft', 'published'].includes(evening.status)) || message || error ? <section className="rounded-[20px] border border-border-soft bg-surface-1 p-4">
        {!hideStatusActions && !readonly && evening.status !== 'cancelled' ? <div>
          {evening.status === 'draft' ? <button disabled={busy} onClick={() => void updateStatus('published')} className="min-h-[46px] w-full rounded-[12px] bg-accent text-[12px] font-bold text-white disabled:opacity-50">Опубликовать вечер</button> : null}
          {evening.status === 'published' ? (() => {
            // Days ahead, starting is not the next step: keep the button available but quiet.
            const hoursToStart = (new Date(evening.starts_at).getTime() - clock) / 3_600_000;
            const early = hoursToStart > 3;
            // Calendar days in Moscow: an evening tomorrow at 19:00 is «завтра», not «через 2 дня».
            const moscowDay = (value: number) => Date.parse(`${new Date(value).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' })}T00:00:00Z`);
            const days = Math.round((moscowDay(new Date(evening.starts_at).getTime()) - moscowDay(clock)) / 86_400_000);
            const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'день' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'дня' : 'дней');
            return <>
              {early ? <p className="mb-2 text-[12px] leading-4 text-text-secondary">{days === 1 ? 'Вечер завтра' : days > 1 ? `Вечер через ${days} ${plural(days)}` : `Вечер через ${Math.round(hoursToStart)} ч`} — «Начать вечер» нажимают в день вечера, когда игроки собираются.</p> : null}
              <button disabled={busy} onClick={() => void updateStatus('active')} className={`inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[12px] text-[13px] font-bold disabled:opacity-50 ${early ? 'border border-border-soft bg-surface-2 text-text-secondary' : 'bg-success text-white'}`}><Play className="h-4 w-4" /> Начать вечер</button>
            </>;
          })() : null}
        </div> : null}
        {message ? <p className="mt-3 rounded-[12px] bg-success-soft px-3 py-2 text-[11px] text-success">{message}</p> : null}
        {error ? <p className="mt-3 rounded-[12px] bg-danger-soft px-3 py-2 text-[11px] text-danger">{error}</p> : null}
      </section> : null}


      <EveningPersonalInvites eveningId={eveningId} />

      <section className="overflow-hidden rounded-[16px] border border-border-soft bg-surface-1">
        <button
          type="button"
          onClick={() => setShowAnnouncementSettings((value) => !value)}
          aria-expanded={showAnnouncementSettings}
          className="flex min-h-[54px] w-full items-center justify-between gap-3 px-3.5 text-left"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-text-secondary"><Settings2 className="h-4 w-4" /></span>
            <span className="min-w-0">
              <strong className="block text-[12px] text-text-primary">Настройки анонса и рассылки</strong>
              <span className="mt-0.5 block text-[10px] leading-4 text-text-muted">Telegram и VK. Обычно сюда заходить не нужно после публикации.</span>
            </span>
          </span>
          {showAnnouncementSettings ? <ChevronUp className="h-4 w-4 shrink-0 text-text-muted" /> : <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />}
        </button>
        {showAnnouncementSettings ? <div className="border-t border-border-soft p-3">
          <EveningAnnouncementSettings eveningId={eveningId} status={evening.status} readonly={readonly} />
        </div> : null}
      </section>
    </div>
  );
};

export default EveningOverviewView;
