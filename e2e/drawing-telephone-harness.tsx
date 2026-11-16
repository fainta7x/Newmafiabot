import React from 'react';
import {createRoot} from 'react-dom/client';
import './appStyles.ts';
import PlayerDrawingTelephone from '../src/components/player/PlayerDrawingTelephone.tsx';
import type {TelephoneChainState, TelephoneItem, TelephoneListState} from '../src/shared/drawingTelephone.ts';

// Preview of every state of «Испорченный телефон с рисунками»; the harness answers like the server.
const mode=new URLSearchParams(location.search).get('mode')||'list';
const drawing=(()=>{const c=document.createElement('canvas');c.width=c.height=480;const x=c.getContext('2d')!;x.fillStyle='#fff';x.fillRect(0,0,480,480);x.strokeStyle='#1e88e5';x.lineWidth=10;x.beginPath();x.arc(240,220,120,0,Math.PI*2);x.stroke();x.strokeStyle='#e53935';x.beginPath();x.moveTo(140,400);x.lineTo(340,400);x.stroke();return c.toDataURL('image/png').split(',')[1];})();
const players=['Богданчик','Очень длинный никнейм игрока клуба','Серый','ФМ','Дина','Алоэ','Перец','Ольга'].map((nickname,i)=>({id:`p${i}`,nickname}));
const item=(kind:TelephoneItem['kind'],position:number,nickname:string,text:string|null,image:string|null=null):TelephoneItem=>({kind,position,nickname,text,image});
const base=(over:Partial<TelephoneChainState>):TelephoneChainState=>({id:'c1',status:'active',length:7,done_links:2,author:{id:'p0',nickname:'Богданчик'},guesser:{id:'p2',nickname:'Серый'},current:{id:'me',nickname:'Я'},step:'move',deadline_at:new Date(Date.now()+5*3600000).toISOString(),created_at:'2026-11-16T10:00:00Z',finished_at:null,my_task:null,items:[],players:[{id:'p3',nickname:'ФМ'},{id:'p4',nickname:'Дина'}],...over});
const chains:Record<string,TelephoneChainState>={
 draft:base({my_task:{step:'move',kind:'drawing',position:3,last:false},items:[item('caption',2,'Дина','Кошка играет на большой гитаре у костра')]}),
 draw:base({my_task:{step:'move',kind:'drawing',position:3,last:false},items:[item('caption',2,'Дина','Кошка играет на большой гитаре у костра')]}),
 caption:base({done_links:3,my_task:{step:'move',kind:'caption',position:4,last:false},items:[item('drawing',3,'ФМ',null,drawing)]}),
 last:base({done_links:6,my_task:{step:'move',kind:'caption',position:7,last:true},items:[item('drawing',6,'ФМ',null,drawing)]}),
 choose:base({step:'choose',my_task:{step:'choose',kind:null,position:3,last:false}}),
 chooseguesser:base({step:'choose_guesser',done_links:7,my_task:{step:'choose_guesser',kind:null,position:8,last:false}}),
 guess:base({step:'guess',done_links:7,my_task:{step:'guess',kind:'guess',position:8,last:true},items:[item('caption',6,'Дина','Шар над рекой'),item('drawing',7,'Алоэ',null,drawing)]}),
 waiting:base({current:{id:'p5',nickname:'Алоэ'},items:[item('phrase',0,'Богданчик','Кот играет на гитаре')]}),
 done:base({status:'done',step:null,current:null,deadline_at:null,length:5,done_links:5,finished_at:'2026-11-16T18:00:00Z',items:[item('phrase',0,'Богданчик','Кот играет на гитаре'),item('drawing',1,'ФМ',null,drawing),item('caption',2,'Очень длинный никнейм игрока клуба','Луна над рекой'),item('drawing',3,'Дина',null,drawing),item('caption',4,'Алоэ','Шар над водой'),item('drawing',5,'Перец',null,drawing),item('guess',6,'Серый','Мяч на пляже')]}),
};
const list:TelephoneListState={reward:50,my_turns:mode==='empty'?[]:[{id:'c1',step:'move',position:3,length:7,author:'Богданчик',deadline_at:new Date(Date.now()+5*3600000).toISOString()},{id:'c2',step:'guess',position:8,length:7,author:'Очень длинный никнейм игрока клуба',deadline_at:new Date(Date.now()+3600000).toISOString()}],
 running:mode==='empty'?[]:[{id:'c4',author:'Богданчик',guesser:'Серый',done_links:2,length:7,step:'move',current:'Очень длинный никнейм игрока клуба',deadline_at:new Date(Date.now()+4*3600000).toISOString()},{id:'c5',author:'Дина',guesser:'Алоэ',done_links:12,length:12,step:'guess',current:'Алоэ',deadline_at:new Date(Date.now()+3600000).toISOString()},{id:'c6',author:'Перец',guesser:'ФМ',done_links:3,length:5,step:'choose',current:'Ольга',deadline_at:new Date(Date.now()+7*3600000).toISOString()}],
 my_active:mode==='active'?{id:'c3',done_links:2,length:9,current:'Дина'}:null,
 finished:mode==='empty'?[]:[{id:'c9',author:'Богданчик',guesser:'Серый',phrase:'Кот играет на гитаре',guess:'Мяч на пляже',length:5,finished_at:'2026-11-16T18:00:00Z',cover:drawing},{id:'c8',author:'Дина',guesser:'Алоэ',phrase:'Очень длинная стартовая фраза про то, как мафия ночью выбирает, кого убить',guess:null,length:12,finished_at:'2026-11-15T18:00:00Z',cover:null}]};
let fail=mode==='error';
globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=String(input);const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 if(fail){fail=false;return json({error:'Нет связи. Загрузка недоступна.'},503);}
 if(url.includes('/players'))return json({items:players});
 if(init?.method==='POST')return json({chain:chains.done});
 const id=url.split('/telephone/')[1];
 if(id)return json(chains[mode]||chains.done);
 return json(list);
};
// A drawing kept from an earlier visit: the offer to continue it (owner, 2026-11-16).
if(mode==='draft'){try{localStorage.setItem('telephone-draft:c1:3',JSON.stringify([{color:'#1e88e5',width:6,points:[[60,60],[300,260]]}]));}catch{/* preview only */}}
const chainId=['draft','draw','caption','last','choose','chooseguesser','guess','waiting','done'].includes(mode)?'c1':null;
function App(){const[open,setOpen]=React.useState<string|null>(chainId);const[create]=React.useState(mode==='create');return <PlayerDrawingTelephone key={String(open)+create} chainId={open} onOpen={setOpen} onExit={()=>location.assign('/e2e/player-cabinet.html?route=/player/club/games')}/>;}
createRoot(document.getElementById('root')!).render(<App/>);
if(mode==='create')setTimeout(()=>(document.querySelector('[data-testid="telephone-create"]') as HTMLButtonElement|null)?.click(),300);
