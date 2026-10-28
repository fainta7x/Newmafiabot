import {beforeEach,expect,it,vi} from 'vitest';
import type {DatabaseWrapper} from '../db/index.ts';
const fixtures=vi.hoisted(()=>({profile:{clubGames:[] as any[],tournamentGames:[] as any[]},timeline:[] as any[]}));
vi.mock('../server/services/playerProfileService.ts',()=>({loadPlayerGameProfile:vi.fn(async()=>fixtures.profile)}));
vi.mock('../server/services/playerEloHistoryService.ts',()=>({loadPlayerEloHistory:vi.fn(async()=>fixtures.timeline)}));
import {loadPremiumProfileElo} from '../server/services/premiumPlayerProfileService.ts';
const db={get:vi.fn(async()=>({id:'me',elo:1200})),all:vi.fn(async()=>[{id:'me',elo_seed:1000}])} as unknown as DatabaseWrapper;
const game=(id:string,date:string,format='RATING')=>({id,date,evening_format:format,status:'completed',winner_team:'red',role:'citizen'});
const event=(id:string,date:string,before:number,after:number)=>({source:id.startsWith('club:')?'club':'tournament',sourceId:id.split(':')[1],sortAt:date,sortOrder:1,players:[{playerId:'me',eloBefore:before,eloAfter:after,totalDelta:after-before,won:true}]});
beforeEach(()=>{fixtures.profile={clubGames:[],tournamentGames:[]};fixtures.timeline=[];});
it('takes the ten newest games across club and tournament groups before filtering Elo points',async()=>{
  fixtures.profile.clubGames=Array.from({length:10},(_,index)=>game(`club:${index+1}`,`2026-10-${String(10-index).padStart(2,'0')}`));
  fixtures.profile.tournamentGames=[game('tournament:new','2026-10-20','TOURNAMENT')];
  fixtures.timeline=[...fixtures.profile.clubGames].reverse().map((g,index)=>event(g.id,g.date,1000+index*10,1010+index*10));
  fixtures.timeline.push(event('tournament:new','2026-10-20',1100,1110));
  const result=await loadPremiumProfileElo(db,'me','all',{period:'recent10'});
  expect(result.points).toHaveLength(10);expect(result.points.at(-1).id).toBe('tournament:new');
  expect(result.points.some((p:any)=>p.id==='club:10')).toBe(false);
});
it('sums only chosen accruals when another format increased Elo between their endpoints',async()=>{
  fixtures.profile.clubGames=[game('club:a','2026-10-01'),game('club:omitted','2026-10-02','CASUAL'),game('club:b','2026-10-03')];
  fixtures.timeline=[event('club:a','2026-10-01',1000,1010),event('club:omitted','2026-10-02',1010,1050),event('club:b','2026-10-03',1050,1060)];
  const result=await loadPremiumProfileElo(db,'me','all',{format:'RATING'});
  expect(result.period_change).toBe(20);expect(result.current_elo).toBe(1200);
  expect(result.points.map((p:any)=>p.elo_after)).toEqual([1010,1060]);
});
