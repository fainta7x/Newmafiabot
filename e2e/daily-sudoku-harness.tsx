import React from 'react';
import {createRoot} from 'react-dom/client';
import './appStyles.ts';
import PlayerDailySudoku,{DailySudokuCard} from '../src/components/player/PlayerDailySudoku.tsx';
import type {DailySudokuState} from '../src/shared/dailySudoku.ts';

// A fixed solved grid for the preview; the harness answers like the server (right digit stays, wrong one is a mistake).
const SOLUTION='534678912672195348198342567859761423426853791713924856961537284287419635345286179';
const PUZZLE  ='530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const mode=new URLSearchParams(location.search).get('mode')||'new';
const notes=mode==='notes';
const base=():DailySudokuState=>({day:'2026-11-16',next_at:new Date(Date.now()+5*3600000).toISOString(),level:'easy',reward:200,max_mistakes:3,status:'new',givens:'',board:'',solution:null,mistakes:0,started_at:null,seconds:null,reward_earned:0,token_balance:100,played:7,solved:4,streak:2,best_streak:5,results:[]});
const table=[{nickname:'Богданчик',won:true,seconds:312,mistakes:0},{nickname:'Очень длинный никнейм игрока клуба',won:true,seconds:3725,mistakes:2},{nickname:'Серый',won:false,seconds:null,mistakes:3}];
let state:DailySudokuState=base();
if(mode==='playing'||notes)state={...state,status:'playing',givens:PUZZLE,board:PUZZLE.split('').map((c,i)=>i===2?'4':c).join(''),mistakes:1,started_at:new Date(Date.now()-185000).toISOString()};
if(mode==='won')state={...state,status:'won',givens:PUZZLE,board:SOLUTION,solution:SOLUTION,mistakes:1,started_at:new Date(Date.now()-600000).toISOString(),seconds:482,reward_earned:200,token_balance:300,streak:3,results:table};
if(mode==='lost')state={...state,status:'lost',givens:PUZZLE,board:PUZZLE,solution:SOLUTION,mistakes:3,started_at:new Date(Date.now()-600000).toISOString(),seconds:null,results:table};
if(notes){try{localStorage.setItem('daily-sudoku-notes:2026-11-16',JSON.stringify({3:[1,2,6],5:[2,4,6,8],6:[1,2,3,4,5,6,7,8,9]}));}catch{/* preview only */}}
let fail=mode==='error';
globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=String(input);const body=init?.body?JSON.parse(String(init.body)):{};
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 if(fail){fail=false;return json({error:'Нет связи. Загрузка недоступна.'},503);}
 if(url.endsWith('/start')){state={...state,status:'playing',givens:PUZZLE,board:PUZZLE,started_at:new Date().toISOString()};return json(state);}
 if(url.endsWith('/move')){
  const ok=SOLUTION[body.cell]===String(body.digit);
  const board=ok?state.board.slice(0,body.cell)+body.digit+state.board.slice(body.cell+1):state.board;
  const mistakes=state.mistakes+(ok?0:1);
  const status=board===SOLUTION?'won':mistakes>=3?'lost':'playing';
  state={...state,board,mistakes,status,solution:status==='playing'?null:SOLUTION,seconds:status==='won'?95:null,reward_earned:status==='won'?200:0,results:status==='playing'?[]:table};
  return json({...state,last_move:{cell:body.cell,digit:body.digit,ok}});
 }
 return json(state);
};
createRoot(document.getElementById('root')!).render(mode==='card'?<div style={{maxWidth:430,padding:12,margin:'auto',background:'#090a0d',color:'white'}}><DailySudokuCard onOpen={()=>location.assign('/e2e/daily-sudoku.html')}/></div>:<PlayerDailySudoku onExit={()=>location.assign('/e2e/player-cabinet.html?route=/player/club/games')}/>);
