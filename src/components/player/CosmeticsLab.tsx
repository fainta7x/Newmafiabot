import { useRef, useState } from 'react';
import PlayerRoleLooksEditor, { type RoleLooksClient } from './PlayerRoleLooksEditor.tsx';
import RolePortrait from './RolePortrait.tsx';
import CosmeticSetStudio, { type CosmeticSetStudioClient } from './CosmeticSetStudio.tsx';
import { DENDI_PILOT_BASE, DENDI_PILOT_LAYERS } from '../../lib/dendiWardrobePilot.ts';
import { emptyRoleLook, LOOK_ROLES, LOOK_ROLE_LABELS, LOOK_BACKGROUNDS, plainPhrase, type LookRole, type RoleLook, type RoleLooksResponse, type DraftSet, type DraftWearableItem, type LookLayer, roleEquippedItems } from '../../lib/roleLooks.ts';
import './cosmeticsLab.css';

const storageKey='2la-cosmetics-lab-v2';
const initial=(layers:LookLayer[]=[])=>LOOK_ROLES.map(role=>({ ...emptyRoleLook(role), equippedItems: layers.some(l=>l.itemId==='lab-shirt')?{portrait_shirt:'lab-shirt'}:{} }));
function readSaved(layers:LookLayer[]):RoleLook[]{
  try {
    const value=JSON.parse(localStorage.getItem(storageKey)||'null');
    if(!Array.isArray(value))return initial(layers);
    return LOOK_ROLES.map(role=>{
      const row=value.find(l=>l?.role===role);
      if(!row)return initial(layers).find(l=>l.role===role)!;
      const equippedItems=Object.fromEntries(layers.filter(l=>roleEquippedItems(row)[l.slot]===l.itemId).map(l=>[l.slot,l.itemId]));
      const hatItemId=equippedItems.portrait_hat||null;
      const jacketItemId=equippedItems.portrait_jacket||null;
      return {role,phrase:plainPhrase(String(row.phrase||'')).slice(0,64),background:LOOK_BACKGROUNDS.includes(row.background)?row.background:'noir',hatItemId,jacketItemId,
        equippedItems,
        revision:Number.isSafeInteger(row.revision)&&row.revision>=0?row.revision:0};
    });
  } catch {return initial(layers);}
}
// Five empty local authoring slots follow the OWNER-APPROVED rarity quotas.
// Their placeholder names and sample layers are not approved designs or live catalog items.
const setStorageKey='2la-cosmetics-lab-sets-v1';
const draftSetSeeds:DraftSet[]=[
  {id:'lab-set-1',name:'Сет 1 · черновик',rarity:'common',seasonId:null,published:false,items:[]},
  {id:'lab-set-2',name:'Сет 2 · черновик',rarity:'common',seasonId:null,published:false,items:[]},
  {id:'lab-set-3',name:'Сет 3 · черновик',rarity:'rare',seasonId:null,published:false,items:[]},
  {id:'lab-set-4',name:'Сет 4 · черновик',rarity:'rare',seasonId:null,published:false,items:[]},
  {id:'lab-set-5',name:'Сет 5 · черновик',rarity:'legendary',seasonId:null,published:false,items:[]},
];
function readLabSets(layers:LookLayer[]):DraftSet[]{
  try {
    const parsed=JSON.parse(localStorage.getItem(setStorageKey)||'null');
    return draftSetSeeds.map(seed=>{
      const found=Array.isArray(parsed)?parsed.find((s:{id?:string})=>s?.id===seed.id):null;
      const itemIds=Array.isArray(found?.items)?found.items.map((i:{id?:string})=>i?.id):[];
      return {...seed,items:layers.filter(l=>itemIds.includes(l.itemId)).map(l=>({id:l.itemId,name:l.name,slot:l.slot,rarity:l.rarity,published:false}))};
    });
  }catch{return draftSetSeeds.map(set=>({...set,items:[]}));}
}

