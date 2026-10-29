import { markDailyWord, type DailyWordState } from '../src/shared/dailyWord.ts';
export function wordFixture(mode='new'):DailyWordState {
 const won=mode==='won',lost=mode==='lost',playing=mode==='playing';
 const answer=mode==='long'?'скатерть':'маска';
 const words=won?['кошка','маска']:lost?['кошка','лампа','ложка','миска','шапка','ручка']:playing?['кошка']:[];
 return {day:'2026-10-28',next_at:new Date(Date.now()+3600000).toISOString(),length:answer.length,max_tries:6,reward:200,status:won?'won':lost?'lost':playing?'playing':'new',guesses:words.map(word=>({word,marks:markDailyWord(answer,word)})),reward_earned:won?200:0,reward_eligible:true,token_balance:won?300:100,played:12,solved:8,streak:won?3:2,best_streak:5,results:won||lost?[{nickname:'ОченьДлинноеИмяИгрокаДляПроверкиПереноса',won:true,attempts:2},{nickname:'Дина',won:false,attempts:6}]:[],can_manage:mode==='admin'};
}
