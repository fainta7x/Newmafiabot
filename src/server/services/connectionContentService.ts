import type {CompletedGameSnapshot} from './clubGameAnalyticsService.ts';
import type {ConnectionMember} from '../../shared/clubConnectionStories.ts';
import type {ConnectionContent,PairGame,PairHistory,PairSummary,PairStreak,NewPair} from '../../shared/connectionContent.ts';
import {winRatePercent} from '../../shared/stats.ts';
type Group={members:ConnectionMember[];games:PairGame[];events:Set<string>;red:{wins:number;games:number;events:Set<string>};black:{wins:number;games:number;events:Set<string>}};
const valid=(g:CompletedGameSnapshot)=>!g.has_unresolved_players&&g.players.every(p=>p.player_id)&&new Set(g.players.map(p=>p.player_id)).size===g.players.length;
const chronological=(a:CompletedGameSnapshot,b:CompletedGameSnapshot)=>a.dateMs-b.dateMs||a.game_number-b.game_number||a.id.localeCompare(b.id);
const key=(a:string,b:string)=>JSON.stringify([a,b].sort());
/** Pair outcomes describe whole-team results; never responsibility, trust or causal synergy. */
export function buildConnectionContent(all:CompletedGameSnapshot[],scoped:CompletedGameSnapshot[],canView:(id:string)=>boolean,selected:string[]):Omit<ConnectionContent,'filters'|'players'>{
 const groups=new Map<string,Group>();const earliest=new Map<string,{date:string;game_key:string}>();const seenAll=new Set<string>();
 for(const g of [...all].sort(chronological)){
  const identity=JSON.stringify([g.source,g.id]);if(seenAll.has(identity)||!valid(g))continue;seenAll.add(identity);
  const players=g.players.filter(p=>canView(p.player_id)).sort((a,b)=>a.player_id.localeCompare(b.player_id));
  for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++)if(players[i].team===players[j].team){const k=key(players[i].player_id,players[j].player_id)+players[i].team;if(!earliest.has(k))earliest.set(k,{date:g.date,game_key:g.id});}
 }
 const seen=new Set<string>();
 for(const g of [...scoped].sort(chronological)){
  const identity=JSON.stringify([g.source,g.id]);if(seen.has(identity)||!valid(g))continue;seen.add(identity);
  const players=g.players.filter(p=>canView(p.player_id)).sort((a,b)=>a.player_id.localeCompare(b.player_id));
  for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++){
   const a=players[i],b=players[j],k=key(a.player_id,b.player_id);const event=JSON.stringify([g.source,g.event_id]);
   const group=groups.get(k)||{members:[{player_id:a.player_id,nickname:a.nickname},{player_id:b.player_id,nickname:b.nickname}],games:[],events:new Set<string>(),red:{wins:0,games:0,events:new Set<string>()},black:{wins:0,games:0,events:new Set<string>()}};
   group.events.add(event);group.games.push({game_key:g.id,date:g.date,title:g.title,number:g.game_number,a_role:a.role,b_role:b.role,a_team:a.team,b_team:b.team,a_won:a.won,b_won:b.won});
   if(a.team===b.team){const c=group[a.team];c.games++;if(a.won)c.wins++;c.events.add(event);}groups.set(k,group);
  }
 }
 const summary=(g:Group):PairSummary=>{const against=g.games.filter(r=>r.a_team!==r.b_team);return {members:g.members,games:g.games.length,events:g.events.size,together:g.red.games+g.black.games,against:against.length,a_wins:against.filter(r=>r.a_won).length,b_wins:against.filter(r=>r.b_won).length,last_date:g.games[g.games.length-1].date};};
 const summaries=[...groups.values()].map(summary);const tie=(a:PairSummary,b:PairSummary)=>b.last_date.localeCompare(a.last_date)||key(a.members[0].player_id,a.members[1].player_id).localeCompare(key(b.members[0].player_id,b.members[1].player_id));
 const streaks:PairStreak[]=[];const newPairs:NewPair[]=[];
 for(const[k,g]of groups)for(const team of ['red','black']as const){
  const games=g.games.filter(r=>r.a_team===team&&r.b_team===team);let current=0,best=0;
  for(const r of games){current=r.a_won?current+1:0;best=Math.max(best,current);}
  if(games.length>=2&&best>=2)streaks.push({members:g.members,team,games:games.length,current,best,last_date:games[games.length-1].date});
  const first=earliest.get(k+team);if(first&&games.some(r=>r.game_key===first.game_key))newPairs.push({members:g.members,team,...first});
 }
 const chosen=selected.length===2&&selected[0]!==selected[1]&&selected.every(canView)?groups.get(key(selected[0],selected[1])):undefined;
 let pair:PairHistory|null=null;
 if(chosen){
  const sample=(team:'red'|'black')=>({...chosen[team],events:chosen[team].events.size,win_rate:winRatePercent(chosen[team].wins,chosen[team].games)});
  const roles=new Map<string,{a_role:PairGame['a_role'];b_role:PairGame['b_role'];games:number;wins:number}>();
  for(const r of chosen.games.filter(r=>r.a_team===r.b_team)){const k=JSON.stringify([r.a_role,r.b_role]);const v=roles.get(k)||{a_role:r.a_role,b_role:r.b_role,games:0,wins:0};v.games++;if(r.a_won)v.wins++;roles.set(k,v);}
  pair={...summary(chosen),red:sample('red'),black:sample('black'),roles:[...roles.values()].sort((a,b)=>b.games-a.games),last_games:chosen.games.slice(-5).reverse()};
 }
 return {streaks:streaks.sort((a,b)=>b.current-a.current||b.best-a.best||b.last_date.localeCompare(a.last_date)||key(a.members[0].player_id,a.members[1].player_id).localeCompare(key(b.members[0].player_id,b.members[1].player_id))).slice(0,3),new_pairs:newPairs.sort((a,b)=>b.date.localeCompare(a.date)||key(a.members[0].player_id,a.members[1].player_id).localeCompare(key(b.members[0].player_id,b.members[1].player_id))).slice(0,3),rivals:summaries.filter(s=>s.against>=2).sort((a,b)=>b.against-a.against||tie(a,b)).slice(0,3),table_pairs:summaries.filter(s=>s.games>=2).sort((a,b)=>b.games-a.games||tie(a,b)).slice(0,3),pair};
}
