import { useEffect, useState } from 'react';

type Visibility = { real_name:boolean; birthday_day_month:boolean; birth_year:boolean; telegram_username:boolean; phone:boolean; game_statistics:boolean; connections:boolean };
const LABELS: Array<[keyof Visibility,string,string]> = [
  ['real_name','Настоящее имя','Показывать другим игрокам'],
  ['birthday_day_month','День и месяц рождения','Год рождения остаётся отдельной настройкой'],
  ['birth_year','Год рождения / возраст','По умолчанию скрыто'],
  ['telegram_username','Telegram username','Контакт по умолчанию скрыт'],
  ['phone','Телефон','Контакт по умолчанию скрыт'],
  ['game_statistics','Игровая статистика','Игры, роли и Elo'],
  ['connections','Игровые связи','С кем чаще играешь и совместная статистика'],
];
export default function PlayerProfilePrivacySettings(){
  const [v,setV]=useState<Visibility|null>(null); const [saving,setSaving]=useState(false); const [message,setMessage]=useState('');
  const [loadError,setLoadError]=useState('');
  useEffect(()=>{fetch('/api/player/privacy-settings',{credentials:'include'}).then(async r=>{const b=await r.json().catch(()=>({}));if(!r.ok||!b.visibility)throw new Error(b.error||'Не удалось загрузить настройки приватности');setV(b.visibility);}).catch((e:any)=>setLoadError(e?.message||'Не удалось загрузить настройки приватности'));},[]);
  if(loadError) return <div className="rounded-2xl border border-white/10 p-4 text-sm text-red-300">{loadError}</div>;
  if(!v) return <div className="rounded-2xl border border-white/10 p-4 text-sm text-white/50">Загрузка приватности…</div>;
  const save=async(next:Visibility)=>{const previous=v;setV(next);setSaving(true);setMessage('');try{const r=await fetch('/api/player/privacy-settings',{method:'PATCH',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({visibility:next})});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'Не удалось сохранить');setMessage('Сохранено');}catch(e:any){setV(previous);setMessage(e?.message||'Не удалось сохранить');}finally{setSaving(false);}};
  return <section className="rounded-2xl border border-white/10 bg-white/[.03] p-4"><h2 className="font-semibold">Приватность профиля</h2><p className="mt-1 text-xs text-white/50">Организатор видит контакты и дату рождения целиком. Для других игроков видимость настраивается отдельно.</p><div className="mt-4 divide-y divide-white/10">{LABELS.map(([key,title,desc])=><label key={key} className="flex items-center gap-3 py-3"><span className="min-w-0 flex-1"><span className="block text-sm">{title}</span><span className="block text-[11px] text-white/45">{desc}</span></span><input type="checkbox" checked={v[key]} onChange={e=>save({...v,[key]:e.target.checked})} className="h-5 w-5"/></label>)}</div>{(saving||message)&&<div className="pt-2 text-xs text-white/45">{saving?'Сохранение…':message}</div>}</section>;
}
