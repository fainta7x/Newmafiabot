import { useEffect, useRef, useState } from 'react';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';

type RoleRow = { player_id: string; nickname: string; avatar_url?: string | null; games: number; wins: number; win_rate: number; figures: Record<string, number>; is_me: boolean };
type RoleTable = {
  role: { key: string; label: string; hint: string; columns: Array<{ key: string; label: string }> };
  roles: Array<{ key: string; label: string }>;
  games_in_scope: number;
  total: number;
  rows: RoleRow[];
};

/** «По ролям»: the club's Dons, mafia, Sheriffs and citizens, each with games, wins and the role's own reveal figures. */
export default function PlayerRoleTables({ period, format }: { period: string; format: string }) {
  const [role, setRole] = useState('don');
  const [data, setData] = useState<RoleTable | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setLoading(true); setError('');
    const query = new URLSearchParams({ role });
    if (period !== 'all') query.set('period', period);
    if (format !== 'all') query.set('format', format);
    void fetch(`/api/rating/roles?${query}`, { credentials: 'include' }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить таблицу по ролям');
      if (current === generation.current) setData(body);
    }).catch((reason: any) => {
      if (current === generation.current) setError(reason?.message || 'Не удалось загрузить таблицу по ролям');
    }).finally(() => { if (current === generation.current) setLoading(false); });
  }, [role, period, format, retry]);

  return <section data-testid="role-tables" className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3">
    <div className="grid grid-cols-4 gap-1.5" role="tablist" aria-label="Роль">
      {(data?.roles || [{ key: 'don', label: 'Дон' }, { key: 'mafia', label: 'Мафия' }, { key: 'sheriff', label: 'Шериф' }, { key: 'citizen', label: 'Мирный' }]).map((item) => (
        <button key={item.key} type="button" role="tab" aria-selected={role === item.key} data-testid={`role-tab-${item.key}`} onClick={() => setRole(item.key)}
          className={`min-h-11 rounded-xl px-1 text-[12px] font-semibold ${role === item.key ? 'bg-white text-black' : 'bg-white/[0.07] text-white/70'}`}>{item.label}</button>
      ))}
    </div>
    {data ? <p className="mt-3 px-1 text-[11px] leading-4 text-white/40">{data.role.hint} · в играх выбранного периода: {data.games_in_scope}</p> : null}
    {error ? <div role="alert" className="mt-3 space-y-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] px-3 py-4"><p className="text-sm text-rose-100/75">{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="min-h-11 w-full rounded-xl border border-white/15 bg-white/[0.07] px-3 text-sm font-semibold text-white">Повторить</button></div>
      : loading || !data ? <div className="mt-3 rounded-2xl bg-black/20 px-3 py-6 text-center text-sm text-white/40">Загружаю таблицу…</div>
      : data.rows.length ? <div className={`mt-2 space-y-1.5 ${loading ? 'opacity-60' : ''}`}>
        {data.rows.map((row, index) => <button key={row.player_id} type="button" data-testid={`role-row-${row.player_id}`} onClick={() => openCanonicalPlayerProfile(row.player_id)}
          className={`ds-focus-ring min-h-[112px] w-full rounded-[20px] border p-3 text-left ${row.is_me ? 'border-white/25 bg-white/[0.08]' : 'border-white/[0.07] bg-black/20'}`}>
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-sm font-semibold text-white/70">{index + 1}</span>
            {row.avatar_url ? <img src={row.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-[14px] object-cover ring-1 ring-white/10" /> : <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-white/[0.08] text-sm font-semibold">{row.nickname.slice(0, 1).toUpperCase()}</span>}
            <span className="min-w-0 flex-1 break-words text-sm font-semibold">{row.nickname}</span>
            <span className="shrink-0 text-right tabular-nums"><b className="block text-lg font-semibold leading-5 text-white">{row.win_rate}%</b><span className="block text-[11px] text-white/45">{row.games} игр</span></span>
          </div>
          <div aria-hidden="true" className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-amber-200/70" style={{ width: `${Math.max(0, Math.min(100, row.win_rate))}%` }} /></div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-white/60">побед {row.wins}</span>
            {data.role.columns.map((column) => <span key={column.key} className="rounded-full bg-amber-200/10 px-2 py-0.5 text-[11px] text-amber-100/80">{column.label}: <b>{row.figures[column.key] ?? 0}</b></span>)}
          </div>
        </button>)}
      </div>
      : <div className="mt-3 rounded-2xl bg-black/20 px-3 py-6 text-center text-sm text-white/40">В этом выборе за эту роль пока никто не играл.</div>}
  </section>;
}
