import { useEffect,useState } from 'react';
import { api, type Player } from '../../lib/api.ts';

type Scope = 'game'|'evening';
type Tier = {id:string;name:string;limit:number|null;scope:Scope;enabled:boolean};
type Assignment = {playerId:string;tierId:string};
type Draft = Omit<Tier,'id'>;
const empty=():Draft=>({name:'',limit:null,scope:'evening',enabled:true});
const inputClass='min-h-11 w-full rounded-xl border border-white/15 bg-[#202126] px-3 text-sm text-white';
async function call(url:string,init:RequestInit={}) {
  const response=await fetch(url,{credentials:'include',...init,
    headers:{'Content-Type':'application/json',...(init.headers||{})}});
  const body:any=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error||'Не удалось сохранить VIP-уровень');
  return body;
}
export default function VipTierSettings() {
  const [tiers,setTiers]=useState<Tier[]>([]);
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [players,setPlayers]=useState<Player[]>([]);
  const [draft,setDraft]=useState<Draft>(empty);
  const [editId,setEditId]=useState<string|null>(null);
  const [limitText,setLimitText]=useState('');
  const [playerId,setPlayerId]=useState('');
  const [chosenTier,setChosenTier]=useState('');
  const [busy,setBusy]=useState(false);
  const [previewUsed,setPreviewUsed]=useState(0);
  const [previewTierId,setPreviewTierId]=useState('');
  const [error,setError]=useState('');
  const [loaded,setLoaded]=useState(false);
  const refresh=async()=>{
    const response=await call('/api/admin/vip-probability-rules/tiers');
    setTiers(Array.isArray(response.tiers)?response.tiers:[]);
    setAssignments(Array.isArray(response.assignments)?response.assignments:[]);
  };
  useEffect(()=>{
    let mounted=true;
    void Promise.all([call('/api/admin/vip-probability-rules/tiers'),api.getPlayers()])
      .then(([response,people])=>{
        if(!mounted)return;
        setTiers(Array.isArray(response.tiers)?response.tiers:[]);
        setAssignments(Array.isArray(response.assignments)?response.assignments:[]);
        setPlayers(Array.isArray(people)?people:[]);
      }).catch((cause:any)=>{if(mounted)setError(cause?.message||'Не удалось загрузить');})
      .finally(()=>{if(mounted)setLoaded(true);});
    return ()=>{mounted=false;};
  },[]);
  const edit=(tier:Tier)=>{
    setEditId(tier.id);setDraft({name:tier.name,limit:tier.limit,scope:tier.scope,enabled:tier.enabled});
    setLimitText(tier.limit==null?'':String(tier.limit));
  };
  const reset=()=>{setEditId(null);setDraft(empty());setLimitText('');};
  const save=async()=>{
    if(busy)return;setBusy(true);setError('');
    try {
      const data={...draft,limit:limitText.trim()===''?null:Number(limitText)};
      await call('/api/admin/vip-probability-rules/tiers'+(editId?'/'+encodeURIComponent(editId):''),{
        method:editId?'PUT':'POST',body:JSON.stringify(data),
      });
      await refresh();reset();
    }catch(cause:any){setError(cause?.message||'Не удалось сохранить');}
    finally{setBusy(false);}
  };
  const assign=async()=>{
    if(!playerId||busy)return;setBusy(true);setError('');
    try {
      await call('/api/admin/vip-probability-rules/assignments/'+encodeURIComponent(playerId),{
        method:'PUT',body:JSON.stringify({tierId:chosenTier||null}),
      });
      await refresh();
    }catch(cause:any){setError(cause?.message||'Не удалось назначить уровень');}
    finally{setBusy(false);}
  };
  const remove=async(id:string)=>{
    if(busy||!window.confirm('Удалить VIP-уровень и назначения?'))return;
    setBusy(true);setError('');
    try {
      await call('/api/admin/vip-probability-rules/tiers/'+encodeURIComponent(id),{method:'DELETE'});
      await refresh();if(editId===id)reset();
    }catch(cause:any){setError(cause?.message||'Не удалось удалить');}
    finally{setBusy(false);}
  };
  return <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
    <h3 className="text-base font-semibold text-white">VIP-уровни и лимиты подмен</h3>
    <p className="text-xs leading-5 text-white/60">
      Создавайте собственные уровни и тестируйте лимит успешных подмен: за игру или за вечер.
      Персональный лимит условия, если задан, имеет приоритет. Пока настройки не подключены к реальной раздаче.
    </p>
    {loaded && tiers.map(tier=><div key={tier.id} className="rounded-xl border border-white/10 p-3">
      <p className="text-sm font-semibold text-white">{tier.name} · {tier.enabled?'Включён':'Выключен'}</p>
      <p className="mt-1 text-xs text-white/60">Лимит: {tier.limit==null?'Не задан':tier.limit} · {tier.scope==='game'?'за игру':'за вечер'}
        {' · Игроков: '}{assignments.filter(x=>x.tierId===tier.id).length}
      </p>
      <div className="mt-2 flex gap-2">
        <button type="button" className="min-h-10 rounded-lg border border-white/15 px-3 text-xs text-white" onClick={()=>edit(tier)}>Изменить</button>
        <button type="button" className="min-h-10 rounded-lg border border-white/15 px-3 text-xs text-white" onClick={()=>void remove(tier.id)}>Удалить</button>
      </div>
    </div>)}
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs text-white/60">Название уровня
        <input className={inputClass} maxLength={64} value={draft.name} onChange={e=>setDraft(x=>({...x,name:e.target.value}))} placeholder="Например, VIP Gold"/>
      </label>
      <label className="text-xs text-white/60">Лимит успешных подмен
        <input className={inputClass} type="number" min={0} step={1} placeholder="Не задан" value={limitText} onChange={e=>setLimitText(e.target.value)}/>
      </label>
      <label className="text-xs text-white/60">Период лимита
        <select className={inputClass} value={draft.scope} onChange={e=>setDraft(x=>({...x,scope:e.target.value as Scope}))}>
          <option value="game">На одну игру</option><option value="evening">На игровой вечер</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft(x=>({...x,enabled:e.target.checked}))}/>Уровень включён</label>
    </div>
    <div className="flex gap-2">
      <button type="button" disabled={busy||!draft.name.trim()} onClick={()=>void save()} className="min-h-11 rounded-xl bg-white px-4 text-xs font-bold text-black disabled:opacity-50">
        {editId?'Сохранить уровень':'Создать уровень'}
      </button>
      {editId&&<button type="button" onClick={reset} className="min-h-11 rounded-xl border border-white/15 px-3 text-xs text-white">Отмена</button>}
    </div>
    <div className="border-t border-white/10 pt-3">
      <h4 className="text-sm font-semibold text-white">Назначить VIP-уровень игроку</h4>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-white/60">Игрок
          <select className={inputClass} value={playerId} onChange={e=>{
            const next=e.target.value;setPlayerId(next);
            setChosenTier(assignments.find(a=>a.playerId===next)?.tierId||'');
          }}>
            <option value="">Выберите игрока</option>{players.map(p=><option key={p.id} value={p.id}>{p.nickname}</option>)}
          </select>
        </label>
        <label className="text-xs text-white/60">VIP-уровень
          <select className={inputClass} value={chosenTier} onChange={e=>setChosenTier(e.target.value)}>
            <option value="">Без VIP-уровня</option>{tiers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      </div>
      <button type="button" disabled={busy||!playerId} onClick={()=>void assign()}
        className="mt-2 min-h-11 rounded-xl bg-white px-4 text-xs font-bold text-black disabled:opacity-50">Сохранить назначение</button>
    </div>
    <div className="space-y-2 border-t border-white/10 pt-3">
      <h4 className="text-sm font-semibold text-white">Проверить настройки на примере</h4>
      <p className="text-xs text-white/60">Расчёт без применения к настоящим играм и без начислений.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-white/60">VIP-уровень
          <select className={inputClass} value={previewTierId} onChange={e=>setPreviewTierId(e.target.value)}>
            <option value="">Выбрать уровень</option>{tiers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-white/60">Уже успешных подмен за период
          <input type="number" min={0} step={1} className={inputClass} value={previewUsed}
            onChange={e=>setPreviewUsed(Math.max(0,Math.floor(Number(e.target.value)||0)))}/>
        </label>
      </div>
      {tiers.filter(t=>t.id===previewTierId).map(t=><p key={t.id} className="rounded-xl bg-black/20 p-3 text-xs text-white/75">
        {t.enabled
          ? t.limit===null
            ? 'Лимит не задан: окончательное разрешение определит механизм раздачи.'
            : previewUsed<t.limit
              ? `Следующая подмена допускается лимитом. Осталось ${t.limit-previewUsed} на ${t.scope==='game'?'игру':'вечер'}.`
              : `Лимит исчерпан: следующая подмена блокируется на ${t.scope==='game'?'эту игру':'этот вечер'}.`
          : 'VIP-уровень выключен.'}
      </p>)}
    </div>
    {error&&<p role="alert" className="text-xs text-amber-200">{error}</p>}
  </section>;
}
