import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Calendar, CheckCircle2, CircleDollarSign,
  Gamepad2, ListTodo, MessageCircle, RefreshCw, UserCheck,
} from 'lucide-react';
import { api, type CrmOverview } from '../../lib/api.ts';
import type { EveningSection } from './EveningWorkspace.tsx';

type OpsPlayer = {
  participant_id: string;
  player_id: string;
  nickname: string;
  elo: number;
  response_status: string;
  attendance_status: string;
  payment_status: string;
  amount_due: number;
  amount_paid: number;
  play_count: number;
};

type CommandCenterResponse = {
  snapshot: null | {
    mode: 'active' | 'upcoming';
    evening: { id: string; title: string; starts_at: string | null; venue: string | null; format: string; status: string };
    stats: {
      expected: number; present: number; pending_attendance: number; no_show: number;
      unpaid_count: number; unpaid_amount: number; games: number; completed_games: number;
      draft_games: number; open_tasks: number; ready_to_close: boolean;
    };
    current_game: null | {
      id: number; local_number: number; global_number: number; table_name: string | null; judge_name: string | null;
      players: Array<{ participant_id: string; player_id: string | null; nickname: string; seat_number: number }>;
    };
    suggested_lineup: OpsPlayer[];
    roster: { expected: OpsPlayer[]; present: OpsPlayer[]; pending_attendance: OpsPlayer[]; unpaid: OpsPlayer[] };
    attention: {
      communication: Array<{ player_id: string; nickname: string; status: 'failed' | 'not_sent' | 'unanswered'; reminder_count: number; last_error: string | null }>;
      tasks: Array<any>;
    };
    blockers: Array<{ kind: string; count: number; label: string }>;
  };
  wrapup: null | {
    evening: { id: string; title: string; starts_at: string | null };
    unpaid: Array<{ id: string; player_id: string; nickname: string; amount_due: number; amount_paid: number }>;
    tasks: Array<any>;
  };
  generated_at: string;
};

interface Props {
  overview: CrmOverview | null;
  onOpenEvening: (id: string) => void;
  onOpenEveningSection: (id: string, section: EveningSection) => void;
  onOpenPlayer: (id: string) => void;
  onNavigateTab: (tab: 'tasks' | 'analytics') => void;
  onCreateEvening: () => void;
  onCompleteTask?: (taskId: string) => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
}

const formatDateTime = (value: string | null) => {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  return date.toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
};

const formatMoney = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

const communicationLabel = (status: string) => {
  if (status === 'failed') return 'Ошибка доставки';
  if (status === 'not_sent') return 'Анонс не отправлен';
  return 'Нет ответа';
};

