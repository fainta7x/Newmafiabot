import { useMemo, useState } from 'react';
import RolePortrait from './RolePortrait.tsx';
import { LOOK_ROLES, LOOK_ROLE_LABELS, type LookRole, type PortraitLayer } from '../../lib/roleLooks.ts';
import './dendiWardrobePrototype.css';

type TrialLook = { jacket: boolean; hat: boolean };
type TrialLooks = Record<LookRole, TrialLook>;
const INITIAL = (): TrialLooks => ({
  civilian: { jacket: true, hat: false }, mafia: { jacket: true, hat: false },
  don: { jacket: true, hat: false }, sheriff: { jacket: true, hat: false },
});
const PREVIEW_SLOTS = [
  { id: 'portrait_jacket', name: 'Пиджак', symbol: '♜', ready: true },
  { id: 'portrait_hat', name: 'Шляпа', symbol: '♛', ready: true },
  { id: 'portrait_shirt', name: 'Рубашка', symbol: '♧', ready: false },
  { id: 'portrait_vest', name: 'Жилет', symbol: '♢', ready: false },
  { id: 'portrait_neckwear', name: 'Галстук', symbol: '♟', ready: false },
  { id: 'portrait_accessory', name: 'Аксессуар', symbol: '✧', ready: false },
] as const;
const SET_QUOTAS = ['Обычный', 'Обычный', 'Редкий', 'Редкий', 'Легендарный'] as const;
/**
 * Design-review ONLY. Uses PNG overlays generated from the real dendi.jpg.
 * No catalog mutation, issue of items, purchases or live role changes.
 */
