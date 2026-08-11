import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Coins, RefreshCw, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';

type Team = 'red' | 'black';
type Bet = {
  id: string;
  player_id: string;
  nickname: string;
  team: Team;
  amount: number;
  status: string;
  payout_amount: number;
  final_coefficient: number | null;
  placed_at: string;
  settled_at: string | null;
};
type RoleSnapshot = { seat_number: number; nickname: string; role: string; team: Team };
type Pool = {
  id: string;
  game_id: number;
  game_number: number | null;
  game_date: string | null;
  status: 'open' | 'closed' | 'settled' | 'refunded';
  opens_at: string;
  closes_at: string;
  red_pool: number;
  black_pool: number;
  red_coefficient: number;
  black_coefficient: number;
  house_rate_bps: number;
  max_coefficient: number;
  reserve_amount: number;
  settled_winner: Team | null;
  settled_at: string | null;
  total_staked: number;
  total_paid_out: number;
  bet_count: number;
  role_snapshot: RoleSnapshot[];
  bets: Bet[];
};
type Overview = {
  summary: { pools: number; open: number; unsettled: number; settled: number; refunded: number; reserve_total: number };
  pools: Pool[];
};
type Filter = 'all' | Pool['status'];

const apiFetch = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Ошибка запроса');
  return body as T;
};

const statusMeta: Record<Pool['status'], { label: string; className: string }> = {
  open: { label: 'Ставки открыты', className: 'bg-success-soft text-success' },
  closed: { label: 'Ждёт результата', className: 'bg-warning-soft text-warning' },
  settled: { label: 'Рассчитано', className: 'bg-surface-2 text-text-secondary' },
  refunded: { label: 'Возвращено', className: 'bg-danger-soft text-danger' },
};
const roleLabel: Record<string, string> = { citizen: 'Мирный', sheriff: 'Шериф', mafia: 'Мафия', don: 'Дон' };
const money = (value: number) => Number(value || 0).toLocaleString('ru-RU');
const coef = (value: number | null | undefined) => `x${Number(value || 1).toFixed(2)}`;

