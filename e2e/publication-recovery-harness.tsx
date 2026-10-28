import { createRoot } from 'react-dom/client';
import OrganizerAgenda from '../src/components/crm/OrganizerAgenda.tsx';
import './appStyles.ts';

let items = [
  {key:'today:evening:telegram',attempt_id:'attempt-one',entity_id:'evening',evening_id:'evening',title:'Пятничный клубный вечер',kind:'today',channel:'telegram',target:'Группа клуба · тема «Игры»',text:'🎭 Сегодня играем в мафию!\nЖдём всех к первой игре в 21:00.\n📍 Суп с Котом',error:'Telegram не ответил — пост мог выйти',legacy:false},
  {key:'club:mvp-result-vk:evening',attempt_id:'attempt-two',entity_id:'evening',evening_id:'evening',title:'Пятничный клубный вечер',kind:'club-result',channel:'vk',target:'vk.com/2lanoiremafia',text:'🏅 MVP вечера — Игрок с длинным именем. Спасибо всем за игры!',error:'Ответ ВКонтакте не получен',legacy:false},
];
const originalFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
  const url=String(input);
  if(url==='/api/crm/publications/held')return Response.json({items});
  if(url==='/api/crm/publications/reconcile'){
    const body=JSON.parse(String(init?.body));
    (window as any).__publicationDecisions=[...((window as any).__publicationDecisions||[]),body];
    items=items.filter(item=>item.key!==body.key);return Response.json({ok:true});
  }
  if(url==='/api/crm/agenda')return Response.json({items:[{id:'existing',group:'now',kind:'task',title:'Подготовить вечер',why:'Проверить состав перед началом игр'}],counts:{now:1,week:0,later:0},total:1,snoozed:0,groups:{now:'Срочно',week:'На этой неделе',later:'Позже'}});
  return originalFetch(input,init);
};
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-2xl p-3"><OrganizerAgenda onOpenEveningSection={()=>{}} onOpenPlayer={()=>{}} onCreateEvening={()=>{}}/></main>);
