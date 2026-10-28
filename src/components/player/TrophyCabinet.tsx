import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, RotateCcw, Trophy, X } from 'lucide-react';
import TournamentCupAsset from './TournamentCupAsset.tsx';
import { NominationPlaque, PlaceMedal, medalTierFromPlace, nominationGlyphFromTitle } from './TrophyIcons.tsx';
import PlayerTournamentView from './PlayerTournamentView.tsx';
import { CABINET_CATEGORIES, cabinetItems, type CabinetAchievement, type CabinetCategory, type CabinetItem, type CabinetVerifiedAward } from '../../lib/trophyCabinetModel.ts';
import './TrophyCabinet.css';
import { formatMoscowDate } from '../../lib/moscowDate.ts';

const PAGE_SIZE = 6;
const clamp = (n:number) => Math.max(-16, Math.min(16, n));
// A bare year («2019») of an old award stays as it is.
const formatDate = (raw:string|null) => (raw && /^\d{4}$/.test(raw) ? raw : formatMoscowDate(raw, 'numeric', { invalidAsRaw: true }));

/** Original lightweight vector exhibits: perspective is applied by the room, not baked into a static picture. */
function Exhibit({item}:{item:CabinetItem}) {
  if(item.shape==='cup') return <TournamentCupAsset designKey={item.trophyDesignKey} />;
  if(item.shape==='medal') return <PlaceMedal tier={medalTierFromPlace(item.place)} />;
  return <NominationPlaque glyph={nominationGlyphFromTitle(item.title)} />;
}

export default function TrophyCabinet({awards,earnedAchievements,onPinAward,busy=false,pinLimitReached=false}:{
  awards:CabinetVerifiedAward[];earnedAchievements:CabinetAchievement[];
  onPinAward?:(id:string)=>void;busy?:boolean;pinLimitReached?:boolean;
}) {
  const [category,setCategory]=useState<CabinetCategory>(()=>{const available=cabinetItems(awards,earnedAchievements);return CABINET_CATEGORIES.find(c=>available.some(i=>i.category===c.id))?.id||'cups';});
  const [page,setPage]=useState(0);
  const [angle,setAngle]=useState(0);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [openTournamentId,setOpenTournamentId]=useState<string|null>(null);
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
      {active.tournamentId && <button type="button" data-testid="cabinet-open-tournament" className="trophy-cabinet__destination" onClick={()=>setOpenTournamentId(active.tournamentId)}>
        Открыть турнир и итоги <ArrowUpRight size={17}/>
      </button>}
      {active.eveningId && <a data-testid="cabinet-open-evening" className="trophy-cabinet__destination" href={'/player/events/' + encodeURIComponent(active.eveningId)}>
        Открыть вечер <ArrowUpRight size={17}/>
      </a>}
      {active.awardId&&onPinAward&&<button type="button" disabled={busy||(!active.pinned&&pinLimitReached)} className="trophy-cabinet__pin"
        onClick={()=>onPinAward(active.awardId!)}>{active.pinned?'Убрать из закреплённых':pinLimitReached?'Закреплено 3 награды':'Закрепить в профиле'}</button>}
    </aside>}
    {openTournamentId && <div className="trophy-cabinet__event-overlay" data-testid="cabinet-tournament-overlay" role="dialog" aria-modal="true" aria-label="Турнир и его результаты">
      <PlayerTournamentView tournamentId={openTournamentId} onBack={()=>setOpenTournamentId(null)} />
    </div>}
  </section>;
}
