import { useCallback, useEffect, useState } from 'react';

type HeldPost = { key:string; attempt_id:string; entity_id?:string; evening_id?:string; title?:string; action_path?:string; kind:string; channel:string; target:string; text:string; error?:string; legacy:boolean; status?:string };

/** Held public posts belong in «Дела», including automatic game and tournament results. */
export default function PublicationRecoveryQueue({ refreshKey=0,onOpenEvening }: {refreshKey?:number;onOpenEvening?:(id:string)=>void}) {
  const [items,setItems]=useState<HeldPost[]>([]);
  const [selected,setSelected]=useState('');
  const [decision,setDecision]=useState('');
  const [evidence,setEvidence]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const load=useCallback(async()=>{
    try {
      const response=await fetch('/api/crm/publications/held',{credentials:'include',cache:'no-store'});
      if(response.status===403)return;
      const body=await response.json();
      if(!response.ok)throw new Error(body.error || 'Не удалось проверить публикации');
      setItems(Array.isArray(body.items)?body.items:[]);
    } catch(error:any){setError(error?.message || 'Не удалось проверить публикации');}
  },[]);
  useEffect(()=>{void load();},[load,refreshKey]);
  const resolve=async(item:HeldPost)=>{
    if(busy)return;setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/crm/publications/reconcile',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:item.key,attempt_id:item.attempt_id,decision,evidence,confirmed:decision==='absent'||decision==='retry'})});
      const body=await response.json();if(!response.ok)throw new Error(body.error || 'Не удалось сохранить проверку');
      setSelected('');setDecision('');setEvidence('');
      setNotice(body.legacy && ['absent','retry'].includes(decision) ? 'Повтор разрешён. Откройте исходный вечер или турнир и запустите публикацию.' : body.result?.certainty==='uncertain' ? 'Ответ снова не получен. Проверьте канал перед следующим действием.' : 'Результат проверки сохранён.');
      await load();
    }catch(error:any){setError(error?.message || 'Не удалось сохранить проверку');}finally{setBusy(false);}
  };
  if(!items.length&&!error&&!notice)return null;
  return <div data-testid="publication-recovery" className="mt-3 space-y-3 rounded-xl border border-warning/40 p-3">
    <h4 className="text-sm font-bold text-text-primary">Проверить публикации{items.length ? ` · ${items.length}` : ''}</h4>
    <p className="text-xs leading-5 text-text-secondary">Пост мог выйти, хотя ответ не получен. Автоматический повтор остановлен. Проверьте указанный канал.</p>
    {error ? <p role="alert" className="break-words text-xs text-danger">{error}</p>:null}
    {notice ? <p role="status" className="text-xs leading-5 text-text-secondary">{notice}</p>:null}
    {items.map(item=><article key={item.key} className="space-y-2 rounded-lg bg-surface-2 p-3">
      <p className="break-all text-xs font-bold text-text-primary">{item.channel==='vk'?'ВКонтакте':'Telegram'} · {item.target}</p>
      {item.title ? <p className="break-words text-xs font-semibold text-text-primary">{item.title}</p>:null}
      {item.evening_id && onOpenEvening ? <button type="button" onClick={()=>onOpenEvening(item.evening_id!)} className="min-h-11 rounded-lg border border-border-soft px-3 py-2 text-sm text-text-primary">Открыть вечер</button> : item.action_path ? <a href={item.action_path} className="inline-flex min-h-11 items-center rounded-lg border border-border-soft px-3 py-2 text-sm text-text-primary">Открыть событие</a>:null}
      <p className="whitespace-pre-wrap break-words text-xs leading-5 text-text-secondary">{item.text}</p>
      {item.error ? <p className="break-words text-xs leading-5 text-text-muted">{item.error}</p>:null}
      {selected===item.key ? <div className="space-y-2">
        {decision==='accepted' ? <label className="block text-xs text-text-secondary">Ссылка или ID поста, если есть<input aria-label="Ссылка или ID поста" value={evidence} onChange={event=>setEvidence(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-1 px-3 text-sm" /></label> : <p className="text-xs leading-5 text-text-primary">Вы проверили канал и убедились, что поста нет? Подтверждение разрешит одну новую отправку сохранённого поста.</p>}
        <button type="button" disabled={busy} onClick={()=>void resolve(item)} className="min-h-11 w-full rounded-lg bg-accent px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{busy?'Сохраняем…':decision==='accepted'?'Подтвердить: пост вышел':'Проверил: поста нет — разрешить повтор'}</button>
        <button type="button" disabled={busy} onClick={()=>setSelected('')} className="min-h-11 w-full rounded-lg border border-border-soft px-3 py-2 text-sm text-text-primary">Отмена</button>
      </div> : <div className="flex flex-col gap-2">
        <button type="button" disabled={busy} onClick={()=>{setSelected(item.key);setDecision(item.status==='ready'?'retry':'accepted');setEvidence('');}} className="min-h-11 rounded-lg border border-border-soft px-3 py-2 text-sm font-semibold text-text-primary">{item.status==='ready'?'Повтор разрешён — отправить':'Пост вышел'}</button>
        <button type="button" disabled={busy} onClick={()=>{setSelected(item.key);setDecision('absent');}} className="min-h-11 rounded-lg border border-border-soft px-3 py-2 text-sm font-semibold text-text-primary">Проверил: поста нет</button>
      </div>}
    </article>)}
  </div>;
}
