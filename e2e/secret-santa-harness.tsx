import {createRoot} from 'react-dom/client';
import './appStyles.ts';
import PlayerSecretSanta from '../src/components/player/PlayerSecretSanta.tsx';
import SecretSantaCRM from '../src/components/crm/SecretSantaCRM.tsx';
import type {SantaOrganizerState, SantaPlayerState} from '../src/shared/secretSanta.ts';

// «Тайный Санта» preview: ?mode=none|open|joined|drawn|closed|error for the player, crm-new|crm-open|crm-drawn for the organizer.
const mode=new URLSearchParams(location.search).get('mode')||'open';
const evening={id:'ev',title:'Новогодний вечер с очень длинным названием клуба',starts_at:'2026-12-20T16:00:00Z'};
const names=['Богданчик','Очень длинный никнейм игрока клуба','Серый','Millourt','Насон','Знак','Кавасаки'];
const people=names.map((nickname,i)=>({id:`p${i}`,nickname}));
const event=(over:Partial<NonNullable<SantaPlayerState['event']>>={})=>({id:'s1',status:'open' as const,evening,gift_limit:1000,participants:people,joined:false,recipient:null,drawn_at:null,...over});
let player:SantaPlayerState={event:event()};
if(mode==='none')player={event:null};
if(mode==='joined')player={event:event({joined:true})};
if(mode==='drawn')player={event:event({status:'drawn',joined:true,recipient:people[1],drawn_at:'2026-12-10T12:00:00Z'})};
if(mode==='closed')player={event:event({status:'drawn',drawn_at:'2026-12-10T12:00:00Z'})};
const org=(status:'open'|'drawn'):SantaOrganizerState=>({event:{id:'s1',status,evening,gift_limit:1000,created_at:'2026-12-01T10:00:00Z',drawn_at:status==='drawn'?'2026-12-10T12:00:00Z':null,posted:true,
 participants:people.map((p,i)=>({...p,joined_at:'2026-12-02T10:00:00Z',bot_blocked:i===2,message:status==='drawn'?(i===2?'unreachable' as const:'queued' as const):null}))}});
let fail=mode==='error';
globalThis.fetch=async(input:RequestInfo|URL)=>{
 const url=String(input);
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 if(fail){fail=false;return json({error:'Нет связи. Загрузка недоступна.'},503);}
 if(url.includes('/api/crm/santa'))return json({...(mode==='crm-new'?{event:null}:org(mode==='crm-drawn'?'drawn':'open')),evenings:[evening,{id:'ev2',title:'Пятница',starts_at:'2026-12-26T16:00:00Z'}]});
 if(url.endsWith('/join'))player={event:event({joined:true})};
 if(url.endsWith('/leave'))player={event:event()};
 return json(player);
};
const root=createRoot(document.getElementById('root')!);
if(mode.startsWith('crm-'))root.render(<div style={{padding:16}}><SecretSantaCRM/></div>);
else root.render(<PlayerSecretSanta onExit={()=>location.assign('/e2e/player-cabinet.html?route=/player/club/games')}/>);
