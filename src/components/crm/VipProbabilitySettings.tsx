import { useEffect, useState } from 'react';
import { api, type Player } from '../../lib/api.ts';

type Kind = 'role' | 'same_color' | 'different_color' | 'red_color';
type Rule = { id: string; playerId: string; kind: Kind; role: string | null; otherPlayerId: string | null;
  percent: number; enabled: boolean };
type Draft = Omit<Rule, 'id'>;
const empty = (): Draft => ({ playerId:'', kind:'role',role:'citizen',otherPlayerId:null,
  percent:0,enabled:true });
const roleLabels: Record<string,string> = {
  citizen:'Мирный житель',sheriff:'Шериф',mafia:'Мафия',don:'Дон',
};
const labels: Record<Kind,string> = { role:'Конкретная роль',same_color:'Одноцвет с игроком',
  different_color:'Разноцвет с игроком', red_color:'Красная карта' };
const field = 'min-h-11 w-full rounded-xl border border-white/15 bg-[#202126] px-3 text-sm text-white';
async function send(url: string, init: RequestInit = {}) {
  const response = await fetch(url,{ credentials:'include',...init,headers:{
    'Content-Type':'application/json',...(init.headers||{}),
  } });
  const body: any = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(body.error || 'Не удалось сохранить правило');
  return body;
}

export default function VipProbabilitySettings() {
  const [players,setPlayers] = useState<Player[]>([]);
  const [rules,setRules] = useState<Rule[]>([]);
  const [draft,setDraft] = useState<Draft>(empty);
  const [editing,setEditing] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [loaded,setLoaded] = useState(false);
  const refresh = async () => {
    const data = await send('/api/admin/vip-probability-rules');
    setRules(Array.isArray(data.rules) ? data.rules : []);
  };
  useEffect(()=>{
    let live = true;
    void Promise.all([api.getPlayers(),send('/api/admin/vip-probability-rules')])
      .then(([people,data])=>{ if (!live) return;
        setPlayers(Array.isArray(people)?people:[]);
        setRules(Array.isArray(data.rules)?data.rules:[]);
      }).catch((cause:any)=>{if(live)setError(cause?.message||'Не удалось загрузить настройки');})
      .finally(()=>{if(live)setLoaded(true)});
    return ()=>{live=false};
  },[]);
  const change = <K extends keyof Draft>(key: K,value: Draft[K])=>
    setDraft(current=>({...current,[key]:value}));
  const edit = (rule:Rule)=>{
    setEditing(rule.id);
    setDraft({playerId:rule.playerId,kind:rule.kind,role:rule.role,
      otherPlayerId:rule.otherPlayerId,percent:rule.percent,enabled:rule.enabled});
  };
  const reset = ()=>{setEditing(null);setDraft(empty());};
  const save = async ()=>{
    if(busy)return;
    setBusy(true);setError('');
    try {
      const body = {...draft,
        role:draft.kind==='role'?draft.role:null,
        otherPlayerId:draft.kind==='same_color'||draft.kind==='different_color'?draft.otherPlayerId:null,
      };
      await send('/api/admin/vip-probability-rules'+(editing?'/'+encodeURIComponent(editing):''),{
        method:editing?'PUT':'POST',body:JSON.stringify(body),
      });
      await refresh();reset();
    }catch(cause:any){setError(cause?.message||'Не удалось сохранить');}
    finally{setBusy(false);}
  };
  const remove = async(id:string)=>{
    if(busy || !window.confirm('Удалить настройку вероятности?'))return;
    setBusy(true);setError('');
    try{await send('/api/admin/vip-probability-rules/'+encodeURIComponent(id),{method:'DELETE'});
      await refresh();if(editing===id)reset();
    }catch(cause:any){setError(cause?.message||'Не удалось удалить');}
    finally{setBusy(false);}
  };
  const playerName = (id:string|null)=>players.find(x=>String(x.id)===id)?.nickname || id || '—';
  return <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 space-y-3">
    <h3 className="text-base font-semibold text-white">Вероятности ролей и цвета</h3>
    <p className="text-xs leading-5 text-white/60">
      Настройки организатора для обычных и новичковых игр. Процент — шанс срабатывания
      конкретного условия. Общий лимит игр с успешной подкруткой задаётся отдельно
      для игрока, а не для каждого условия. Пока правила не влияют на реальную раздачу.
    </p>
    {loaded && <div className="space-y-2">
      {rules.map(rule=><div key={rule.id} className="rounded-xl border border-white/10 bg-black/15 p-3">
        <div className="text-sm text-white">{playerName(rule.playerId)} · {labels[rule.kind]}</div>
        <div className="mt-1 text-xs text-white/60">
          {rule.kind==='role'?roleLabels[rule.role||'']:rule.kind==='red_color'?'Любая красная роль':playerName(rule.otherPlayerId)}
          {' · '}{rule.percent}% · {rule.enabled?'Включено':'Выключено'}
        </div>
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={busy} onClick={()=>edit(rule)} className="min-h-10 rounded-lg border border-white/15 px-3 text-xs text-white">Изменить</button>
          <button type="button" disabled={busy} onClick={()=>void remove(rule.id)} className="min-h-10 rounded-lg border border-white/15 px-3 text-xs text-white/70">Удалить</button>
        </div>
      </div>)}
    </div>}
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs text-white/60">Игрок
        <select className={field} value={draft.playerId} onChange={e=>change('playerId',e.target.value)}>
          <option value="">Выбрать</option>{players.map(p=><option key={p.id} value={p.id}>{p.nickname}</option>)}
        </select>
      </label>
      <label className="text-xs text-white/60">Условие
        <select className={field} value={draft.kind} onChange={e=>change('kind',e.target.value as Kind)}>
          {(Object.keys(labels) as Kind[]).map(kind=><option key={kind} value={kind}>{labels[kind]}</option>)}
        </select>
      </label>
      {draft.kind==='red_color'?null:draft.kind==='role'?
        <label className="text-xs text-white/60">Роль
          <select className={field} value={draft.role||'citizen'} onChange={e=>change('role',e.target.value)}>
            {Object.entries(roleLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}
          </select>
        </label>:
        <label className="text-xs text-white/60">С кем
          <select className={field} value={draft.otherPlayerId||''} onChange={e=>change('otherPlayerId',e.target.value)}>
            <option value="">Выбрать</option>{players.filter(p=>String(p.id)!==draft.playerId).map(p=><option key={p.id} value={p.id}>{p.nickname}</option>)}
          </select>
        </label>}
      <div className="space-y-2 rounded-xl border border-white/10 p-3">
        <label htmlFor="vip-rule-percent" className="flex justify-between gap-2 text-xs text-white/70">
          <span>Шанс срабатывания</span><strong className="text-white">{draft.percent}%</strong>
        </label>
        <input id="vip-rule-percent" type="range" min={0} max={100} step={1} className="w-full accent-white"
          value={draft.percent} onChange={e=>change('percent',Number(e.target.value))}/>
      </div>
    </div>
    <label className="flex items-center gap-2 text-xs text-white/70">
      <input type="checkbox" checked={draft.enabled} onChange={e=>change('enabled',e.target.checked)}/> Включено
    </label>
    {error && <p role="alert" className="text-xs text-amber-200">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy||!draft.playerId} onClick={()=>void save()}
        className="min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-black disabled:opacity-40">
        {busy?'Сохраняем…':editing?'Сохранить изменения':'Добавить условие'}
      </button>
      {editing && <button type="button" onClick={reset} className="min-h-11 rounded-xl border border-white/15 px-3 text-sm text-white">Отмена</button>}
    </div>
  </section>;
}
