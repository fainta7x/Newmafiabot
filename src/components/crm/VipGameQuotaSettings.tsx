import { useEffect,useState } from 'react';
import { api,type Player } from '../../lib/api.ts';

type Quota={playerId:string;wholeEvening:boolean;maxSuccessfulGames:number|null};
const cls='min-h-11 w-full rounded-xl border border-white/15 bg-[#202126] px-3 text-sm text-white';
async function call(url:string,init:RequestInit={}){
  const res=await fetch(url,{credentials:'include',...init,headers:{'Content-Type':'application/json',...(init.headers||{})}});
  const body:any=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(body.error||'Не удалось сохранить настройки');
  return body;
}
export default function VipGameQuotaSettings(){
  const [players,setPlayers]=useState<Player[]>([]);
  const [quotas,setQuotas]=useState<Quota[]>([]);
  const [playerId,setPlayerId]=useState('');
  const [wholeEvening,setWholeEvening]=useState(true);
  const [maxGames,setMaxGames]=useState(2);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [loaded,setLoaded]=useState(false);
  const refresh=async()=>{
    const response=await call('/api/admin/vip-probability-rules/game-quotas');
    setQuotas(Array.isArray(response.quotas)?response.quotas:[]);
  };
  useEffect(()=>{
    let alive=true;
    void Promise.all([api.getPlayers(),call('/api/admin/vip-probability-rules/game-quotas')])
      .then(([people,data])=>{if(alive){
        setPlayers(Array.isArray(people)?people:[]);
        setQuotas(Array.isArray(data.quotas)?data.quotas:[]);
      }}).catch((cause:any)=>{if(alive)setError(cause.message||'Ошибка загрузки');})
      .finally(()=>{if(alive)setLoaded(true)});
    return ()=>{alive=false};
  },[]);
  const selectPlayer=(id:string)=>{
    setPlayerId(id);
    const saved=quotas.find(q=>q.playerId===id);
    setWholeEvening(saved?.wholeEvening??true);
    setMaxGames(saved?.maxSuccessfulGames??2);
  };
  const save=async()=>{
    if(!playerId||busy)return;
    setBusy(true);setError('');
    try{
      await call('/api/admin/vip-probability-rules/game-quotas/'+encodeURIComponent(playerId),{
        method:'PUT',body:JSON.stringify({wholeEvening,maxSuccessfulGames:wholeEvening?null:maxGames}),
      });
      await refresh();
    }catch(cause:any){setError(cause?.message||'Не удалось сохранить');}
    finally{setBusy(false);}
  };
  return <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
    <h3 className="text-base font-semibold text-white">Игры с успешной подкруткой</h3>
    <p className="text-xs leading-5 text-white/60">
      Одно ограничение на все условия выбранного игрока. Если в одной игре сработало
      несколько условий, это всё равно одна успешная игра. Неудачная попытка не расходует лимит.
    </p>
    <label className="block text-xs text-white/70">Игрок
      <select className={cls} value={playerId} onChange={e=>selectPlayer(e.target.value)}>
        <option value="">Выберите игрока</option>
        {players.map(p=><option key={p.id} value={p.id}>{p.nickname}</option>)}
      </select>
    </label>
    {playerId&&<div className="space-y-3">
      <label className="flex min-h-11 items-center gap-2 text-sm text-white">
        <input type="checkbox" checked={wholeEvening} onChange={e=>setWholeEvening(e.target.checked)}/>
        На весь вечер
      </label>
      {wholeEvening?
        <p className="text-xs text-white/60">Вероятности проверяются в каждой игре вечера без лимита успешных игр.</p>:
        <div className="rounded-xl border border-white/10 p-3 space-y-2">
          <div className="flex justify-between gap-2 text-xs text-white/75">
            <label htmlFor="vip-game-quota-range">Игр со сработавшей подкруткой за вечер</label>
            <strong className="text-white">{maxGames}</strong>
          </div>
          <input id="vip-game-quota-range" type="range" min={1} max={20} step={1}
            className="w-full accent-white" value={Math.min(maxGames,20)}
            onChange={e=>setMaxGames(Number(e.target.value))}/>
          <label className="flex items-center gap-2 text-xs text-white/60">
            Точное число
            <input className="min-h-10 w-20 rounded-lg border border-white/15 bg-[#202126] px-2 text-sm text-white"
              type="number" min={1} max={10000} step={1} value={maxGames}
              onChange={e=>setMaxGames(Number(e.target.value))}/>
          </label>
          <p className="text-[11px] text-white/45">После указанного количества успешных игр вероятность больше не проверяется до следующего вечера.</p>
        </div>
      }
      <button type="button" disabled={busy||(!wholeEvening&&(!Number.isInteger(maxGames)||maxGames<1||maxGames>10000))}
        onClick={()=>void save()} className="min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-black disabled:opacity-50">
        {busy?'Сохранение…':'Сохранить'}
      </button>
    </div>}
    {error&&<p role="alert" className="text-xs text-amber-200">{error}</p>}
    {!loaded&&<p className="text-xs text-white/50">Загрузка…</p>}
  </section>;
}
