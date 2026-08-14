import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDollarSign, Clock3, Gamepad2, Play, RefreshCw, Users } from 'lucide-react';
import { api, type EveningParticipant, type GameEvening } from '../../lib/api.ts';
import { getEveningResponse } from '../../lib/eveningResponse.ts';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import EveningAnnouncementPanel from './EveningAnnouncementPanel.tsx';

interface EveningOverviewViewProps {
  eveningId: string;
  onBack: () => void;
  onOpenSection: (section: 'participants' | 'tables' | 'games') => void;
}

type EveningAnnouncementSummary = {
  audience: number;
  sent: number;
  answered: number;
  unanswered: number;
  failed: number;
  not_sent: number;
  reminded: number;
};

type EveningData = GameEvening & {
  participants?: EveningParticipant[];
  games?: Array<{ id: number | string; status?: string | null; protocol_status?: string | null; winner_team?: string | null }>;
  announcement?: { summary?: EveningAnnouncementSummary } | null;
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
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmNoShow, setConfirmNoShow] = useState(false);
  const [confirmSettle, setConfirmSettle] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      setEvening(await api.getEvening(eveningId) as EveningData);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить вечер');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [eveningId]);

  const stats = useMemo(() => {
    const participants = evening?.participants || [];
    const expected = participants.filter((item) => ['going', 'late'].includes(getEveningResponse(item)));
    const pendingExpected = expected.filter((item) => item.attendance_status === 'pending');
    const attended = participants.filter((item) => item.attendance_status === 'attended');
    const noShow = participants.filter((item) => item.attendance_status === 'no_show');
    const thinking = participants.filter((item) => getEveningResponse(item) === 'thinking');
    const participantUnanswered = participants.filter((item) => getEveningResponse(item) === 'unanswered');
    const announcementSummary = evening?.announcement?.summary;
    const unansweredCount = Number(announcementSummary?.unanswered ?? participantUnanswered.length);
    const audienceCount = Number(announcementSummary?.audience ?? participants.length);
    const paymentExpected = participants.filter((item) => item.attendance_status === 'attended' || ['going', 'late'].includes(getEveningResponse(item)));
    const due = paymentExpected.reduce((sum, item) => sum + Number(item.amount_due || 0), 0);
    const paid = paymentExpected.reduce((sum, item) => sum + Number(item.amount_paid || 0), 0);
    const outstanding = paymentExpected.reduce((sum, item) => sum + Math.max(0, Number(item.amount_due || 0) - Number(item.amount_paid || 0)), 0);
    const unpaidPeople = paymentExpected.filter((item) => item.payment_status !== 'paid' && item.payment_status !== 'waived' && Number(item.amount_due || 0) > Number(item.amount_paid || 0)).length;
    const games = evening?.games || [];
    const completedGames = games.filter((game) => {
      const winner = String(game.winner_team || '').trim().toLowerCase();
      return game.status === 'completed' || game.protocol_status === 'completed' || Boolean(winner && winner !== 'draft');
    }).length;
    return { participants, expected, pendingExpected, attended, noShow, thinking, participantUnanswered, unansweredCount, audienceCount, due, paid, outstanding, unpaidPeople, games, completedGames };
  }, [evening]);

  const updateStatus = async (status: 'published' | 'active') => {
    if (busy) return;
    setBusy(status); setError(null); setMessage(null);
    try {
      const updated = await api.updateEvening(eveningId, { status });
      setEvening((current) => current ? { ...current, ...updated } : current);
      setMessage(status === 'active' ? 'Вечер переведён в активный режим.' : 'Вечер опубликован.');
    } catch (err: any) {
      setError(err?.message || 'Не удалось изменить статус вечера');
    } finally { setBusy(null); }
  };

  const markPendingAsNoShow = async () => {
    if (busy || !stats.pendingExpected.length) return;
    setBusy('no-show'); setError(null); setMessage(null);
    try {
      await api.bulkUpdateParticipants(eveningId, stats.pendingExpected.map((item) => ({ id: item.id, attendance_fact: 'no_show' } as any)));
      setConfirmNoShow(false);
      await load(true);
      setMessage('Неотмеченные ожидаемые игроки помечены как не пришедшие.');
    } catch (err: any) {
      setError(err?.message || 'Не удалось обновить явку');
    } finally { setBusy(null); }
  };

  const settle = async () => {
    if (busy) return;
    setBusy('settle'); setError(null); setMessage(null);
    try {
      await api.settleEvening(eveningId);
      setConfirmSettle(false);
      await load(true);
      setMessage('Вечер закрыт и зафиксирован в истории клуба.');
    } catch (err: any) {
      setError(err?.message || 'Не удалось закрыть вечер');
    } finally { setBusy(null); }
  };

  if (loading) return <div className="flex min-h-[45vh] items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-accent" /></div>;
  if (!evening) return <div className="rounded-[18px] border border-danger/30 bg-danger-soft p-4 text-[13px] text-danger">{error || 'Вечер не найден'}</div>;

  const readonly = evening.status === 'completed' || Boolean(evening.settled_at);
  const hasUnfinishedGames = stats.games.length > stats.completedGames;
  const readyToClose = stats.pendingExpected.length === 0 && !hasUnfinishedGames;
  const stageIndex = evening.status === 'cancelled'
    ? -1
    : Math.max(0, lifecycleStages.findIndex((stage) => stage.id === evening.status));
  const lifecycleHint = evening.status === 'draft'
    ? 'Проверь дату, место, формат и цену. После публикации Telegram и личные приглашения смогут работать с этим вечером.'
    : evening.status === 'published'
      ? stats.unansweredCount
        ? `Вечер опубликован. Из ${stats.audienceCount} приглашённых ещё ${stats.unansweredCount} без ответа.`
        : stats.expected.length
          ? `Состав собирается: ${stats.expected.length} игрок(ов) подтвердили участие. Когда начнётся встреча — переведи вечер в активный режим.`
          : 'Вечер опубликован. Следующий этап — собрать ответы игроков, затем начать вечер.'
      : evening.status === 'active'
        ? stats.pendingExpected.length
          ? `Вечер идёт. Перед завершением отметь явку ещё у ${stats.pendingExpected.length} ожидаемых игроков.`
          : hasUnfinishedGames
            ? `Вечер идёт. Завершено ${stats.completedGames} из ${stats.games.length} созданных игр.`
            : stats.games.length
              ? 'Все созданные игры завершены, явка заполнена. Можно продолжить новыми играми или закрыть вечер.'
              : 'Вечер идёт. Явка заполнена; можно создавать игры или завершить вечер, если игр сегодня не было.'
        : evening.status === 'completed'
          ? 'Вечер завершён и зафиксирован в истории клуба.'
          : 'Вечер отменён. Активные игровые действия отключены.';

  const pendingNames = stats.pendingExpected.slice(0, 6).map((item) => item.nickname).join(', ');
  const pendingTail = stats.pendingExpected.length > 6 ? ` и ещё ${stats.pendingExpected.length - 6}` : '';

  return <div className="space-y-4 pb-4">
    <section className="rounded-[20px] border border-border-soft bg-surface-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="mb-3 text-[11px] font-bold text-text-muted">← К событиям</button>
          <h2 className="break-words text-[20px] font-black leading-tight text-text-primary">{evening.title}</h2>
          <p className="mt-1 text-[12px] text-text-secondary">{new Date(evening.starts_at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}{evening.venue ? ` · ${evening.venue}` : ''}</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${evening.status === 'active' ? 'bg-success-soft text-success' : evening.status === 'completed' ? 'bg-surface-2 text-text-secondary' : evening.status === 'cancelled' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-text-primary'}`}>{statusLabel[evening.status] || evening.status}</span>
      </div>

      <div className="mt-4">
        <div className="grid grid-cols-4 gap-1.5">
          {lifecycleStages.map((stage, index) => {
            const done = stageIndex >= 0 && index < stageIndex;
            const current = stageIndex === index;
            return <div key={stage.id} className="min-w-0 text-center">
              <div className={`mx-auto grid h-7 w-7 place-items-center rounded-full text-[10px] font-black ${done ? 'bg-success text-white' : current ? 'bg-accent text-white' : 'bg-surface-2 text-text-muted'}`}>{done ? '✓' : index + 1}</div>
              <div className={`mt-1 truncate text-[9px] font-semibold ${current ? 'text-text-primary' : 'text-text-muted'}`}>{stage.label}</div>
            </div>;
          })}
        </div>
        <div className={`mt-3 rounded-[12px] px-3 py-2.5 text-[11px] leading-4 ${evening.status === 'cancelled' ? 'bg-danger-soft text-danger' : evening.status === 'completed' ? 'bg-success-soft text-text-secondary' : 'bg-surface-2 text-text-secondary'}`}>{lifecycleHint}</div>
      </div>

      {!readonly && evening.status !== 'cancelled' ? <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {evening.status === 'draft' ? <button disabled={Boolean(busy)} onClick={() => void updateStatus('published')} className="min-h-[46px] rounded-[12px] bg-accent text-[12px] font-bold text-white disabled:opacity-50">Опубликовать вечер</button> : null}
        {evening.status === 'published' ? <button disabled={Boolean(busy)} onClick={() => void updateStatus('active')} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[12px] bg-success text-[12px] font-bold text-white disabled:opacity-50"><Play className="h-4 w-4" /> Начать вечер</button> : null}
        {evening.status === 'active' && readyToClose ? <button disabled={Boolean(busy)} onClick={() => setConfirmSettle(true)} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[12px] bg-accent text-[12px] font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Закрыть вечер</button> : null}
      </div> : null}
      {message ? <p className="mt-3 rounded-[12px] bg-success-soft px-3 py-2 text-[11px] text-success">{message}</p> : null}
      {error ? <p className="mt-3 rounded-[12px] bg-danger-soft px-3 py-2 text-[11px] text-danger">{error}</p> : null}
    </section>

    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <button onClick={() => onOpenSection('participants')} className="rounded-[16px] border border-border-soft bg-surface-1 p-3 text-left"><Users className="h-4 w-4 text-accent" /><div className="mt-3 text-[22px] font-black">{stats.expected.length}</div><div className="text-[10px] text-text-muted">ожидаем игроков</div></button>
      <button onClick={() => onOpenSection('participants')} className="rounded-[16px] border border-border-soft bg-surface-1 p-3 text-left"><CheckCircle2 className="h-4 w-4 text-success" /><div className="mt-3 text-[22px] font-black">{stats.attended.length}</div><div className="text-[10px] text-text-muted">фактически пришли</div></button>
      <button onClick={() => onOpenSection('games')} className="rounded-[16px] border border-border-soft bg-surface-1 p-3 text-left"><Gamepad2 className="h-4 w-4 text-accent" /><div className="mt-3 text-[22px] font-black">{stats.completedGames}<span className="text-[12px] text-text-muted">/{stats.games.length}</span></div><div className="text-[10px] text-text-muted">игр завершено</div></button>
      <button onClick={() => onOpenSection('participants')} className="rounded-[16px] border border-border-soft bg-surface-1 p-3 text-left"><CircleDollarSign className="h-4 w-4 text-success" /><div className="mt-3 text-[18px] font-black">{money(stats.paid)}</div><div className="text-[10px] text-text-muted">оплачено из {money(stats.due)}</div></button>
    </div>

    <EveningAnnouncementPanel eveningId={eveningId} eveningTitle={evening.title} startsAt={evening.starts_at} status={evening.status} readonly={readonly} />

    <section className="rounded-[18px] border border-border-soft bg-surface-1 p-4">
      <h3 className="text-[14px] font-black text-text-primary">Готовность вечера</h3>
      <div className="mt-3 space-y-2">
        <button onClick={() => onOpenSection('participants')} className="flex min-h-[54px] w-full items-center gap-3 rounded-[13px] bg-surface-2 px-3 text-left">{stats.pendingExpected.length ? <AlertTriangle className="h-5 w-5 shrink-0 text-warning" /> : <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />}<span className="min-w-0 flex-1"><strong className="block text-[12px]">Явка</strong><span className="text-[10px] text-text-muted">{stats.pendingExpected.length ? `Не отмечено: ${stats.pendingExpected.length}` : `Отмечено всё · пришли ${stats.attended.length}, не пришли ${stats.noShow.length}`}</span></span></button>
        <button onClick={() => onOpenSection('participants')} className="flex min-h-[54px] w-full items-center gap-3 rounded-[13px] bg-surface-2 px-3 text-left">{stats.outstanding > 0 ? <Clock3 className="h-5 w-5 shrink-0 text-warning" /> : <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />}<span className="min-w-0 flex-1"><strong className="block text-[12px]">Оплата</strong><span className="text-[10px] text-text-muted">{stats.outstanding > 0 ? `${stats.unpaidPeople} чел. · осталось ${money(stats.outstanding)}` : 'Все начисления закрыты'}</span></span></button>
        <button onClick={() => onOpenSection('games')} className="flex min-h-[54px] w-full items-center gap-3 rounded-[13px] bg-surface-2 px-3 text-left">{hasUnfinishedGames ? <AlertTriangle className="h-5 w-5 shrink-0 text-warning" /> : <Gamepad2 className="h-5 w-5 shrink-0 text-accent" />}<span className="min-w-0 flex-1"><strong className="block text-[12px]">Игры</strong><span className="text-[10px] text-text-muted">Завершено {stats.completedGames} из {stats.games.length}</span></span></button>
      </div>
    </section>

    {!readonly && evening.status === 'active' && stats.pendingExpected.length ? <section className="rounded-[18px] border border-warning/25 bg-warning-soft p-4"><h3 className="text-[13px] font-black text-text-primary">Перед закрытием вечера</h3><p className="mt-1 text-[11px] leading-5 text-text-secondary">У {stats.pendingExpected.length} ожидаемых игроков ещё не отмечена явка. Их нужно отметить вручную или, если вечер уже закончился, массово поставить «Не пришёл».</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><button onClick={() => onOpenSection('participants')} className="min-h-[44px] rounded-[12px] border border-border-soft bg-surface-1 text-[11px] font-bold">Отметить вручную</button><button disabled={Boolean(busy)} onClick={() => setConfirmNoShow(true)} className="min-h-[44px] rounded-[12px] bg-warning text-[11px] font-bold text-white disabled:opacity-50">Оставшихся → не пришли</button></div></section> : null}

    {!readonly && evening.status === 'active' && stats.pendingExpected.length === 0 && hasUnfinishedGames ? <section className="rounded-[18px] border border-warning/25 bg-warning-soft p-4"><h3 className="text-[13px] font-black text-text-primary">Сначала завершите игры</h3><p className="mt-1 text-[11px] leading-5 text-text-secondary">Незавершённых игр: {stats.games.length - stats.completedGames}. Вечер нельзя закрыть, пока у каждой созданной игры не зафиксирован результат.</p><button onClick={() => onOpenSection('games')} className="mt-3 min-h-[44px] w-full rounded-[12px] bg-warning text-[11px] font-bold text-white">Перейти к играм</button></section> : null}

    {!readonly && evening.status === 'active' && readyToClose ? <section className="rounded-[18px] border border-success/25 bg-success-soft p-4"><h3 className="text-[13px] font-black">Вечер можно закрывать</h3><p className="mt-1 text-[11px] leading-5 text-text-secondary">Явка ожидаемых игроков заполнена, все созданные игры завершены. Неоплаченные суммы будут сохранены как задолженность игрока.</p><button disabled={Boolean(busy)} onClick={() => setConfirmSettle(true)} className="mt-3 min-h-[46px] w-full rounded-[12px] bg-success text-[12px] font-bold text-white disabled:opacity-50">{busy === 'settle' ? 'Закрываем…' : 'Завершить и зафиксировать вечер'}</button></section> : null}

    <ConfirmDialog open={confirmNoShow} title="Отметить оставшихся как «Не пришёл»?" description={`${pendingNames}${pendingTail}. Действие можно затем исправить вручную в составе вечера.`} confirmLabel="Отметить" tone="warning" busy={busy === 'no-show'} onCancel={() => !busy && setConfirmNoShow(false)} onConfirm={markPendingAsNoShow} />
    <ConfirmDialog open={confirmSettle} title={`Закрыть вечер «${evening.title}»?`} description="После закрытия явка и оплаты фиксируются в истории. Неоплаченные суммы останутся долгом." confirmLabel="Закрыть вечер" tone="warning" busy={busy === 'settle'} onCancel={() => !busy && setConfirmSettle(false)} onConfirm={settle} />
  </div>;
};

export default EveningOverviewView;
