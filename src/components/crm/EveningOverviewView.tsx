import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleDollarSign, Gamepad2, Play, RefreshCw, Users } from 'lucide-react';
import { api, type EveningParticipant, type GameEvening } from '../../lib/api.ts';
import EveningAnnouncementPanel from './EveningAnnouncementPanel.tsx';

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

const lifecycleStages = [
  { id: 'draft', label: 'Создан' },
  { id: 'published', label: 'Опубликован' },
  { id: 'active', label: 'Идёт' },
  { id: 'completed', label: 'Завершён' },
] as const;

const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

export const EveningOverviewView: React.FC<EveningOverviewViewProps> = ({ eveningId, onBack, onOpenSection }) => {
  const [evening, setEvening] = useState<EveningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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

  const stats = useMemo(() => {
    const participants = evening?.participants || [];
    const expected = participants.filter((item) => ['going', 'late'].includes(String((item as any).response_status || (item as any).registration_status || '')));
    const attended = participants.filter((item) => item.attendance_status === 'attended');
    const paid = participants.reduce((sum, item) => sum + Number(item.amount_paid || 0), 0);
    const due = participants.reduce((sum, item) => sum + Number(item.amount_due || 0), 0);
    const games = evening?.games || [];
    const completedGames = games.filter((game) => game.status === 'completed' || game.protocol_status === 'completed' || Boolean(game.winner_team && game.winner_team !== 'draft')).length;
    return { expected: expected.length, attended: attended.length, paid, due, games: games.length, completedGames };
  }, [evening]);

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
  const stageIndex = evening.status === 'cancelled' ? -1 : Math.max(0, lifecycleStages.findIndex((stage) => stage.id === evening.status));

  return (
    <div className="space-y-4 pb-4">
      <section className="rounded-[20px] border border-border-soft bg-surface-1 p-4">
        <button type="button" onClick={onBack} className="mb-3 text-[11px] font-bold text-text-muted">← К событиям</button>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-[20px] font-black leading-tight text-text-primary">{evening.title}</h2>
            <p className="mt-1 text-[12px] text-text-secondary">{new Date(evening.starts_at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}{evening.venue ? ` · ${evening.venue}` : ''}</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${evening.status === 'active' ? 'bg-success-soft text-success' : evening.status === 'completed' ? 'bg-surface-2 text-text-secondary' : evening.status === 'cancelled' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-text-primary'}`}>{statusLabel[evening.status] || evening.status}</span>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-1.5">
          {lifecycleStages.map((stage, index) => {
            const done = stageIndex >= 0 && index < stageIndex;
            const current = stageIndex === index;
            return <div key={stage.id} className="min-w-0 text-center">
              <div className={`mx-auto grid h-7 w-7 place-items-center rounded-full text-[10px] font-black ${done ? 'bg-success text-white' : current ? 'bg-accent text-white' : 'bg-surface-2 text-text-muted'}`}>{done ? '✓' : index + 1}</div>
              <div className={`mt-1 truncate text-[9px] font-semibold ${current ? 'text-text-primary' : 'text-text-muted'}`}>{stage.label}</div>
            </div>;
          })}
        </div>

        {!readonly && evening.status !== 'cancelled' ? <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {evening.status === 'draft' ? <button disabled={busy} onClick={() => void updateStatus('published')} className="min-h-[46px] rounded-[12px] bg-accent text-[12px] font-bold text-white disabled:opacity-50">Опубликовать вечер</button> : null}
          {evening.status === 'published' ? <button disabled={busy} onClick={() => void updateStatus('active')} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[12px] bg-success text-[12px] font-bold text-white disabled:opacity-50"><Play className="h-4 w-4" /> Начать вечер</button> : null}
        </div> : null}
        {message ? <p className="mt-3 rounded-[12px] bg-success-soft px-3 py-2 text-[11px] text-success">{message}</p> : null}
        {error ? <p className="mt-3 rounded-[12px] bg-danger-soft px-3 py-2 text-[11px] text-danger">{error}</p> : null}
      </section>

      <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-[14px] font-black text-text-primary">Что сейчас происходит</h3><p className="mt-1 text-[10px] leading-4 text-text-muted">В этом разделе только сам вечер и его публикации. Ответы игроков и фактический приход находятся в соседних разделах.</p></div>
          <MegaphoneIcon />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button type="button" onClick={() => onOpenSection('participants')} className="rounded-[14px] bg-surface-2 p-3 text-left"><Users className="h-4 w-4 text-accent" /><strong className="mt-2 block text-[20px] text-text-primary">{stats.expected}</strong><span className="text-[10px] text-text-muted">подтвердили участие</span></button>
          <button type="button" onClick={() => onOpenSection('management')} className="rounded-[14px] bg-surface-2 p-3 text-left"><CheckCircle2 className="h-4 w-4 text-success" /><strong className="mt-2 block text-[20px] text-text-primary">{stats.attended}</strong><span className="text-[10px] text-text-muted">отмечены на месте</span></button>
          <button type="button" onClick={() => onOpenSection('games')} className="rounded-[14px] bg-surface-2 p-3 text-left"><Gamepad2 className="h-4 w-4 text-accent" /><strong className="mt-2 block text-[20px] text-text-primary">{stats.completedGames}<span className="text-[11px] text-text-muted">/{stats.games}</span></strong><span className="text-[10px] text-text-muted">игр завершено</span></button>
          <button type="button" onClick={() => onOpenSection('management')} className="rounded-[14px] bg-surface-2 p-3 text-left"><CircleDollarSign className="h-4 w-4 text-success" /><strong className="mt-2 block text-[16px] text-text-primary">{money(stats.paid)}</strong><span className="text-[10px] text-text-muted">оплачено из {money(stats.due)}</span></button>
        </div>
      </section>

      <EveningAnnouncementPanel eveningId={eveningId} eveningTitle={evening.title} startsAt={evening.starts_at} status={evening.status} readonly={readonly} />
    </div>
  );
};

const MegaphoneIcon = () => <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">📣</span>;

export default EveningOverviewView;
