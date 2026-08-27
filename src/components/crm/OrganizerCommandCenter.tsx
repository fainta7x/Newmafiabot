import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Calendar, CheckCircle2,
  Gamepad2, MessageCircle, RefreshCw, UserCheck,
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
  rotation_reason?: 'sat_out' | 'early_exit' | 'winner' | 'loser';
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

const rotationReasonLabel = (reason?: OpsPlayer['rotation_reason']) => {
  if (reason === 'sat_out') return 'пропустил прошлую';
  if (reason === 'early_exit') return 'первый убитый / 0 круг';
  if (reason === 'winner') return 'победившая команда';
  if (reason === 'loser') return 'проигравшая команда';
  return 'приоритет ротации';
};

export default function OrganizerCommandCenter({
  onOpenEvening, onOpenEveningSection, onOpenPlayer,
  onCreateEvening, onRefresh,
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
  const attendanceAttention = snapshot?.mode === 'active' ? snapshot.stats.pending_attendance : 0;
  const hasOperationalAttention = communicationAttention.length > 0 || attendanceAttention > 0;

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

  if (loading && !data) return <div className="flex min-h-[45vh] items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-accent" /></div>;

  return <div className="mx-auto w-full max-w-3xl space-y-3.5 sm:space-y-4">
    <div data-testid="crm-today-header" className="flex items-center justify-between gap-3 px-0.5">
      <div className="min-w-0">
        <h2 className="text-[21px] font-semibold leading-tight text-text-primary sm:text-[24px]">Сегодня</h2>
        <p className="mt-0.5 text-[11px] leading-4 text-text-muted sm:text-[12px] sm:text-text-secondary">Только то, что действительно нужно сделать сейчас.</p>
      </div>
      <button type="button" onClick={() => void refreshAll()} aria-label="Обновить" className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-border-soft bg-surface-1 text-text-secondary"><RefreshCw className="h-4 w-4" /></button>
    </div>

    {error ? <div className="rounded-[14px] border border-danger/25 bg-danger-soft px-3 py-2.5 text-[11px] text-danger">{error}</div> : null}

    {!snapshot ? <section className="rounded-[22px] border border-border-soft bg-surface-1 p-5 text-center">
      <Calendar className="mx-auto h-8 w-8 text-text-muted" />
      <h3 className="mt-3 text-[16px] font-black text-text-primary">Нет активного или ближайшего вечера</h3>
      <p className="mx-auto mt-1 max-w-sm text-[11px] leading-5 text-text-secondary">Создай следующее событие — пульт автоматически переключится на подготовку.</p>
      <button type="button" onClick={onCreateEvening} className="mt-4 min-h-11 rounded-[12px] bg-accent px-4 text-[11px] font-black text-white">Создать вечер</button>
    </section> : <>
      <section className={`overflow-hidden rounded-[22px] border ${snapshot.mode === 'active' ? 'border-success/30 bg-success-soft/20' : 'border-border-soft bg-surface-1'}`}>
        <div className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-[14px] ${snapshot.mode === 'active' ? 'bg-success text-white' : 'bg-accent-soft text-accent'}`}>{snapshot.mode === 'active' ? <Gamepad2 className="h-5 w-5" /> : <Calendar className="h-5 w-5" />}</span>
            <div className="min-w-0 flex-1">
              <div className={`text-[10px] font-black uppercase tracking-[0.14em] ${snapshot.mode === 'active' ? 'text-success' : 'text-accent'}`}>{snapshot.mode === 'active' ? 'Идёт сейчас' : 'Ближайший вечер'}</div>
              <h3 className="mt-1 break-words text-[19px] font-black leading-tight text-text-primary">{snapshot.evening.title}</h3>
              <p className="mt-1 text-[11px] text-text-secondary">{formatDateTime(snapshot.evening.starts_at)}{snapshot.evening.venue ? ` · ${snapshot.evening.venue}` : ''}</p>
            </div>
            <button type="button" onClick={() => onOpenEvening(snapshot.evening.id)} className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-surface-2 text-text-secondary"><ArrowRight className="h-4 w-4" /></button>
          </div>

          {snapshot.mode === 'active' ? <div className="mt-4 grid grid-cols-4 gap-1.5 text-center">
            <button type="button" onClick={() => onOpenEveningSection(snapshot.evening.id, 'participants')} className="rounded-[13px] bg-surface-2 px-1 py-2.5"><div className="text-[18px] font-black text-text-primary">{snapshot.stats.expected}</div><div className="text-[8px] text-text-muted">ожидаем</div></button>
            <button type="button" onClick={() => onOpenEveningSection(snapshot.evening.id, 'participants')} className="rounded-[13px] bg-surface-2 px-1 py-2.5"><div className="text-[18px] font-black text-success">{snapshot.stats.present}</div><div className="text-[8px] text-text-muted">пришли</div></button>
            <button type="button" onClick={() => onOpenEveningSection(snapshot.evening.id, 'games')} className="rounded-[13px] bg-surface-2 px-1 py-2.5"><div className="text-[18px] font-black text-text-primary">{snapshot.stats.completed_games}<span className="text-[9px] text-text-muted">/{snapshot.stats.games}</span></div><div className="text-[8px] text-text-muted">игры</div></button>
            <button type="button" onClick={() => onOpenEveningSection(snapshot.evening.id, 'overview')} className="rounded-[13px] bg-surface-2 px-1 py-2.5"><div className={`text-[18px] font-black ${snapshot.blockers.length ? 'text-warning' : 'text-success'}`}>{snapshot.blockers.reduce((sum, row) => sum + row.count, 0)}</div><div className="text-[8px] text-text-muted">к закрытию</div></button>
          </div> : <button type="button" onClick={() => onOpenEveningSection(snapshot.evening.id, 'participants')} className="mt-4 w-full rounded-[13px] bg-surface-2 px-3 py-2.5 text-center"><div className="text-[18px] font-black text-text-primary">{snapshot.stats.expected}</div><div className="text-[8px] text-text-muted">планируют прийти</div></button>}
        </div>
      </section>

      {snapshot.mode === 'active' ? <section className="rounded-[20px] border border-border-soft bg-surface-1 p-4">
        <div className="flex items-center justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-accent">Сейчас</div><h3 className="mt-0.5 text-[15px] font-black text-text-primary">{snapshot.current_game ? `Игра ${snapshot.current_game.local_number} за столом` : snapshot.stats.present >= 10 ? 'Готовим следующую десятку' : 'Собираем игроков'}</h3></div><Gamepad2 className="h-5 w-5 text-accent" /></div>

        {snapshot.current_game ? <div className="mt-3 rounded-[15px] bg-surface-2 p-3">
          <div className="flex items-start justify-between gap-3"><div><strong className="text-[12px] text-text-primary">Игра {snapshot.current_game.local_number}</strong><div className="mt-0.5 text-[9px] text-text-muted">{snapshot.current_game.table_name || 'Без стола'}{snapshot.current_game.judge_name ? ` · ведущий ${snapshot.current_game.judge_name}` : ''}</div></div><span className="rounded-full bg-accent-soft px-2 py-1 text-[8px] font-black text-accent">В ПРОЦЕССЕ</span></div>
          <div className="mt-3 grid grid-cols-5 gap-1">{snapshot.current_game.players.map((player) => <div key={player.participant_id || player.seat_number} className="min-w-0 rounded-[9px] bg-surface-1 px-1 py-1.5 text-center"><div className="text-[7px] font-mono text-text-muted">#{player.seat_number}</div><div className="truncate text-[8px] font-bold text-text-primary">{player.nickname}</div></div>)}</div>
          <button type="button" onClick={() => onOpenEveningSection(snapshot.evening.id, 'games')} className="mt-3 min-h-10 w-full rounded-[11px] bg-accent text-[10px] font-black text-white">Продолжить игру</button>
        </div> : snapshot.suggested_lineup.length >= 10 ? <div className="mt-3 rounded-[15px] bg-surface-2 p-3">
          <div className="flex items-center justify-between"><div className="text-[10px] font-black text-text-primary">Кандидаты на следующую игру</div><div className="text-[8px] text-text-muted">клубный приоритет</div></div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">{snapshot.suggested_lineup.map((player, index) => <button key={player.participant_id} type="button" onClick={() => onOpenPlayer(player.player_id)} className="flex min-w-0 items-center gap-2 rounded-[10px] bg-surface-1 px-2 py-2 text-left"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-[8px] bg-accent-soft text-[8px] font-black text-accent">{index + 1}</span><span className="min-w-0 flex-1"><strong className="block truncate text-[9px] text-text-primary">{player.nickname}</strong><span className="block truncate text-[7px] text-text-muted">{rotationReasonLabel(player.rotation_reason)} · игр сегодня: {player.play_count}</span></span></button>)}</div>
          <p className="mt-2 text-[8px] leading-4 text-text-muted">Ротация: пропустившие прошлую → первый убитый / нулевой круг → победившая команда → проигравшая. Среди проигравших дольше остававшиеся в партии первыми уходят на пропуск. Финальный выбор остаётся у организатора.</p>
          <button type="button" onClick={() => onOpenEveningSection(snapshot.evening.id, 'games')} className="mt-3 min-h-11 w-full rounded-[11px] bg-accent text-[10px] font-black text-white">Создать следующую игру</button>
        </div> : <div className="mt-3 rounded-[15px] border border-warning/20 bg-warning-soft p-3"><div className="text-[11px] font-black text-text-primary">Сейчас в клубе {snapshot.stats.present} из 10 нужных игроков</div><div className="mt-1 text-[9px] leading-4 text-text-secondary">Отметь приход остальных участников, когда они появятся.</div><button type="button" onClick={() => onOpenEveningSection(snapshot.evening.id, 'participants')} className="mt-3 min-h-10 w-full rounded-[11px] bg-warning text-[10px] font-black text-white">К явке</button></div>}
      </section> : null}

      {hasOperationalAttention ? <section className="rounded-[20px] border border-warning/20 bg-surface-1 p-4">
        <div className="flex items-center justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-warning">Сейчас требует внимания</div><h3 className="mt-0.5 text-[15px] font-black text-text-primary">{snapshot.mode === 'active' ? 'Только оперативные действия' : 'До старта вечера'}</h3></div><AlertTriangle className="h-5 w-5 text-warning" /></div>
        <div className="mt-3 space-y-2">
          {communicationAttention.length ? <button type="button" onClick={() => onOpenEveningSection(snapshot.evening.id, 'overview')} className="flex w-full items-center gap-3 rounded-[13px] bg-surface-2 p-3 text-left"><MessageCircle className="h-5 w-5 shrink-0 text-warning" /><span className="min-w-0 flex-1"><strong className="block text-[10px] text-text-primary">Коммуникация · {communicationAttention.length}</strong><span className="mt-0.5 block truncate text-[8px] text-text-muted">{communicationAttention.slice(0, 4).map((item) => `${item.nickname}: ${communicationLabel(item.status)}`).join(' · ')}</span></span><ArrowRight className="h-4 w-4 text-text-muted" /></button> : null}
          {attendanceAttention ? <button type="button" onClick={() => onOpenEveningSection(snapshot.evening.id, 'participants')} className="flex w-full items-center gap-3 rounded-[13px] bg-surface-2 p-3 text-left"><UserCheck className="h-5 w-5 shrink-0 text-warning" /><span className="min-w-0 flex-1"><strong className="block text-[10px] text-text-primary">Явка · не отмечено {attendanceAttention}</strong><span className="mt-0.5 block truncate text-[8px] text-text-muted">{snapshot.roster.pending_attendance.slice(0, 6).map((item) => item.nickname).join(', ')}</span></span><ArrowRight className="h-4 w-4 text-text-muted" /></button> : null}
        </div>
      </section> : null}

      {snapshot.mode === 'active' ? <section className={`rounded-[20px] border p-4 ${snapshot.stats.ready_to_close ? 'border-success/30 bg-success-soft' : 'border-border-soft bg-surface-1'}`}>
        <div className="flex items-center gap-3"><CheckCircle2 className={`h-5 w-5 shrink-0 ${snapshot.stats.ready_to_close ? 'text-success' : 'text-text-muted'}`} /><div className="min-w-0 flex-1"><strong className="block text-[11px] text-text-primary">Финиш вечера</strong><span className="text-[8px] leading-4 text-text-muted">{snapshot.stats.ready_to_close ? 'Явка заполнена и созданные игры завершены. Можно делать финальную проверку и закрывать вечер.' : snapshot.blockers.map((item) => `${item.label}: ${item.count}`).join(' · ')}</span></div><button type="button" onClick={() => onOpenEveningSection(snapshot.evening.id, 'overview')} className="min-h-9 shrink-0 rounded-[10px] bg-accent px-2.5 text-[9px] font-black text-white">К итогу</button></div>
      </section> : null}
    </>}

    {data?.wrapup ? <section className="rounded-[20px] border border-warning/20 bg-warning-soft/40 p-4">
      <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-warning" /><div className="min-w-0 flex-1"><div className="text-[9px] font-black uppercase tracking-[0.12em] text-warning">После прошлого вечера</div><h3 className="mt-0.5 truncate text-[13px] font-black text-text-primary">{data.wrapup.evening.title}</h3><p className="mt-1 text-[8px] text-text-muted">{data.wrapup.unpaid.length ? `Не закрыты оплаты: ${data.wrapup.unpaid.length}.` : 'По оплатам всё закрыто.'}</p></div><button type="button" onClick={() => onOpenEvening(data.wrapup!.evening.id)} className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-surface-1 text-text-secondary"><ArrowRight className="h-4 w-4" /></button></div>
      {data.wrapup.unpaid.length ? <div className="mt-3 space-y-1.5">{data.wrapup.unpaid.slice(0, 4).map((row) => <div key={row.id} className="flex items-center gap-2 rounded-[10px] bg-surface-1 px-2.5 py-2"><span className="min-w-0 flex-1"><strong className="block truncate text-[9px] text-text-primary">{row.nickname}</strong><span className="text-[7px] text-text-muted">осталось {formatMoney(row.amount_due - row.amount_paid)}</span></span><button type="button" disabled={Boolean(busy)} onClick={() => void markPaid(row)} className="min-h-8 rounded-[9px] bg-success-soft px-2 text-[8px] font-black text-success disabled:opacity-40">Оплачено</button></div>)}</div> : null}
    </section> : null}
  </div>;
}
