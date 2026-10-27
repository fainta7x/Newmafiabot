import { getPlayerGameRoleLabel } from '../../lib/playerGameRoleLabels.ts';
import { RoleMark } from './PlayerGameGraphics.tsx';
import { gameResultText } from '../../lib/playerResultObservations.ts';

type RoleResult = { role: string; label?: string; games?: number; total?: number; wins?: number; win_rate?: number; recent_form?: string[] };

export default function PlayerRoleResults({ roles }: { roles: RoleResult[] }) {
  return <section className="profile-role-list divide-y divide-white/[.07] rounded-3xl border border-white/10 bg-white/[.035] px-4" aria-label="Ролевая статистика">
    <header className="py-3"><h2 className="text-sm font-semibold">Результаты по ролям</h2><p className="mt-1 text-xs leading-5 text-white/55">Победы команды в выбранных играх. Последние исходы — от старого к новому.</p></header>
    {roles.map(role=>{
      const games=Number(role.games??role.total??0);
      const form=(role.recent_form??[]).slice(0,5).filter(value=>value==='W'||value==='L').reverse();
      return <article key={role.role} className="py-4">
        <div className="flex items-start gap-3"><RoleMark role={role.role}/><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{getPlayerGameRoleLabel(role.role)||role.label||role.role}</h3><p className="mt-1 text-xs leading-5 text-white/60">{role.role==='mafia'||role.role==='don'?'Чёрная команда':'Красная команда'}</p></div><p className="text-lg font-semibold tabular-nums">{games>0&&role.win_rate!=null?`${role.win_rate}%`:'—'}</p></div>
        <p className="mt-2 text-sm text-white/80">{games>0?role.wins!=null?gameResultText({wins:role.wins,games}):`Игр: ${games}`:'За эту роль пока нет игр'}</p>
        {form.length>0&&<ol aria-label="Последние результаты в роли" className="mt-2 flex gap-1.5">{form.map((value,index)=><li key={index} aria-label={value==='W'?'Победа':'Поражение'} title={value==='W'?'Победа':'Поражение'} className={`grid h-7 w-7 place-items-center rounded-lg text-sm font-semibold ${value==='W'?'bg-emerald-300/10 text-emerald-200':'bg-rose-300/10 text-rose-200'}`}>{value==='W'?'✓':'×'}</li>)}</ol>}
      </article>;
    })}
  </section>;
}
