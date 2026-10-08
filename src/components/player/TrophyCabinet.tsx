import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Trophy, X } from 'lucide-react';
import { CABINET_CATEGORIES, cabinetItems, type CabinetAchievement, type CabinetCategory, type CabinetItem, type CabinetVerifiedAward } from '../../lib/trophyCabinetModel.ts';
import './TrophyCabinet.css';

const PAGE_SIZE = 6;
const clamp = (n:number) => Math.max(-16, Math.min(16, n));
const formatDate = (raw:string|null) => {
  if(!raw) return null;
  if(/^\d{4}$/.test(raw)) return raw;
  const d=new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'});
};

/** Original lightweight vector exhibits: perspective is applied by the room, not baked into a static picture. */
function Exhibit({item}:{item:CabinetItem}) {
  if(item.shape==='cup') return <svg className="trophy-cabinet__object trophy-cabinet__object--cup" viewBox="0 0 104 124" fill="none" aria-hidden="true">
    <defs><linearGradient id="cabinet-cup-metal" x1="5" y1="15" x2="95" y2="106" gradientUnits="userSpaceOnUse"><stop stopColor="#D7D3CB"/><stop offset=".26" stopColor="#66727F"/><stop offset=".5" stopColor="#ECE9E0"/><stop offset=".75" stopColor="#45515C"/><stop offset="1" stopColor="#A2AAB0"/></linearGradient></defs>
    <path d="M23 21H13C7 21 6 28 9 37C12 49 22 55 33 53M81 21H91C97 21 98 28 95 37C92 49 82 55 71 53" stroke="url(#cabinet-cup-metal)" strokeWidth="7" strokeLinecap="round"/>
    <path d="M20 12H84L77 52C75 64 64 72 52 72S29 64 27 52L20 12Z" fill="url(#cabinet-cup-metal)" stroke="#9BA5AB"/>
    <ellipse cx="52" cy="12" rx="33" ry="5" fill="#8C94A0" stroke="#E5DFCF" strokeWidth="2"/>
    <path d="M47 73H57V88H47V73ZM37 88H67L73 99H31L37 88Z" fill="url(#cabinet-cup-metal)"/>
    <path d="M23 100H81V110H23V100Z" fill="#282F39" stroke="#A9B2B8" strokeWidth="1.6"/>
    <path d="M28 110H76V117H28V110Z" fill="#11161D" stroke="#747C84"/><rect x="39" y="102" width="26" height="6" rx="1" fill="#B8A580" fillOpacity=".7"/>
  </svg>;
  if(item.shape==='medal') return <svg className="trophy-cabinet__object trophy-cabinet__object--medal" viewBox="0 0 104 124" fill="none" aria-hidden="true">
    <defs><linearGradient id="cabinet-medal-metal" x1="25" y1="23" x2="81" y2="106"><stop stopColor="#E9E7D7"/><stop offset=".5" stopColor="#687485"/><stop offset="1" stopColor="#B9BFC3"/></linearGradient></defs>
    <path d="M26 8H43L52 34L61 8H78L62 53H42L26 8Z" fill="#566878" stroke="#B9C3C6" strokeWidth="2"/>
    <circle cx="52" cy="75" r="33" fill="#161F29" stroke="url(#cabinet-medal-metal)" strokeWidth="8"/>
    <circle cx="52" cy="75" r="26" fill="url(#cabinet-medal-metal)" fillOpacity=".8"/>
    <path d="M52 56L57.6 68L71 70L61 79L64 92L52 85L40 92L43 79L33 70L46.4 68L52 56Z" fill="#DADAD4" stroke="#6F7B87"/>
  </svg>;
  return <svg className="trophy-cabinet__object trophy-cabinet__object--plaque" viewBox="0 0 104 124" fill="none" aria-hidden="true">
    <defs><linearGradient id="cabinet-plaque-metal" x1="18" y1="15" x2="86" y2="108"><stop stopColor="#B2B8BC"/><stop offset=".42" stopColor="#454F5D"/><stop offset="1" stopColor="#929BA0"/></linearGradient></defs>
    <path d="M16 26L29 13H75L88 26V99L75 111H29L16 99V26Z" fill="#171D25" stroke="url(#cabinet-plaque-metal)" strokeWidth="5"/>
    <path d="M25 32L34 23H70L79 32V93L70 102H34L25 93V32Z" stroke="#778391" strokeOpacity=".65"/>
    <path d="M52 40L58.6 53.4L73.4 55.6L62.7 66L65.2 80.8L52 73.8L38.8 80.8L41.3 66L30.6 55.6L45.4 53.4L52 40Z" fill="#AFB6BD" stroke="#D6D3C9"/>
    <path d="M36 92H68" stroke="#8A958F" strokeWidth="2"/>
  </svg>;
}

