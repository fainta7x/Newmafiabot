import {expect,it} from 'vitest';
import {buildConnectionContent} from '../server/services/connectionContentService.ts';
import type {CompletedGameSnapshot} from '../server/services/clubGameAnalyticsService.ts';
function game(n:number,won=true,opposite=false):CompletedGameSnapshot{return {id:'club:'+n,source:'club',event_id:'e'+n,date:`2026-10-${String(n).padStart(2,'0')}T18:00:00Z`,dateMs:n,played_at:'',title:'Вечер',game_number:n,winner_team:won?'red':'black',players:[{player_id:'a',nickname:'Анна',role:'citizen',team:'red',won,seat_number:1},{player_id:'b',nickname:'Борис',role:opposite?'mafia':'sheriff',team:opposite?'black':'red',won:opposite?!won:won,seat_number:2}]};}
const build=(all:CompletedGameSnapshot[],scope=all,visible=(_id:string)=>true,selected=['a','b'])=>buildConnectionContent(all,scope,visible,selected);
it('counts current and record streaks only over common same-colour games',()=>{
 const all=[game(1),game(2),game(3,false,true),game(4,false),game(5),game(6)];
 const r=build(all);expect(r.streaks[0]).toMatchObject({current:2,best:2,games:5,team:'red'});
 expect(r.pair).toMatchObject({games:6,together:5,against:1,a_wins:0,b_wins:1,red:{games:5,wins:4}});
 expect(r.pair?.last_games.map(g=>g.game_key)).toEqual(['club:6','club:5','club:4','club:3','club:2']);
});
it('does not call an old pair new at the start of a selected period or after a format filter',()=>{const all=[game(1),game(2),game(3)];expect(build(all,[all[2]]).new_pairs).toEqual([]);expect(build(all).new_pairs).toHaveLength(1);});
it('deduplicates sources, rejects incomplete rosters and removes hidden identities before aggregation',()=>{
 const a=game(1),b=game(2);expect(build([a,a,b]).pair?.games).toBe(2);
 const hidden=build([a,b],undefined,id=>id!=='b');expect(hidden).toMatchObject({pair:null,streaks:[],rivals:[],table_pairs:[],new_pairs:[]});
 const incomplete={...b,has_unresolved_players:true};expect(build([a,incomplete]).pair?.games).toBe(1);
 const tournament={...a,source:'tournament' as const,id:'tournament:1'};expect(build([a,tournament]).pair?.events).toBe(2);
});
it('keeps role orientation and opponent scores independent from selected ID order',()=>{const r=build([game(1),game(2,false,true),game(3,true,true)],undefined,()=>true,['b','a']);expect(r.pair?.members.map(m=>m.player_id)).toEqual(['a','b']);expect(r.rivals[0]).toMatchObject({against:2,a_wins:1,b_wins:1});expect(r.pair?.roles[0]).toMatchObject({a_role:'citizen',b_role:'sheriff',wins:1});expect(build([game(1)],undefined,()=>true,['a','a']).pair).toBeNull();});
