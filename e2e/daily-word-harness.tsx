import React from 'react';
import {createRoot} from 'react-dom/client';
import './appStyles.ts';
import PlayerDailyWord,{DailyWordCard} from '../src/components/player/PlayerDailyWord.tsx';
import {markDailyWord} from '../src/shared/dailyWord.ts';
import {wordFixture} from './daily-word-fixture.ts';
const mode=new URLSearchParams(location.search).get('mode')||'new';
let state=wordFixture(mode);let fail=mode==='error';
globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=String(input);const body=init?.body?JSON.parse(String(init.body)):{};
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 if(url.endsWith('/schedule'))return json(init?.method==='PUT'?{success:true}:{items:[{day:'2026-11-01',answer:'крыло'}]});
 if(url.endsWith('/reveal'))return json({answer:'маска'});
 if(url.endsWith('/guess')){if(body.word==='ааааа')return json({error:'Слова нет в словаре. Нужны существительные в начальной форме.'},400);const words=[...state.guesses,{word:body.word,marks:markDailyWord('маска',body.word)}];state={...state,guesses:words,status:body.word==='маска'?'won':words.length===6?'lost':'playing',reward_earned:body.word==='маска'?200:0,token_balance:body.word==='маска'?300:100};return json(state);}
 if(fail){fail=false;return json({error:'Нет связи. Загрузка недоступна.'},503);}return json(state);
};
createRoot(document.getElementById('root')!).render(mode==='card'?<div style={{maxWidth:430,padding:12,margin:'auto',background:'#090a0d',color:'white'}}><DailyWordCard onOpen={()=>location.assign('/e2e/daily-word.html')}/></div>:<PlayerDailyWord onExit={()=>location.assign('/e2e/player-cabinet.html?route=/player/club/games')}/>);