export default function TrophyCabinet({awards,earnedAchievements,onPinAward,busy=false}:{
  awards:CabinetVerifiedAward[];earnedAchievements:CabinetAchievement[];
  onPinAward?:(id:string)=>void;busy?:boolean;
}) {
  const [category,setCategory]=useState<CabinetCategory>('cups');
  const [page,setPage]=useState(0);
  const [angle,setAngle]=useState(0);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const drag=useRef<{x:number;angle:number}|null>(null);
  const items=useMemo(()=>cabinetItems(awards,earnedAchievements),[awards,earnedAchievements]);
  const filtered=items.filter(item=>item.category===category);
  const lastPage=Math.max(0,Math.ceil(filtered.length/PAGE_SIZE)-1);
  const safePage=Math.min(page,lastPage);
  const visible=filtered.slice(safePage*PAGE_SIZE,(safePage+1)*PAGE_SIZE);
  const active=items.find(item=>item.id===selectedId)||null;
  const start=(e:PointerEvent<HTMLDivElement>)=>{
    if((e.target as HTMLElement).closest('button'))return;
    drag.current={x:e.clientX,angle};
  };
  const move=(e:PointerEvent<HTMLDivElement>)=>{
    if(!drag.current)return;
    if(e.pointerType==='mouse'&&e.buttons===0){drag.current=null;return;}
    setAngle(clamp(drag.current.angle+(e.clientX-drag.current.x)/9));
  };
  const choose=(next:CabinetCategory)=>{setCategory(next);setPage(0);setSelectedId(null);setAngle(0);};
  const style={'--cabinet-angle':angle+'deg'} as CSSProperties;

  return <section className="trophy-cabinet" data-testid="trophy-cabinet" aria-label="Интерактивная трофейная витрина">
    <div className="trophy-cabinet__header"><div><div className="trophy-cabinet__eyebrow"><Trophy size={13}/> КОЛЛЕКЦИЯ ИГРОКА</div>
      <h2>Трофейная витрина</h2><p>Официальные награды и полученные достижения</p></div>
      <span className="trophy-cabinet__total">{items.length}</span>
    </div>
    <div className="trophy-cabinet__categories" role="group" aria-label="Типы наград">
      {CABINET_CATEGORIES.map(entry=><button type="button" key={entry.id} data-testid={'cabinet-filter-'+entry.id}
        aria-pressed={category===entry.id} onClick={()=>choose(entry.id)}>{entry.title}<span>{items.filter(x=>x.category===entry.id).length}</span></button>)}
    </div>
    <div className="trophy-cabinet__stage" data-testid="cabinet-3d-stage">
      <div className="trophy-cabinet__stage-label"><span>ЭКСПОЗИЦИЯ · {CABINET_CATEGORIES.find(x=>x.id===category)?.title.toLocaleUpperCase('ru-RU')}</span>
        <span>{visible.length?(safePage+1)+' / '+(lastPage+1):'ПУСТО'}</span></div>
      <div className="trophy-cabinet__viewport" style={style} onPointerDown={start} onPointerMove={move}
        onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
        <div className="trophy-cabinet__room">
          <div className="trophy-cabinet__wall trophy-cabinet__wall--left" aria-hidden="true"/>
          <div className="trophy-cabinet__wall trophy-cabinet__wall--right" aria-hidden="true"/>
          <div className="trophy-cabinet__wall trophy-cabinet__wall--back" aria-hidden="true"/>
          <div className="trophy-cabinet__lighting" aria-hidden="true"/>
          <div className="trophy-cabinet__shelves">
            {[0,1].map(row=><div className="trophy-cabinet__shelf" key={row}>
              <div className="trophy-cabinet__slots">{[0,1,2].map(column=>{
                const item=visible[row*3+column];
                return item?<button type="button" key={item.id}
                  className={'trophy-cabinet__exhibit'+(selectedId===item.id?' trophy-cabinet__exhibit--active':'')}
                  data-testid="cabinet-exhibit" aria-label={'Открыть награду: '+item.title} onClick={()=>setSelectedId(item.id)}>
                  <span className="trophy-cabinet__object-wrap"><Exhibit item={item}/></span>
                  <span className="trophy-cabinet__exhibit-name">{item.context||item.title}</span>
                  {item.tournamentWinner&&<span className="trophy-cabinet__exhibit-caption">1 место</span>}
                </button>:<div key={'empty-'+row+'-'+column} className="trophy-cabinet__empty-slot" aria-hidden="true"><span/></div>;
              })}</div>
              <div className="trophy-cabinet__ledge" aria-hidden="true"/>
            </div>)}
          </div>
        </div>
      </div>
      {visible.length===0&&<p className="trophy-cabinet__empty" data-testid="cabinet-empty">
        {category==='cups'?'Кубков пока нет. Здесь появятся подтверждённые победы в турнирах.':'Пока нет полученных наград в этом разделе.'}
      </p>}
      <div className="trophy-cabinet__controls">
        <div className="trophy-cabinet__angle">
          <button type="button" aria-label="Повернуть витрину влево" onClick={()=>setAngle(a=>clamp(a-8))}><ChevronLeft size={17}/></button>
          <button type="button" aria-label="Вернуть ракурс" onClick={()=>setAngle(0)}><RotateCcw size={14}/></button>
          <button type="button" aria-label="Повернуть витрину вправо" onClick={()=>setAngle(a=>clamp(a+8))}><ChevronRight size={17}/></button>
        </div>
        <span className="trophy-cabinet__hint">Нажми на экспонат</span>
        <div className="trophy-cabinet__pages">
          <button type="button" aria-label="Предыдущая полка" disabled={safePage===0} onClick={()=>setPage(n=>Math.max(0,n-1))}><ChevronLeft size={17}/></button>
          <button type="button" aria-label="Следующая полка" disabled={safePage>=lastPage} onClick={()=>setPage(n=>Math.min(lastPage,n+1))}><ChevronRight size={17}/></button>
        </div>
      </div>
    </div>
    {active&&<aside className="trophy-cabinet__details" data-testid="cabinet-details" aria-label="Описание выбранной награды">
      <button type="button" aria-label="Закрыть сведения" className="trophy-cabinet__close" onClick={()=>setSelectedId(null)}><X size={18}/></button>
      <p className="trophy-cabinet__eyebrow">НАГРАДА ИГРОКА</p><h3>{active.title}</h3>
      {active.context&&<p className="trophy-cabinet__context">{active.context}</p>}
      {active.tournamentWinner&&<p className="trophy-cabinet__result">1 место · победитель турнира</p>}
      {formatDate(active.date)&&<p className="trophy-cabinet__date">{formatDate(active.date)}</p>}
      {active.description&&<p className="trophy-cabinet__description">{active.description}</p>}
      {active.photoUrl&&<img src={active.photoUrl} alt={'Фото награды '+active.title} loading="lazy"/>}
      {active.awardId&&onPinAward&&<button type="button" disabled={busy} className="trophy-cabinet__pin"
        onClick={()=>onPinAward(active.awardId!)}>{active.pinned?'Убрать из закреплённых':'Закрепить в профиле'}</button>}
    </aside>}
  </section>;
}
