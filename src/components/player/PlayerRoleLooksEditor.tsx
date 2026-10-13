import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.ts';
import { LOOK_ROLES, LOOK_ROLE_LABELS, PORTRAIT_EQUIPMENT_SLOTS, PORTRAIT_SLOT_LABELS, roleEquippedItems, plainPhrase, type LookRole, type PortraitEquipmentSlot, type RoleLook, type RoleLooksResponse, type WardrobeSet } from '../../lib/roleLooks.ts';
import { PlayerAvatar } from '../ui/PlayerAvatar.tsx';
import RolePortrait from './RolePortrait.tsx';
import WardrobeSetGallery, { tryOnOwnedSet } from './WardrobeSetGallery.tsx';
import CosmeticSetStudio from './CosmeticSetStudio.tsx';
import './roleLooks.css';

const backgroundLabels = { noir: 'Нуар', autumn: 'Огненная осень', burgundy: 'Багряный' } as const;
const errorText = (error: unknown) => {
  const code=error instanceof Error ? error.message : '';
  return ({ look_revision_conflict:'Образ изменён в другом окне. Обновите редактор перед сохранением.', portrait_preparation_required:'Для одежды сначала нужен подготовленный портрет.', item_not_owned_or_not_ready:'Этот предмет пока нельзя использовать.' } as Record<string,string>)[code] || 'Не удалось выполнить запрос. Попробуйте ещё раз.';
};
export type RoleLooksClient = Pick<typeof api, 'getRoleLooks' | 'saveRoleLook' | 'approvePlayerPortrait'>;
export default function PlayerRoleLooksEditor({ playerId, nickname, initialOpen=false, client=api, portraitUrl }: { playerId:string; nickname:string; initialOpen?:boolean; client?:RoleLooksClient; portraitUrl?:(version:string)=>string }) {
  const [open,setOpen]=useState(initialOpen), [role,setRole]=useState<LookRole>('civilian');
  const [previewMode,setPreviewMode]=useState<'all'|'hat'|'jacket'>('all');
  const [showGuides,setShowGuides]=useState(false);
  const [showComparison,setShowComparison]=useState(false);
  const [state,setState]=useState<RoleLooksResponse|null>(null), [drafts,setDrafts]=useState<RoleLook[]>([]);
  const [error,setError]=useState(''), [notice,setNotice]=useState(''), [saving,setSaving]=useState(false), [reload,setReload]=useState(0);
  const loadedKey=useRef('');
  const [portraitFile,setPortraitFile]=useState<File|null>(null), [identityConfirmed,setIdentityConfirmed]=useState(false);
  useEffect(()=>{
    if(!open) return;
    const key=`${playerId}:${reload}`;
    if(loadedKey.current===key)return;
    let cancelled=false;
    setState(null);setError('');setNotice('');
    client.getRoleLooks().then(value=>{if(!cancelled){loadedKey.current=key;const normalized={...value,looks:value.looks.map(l=>({...l,equippedItems:roleEquippedItems(l)}))};setState(normalized);setDrafts(normalized.looks);}}).catch(e=>{if(!cancelled)setError(errorText(e));});
    return ()=>{cancelled=true;};
  },[open,playerId,reload,client]);
  const look=drafts.find(l=>l.role===role), saved=state?.looks.find(l=>l.role===role);
  const baseUrl=state?.portraitVersion?(portraitUrl?.(state.portraitVersion)||`/api/player/cosmetics/portrait/${encodeURIComponent(state.portraitVersion)}`):null;
  const layersFor=(draft:RoleLook)=>state?.layers.filter(l=>roleEquippedItems(draft)[l.slot]===l.itemId).map(l=>({slot:l.slot,itemId:l.itemId,url:l.url}))||[];
  const dirty=look && saved && JSON.stringify(look)!==JSON.stringify(saved);
  const update=(patch:Partial<RoleLook>)=>{setNotice('');setDrafts(previous=>previous.map(l=>l.role===role?{...l,...patch}:l));};
  const updateSlot=(slot:PortraitEquipmentSlot,itemId:string|null)=>{
    setNotice('');
    setDrafts(previous=>previous.map(l=>{
      if(l.role!==role)return l;
      const equippedItems=roleEquippedItems(l);
      if(itemId)equippedItems[slot]=itemId;else delete equippedItems[slot];
      return {...l,equippedItems,
        hatItemId:equippedItems.portrait_hat||null,
        jacketItemId:equippedItems.portrait_jacket||null};
    }));
  };
  const tryOnSet=(set:WardrobeSet)=>{
    if(!look||!state?.portraitVersion||saving)return;
    const equippedItems=tryOnOwnedSet(look,set,state.layers);
    update({equippedItems,hatItemId:equippedItems.portrait_hat||null,jacketItemId:equippedItems.portrait_jacket||null});
  };
  const save=async()=>{
    if(!look||!saved||saving)return;
    setSaving(true);setError('');setNotice('');
    try {
      const next=await client.saveRoleLook(role,{phrase:look.phrase,background:look.background,hatItemId:look.hatItemId,jacketItemId:look.jacketItemId,equippedItems:roleEquippedItems(look)},saved.revision);
      setState(previous=>previous?{...previous,looks:previous.looks.map(l=>l.role===role?{...next,equippedItems:roleEquippedItems(next)}:l)}:previous);
      setDrafts(previous=>previous.map(l=>l.role===role?{...next,equippedItems:roleEquippedItems(next)}:l));setNotice(`Образ «${LOOK_ROLE_LABELS[role]}» сохранён. В уже начатой трансляции остаётся зафиксированный образ.`);
    }catch(e){setError(errorText(e));}finally{setSaving(false);}
  };
  const approve=async()=>{
    if(!portraitFile||!identityConfirmed||saving)return;
    if(portraitFile.size>1024*1024){setError('Портрет должен быть не больше 1 МБ.');return;}
    setSaving(true);setError('');
    try {
      const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('read_error'));reader.readAsDataURL(portraitFile);});
      const approved=await client.approvePlayerPortrait(playerId,dataUrl);
      setState(previous=>previous?{...previous,portraitVersion:approved.version}:previous);
      setNotice('Основа портрета сохранена. Старые игровые образы сохраняют прежнюю версию.');setPortraitFile(null);setIdentityConfirmed(false);
    }catch{setError('Не удалось подтвердить портрет. Нужен PNG RGBA 512×640, до 1 МБ, без анимации.');}finally{setSaving(false);}
  };
  return <details className="role-looks-editor" open={initialOpen} onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary>Мои образы по ролям<span>Мирный · Мафия · Дон · Шериф</span></summary>
    <div className="role-looks-body">
      <p className="role-looks-explanation">Одно лицо, четыре оформления. Выбор здесь меняет внешний вид, а не вашу роль в игре.</p>
      <div className="role-looks-tabs" role="group" aria-label="Образ по роли">{LOOK_ROLES.map(key=><button type="button" key={key} disabled={saving} aria-pressed={role===key} onClick={()=>{setRole(key);setNotice('');setError('');}}>{LOOK_ROLE_LABELS[key]}</button>)}</div>
      {error&&<p role="alert">{error}</p>}
      {!state&&!error&&<p role="status">Загружаем образы…</p>}
      {look&&state&&<>
        <div className="role-looks-preview" data-testid="role-look-preview">
          <RolePortrait showGuides={showGuides} background={look.background} baseUrl={baseUrl} layers={layersFor(look).filter(l=>previewMode==='all'||(previewMode==='hat'?l.slot==='portrait_hat':l.slot!=='portrait_hat'))} fallback={<PlayerAvatar nickname={nickname} playerId={playerId} size="xl"/>}/>
          <strong>{nickname}</strong><span>{LOOK_ROLE_LABELS[role]}</span>{look.phrase&&<p className="role-looks-phrase">{look.phrase}</p>}
        </div>
        <details className="role-looks-compare" onToggle={e=>setShowComparison(e.currentTarget.open)}>
          <summary>Сравнить все четыре образа<span>Сохранённые и несохранённые изменения отображаются отдельно по ролям</span></summary>
          {showComparison&&<div className="role-looks-compare-grid">
            {LOOK_ROLES.map(key=>{
              const compared=drafts.find(l=>l.role===key)!;
              return <button key={key} type="button" disabled={saving} aria-pressed={role===key} onClick={()=>setRole(key)}>
                <RolePortrait background={compared.background} baseUrl={baseUrl} layers={layersFor(compared)}
                  fallback={<PlayerAvatar nickname={nickname} playerId={playerId} size="lg"/>}/>
                <strong>{LOOK_ROLE_LABELS[key]}</strong>
                <small>{Object.keys(roleEquippedItems(compared)).length} вещей</small>
              </button>;
            })}
          </div>}
        </details>
        {state.portraitVersion&&<div className="role-looks-isolation" role="group" aria-label="Режим примерки">
          <span>Проверить посадку:</span>
          {([['all','Весь образ'],['hat','Только шляпа'],['jacket','Только одежда']] as const).map(([mode,label])=><button type="button" key={mode} aria-pressed={previewMode===mode} onClick={()=>setPreviewMode(mode)}>{label}</button>)}
          <label className="role-looks-guide-toggle"><input type="checkbox" checked={showGuides} onChange={e=>setShowGuides(e.target.checked)}/> Направляющие посадки</label><p>Режим проверки временно скрывает другие слои только в предпросмотре. Сохранённые предметы не меняются.</p>
        </div>}
        <label>Фраза<input maxLength={64} value={look.phrase} disabled={saving} onChange={e=>update({phrase:plainPhrase(e.target.value)})} placeholder="Ваша короткая фраза"/></label>
        <label>Фон<select aria-label="Фон" value={look.background} disabled={saving} onChange={e=>update({background:e.target.value as RoleLook['background']})}>{Object.entries(backgroundLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
        {PORTRAIT_EQUIPMENT_SLOTS.filter(slot=>slot==='portrait_hat'||slot==='portrait_jacket'||state.layers.some(l=>l.slot===slot)).map(slot=>{
          const items=state.layers.filter(l=>l.slot===slot);
          const label=PORTRAIT_SLOT_LABELS[slot];
          const locked=!state.portraitVersion;
          return <fieldset className="role-looks-inventory" key={slot} disabled={saving||locked}>
            <legend>{label}</legend>
            <p className="role-looks-explanation">{locked?'Сначала подготовьте портрет игрока':items.length?'Примерьте вещь отдельно; она не меняет другие слоты.':'Полученные предметы появятся здесь после выпуска коллекции.'}</p>
            <div className="role-looks-item-grid">
              <button type="button" className="role-looks-item" aria-pressed={!roleEquippedItems(look)[slot]} onClick={()=>updateSlot(slot,null)}>
                <span className="role-looks-item-empty" aria-hidden="true">∅</span><span>Без предмета</span>
              </button>
              {items.map(item=><button type="button" className="role-looks-item" key={item.itemId} aria-pressed={roleEquippedItems(look)[slot]===item.itemId} onClick={()=>updateSlot(slot,item.itemId)} title={item.name}>
                <span className="role-looks-item-thumb"><img src={item.url} alt="" loading="lazy"/></span>
                <span>{item.name}</span><small>{item.rarity}</small>
              </button>)}
            </div>
          </fieldset>;
        })}
        {look&&<WardrobeSetGallery sets={state.sets||[]} look={look} layers={state.layers}
          disabled={saving||!state.portraitVersion} onTrySet={tryOnSet}
          onTryItem={(slot,itemId)=>{if(state.portraitVersion)updateSlot(slot,itemId);}}/>}
        {!state.portraitVersion&&<p className="role-looks-explanation">Используется ваш текущий аватар. Для смены одежды нужна подготовленная основа портрета с сохранением лица; её подтверждает организатор.</p>}
        {state.portraitVersion&&!state.layers.length&&<p className="role-looks-explanation">Основа подготовлена. Доступной одежды пока нет — здесь появятся полученные предметы выпущенной коллекции.</p>}
        <button type="button" className="role-looks-save" disabled={!dirty||saving} onClick={()=>void save()}>{saving?'Сохраняем…':`Сохранить: ${LOOK_ROLE_LABELS[role]}`}</button>
        {state.canApprovePortrait&&<CosmeticSetStudio portraitUrl={baseUrl}/>}
        {state.canApprovePortrait&&<details className="role-looks-preparation"><summary>Подготовка основы · для владельца</summary><p className="role-looks-explanation">Загрузите подготовленный прозрачный PNG 512×640: лицо и волосы без надписей и верхней одежды. Лицо — по центру, подбородок около y=340; шляпа занимает верх до y=180, пиджак начинается с y=350. Проверьте узнаваемость и посадку слоёв до выпуска предметов.</p><label>Основа портрета<input type="file" accept="image/png" disabled={saving} onChange={e=>{setPortraitFile(e.target.files?.[0]||null);setIdentityConfirmed(false);}}/></label><label className="role-looks-confirm"><input type="checkbox" checked={identityConfirmed} disabled={saving} onChange={e=>setIdentityConfirmed(e.target.checked)}/>Подтверждаю: это узнаваемый портрет этого игрока</label><button type="button" disabled={!portraitFile||!identityConfirmed||saving} onClick={()=>void approve()}>Подтвердить основу</button></details>}
      </>}
      {notice&&<p role="status">{notice}</p>}
      {error&&<button type="button" disabled={saving} onClick={()=>setReload(n=>n+1)}>Обновить редактор</button>}
    </div>
  </details>;
}