export default function CosmeticsLab({ portraitUrl=DENDI_PILOT_BASE, wearableLayers=DENDI_PILOT_LAYERS }: {portraitUrl?:string;wearableLayers?:LookLayer[]}){
  const [layers]=useState<LookLayer[]>(()=>wearableLayers);
  const [saved,setSaved]=useState(()=>readSaved(layers)), [role,setRole]=useState<LookRole>('civilian'), [frozen,setFrozen]=useState<RoleLook|null>(null), [durable,setDurable]=useState(true), [resetKey,setResetKey]=useState(0);
  const memory=useRef(saved), storageAvailable=useRef(true);
  const studioMemory=useRef(readLabSets(layers));
  const [studioClient]=useState<CosmeticSetStudioClient>(()=>({
    getCosmeticDraftSets:async()=>studioMemory.current.map(s=>({...s,items:[...s.items]})),
    getCosmeticDraftItems:async():Promise<DraftWearableItem[]>=>layers.map(l=>({id:l.itemId,name:l.name,slot:l.slot,rarity:l.rarity,seasonId:null,published:false,url:l.url,draft:true})),
    getCosmeticDraftAssets:async()=>layers.map(l=>({key:l.itemId,slot:l.slot,url:l.url,draft:true})),
    createCosmeticDraftItem:async()=>{throw new Error('lab_fixed_art');},
    createCosmeticDraftSet:async()=>{throw new Error('lab_fixed_quota');},
    saveCosmeticDraftSetItems:async(setId,itemIds)=>{
      if(itemIds.some(id=>!layers.some(l=>l.itemId===id))||new Set(itemIds).size!==itemIds.length)throw new Error('invalid_lab_items');
      const found=studioMemory.current.find(s=>s.id===setId);
      if(!found)throw new Error('invalid_lab_set');
      const available=layers.map(l=>({id:l.itemId,name:l.name,slot:l.slot,rarity:l.rarity,published:false}));
      const selected=available.filter(item=>itemIds.includes(item.id));
      if(new Set(selected.map(item=>item.slot)).size!==selected.length)throw new Error('invalid_lab_slots');
      studioMemory.current=studioMemory.current.map(s=>s.id===setId?{...s,items:available.filter(item=>itemIds.includes(item.id))}:s);
      try{localStorage.setItem(setStorageKey,JSON.stringify(studioMemory.current));}catch{setDurable(false);}
      return {setId,items:available.filter(item=>itemIds.includes(item.id))};
    },
  }));
  const [client]=useState<RoleLooksClient>(()=>({
    getRoleLooks:async():Promise<RoleLooksResponse>=>({looks:storageAvailable.current?readSaved(layers):memory.current,portraitVersion:'lab-portrait-v2',layers}),
    saveRoleLook:async(selected,input,expectedRevision)=>{
      const latest=storageAvailable.current?readSaved(layers):memory.current,old=latest.find(l=>l.role===selected)!;
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
  const card=(look:RoleLook,label:string)=><div className="cosmetics-lab-card" data-testid={label==='Карточка трансляции'?'lab-broadcast-card':'lab-frozen-card'}><p>{label}</p><RolePortrait baseUrl={portraitUrl} background={look.background} layers={layers.filter(l=>roleEquippedItems(look)[l.slot]===l.itemId)}/><strong>Денди</strong><span>{LOOK_ROLE_LABELS[look.role]}</span><blockquote>{look.phrase||'Фраза ещё не задана'}</blockquote></div>;
  return <section className="cosmetics-lab" aria-label="Примерка гардероба Денди">
    <header><p>2LA NOIRE · ПРИМЕРКА</p><h1>Гардероб Денди</h1><p>Четыре роли. Одно узнаваемое лицо.</p></header>
    <div className="cosmetics-lab-note">Примерьте одежду на Денди и сохраните свой вариант для каждой роли. Эта проверка использует тот же редактор, что личный профиль. Сохранение — в этом браузере.</div>
    {!durable&&<p role="alert">Браузер запретил постоянное хранение. После закрытия страницы настройки могут потеряться.</p>}
    <div className="cosmetics-lab-grid"><section><h2>1. Настройте образ</h2><p>Выберите роль, смените фон, шляпу, пиджак и фразу. Сначала виден черновик; нажмите «Сохранить».</p><PlayerRoleLooksEditor key={resetKey} playerId="lab-dendi" nickname="Денди" initialOpen client={client} portraitUrl={()=>portraitUrl}/></section>
    <section><h2>2. Посмотрите сохранённый образ</h2><p>Это макет карточки для зрителей. Роль выбрана вручную для проверки; в настоящем эфире её выбирает состояние игры.</p><div className="cosmetics-lab-roles" role="group" aria-label="Роль на трансляции">{LOOK_ROLES.map(key=><button key={key} type="button" aria-pressed={role===key} onClick={()=>setRole(key)}>{LOOK_ROLE_LABELS[key]}</button>)}</div>{card(current,'Карточка трансляции')}
    <button type="button" onClick={()=>setFrozen({...current})}>Зафиксировать образ для тестовой игры</button>
    {frozen&&<><p className="cosmetics-lab-note">Теперь измените и сохраните этот образ слева: текущая карточка обновится, зафиксированная останется прежней.</p>{card(frozen,'Образ на момент игры')}</>}</section></div>
    <section className="cosmetics-lab-workshop" aria-label="Мастерская пяти сетов"><h2>3. Соберите черновики пяти сетов</h2>
      <p>Здесь нет придуманных костюмов: пять пустых коллекций по утверждённым редкостям. Тестовые слои служат для проверки выбора слотов и примерки. Состав сохраняется локально и не связан с магазином.</p>
      <CosmeticSetStudio key={resetKey} client={studioClient} portraitUrl={portraitUrl} initialOpen allowCreate={false}/>
    </section>
    <button type="button" className="cosmetics-lab-reset" onClick={()=>{try{localStorage.removeItem(storageKey);localStorage.removeItem(setStorageKey);}catch{}studioMemory.current=draftSetSeeds.map(set=>({...set,items:[]}));memory.current=initial(layers);setSaved(initial(layers));setFrozen(null);setResetKey(n=>n+1);}}>Сбросить тестовые настройки</button>
  </section>;
}
