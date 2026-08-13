import { useEffect, useState } from 'react';
import PlayerEventSlotDetail from './PlayerEventSlotDetail.tsx';

type EventItem = { id:string; title:string; starts_at:string; format:string; event_type:'evening'|'tournament'; assembled?:boolean; assembled_slots?:number; participant_count?:number };
type Filter = 'all' | 'novice' | 'club' | 'rating' | 'tournament';
const FILTERS:Array<[Filter,string]>=[['all','Все'],['novice','Новички'],['club','Клуб'],['rating','Рейтинг'],['tournament','Турниры']];
const eventKind=(e:EventItem):Filter=>e.event_type==='tournament'?'tournament':String(e.format||'').toUpperCase().includes('NOV')?'novice':String(e.format||'').toUpperCase().includes('RAT')?'rating':'club';
const kindLabel=(e:EventItem)=>({novice:'Новички',club:'Клубный',rating:'Рейтинг',tournament:'Турнир',all:'Все'} as const)[eventKind(e)];
const kindTone=(e:EventItem)=>eventKind(e)==='tournament'?'bg-violet-400/15 text-violet-100':eventKind(e)==='novice'?'bg-sky-400/15 text-sky-100':eventKind(e)==='rating'?'bg-amber-400/15 text-amber-100':'bg-emerald-400/15 text-emerald-100';

export default function PlayerEventsCalendar(){
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [events,setEvents]=useState<EventItem[]>([]);
  const [selected,setSelected]=useState<EventItem|null>(null);
  const [filter,setFilter]=useState<Filter>('all');
  const key=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`;
  const load=async()=>{const r=await fetch(`/api/player/calendar?month=${key}`,{credentials:'include'});const b=await r.json();if(r.ok)setEvents(Array.isArray(b.events)?b.events:[])};
  useEffect(()=>{void load()},[key]);
  if(selected)return <PlayerEventSlotDetail event={selected} onBack={()=>setSelected(null)} onSaved={()=>void load()}/>;
  const visible=events.filter(e=>filter==='all'||eventKind(e)===filter);
  const first=new Date(month.getFullYear(),month.getMonth(),1),lead=(first.getDay()+6)%7,count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const days=Array.from({length:42},(_,i)=>{const d=i-lead+1;return d>0&&d<=count?d:null});
  return <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-4 text-white"><div className="mx-auto max-w-[430px]">
    <h1 className="text-2xl font-semibold">Календарь событий</h1><p className="mt-1 text-xs text-white/40">Планируй месяц, выбирай формат и конкретные игры.</p>
    <section className="mt-4 rounded-[28px] border border-white/10 bg-white/[0.045] p-3"><div className="flex items-center justify-between"><button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))} className="h-10 w-10 rounded-2xl bg-white/[0.06]">‹</button><b className="capitalize">{month.toLocaleDateString('ru-RU',{month:'long',year:'numeric'})}</b><button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))} className="h-10 w-10 rounded-2xl bg-white/[0.06]">›</button></div>
    <div className="mt-3 flex gap-1 overflow-x-auto pb-1">{FILTERS.map(([id,text])=><button key={id} onClick={()=>setFilter(id)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] ${filter===id?'bg-white text-black':'bg-white/[0.06] text-white/45'}`}>{text}</button>)}</div>
    <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[9px] text-white/25">{['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=><div key={x}>{x}</div>)}</div><div className="mt-1 grid grid-cols-7 gap-1">{days.map((d,i)=>{if(!d)return <div key={i} className="min-h-[68px]"/>;const items=visible.filter(e=>{const x=new Date(e.starts_at);return x.getFullYear()===month.getFullYear()&&x.getMonth()===month.getMonth()&&x.getDate()===d});return <div key={d} className="min-h-[68px] rounded-xl border border-white/[0.06] bg-black/20 p-1"><div className="text-[9px] text-white/35">{d}</div>{items.slice(0,2).map(e=><button key={`${e.event_type}-${e.id}`} onClick={()=>setSelected(e)} className={`mt-1 block w-full truncate rounded px-1 py-1 text-left text-[7px] ${kindTone(e)}`}>{new Date(e.starts_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})} {kindLabel(e)}</button>)}</div>})}</div></section>
    <div className="mt-3 space-y-2">{visible.map(e=><button key={`${e.event_type}-${e.id}`} onClick={()=>setSelected(e)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-left"><div><b className="text-sm">{e.title}</b><div className="mt-1 text-xs text-white/35">{new Date(e.starts_at).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div></div><div className="text-right"><span className={`rounded-full px-2 py-1 text-[9px] ${kindTone(e)}`}>{kindLabel(e)}</span><div className="mt-1 text-[9px] text-white/35">{e.event_type==='evening'?(e.assembled?'стол собран':`${e.assembled_slots||0}/4 игр`):`${e.participant_count||0} игроков`}</div></div></button>)}</div>
  </div></main>;
}
