import { useRef, useState } from 'react';
import PlayerRoleLooksEditor, { type RoleLooksClient } from './PlayerRoleLooksEditor.tsx';
import RolePortrait from './RolePortrait.tsx';
import { emptyRoleLook, LOOK_ROLES, LOOK_ROLE_LABELS, LOOK_BACKGROUNDS, plainPhrase, type LookRole, type RoleLook, type RoleLooksResponse } from '../../lib/roleLooks.ts';
import './cosmeticsLab.css';

const storageKey='2la-cosmetics-lab-v1';
const initial=()=>LOOK_ROLES.map(emptyRoleLook);
function readSaved():RoleLook[]{
  try {
    const value=JSON.parse(localStorage.getItem(storageKey)||'null');
    if(!Array.isArray(value))return initial();
    return LOOK_ROLES.map(role=>{
      const row=value.find(l=>l?.role===role);
      if(!row)return emptyRoleLook(role);
      return {role,phrase:plainPhrase(String(row.phrase||'')).slice(0,64),background:LOOK_BACKGROUNDS.includes(row.background)?row.background:'noir',hatItemId:row.hatItemId==='lab-hat'?'lab-hat':null,jacketItemId:row.jacketItemId==='lab-jacket'?'lab-jacket':null,revision:Number.isSafeInteger(row.revision)&&row.revision>=0?row.revision:0};
    });
  } catch {return initial();}
}
export default function CosmeticsLab({ portraitUrl, hatUrl='/cosmetics/autumn-fedora-v1.svg', jacketUrl='/cosmetics/autumn-jacket-v1.svg' }: {portraitUrl:string;hatUrl?:string;jacketUrl?:string}){
  const [saved,setSaved]=useState(readSaved), [role,setRole]=useState<LookRole>('civilian'), [frozen,setFrozen]=useState<RoleLook|null>(null), [durable,setDurable]=useState(true), [resetKey,setResetKey]=useState(0);
  const memory=useRef(saved), storageAvailable=useRef(true);
  const [client]=useState<RoleLooksClient>(()=>({
    getRoleLooks:async():Promise<RoleLooksResponse>=>({looks:storageAvailable.current?readSaved():memory.current,portraitVersion:'lab-portrait',layers:[{itemId:'lab-hat',name:'Медный лист · эскиз',slot:'portrait_hat',url:hatUrl,rarity:'rare'},{itemId:'lab-jacket',name:'Багряный пиджак · эскиз',slot:'portrait_jacket',url:jacketUrl,rarity:'epic'}]}),
    saveRoleLook:async(selected,input,expectedRevision)=>{
      const latest=storageAvailable.current?readSaved():memory.current,old=latest.find(l=>l.role===selected)!;
      if(old.revision!==expectedRevision)throw new Error('look_revision_conflict');
      const next={...input,role:selected,revision:old.revision+1};
      const all=latest.map(l=>l.role===selected?next:l);
      memory.current=all;
      try{localStorage.setItem(storageKey,JSON.stringify(all));}catch{storageAvailable.current=false;setDurable(false);}
      setSaved(all);return next;
    },
    approvePlayerPortrait:async()=>{throw new Error('demo_only');},
  }));
  const current=saved.find(l=>l.role===role)!;
  const card=(look:RoleLook,label:string)=><div className="cosmetics-lab-card" data-testid={label==='Карточка трансляции'?'lab-broadcast-card':'lab-frozen-card'}><p>{label}</p><RolePortrait baseUrl={portraitUrl} background={look.background} hatUrl={look.hatItemId?hatUrl:null} jacketUrl={look.jacketItemId?jacketUrl:null}/><strong>Денди</strong><span>{LOOK_ROLE_LABELS[look.role]}</span><blockquote>{look.phrase||'Фраза ещё не задана'}</blockquote></div>;
  return <main className="cosmetics-lab">
    <header><p>2LA NOIRE · ТЕСТОВЫЙ СТЕНД</p><h1>Огненная осень</h1><p>Четыре роли. Одно узнаваемое лицо.</p></header>
    <div className="cosmetics-lab-note">Здесь используются портрет Денди из проекта и эскизы одежды. Это примерка: предметы не выдаются, реальные профили и трансляция клуба не меняются. Сохранение — в этом браузере.</div>
    {!durable&&<p role="alert">Браузер запретил постоянное хранение. После закрытия страницы настройки могут потеряться.</p>}
    <div className="cosmetics-lab-grid"><section><h2>1. Настройте образ</h2><p>Выберите роль, смените фон, шляпу, пиджак и фразу. Сначала виден черновик; нажмите «Сохранить».</p><PlayerRoleLooksEditor key={resetKey} playerId="lab-dendi" nickname="Денди" initialOpen client={client} portraitUrl={()=>portraitUrl}/></section>
    <section><h2>2. Посмотрите сохранённый образ</h2><p>Это макет карточки для зрителей. Роль выбрана вручную для проверки; в настоящем эфире её выбирает состояние игры.</p><div className="cosmetics-lab-roles" role="group" aria-label="Роль на трансляции">{LOOK_ROLES.map(key=><button key={key} type="button" aria-pressed={role===key} onClick={()=>setRole(key)}>{LOOK_ROLE_LABELS[key]}</button>)}</div>{card(current,'Карточка трансляции')}
    <button type="button" onClick={()=>setFrozen({...current})}>Зафиксировать образ для тестовой игры</button>
    {frozen&&<><p className="cosmetics-lab-note">Теперь измените и сохраните этот образ слева: текущая карточка обновится, зафиксированная останется прежней.</p>{card(frozen,'Образ на момент игры')}</>}</section></div>
    <button type="button" className="cosmetics-lab-reset" onClick={()=>{try{localStorage.removeItem(storageKey);}catch{}memory.current=initial();setSaved(initial());setFrozen(null);setResetKey(n=>n+1);}}>Сбросить тестовые настройки</button>
  </main>;
}
