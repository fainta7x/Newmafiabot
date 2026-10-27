import { expect, it, vi } from 'vitest';
import { loadPlayerEveningSummaries } from '../server/services/playerEveningSummaryService.ts';
import type { CompletedGameSnapshot } from '../server/services/clubGameAnalyticsService.ts';
it('projects actual snapshot numbers and only the viewer recorded participation', async()=>{
 const db={all:vi.fn(async()=>[{id:'e1',title:'Вечер',starts_at:'2026-10-23T18:00:00Z',settled_at:null,venue:null,status:'completed',attendance_status:'attended'}]),get:vi.fn(async()=>null)};
 const game=(id:string,number:number,played:boolean):CompletedGameSnapshot=>({id,source:'club',event_id:'e1',date:'2026-10-23T18:00:00Z',dateMs:Date.parse('2026-10-23T18:00:00Z'),played_at:'2026-10-23T18:00:00Z',title:'Вечер',game_number:number,winner_team:'red',players:played?[{player_id:'me',nickname:'Игрок',role:'sheriff',team:'red',won:true,seat_number:3}]:[]});
 const summaries=await loadPlayerEveningSummaries(db,'me',8,{snapshots:[game('club:41',41,true),game('club:42',42,false),game('club:legacy',0,false),{...game('club:unknown',43,false),has_unresolved_players:true}],eloTimeline:[]});
 expect(summaries[0].game_links).toEqual([{id:'club:legacy',game_number:null,winner_team:'red',personal:null},{id:'club:41',game_number:41,winner_team:'red',personal:{role:'sheriff',won:true}},{id:'club:42',game_number:42,winner_team:'red',personal:null},{id:'club:unknown',game_number:43,winner_team:'red',personal:undefined}]);
 expect(summaries[0].game_ids).toEqual(summaries[0].game_links.map(game=>game.id));
 expect(JSON.parse(JSON.stringify(summaries[0].game_links)).find((game: {id:string})=>game.id==='club:unknown')).not.toHaveProperty('personal');
 expect(db.all).toHaveBeenCalledTimes(1);
});
