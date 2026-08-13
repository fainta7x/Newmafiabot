import { useEffect, useState } from 'react';
import PlayerEventSlotDetail from './PlayerEventSlotDetail.tsx';

type EventItem = { id:string; title:string; starts_at:string; format:string; event_type:'evening'|'tournament'; assembled?:boolean; assembled_slots?:number };

export default function PlayerEventsCalendar(){
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [events,setEvents]=useState<EventItem[]>([]);
  const [selected,setSelected]=useState<EventItem|null>(null);
  const key=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`;
  const load=async()=>{const r=await fetch(`/api/player/calendar?month=${key}`,{credentials:'include'});const b=await r.json();if(r.ok)setEvents(Array.isArray(b.events)?b.events:[])};
  useEffect(()=>{void load()},[key]);
  if(selected)return <PlayerEventSlotDetail event={selected} onBack={()=>setSelected(null)} onSaved={()=>void load()}/>;
  const first=new Date(month.getFullYear(),month.getMonth(),1),lead=(first.getDay()+6)%7,count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const days=Array.from({length:42},(_,i)=>{const d=i-lead+1;return d>0&&d<=count?d:null});
  return <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-4 text-white"><div className="mx-auto max-w-[430px]">
    <h1 className="text-2xl font-semibold">Календарь событий</h1><p className="mt-1 text-xs text-white/40">Выбирай формат, дату и конкретные игры.</p>
    <section className="mt-4 rounded-[28px] border border-white/10 bg-white/[0.045] p-3"><div className="flex items-center justify-between"><button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))} className="h-10 w-10 rounded-2xl bg-white/[0.06]">‹</button><b className="capitalize">{month.toLocaleDateString('ru-RU',{month:'long',year:'numeric'})}</b><button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))} className="h-10 w-10 rounded-2xl bg-white/[0.06]">›</button></div>
    <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[9px] text-white/25">{['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=><div key={x}>{x}</div>)}</div><div className="mt-1 grid grid-cols-7 gap-1">{days.map((d,i)=>{if(!d)return <div key={i} className="min-h-[68px]"/>;const items=events.filter(e=>{const x=new Date(e.starts_at);return x.getFullYear()===month.getFullYear()&&x.getMonth()===month.getMonth()&&x.getDate()===d});return <div key={d} className="min-h-[68px] rounded-xl border border-white/[0.06] bg-black/20 p-1"><div className="text-[9px] text-white/35">{d}</div>{items.slice(0,2).map(e=><button key={`${e.event_type}-${e.id}`} onClick={()=>setSelected(e)} className="mt-1 block w-full truncate rounded bg-white/[0.08] px-1 py-1 text-left text-[7px]">{new Date(e.starts_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})} {e.event_type==='tournament'?'Турнир':e.format}</button>)}</div>})}</div></section>
    <div className="mt-3 space-y-2">{events.map(e=><button key={`${e.event_type}-${e.id}`} onClick={()=>setSelected(e)} className="w-full rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-left"><b className="text-sm">{e.title}</b><div className="mt-1 text-xs text-white/35">{new Date(e.starts_at).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}{e.event_type==='evening'?` · ${e.assembled?'стол собран':`${e.assembled_slots||0}/4 игр`}`:''}</div></button>)}</div>
  </div></main>;
}
