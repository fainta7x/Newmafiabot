import { AvatarImage } from '../ui/AvatarImage.tsx';
import { getPlayerGameRoleLabel } from '../../lib/playerGameRoleLabels.ts';
import { gameResultText } from '../../lib/playerResultObservations.ts';
import { GAME_ROLES, type GameRole } from '../../shared/gameRoles.ts';
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
  const [role, setRole] = useState(()=>{try{return sessionStorage.getItem('community-role-view')||'don';}catch{return 'don';}});
  useEffect(()=>{try{sessionStorage.setItem('community-role-view',role);}catch{}},[role]);
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
    return () => { generation.current += 1; };
  }, [role, period, format, retry]);

  return <section data-testid="role-tables" className="mt-4 border-t border-white/10 pt-3">
    <div className="grid grid-cols-4 gap-1.5" role="tablist" aria-label="Роль">
      {(data?.roles || (['don', 'mafia', 'sheriff', 'citizen'] as GameRole[]).map(key => ({ key, label: GAME_ROLES[key].label }))).map((item) => (
        <button key={item.key} type="button" role="tab" aria-selected={role === item.key} data-testid={`role-tab-${item.key}`} onClick={() => setRole(item.key)}
          className={`min-h-11 rounded-xl px-1 text-[12px] font-semibold ${role === item.key ? 'bg-white text-black' : 'bg-white/[0.07] text-white/70'}`}>{getPlayerGameRoleLabel(item.key) ?? item.label}</button>
      ))}
    </div>
    {data && !loading && !error ? <div className="mt-3 space-y-1 px-1 text-xs leading-5 text-white/60"><p>Порядок по числу игр в роли, затем по проценту побед.</p><p>Показано {data.rows.length} из {data.total} игроков · {data.role.hint} · в играх выбранного периода: {data.games_in_scope}</p></div> : null}
    {error ? <div role="alert" className="mt-3 space-y-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.07] px-3 py-4"><p className="text-sm text-rose-100/75">{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="min-h-11 w-full rounded-xl border border-white/15 bg-white/[0.07] px-3 text-sm font-semibold text-white">Повторить</button></div>
      : loading || !data ? <div className="mt-3 rounded-2xl bg-black/20 px-3 py-6 text-center text-sm text-white/40">Загружаю таблицу…</div>
      : data.rows.length ? <div className="mt-2 divide-y divide-white/[.07]">
        {data.rows.map((row, index) => <button key={row.player_id} type="button" data-testid={`role-row-${row.player_id}`} onClick={() => openCanonicalPlayerProfile(row.player_id)}
          className={`ds-focus-ring min-h-11 w-full px-1 py-3 text-left ${row.is_me ? 'bg-sky-200/[0.08]' : 'hover:bg-white/[.035]'}`}>
          <div className="flex items-center gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.06] text-xs font-semibold text-white/70">{index + 1}</span>
            {row.avatar_url ? <AvatarImage src={row.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-xl object-cover ring-1 ring-white/10" /> : null}
            <span className="min-w-0 flex-1 break-words text-sm font-medium">{row.nickname}</span>
            <span className="shrink-0 text-right text-[12px] tabular-nums text-white/60"><b className="text-white">{row.win_rate}%</b><span className="block">побед</span></span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 pl-10">
            <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-white/60">{gameResultText(row)}</span>
            {data.role.columns.map((column) => <span key={column.key} className="rounded-full bg-amber-200/10 px-2 py-0.5 text-[11px] text-amber-100/80">{column.label}: <b>{row.figures[column.key] ?? 0}</b></span>)}
          </div>
        </button>)}
      </div>
      : <div className="mt-3 rounded-2xl bg-black/20 px-3 py-6 text-center text-sm text-white/40">В этом выборе за эту роль пока никто не играл.</div>}
  </section>;
}
