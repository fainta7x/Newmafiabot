import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Play, RefreshCw, Settings2 } from 'lucide-react';
import { api, type EveningParticipant, type GameEvening } from '../../lib/api.ts';
import EveningAnnouncementPanel from './EveningAnnouncementPanel.tsx';
import EveningPersonalInvites from './EveningPersonalInvites.tsx';

interface EveningOverviewViewProps {
  eveningId: string;
  onBack: () => void;
  onOpenSection: (section: 'participants' | 'management' | 'games') => void;
}

type EveningData = GameEvening & {
  participants?: EveningParticipant[];
  games?: Array<{ id: number | string; status?: string | null; protocol_status?: string | null; winner_team?: string | null }>;
};

const statusLabel: Record<string, string> = {
  draft: 'Черновик',
  published: 'Опубликован',
  active: 'Идёт сейчас',
  completed: 'Завершён',
  cancelled: 'Отменён',
};

export const EveningOverviewView: React.FC<EveningOverviewViewProps> = ({ eveningId, onBack }) => {
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
    } catch (err: any) {
      setError(err?.message || 'Не удалось изменить статус вечера');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex min-h-[45vh] items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-accent" /></div>;
  if (!evening) return <div className="rounded-[18px] border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger">{error || 'Вечер не найден'}</div>;

  const readonly = evening.status === 'completed' || Boolean(evening.settled_at);

  return (
    <div className="space-y-3.5 pb-4">
      <section className="rounded-[20px] border border-border-soft bg-surface-1 p-4">
        <button type="button" onClick={onBack} className="mb-3 text-[11px] font-bold text-text-muted">← К событиям</button>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-[20px] font-black leading-tight text-text-primary">{evening.title}</h2>
            <p className="mt-1 text-[12px] text-text-secondary">{new Date(evening.starts_at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}{evening.venue ? ` · ${evening.venue}` : ''}</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${evening.status === 'active' ? 'bg-success-soft text-success' : evening.status === 'completed' ? 'bg-surface-2 text-text-secondary' : evening.status === 'cancelled' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-text-primary'}`}>{statusLabel[evening.status] || evening.status}</span>
        </div>

        {!readonly && evening.status !== 'cancelled' ? <div className="mt-4">
          {evening.status === 'draft' ? <button disabled={busy} onClick={() => void updateStatus('published')} className="min-h-[46px] w-full rounded-[12px] bg-accent text-[12px] font-bold text-white disabled:opacity-50">Опубликовать вечер</button> : null}
          {evening.status === 'published' ? <button disabled={busy} onClick={() => void updateStatus('active')} className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[12px] bg-success text-[12px] font-bold text-white disabled:opacity-50"><Play className="h-4 w-4" /> Начать вечер</button> : null}
        </div> : null}
        {message ? <p className="mt-3 rounded-[12px] bg-success-soft px-3 py-2 text-[11px] text-success">{message}</p> : null}
        {error ? <p className="mt-3 rounded-[12px] bg-danger-soft px-3 py-2 text-[11px] text-danger">{error}</p> : null}
      </section>

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
              <span className="mt-0.5 block text-[10px] leading-4 text-text-muted">Telegram, VK, публикация и повторная рассылка. Обычно сюда заходить не нужно.</span>
            </span>
          </span>
          {showAnnouncementSettings ? <ChevronUp className="h-4 w-4 shrink-0 text-text-muted" /> : <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />}
        </button>
        {showAnnouncementSettings ? <div className="border-t border-border-soft p-3">
          <EveningAnnouncementPanel eveningId={eveningId} eveningTitle={evening.title} startsAt={evening.starts_at} status={evening.status} readonly={readonly} settingsOnly />
        </div> : null}
      </section>
    </div>
  );
};

export default EveningOverviewView;