export default function OrganizerCommandCenter({
  onOpenEvening,
  onOpenEveningSection,
  onNavigateTab,
  onCreateEvening,
  onRefresh,
}: Props) {
  const [data, setData] = useState<CommandCenterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/crm/command-center', { credentials: 'same-origin' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить пульт');
      setData(body as CommandCenterResponse);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить пульт');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, 15_000);
    const onVisible = () => document.visibilityState === 'visible' && void load(true);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  const snapshot = data?.snapshot || null;
  const communicationAttention = snapshot?.attention.communication || [];
  const unansweredCount = communicationAttention.filter((item) => item.status === 'unanswered').length;
  const deliveryProblems = communicationAttention.filter((item) => item.status !== 'unanswered');
  const attendanceAttention = snapshot?.mode === 'active' ? snapshot.stats.pending_attendance : 0;
  const unfinishedGames = snapshot?.mode === 'active' ? Math.max(0, snapshot.stats.games - snapshot.stats.completed_games) : 0;
  const taskCount = snapshot?.stats.open_tasks || snapshot?.attention.tasks.length || 0;

  const refreshAll = async () => {
    await Promise.all([load(true), onRefresh?.()]);
  };

  const markPaid = async (participant: { id?: string; participant_id?: string; amount_due: number }) => {
    const id = String(participant.id || participant.participant_id || '');
    if (!id || busy) return;
    setBusy(`payment:${id}`);
    try {
      await api.updateParticipant(id, { amount_paid: Number(participant.amount_due || 0), payment_status: 'paid' });
      await refreshAll();
    } catch (err: any) {
      setError(err?.message || 'Не удалось закрыть оплату');
    } finally { setBusy(null); }
  };

  const actionCards = useMemo(() => {
    if (!snapshot) return [];
    const rows: Array<{ id: string; label: string; value: string; detail: string; tone: string; icon: React.ReactNode; action: () => void }> = [];
    if (unansweredCount > 0) rows.push({
      id: 'unanswered', label: 'Нет ответа', value: String(unansweredCount), detail: 'приглашений без RSVP', tone: 'text-warning', icon: <MessageCircle className="h-4 w-4" />,
      action: () => onOpenEveningSection(snapshot.evening.id, 'overview'),
    });
    if (snapshot.mode === 'active') rows.push({
      id: 'present', label: 'Пришли', value: String(snapshot.stats.present), detail: 'фактически на месте', tone: 'text-success', icon: <UserCheck className="h-4 w-4" />,
      action: () => onOpenEveningSection(snapshot.evening.id, 'management'),
    });
    if (snapshot.stats.unpaid_count > 0) rows.push({
      id: 'unpaid', label: 'Не оплачено', value: String(snapshot.stats.unpaid_count), detail: formatMoney(snapshot.stats.unpaid_amount), tone: 'text-warning', icon: <CircleDollarSign className="h-4 w-4" />,
      action: () => onOpenEveningSection(snapshot.evening.id, 'payments'),
    });
    if (unfinishedGames > 0) rows.push({
      id: 'unfinished', label: 'Игры', value: String(unfinishedGames), detail: 'ещё не завершено', tone: 'text-warning', icon: <Gamepad2 className="h-4 w-4" />,
      action: () => onOpenEveningSection(snapshot.evening.id, 'games'),
    });
    if (taskCount > 0) rows.push({
      id: 'tasks', label: 'Задачи', value: String(taskCount), detail: 'требуют внимания', tone: 'text-warning', icon: <ListTodo className="h-4 w-4" />,
      action: () => onNavigateTab('tasks'),
    });
    return rows;
  }, [snapshot, unansweredCount, unfinishedGames, taskCount, onNavigateTab, onOpenEveningSection]);

  if (loading && !data) return <div className="flex min-h-[45vh] items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-accent" /></div>;

  return <div className="mx-auto w-full max-w-3xl space-y-3">
    <div data-testid="crm-today-header" className="flex items-center justify-between gap-3 px-0.5">
      <div className="min-w-0">
        <h2 className="text-[22px] font-semibold leading-tight text-text-primary sm:text-[24px]">Сегодня</h2>
        <p className="mt-1 text-[13px] leading-5 text-text-secondary">Только текущий вечер и действия, которые требуют внимания.</p>
      </div>
      <button type="button" onClick={() => void refreshAll()} aria-label="Обновить" className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-border-soft bg-surface-1 text-text-secondary"><RefreshCw className="h-4 w-4" /></button>
    </div>

    {error ? <div className="rounded-[14px] border border-danger/25 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{error}</div> : null}

    {!snapshot ? <section className="rounded-[22px] border border-border-soft bg-surface-1 p-5 text-center">
      <Calendar className="mx-auto h-8 w-8 text-text-muted" />
      <h3 className="mt-3 text-[16px] font-bold text-text-primary">Нет активного или ближайшего вечера</h3>
      <p className="mx-auto mt-1 max-w-sm text-[13px] leading-5 text-text-secondary">Создай следующее событие — оно станет рабочим контекстом этой страницы.</p>
      <button type="button" onClick={onCreateEvening} className="mt-4 min-h-11 rounded-[12px] bg-accent px-4 text-[14px] font-bold text-white">Создать вечер</button>
    </section> : <>
      <section className={`rounded-[22px] border p-4 ${snapshot.mode === 'active' ? 'border-success/30 bg-success-soft/20' : 'border-border-soft bg-surface-1'}`}>
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[13px] ${snapshot.mode === 'active' ? 'bg-success text-white' : 'bg-accent-soft text-accent'}`}>{snapshot.mode === 'active' ? <Gamepad2 className="h-5 w-5" /> : <Calendar className="h-5 w-5" />}</span>
          <div className="min-w-0 flex-1">
            <div className={`text-[12px] font-bold uppercase tracking-[0.1em] ${snapshot.mode === 'active' ? 'text-success' : 'text-accent'}`}>{snapshot.mode === 'active' ? 'Идёт сейчас' : 'Ближайший вечер'}</div>
            <h3 className="mt-1 line-clamp-2 text-[18px] font-bold leading-6 text-text-primary">{snapshot.evening.title}</h3>
            <p className="mt-1 line-clamp-2 text-[12px] leading-4 text-text-secondary">{formatDateTime(snapshot.evening.starts_at)}{snapshot.evening.venue ? ` · ${snapshot.evening.venue}` : ''}</p>
          </div>
          <button type="button" onClick={() => onOpenEvening(snapshot.evening.id)} aria-label="Открыть вечер" className="grid h-11 w-11 shrink-0 place-items-center rounded-[11px] bg-surface-2 text-text-secondary"><ArrowRight className="h-4 w-4" /></button>
        </div>
      </section>

      {actionCards.length ? <section aria-label="Действия сегодня" className="grid grid-cols-2 gap-2">
        {actionCards.map((item) => <button key={item.id} type="button" onClick={item.action} className="min-h-[78px] rounded-[16px] border border-border-soft bg-surface-1 p-3 text-left active:bg-surface-hover">
          <div className={`flex items-center gap-1.5 text-[13px] font-semibold ${item.tone}`}>{item.icon}{item.label}</div>
          <div className="mt-1.5 text-[22px] font-bold leading-none text-text-primary">{item.value}</div>
          <div className="mt-1 text-[12px] leading-4 text-text-secondary">{item.detail}</div>
        </button>)}
      </section> : <section className="flex min-h-14 items-center gap-2 rounded-[16px] border border-success/20 bg-success-soft px-3 text-[13px] text-success"><CheckCircle2 className="h-4 w-4" /> На текущий момент срочных действий нет.</section>}

      {(deliveryProblems.length > 0 || attendanceAttention > 0) ? <section className="rounded-[18px] border border-warning/20 bg-surface-1 p-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-warning"><AlertTriangle className="h-4 w-4" /> Требует уточнения</div>
        <div className="mt-2 space-y-1.5">
          {deliveryProblems.length ? <button type="button" onClick={() => onOpenEveningSection(snapshot.evening.id, 'overview')} className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-surface-2 px-3 text-left"><MessageCircle className="h-4 w-4 shrink-0 text-warning" /><span className="min-w-0 flex-1 text-[12px] text-text-secondary">{deliveryProblems.slice(0, 3).map((item) => `${item.nickname}: ${communicationLabel(item.status)}`).join(' · ')}</span><ArrowRight className="h-4 w-4 shrink-0 text-text-muted" /></button> : null}
          {attendanceAttention ? <button type="button" onClick={() => onOpenEveningSection(snapshot.evening.id, 'management')} className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-surface-2 px-3 text-left"><UserCheck className="h-4 w-4 shrink-0 text-warning" /><span className="min-w-0 flex-1 text-[12px] text-text-secondary">Явка не отмечена: {attendanceAttention}</span><ArrowRight className="h-4 w-4 shrink-0 text-text-muted" /></button> : null}
        </div>
      </section> : null}
    </>}

    {data?.wrapup?.unpaid.length ? <section className="rounded-[18px] border border-warning/20 bg-warning-soft/40 p-3">
      <div className="flex items-center justify-between gap-2"><div className="min-w-0"><div className="text-[12px] font-semibold text-warning">После прошлого вечера</div><div className="mt-0.5 line-clamp-1 text-[13px] font-bold text-text-primary">{data.wrapup.evening.title}</div></div><button type="button" onClick={() => onOpenEvening(data.wrapup!.evening.id)} aria-label="Открыть прошлый вечер" className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-surface-1 text-text-secondary"><ArrowRight className="h-4 w-4" /></button></div>
      <div className="mt-2 space-y-1.5">{data.wrapup.unpaid.slice(0, 4).map((row) => <div key={row.id} className="flex min-h-11 items-center gap-2 rounded-[10px] bg-surface-1 px-2.5"><span className="min-w-0 flex-1"><strong className="block truncate text-[13px] text-text-primary">{row.nickname}</strong><span className="text-[12px] text-text-muted">осталось {formatMoney(row.amount_due - row.amount_paid)}</span></span><button type="button" disabled={Boolean(busy)} onClick={() => void markPaid(row)} className="min-h-11 rounded-[9px] bg-success-soft px-3 text-[13px] font-bold text-success disabled:opacity-40">Оплачено</button></div>)}</div>
    </section> : null}
  </div>;
}