export const BettingAdminCRM: React.FC = () => {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = async () => {
    setError(null);
    try {
      setData(await apiFetch<Overview>('/api/games/betting/admin/overview'));
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить ставки');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const pools = useMemo(() => {
    if (!data) return [];
    return filter === 'all' ? data.pools : data.pools.filter((pool) => pool.status === filter);
  }, [data, filter]);

  const runAction = async (pool: Pool, action: 'close' | 'refund' | 'settle', winner?: Team) => {
    const title = action === 'close'
      ? 'Закрыть приём ставок прямо сейчас?'
      : action === 'refund'
        ? 'Вернуть все ставки игрокам? Выплаты, если они уже были, будут отменены.'
        : `Принудительно рассчитать победу ${winner === 'red' ? 'красных' : 'чёрных'}?`;
    if (!window.confirm(title)) return;
    const key = `${pool.game_id}:${action}:${winner || ''}`;
    setBusy(key); setError(null); setMessage(null);
    try {
      const suffix = action === 'settle' ? 'settle' : action;
      await apiFetch(`/api/games/${pool.game_id}/betting/${suffix}`, {
        method: 'POST',
        body: JSON.stringify(action === 'settle' ? { winner, note: 'Ручное действие из управления ставками' } : { note: 'Ручное действие из управления ставками' }),
      });
      setMessage(action === 'close' ? 'Приём ставок закрыт' : action === 'refund' ? 'Ставки возвращены' : 'Банк пересчитан');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Не удалось выполнить действие');
    } finally {
      setBusy(null);
    }
  };

  const reconcile = async () => {
    setBusy('reconcile'); setError(null); setMessage(null);
    try {
      const body = await apiFetch<{ changed: number }>('/api/games/betting/reconcile', { method: 'POST' });
      setMessage(`Автопроверка завершена · изменений: ${body.changed}`);
      await load();
    } catch (err: any) { setError(err?.message || 'Не удалось пересчитать ставки'); }
    finally { setBusy(null); }
  };

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-accent" /></div>;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[24px] font-black tracking-tight text-text-primary">Управление ставками</h2>
          <p className="mt-1 text-[13px] leading-5 text-text-secondary">Контроль тотализатора, банков, выплат и аварийных возвратов.</p>
        </div>
        <button type="button" disabled={busy === 'reconcile'} onClick={() => void reconcile()} className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-border-soft bg-surface-1 text-text-secondary disabled:opacity-40" title="Пересчитать все ставки">
          <RefreshCw className={`h-4.5 w-4.5 ${busy === 'reconcile' ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error ? <div className="rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] font-semibold text-danger">{error}</div> : null}
      {message ? <div className="rounded-[14px] border border-success/20 bg-success-soft p-3 text-[12px] font-semibold text-success">{message}</div> : null}

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-[16px] border border-border-soft bg-surface-1 p-3"><div className="text-[10px] text-text-muted">Открыто</div><div className="mt-1 text-[20px] font-black">{data?.summary.open || 0}</div></div>
        <div className="rounded-[16px] border border-border-soft bg-surface-1 p-3"><div className="text-[10px] text-text-muted">Ждут итога</div><div className="mt-1 text-[20px] font-black">{data?.summary.unsettled || 0}</div></div>
        <div className="rounded-[16px] border border-border-soft bg-surface-1 p-3"><div className="text-[10px] text-text-muted">Резерв клуба</div><div className="mt-1 truncate text-[18px] font-black">{money(data?.summary.reserve_total || 0)} 🪙</div></div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-[14px] border border-border-soft bg-surface-1 p-1">
        {([
          ['all', 'Все'], ['open', 'Открытые'], ['closed', 'Ждут'], ['settled', 'Рассчитаны'], ['refunded', 'Возвраты'],
        ] as Array<[Filter, string]>).map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className={`min-h-10 shrink-0 rounded-[10px] px-3 text-[11px] font-bold ${filter === id ? 'bg-accent text-white' : 'text-text-muted'}`}>{label}</button>
        ))}
      </div>

      {!pools.length ? <div className="rounded-[18px] border border-border-soft bg-surface-1 p-5 text-center text-[12px] text-text-muted">В этой категории ставок пока нет.</div> : null}

      <div className="space-y-3">
        {pools.map((pool) => {
          const meta = statusMeta[pool.status];
          return (
            <details key={pool.id} className="overflow-hidden rounded-[18px] border border-border-soft bg-surface-1">
              <summary className="cursor-pointer list-none p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-black text-text-primary">Игра №{pool.game_number || pool.game_id}</div>
                    <div className="mt-1 text-[11px] text-text-muted">{pool.game_date || 'дата не указана'} · {pool.bet_count} ставок · банк {money(pool.total_staked)} 🪙</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${meta.className}`}>{meta.label}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-[13px] bg-red-500/[0.08] p-3"><div className="text-[10px] font-bold text-red-300/70">🔴 Красные</div><div className="mt-1 flex items-end justify-between gap-2"><span className="text-[17px] font-black">{money(pool.red_pool)} 🪙</span><span className="text-[12px] font-bold text-red-200/70">{coef(pool.red_coefficient)}</span></div></div>
                  <div className="rounded-[13px] bg-white/[0.055] p-3"><div className="text-[10px] font-bold text-text-secondary">⚫ Чёрные</div><div className="mt-1 flex items-end justify-between gap-2"><span className="text-[17px] font-black">{money(pool.black_pool)} 🪙</span><span className="text-[12px] font-bold text-text-secondary">{coef(pool.black_coefficient)}</span></div></div>
                </div>
              </summary>

              <div className="space-y-4 border-t border-border-soft p-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-[12px] bg-surface-2 p-2.5"><div className="text-[9px] text-text-muted">Комиссия</div><div className="mt-1 text-[13px] font-bold">{(Number(pool.house_rate_bps || 0) / 100).toFixed(0)}%</div></div>
                  <div className="rounded-[12px] bg-surface-2 p-2.5"><div className="text-[9px] text-text-muted">Резерв</div><div className="mt-1 text-[13px] font-bold">{money(pool.reserve_amount)} 🪙</div></div>
                  <div className="rounded-[12px] bg-surface-2 p-2.5"><div className="text-[9px] text-text-muted">Выплачено</div><div className="mt-1 text-[13px] font-bold">{money(pool.total_paid_out)} 🪙</div></div>
                </div>

                <section>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">Состав и роли</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {pool.role_snapshot.map((person) => <div key={`${person.seat_number}:${person.nickname}`} className="rounded-[11px] bg-surface-2 px-2.5 py-2 text-[11px]"><span className="text-text-muted">#{person.seat_number}</span> <strong>{person.nickname}</strong><div className="mt-0.5 text-[10px] text-text-secondary">{roleLabel[person.role] || person.role}</div></div>)}
                  </div>
                </section>

                <section>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">Ставки игроков</div>
                  {!pool.bets.length ? <div className="rounded-[12px] bg-surface-2 p-3 text-[11px] text-text-muted">Никто не поставил.</div> : <div className="space-y-1.5">{pool.bets.map((bet) => <div key={bet.id} className="flex items-center gap-3 rounded-[12px] bg-surface-2 px-3 py-2.5"><span className="text-base">{bet.team === 'red' ? '🔴' : '⚫'}</span><div className="min-w-0 flex-1"><div className="truncate text-[12px] font-bold">{bet.nickname}</div><div className="text-[10px] text-text-muted">{new Date(bet.placed_at).toLocaleString('ru-RU')}</div></div><div className="text-right"><div className="text-[12px] font-black">{money(bet.amount)} 🪙</div>{pool.status === 'settled' ? <div className="mt-0.5 text-[10px] text-text-secondary">{bet.payout_amount ? `${coef(bet.final_coefficient)} → ${money(bet.payout_amount)}` : 'проигрыш'}</div> : null}</div></div>)}</div>}
                </section>

                {pool.settled_winner ? <div className="flex items-center gap-2 rounded-[13px] bg-success-soft p-3 text-[12px] font-bold text-success"><ShieldCheck className="h-4 w-4" /> Победили {pool.settled_winner === 'red' ? 'красные' : 'чёрные'}</div> : null}

                <div className="space-y-2 border-t border-border-soft pt-4">
                  <div className="flex items-center gap-2 text-[11px] font-bold text-text-muted"><AlertTriangle className="h-4 w-4" /> Ручное управление</div>
                  {pool.status === 'open' ? <button disabled={Boolean(busy)} onClick={() => void runAction(pool, 'close')} className="min-h-11 w-full rounded-[12px] bg-warning-soft text-[12px] font-bold text-warning">Закрыть приём ставок сейчас</button> : null}
                  {pool.status === 'closed' || pool.status === 'settled' ? <div className="grid grid-cols-2 gap-2"><button disabled={Boolean(busy)} onClick={() => void runAction(pool, 'settle', 'red')} className="min-h-11 rounded-[12px] bg-red-500/[0.12] text-[11px] font-bold text-red-200">🔴 Победа красных</button><button disabled={Boolean(busy)} onClick={() => void runAction(pool, 'settle', 'black')} className="min-h-11 rounded-[12px] bg-surface-2 text-[11px] font-bold text-text-primary">⚫ Победа чёрных</button></div> : null}
                  {pool.status !== 'refunded' ? <button disabled={Boolean(busy)} onClick={() => void runAction(pool, 'refund')} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-danger/25 bg-danger-soft text-[11px] font-bold text-danger"><RotateCcw className="h-4 w-4" /> Вернуть все ставки</button> : <div className="flex items-center justify-center gap-2 rounded-[12px] bg-surface-2 p-3 text-[11px] text-text-muted"><XCircle className="h-4 w-4" /> Банк закрыт возвратом</div>}
                </div>
              </div>
            </details>
          );
        })}
      </div>

      <div className="rounded-[15px] border border-border-soft bg-surface-1 p-3 text-[11px] leading-5 text-text-muted">
        <div className="mb-1 flex items-center gap-2 font-bold text-text-secondary"><Coins className="h-4 w-4" /> Как работает ручная коррекция</div>
        При смене победителя уже выданные выплаты сначала отменяются через журнал жетонов, после чего банк рассчитывается заново. «Вернуть все ставки» возвращает игрокам их исходные суммы и закрывает банк окончательно.
      </div>
    </div>
  );
};

export default BettingAdminCRM;
