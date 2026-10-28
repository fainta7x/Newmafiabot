import {afterAll,beforeAll,expect,it} from 'vitest';
import request from 'supertest';
import {createApp} from '../app.ts';
import {createDatabaseConnection,type DatabaseWrapper} from '../db/index.ts';
import {generatePlayerSessionToken} from '../server/auth.ts';
let db:DatabaseWrapper;let app:any;let cookie:string;
beforeAll(async()=>{
 db=createDatabaseConnection(':memory:');app=await createApp(db);cookie=`player_token=${generatePlayerSessionToken('me')}`;
 await db.run(`INSERT INTO players(id,nickname,elo,created_at,updated_at) VALUES('me','Игрок',1000,'2026-01-01','2026-01-01')`);
 for(const[id,start,end,type]of [['old','2026-01-01','2026-02-01','RATING'],['new','2026-09-01','2026-12-01','RATING'],['novice','2026-09-01','2026-12-01','NOVICE']])await db.run(`INSERT INTO rating_periods(id,title,type,starts_at,ends_at,status,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?)`,[id,id,type,start,end,start,start]);
 for(let n=0;n<5;n++){
  const date=n===0?'2026-01-10T18:00:00Z':`2026-10-${10+n}T18:00:00Z`;const winner=n===0?'black':'red';
  await db.run(`INSERT INTO game_evenings(id,title,starts_at,status,format,created_at,updated_at) VALUES(?,?,?,'completed','CASUAL',?,?)`,[`cs-${n}`,'Вечер',date,date,date]);
  const payload={version:1,kind:'club_evening_protocol',player_results:[{player_id:'me',display_name:'Игрок',role:'citizen',seat_number:1}],protocol:{status:'completed',winner_team:winner,completed_at:date}};
  await db.run(`INSERT INTO games(evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at) VALUES(?,?,?,?,?,?,'[]',?)`,[`cs-${n}`,n+1,date,winner,winner,JSON.stringify(payload),date]);
 }
});
afterAll(()=>db?.sqlite.close());
const get=async(path:string)=>{const r=await request(app).get('/api/player/'+path).set('Cookie',cookie);expect(r.status).toBe(200);return r.body;};
it('returns the exact historical RATING period and its own records rather than current statistics',async()=>{
 const old=await get('club-world?period=period:old');const current=await get('club-world?period=period:new');
 expect(old.selected_season).toMatchObject({key:'period:old',games:1,viewer:{wins:0,games:1}});
 expect(current.selected_season).toMatchObject({key:'period:new',games:4,viewer:{wins:4,games:4}});
 expect(old.selected_season_records[0].value).toBe(0);expect(current.selected_season_records[0].value).toBe(4);
});
it('never substitutes a different season for unknown or novice IDs',async()=>{
 for(const id of ['period:missing','period:novice']){const data=await get('club-world?period='+encodeURIComponent(id));expect(data.selected_season).toBeNull();expect(data.selected_season_records).toEqual([]);}
});
it('reports actual recent outcomes and their date alongside unchanged Form points',async()=>{
 const data=await get('pulse');expect(data.power_ranking[0]).toMatchObject({games:5,wins:4,streak:4,score:97,last_results:['W','W','W','W','L'],last_game_at:'2026-10-14T18:00:00.000Z'});
});

it('keeps the new detailed Form sequence private when game statistics are hidden',async()=>{
 await db.run(`UPDATE players SET profile_visibility_json=? WHERE id='me'`,[JSON.stringify({game_statistics:false})]);
 const other=await request(app).get('/api/player/pulse').set('Cookie',`player_token=${generatePlayerSessionToken('viewer')}`);
 expect(other.status).toBe(200);expect(other.body.power_ranking[0].last_results).toBeUndefined();expect(other.body.power_ranking[0].last_game_at).toBeNull();
 const own=await get('pulse');expect(own.power_ranking[0].last_results).toEqual(['W','W','W','W','L']);
});