export default function DendiWardrobePrototype({ faceUrl, suitUrl, hatUrl, sourceUrl }: {
  faceUrl: string; suitUrl: string; hatUrl: string; sourceUrl: string;
}) {
  const [role, setRole] = useState<LookRole>('civilian');
  const [drafts, setDrafts] = useState<TrialLooks>(INITIAL);
  const [saved, setSaved] = useState<TrialLooks>(INITIAL);
  const [slot, setSlot] = useState<(typeof PREVIEW_SLOTS)[number]['id']>('portrait_jacket');
  const [view, setView] = useState<'none' | 'source' | 'compare'>('none');
  const [notice, setNotice] = useState('');
  const current = drafts[role];
  const layers = useMemo(() => [
    ...(current.jacket ? [{ slot: 'portrait_jacket' as const, itemId: 'original-suit-draft', url: suitUrl }] : []),
    ...(current.hat ? [{ slot: 'portrait_hat' as const, itemId: 'draft-hat', url: hatUrl }] : []),
  ], [current, suitUrl, hatUrl]);
  const update = (key: keyof TrialLook, value: boolean) => {
    setNotice('');
    setDrafts(prev => ({ ...prev, [role]: { ...prev[role], [key]: value } }));
  };
  const selected = PREVIEW_SLOTS.find(s => s.id === slot)!;
  const preview = (selected.id === 'portrait_jacket' || selected.id === 'portrait_hat');
  const pieceUrl = selected.id === 'portrait_jacket' ? suitUrl : hatUrl;
  const equipped = selected.id === 'portrait_jacket' ? current.jacket : current.hat;
  const changed = current.jacket !== saved[role].jacket || current.hat !== saved[role].hat;
  const portrait = (look: TrialLook): PortraitLayer[] => [
    ...(look.jacket ? [{ slot: 'portrait_jacket' as const, itemId: 'original-suit-draft', url: suitUrl }] : []),
    ...(look.hat ? [{ slot: 'portrait_hat' as const, itemId: 'draft-hat', url: hatUrl }] : []),
  ];
  return <div className="dendi-game-wardrobe">
    <header className="dgw-top">
      <div className="dgw-mark"><strong>2L</strong><span>2LA NOIRE<small>КЛУБ СПОРТИВНОЙ МАФИИ</small></span></div>
      <span className="dgw-review-flag">ПРОТОТИП · НЕ ВЫПУЩЕНО</span>
    </header>
    <div className="dgw-intro"><span>ПЕРСОНАЖ / КАСТОМИЗАЦИЯ</span><h1>Гардероб</h1><p>Один узнаваемый портрет. Четыре независимых образа.</p></div>
    <main className="dgw-main">
      <section className="dgw-stage" aria-label="Предпросмотр персонажа">
        <nav className="dgw-roles" aria-label="Образ для роли">
          {LOOK_ROLES.map(key => <button key={key} type="button" aria-pressed={role===key}
            onClick={() => { setRole(key); setNotice(''); }}>{LOOK_ROLE_LABELS[key]}</button>)}
        </nav>
        <div className="dgw-portrait-stage">
          <div className="dgw-halo" aria-hidden="true"/>
          <RolePortrait background="noir" baseUrl={faceUrl} layers={layers}/>
          <div className="dgw-persona"><strong>Денди</strong><small>{LOOK_ROLE_LABELS[role]}</small></div>
          <span className="dgw-render-label">512 × 640 · RGBA</span>
        </div>
        <div className="dgw-stage-footer">
          <div><strong>Оригинальная аватарка → слои</strong><small>Лицо не перерисовано</small></div>
          <div><button type="button" onClick={()=>setView('source')}>Исходник</button>
          <button type="button" onClick={()=>setView('compare')}>4 роли</button></div>
        </div>
      </section>
      <section className="dgw-kit" aria-label="Выбор экипировки">
        <div className="dgw-kit-head"><div><h2>Экипировка</h2><p>Выбери слот, затем предмет</p></div>
          <span><strong>{Number(current.jacket)+Number(current.hat)}/6</strong><small>занято слотов</small></span>
        </div>
        <div className="dgw-kit-main">
          <h3>СЛОТЫ ОДЕЖДЫ</h3>
          <div className="dgw-slots">
            {PREVIEW_SLOTS.map(s=><button type="button" className="dgw-slot" key={s.id} aria-pressed={slot===s.id}
              title={!s.ready?'Пока нет корректно отделённого ассета':s.name}
              onClick={()=>setSlot(s.id)}><span aria-hidden="true">{s.symbol}</span>{s.name}{!s.ready&&<small>скоро</small>}</button>)}
          </div>
          <div className="dgw-pieces-head"><strong>{selected.name}</strong><small>{preview?'1 технический предмет':'Пока нет вещей'}</small></div>
          {preview ? <div className="dgw-pieces">
            <button type="button" className="dgw-piece" aria-pressed={!equipped}
              onClick={()=>update(slot==='portrait_jacket'?'jacket':'hat', false)}>
              <span className="dgw-piece-pic dgw-empty" aria-hidden="true">∅</span>
              <strong>Без предмета</strong><small>Оставить слот пустым</small>
            </button>
            <button type="button" className="dgw-piece" aria-pressed={equipped}
              onClick={()=>update(slot==='portrait_jacket'?'jacket':'hat', true)}>
              <span className="dgw-piece-pic"><img src={pieceUrl} alt=""/></span>
              <strong>{slot==='portrait_jacket'?'Оригинальный костюм Денди':'Черновая шляпа'}</strong>
              <small>{slot==='portrait_jacket'?'Из исходного JPG':'Технический эскиз · не награда'}</small>
            </button>
          </div> : <p className="dgw-no-pieces">Этот слот подготовлен технически, но исходная аватарка не содержит отдельного корректного предмета. Новые вещи появятся после разделения и проверки слоёв.</p>}
        </div>
        <div className="dgw-controls">
          <button type="button" className="dgw-reset" onClick={()=>{setDrafts(prev=>({...prev,[role]:{jacket:true,hat:false}}));setNotice('');}}>Сбросить</button>
          <button type="button" className="dgw-save" disabled={!changed}
            onClick={()=>{setSaved(prev=>({...prev,[role]:{...drafts[role]}}));setNotice('Сохранено в этой примерке. Игровой профиль не изменён.');}}>
              Сохранить образ
          </button>
        </div>
        <p className="dgw-safe">Только локальная примерка. Не выдаёт вещи, не меняет магазин, роли или трансляцию.</p>
      </section>
    </main>
    <section className="dgw-set-tray"><div><strong>Коллекции «Огненной осени»</strong><small>Пять утверждённых квот · состав пока пуст</small></div>
      <div>{SET_QUOTAS.map((rarity,i)=><span key={i}>Сет {i+1}<small>{rarity}</small></span>)}</div>
    </section>
    {notice&&<p role="status" className="dgw-notice">{notice}</p>}
    {view!=='none'&&<div className="dgw-overlay" role="dialog" aria-modal="true" aria-label={view==='source'?'Исходник':'Сравнение ролей'}>
      <div className="dgw-dialog"><header><h2>{view==='source'?'Настоящий JPG Денди':'Четыре ролевых образа'}</h2>
        <button type="button" onClick={()=>setView('none')}>Закрыть ×</button></header>
        {view==='source'?<><img className="dgw-source" src={sourceUrl} alt="Оригинальная аватарка Денди"/>
          <p>Из исходного JPG отделены лицо/волосы и оригинальная одежда. Фон и надписи не входят в игровые слои. Края масок ещё проходят проверку.</p></>
          :<div className="dgw-four">{LOOK_ROLES.map(key=><div key={key}>
            <RolePortrait background="noir" baseUrl={faceUrl} layers={portrait(drafts[key])}/>
            <strong>{LOOK_ROLE_LABELS[key]}</strong></div>)}</div>}
      </div>
    </div>}
  </div>;
}
