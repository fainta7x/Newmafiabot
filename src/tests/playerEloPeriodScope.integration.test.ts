import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import request from 'supertest';
import {createApp} from '../app.ts';
import {createDatabaseConnection,type DatabaseWrapper} from '../db/index.ts';
import {generatePlayerSessionToken} from '../server/auth.ts';
let db:DatabaseWrapper;let app:any;let cookie:string;
const date=(day:number)=>`2026-10-${String(day).padStart(2,'0')}T18:00:00Z`;
beforeAll(async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
  db=createDatabaseConnection(':memory:');app=await createApp(db);
  const roles=['don','mafia','mafia','sheriff','citizen','citizen','citizen','citizen','citizen','citizen'];
  const players=roles.map((role,index)=>({role,player_id:index===4?'me':`scope-${index}`,seat_number:index+1,participant_id:`seat-${index}`,judge_bonus:0,protocol_bonus:0,ci_points:0,minor_technical_fouls:0,major_technical_fouls:0}));
  for(const player of players)await db.run(`INSERT INTO players(id,nickname,elo,elo_seed,created_at,updated_at) VALUES(?,?,1000,1000,?,?)`,[player.player_id,player.player_id,date(1),date(1)]);
  cookie=`player_token=${generatePlayerSessionToken('me')}`;
  for(const[id,from,to]of [['old','2026-03-01','2026-06-01'],['current','2026-09-01','2026-12-01'],['future','2027-01-01','2027-04-01']])await db.run(`INSERT INTO rating_periods(id,title,type,starts_at,ends_at,status,created_at,updated_at) VALUES(?,?,'RATING',?,?,'active',?,?)`,[id,id,from,to,date(1),date(1)]);
  for(let n=0;n<=14;n++){
    const at=n===0?'2026-05-01T18:00:00Z':date(n);const format=n===13?'NOVICE':n%2?'CASUAL':'RATING';const winner=n%2?'red':'black';
    await db.run(`INSERT INTO game_evenings(id,title,starts_at,status,format,created_at,updated_at) VALUES(?,?,?,'completed',?,?,?)`,[`scope-${n}`,`Scope ${n}`,at,format,at,at]);
    const payload={version:1,kind:'club_evening_protocol',player_results:players,protocol:{status:'completed',winner_team:winner,completed_at:at,events:[]}};
    await db.run(`INSERT INTO games(id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at) VALUES(?,?,?,?,?,?,?,'[]',?)`,[n+1,`scope-${n}`,n,at,winner,winner,JSON.stringify(payload),at]);
  }
});
afterAll(()=>{db?.sqlite.close();vi.useRealTimers();});
const get=async(path:string)=>{const r=await request(app).get('/api/player/'+path).set('Cookie',cookie);expect(r.status).toBe(200);return r.body;};
it('resolves current-season alias to the same explicit started period and excludes old games',async()=>{
  const all=await get('elo-journey');expect(all.events).toHaveLength(14);
  const alias=await get('elo-journey?period=season');const explicit=await get('elo-journey?period=period:current');
  expect(alias.scope.period).toBe('period:current');expect(alias.events).toHaveLength(13);
  expect(alias.events.map((e:any)=>e.id)).toEqual(explicit.events.map((e:any)=>e.id));
  expect(alias.summary.current).toBe(all.summary.current);
});
it('uses ten completed games, with a novice game occupying its place but adding no Elo event',async()=>{
  const games=await get('profiles/me/games?period=recent10&limit=10');expect(games.games).toHaveLength(10);
  const journey=await get('elo-journey?period=recent10');expect(journey.scope.period).toBe('recent10');
  expect(journey.events).toHaveLength(9);
  expect(journey.events.map((e:any)=>e.id).sort()).toEqual(games.games.filter((g:any)=>g.evening_format!=='NOVICE').map((g:any)=>g.id).sort());
  expect(journey.summary.chart_start).toBe(journey.events[0].elo_before);
});
it('applies format before the ten-game window and keeps unknown periods as the existing all-time fallback',async()=>{
  const games=await get('profiles/me/games?period=recent10&format=RATING&limit=10');
  const journey=await get('elo-journey?period=recent10&format=RATING');
  expect(journey.events.map((e:any)=>e.id).sort()).toEqual(games.games.map((g:any)=>g.id).sort());expect(journey.events).toHaveLength(8);
  const unknown=await get('elo-journey?period=nope');expect(unknown.scope.period).toBe('all');expect(unknown.events).toHaveLength(14);
});
