import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import { ensureAdminDataSchema } from '../db/ensureAdminDataSchema.ts';
import { evaluatePlayerAchievements } from '../server/services/playerAchievementsService.ts';

describe('achievement paths auth, persistence and catalog preservation', () => {
  let db: DatabaseWrapper; let app: any;
  const own='player_token='+generatePlayerSessionToken('p1');
  beforeEach(async()=>{db=createDatabaseConnection(':memory:');app=await createApp(db);
    await db.run("INSERT INTO players(id,nickname,telegram_user_id,contact_status,created_at,updated_at) VALUES ('p1','P1','111','normal','2026-10-08','2026-10-08'),('p2','P2','222','normal','2026-10-08','2026-10-08')");});
  afterEach(()=>db.sqlite.close());
  it('does not authorize anonymous/foreign pin writes; persists own path across reads',async()=>{
    expect((await request(app).patch('/api/player/achievement-preferences').send({path_id:'citizen',pins:[]})).status).toBe(401);
    expect((await request(app).patch('/api/player/achievement-preferences').set('Cookie',own).send({path_id:'citizen',pins:['case_closed']})).status).toBe(400);
    const save=await request(app).patch('/api/player/achievement-preferences').set('Cookie',own).send({path_id:'sheriff',pins:[],player_id:'p2'});
    expect(save.status).toBe(200);
    const profile=await request(app).get('/api/player/profiles/p1/showcase').set('Cookie',own);
    expect(profile.status).toBe(200);expect(profile.body.achievement_preferences).toEqual({path_id:'sheriff',pins:[]});
    expect(await db.get('SELECT 1 FROM player_achievement_preferences WHERE player_id=\'p2\'')).toBeNull();
  });
  it('keeps edited definitions, manual legacy dates and revoke overrides on reseed/evaluation',async()=>{
    await db.run("UPDATE achievement_definitions SET name='Моё название' WHERE id='first_game'");
    await db.run("INSERT INTO player_achievements(id,player_id,achievement_id,earned_at,source,created_at) VALUES ('old','p1','first_game','2025-01-01','legacy','2025-01-01')");
    await db.run("INSERT INTO player_achievement_overrides(player_id,achievement_id,state,updated_at) VALUES ('p1','case_closed','revoke','2026-01-01')");
    await ensureAdminDataSchema(db);await evaluatePlayerAchievements(db,'p1');
    expect((await db.get<any>("SELECT name FROM achievement_definitions WHERE id='first_game'"))!.name).toBe('Моё название');
    expect((await db.get<any>("SELECT earned_at FROM player_achievements WHERE id='old'"))!.earned_at).toBe('2025-01-01');
    expect(await db.get("SELECT 1 FROM player_achievements WHERE player_id='p1' AND achievement_id='case_closed'")).toBeNull();
  });
  it('does not disclose story grounds or pins to other players',async()=>{
    const response=await request(app).get('/api/player/profiles/p1/showcase').set('Cookie','player_token='+generatePlayerSessionToken('p2'));
    expect(response.status).toBe(200);expect(response.body.achievement_preferences).toBeNull();
    expect(response.body.achievements.categories.flatMap((c:any)=>c.achievements).every((a:any)=>a.evidence===null)).toBe(true);
  });
  it('awards from real saved history once, protects private evidence and reconciles corrected dates',async()=>{
    const date='2026-10-01T20:00:00Z';
    const roles=['citizen','mafia','sheriff','citizen','don','citizen','citizen','mafia','citizen','citizen'];
    const payload=(completed:string, nominated=true)=>({kind:'club_evening_protocol',
      player_results:roles.map((role,i)=>({role,seat_number:i+1,player_id:`p${i+1}`,participant_id:`seat${i+1}`})),
      protocol:{status:'completed',winner_team:'red',completed_at:completed,events:[
        {kind:'game_start',phase:'setup',round:1},
        ...(nominated?[{kind:'nomination',seat:2,by:1}]:[]),
        {kind:'vote',seat:1,target:2,value:1},{kind:'vote_round_result',value:'1:single_eliminated'},
        {kind:'exit',seat:2,value:'voted_day'},{kind:'game_end',value:'red'},
      ].map((e,i)=>({seq:i+1,at:completed,round:2,phase:'day_voting',...e}))}});
    await db.run("INSERT INTO game_evenings(id,title,starts_at,status,created_at,updated_at) VALUES ('e1','E1',?,'completed',?,?)",[date,date,date]);
    await db.run("INSERT INTO games(id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at) VALUES (1,'e1',1,?,'red','Red',?,'[]',?)",[date,JSON.stringify(payload(date)),date]);
    expect(await evaluatePlayerAchievements(db,'p1')).toContain('case_closed');
    expect(await evaluatePlayerAchievements(db,'p1')).not.toContain('case_closed');
    const find=(r:any)=>r.body.achievements.categories.flatMap((c:any)=>c.achievements).find((a:any)=>a.id==='case_closed');
    const self=await request(app).get('/api/player/profiles/p1/showcase').set('Cookie',own);
    expect(find(self)).toMatchObject({earned:true,earned_at:new Date(date).toISOString(),evidence:{gameId:'club:1'}});
    expect((await request(app).patch('/api/player/achievement-preferences').set('Cookie',own).send({path_id:'citizen',pins:['case_closed']})).status).toBe(200);
    const other=await request(app).get('/api/player/profiles/p1/showcase').set('Cookie','player_token='+generatePlayerSessionToken('p2'));
    expect(find(other)).toMatchObject({earned:true,evidence:null});expect(other.body.achievement_preferences).toBeNull();
    await db.run("INSERT INTO organizer_player_access(player_id,granted_at) VALUES ('p2','2026-10-08')");
    const both='player_token='+generatePlayerSessionToken('p2')+'; organizer_token='+generateOrganizerToken('p2');
    const organizer=await request(app).get('/api/player/profiles/p1/showcase').set('Cookie',both);
    expect(organizer.status).toBe(200);
    expect(find(organizer)).toMatchObject({evidence:{gameId:'club:1'}});
    // Summary intentionally returns only three latest achievements: give the older catalog fixture older dates.
    await db.run("UPDATE player_achievements SET earned_at='2020-01-01T00:00:00Z' WHERE player_id='p1' AND achievement_id!='case_closed'");
    const organizerSummary=await request(app).get('/api/player/profiles/p1/summary').set('Cookie',both);
    expect(organizerSummary.status).toBe(200);
    expect(organizerSummary.body.viewer).toMatchObject({is_self:false,is_organizer:true});
    expect(organizerSummary.body.recent_achievements.find((a:any)=>a.id==='case_closed').evidence).toMatchObject({gameId:'club:1'});
    const untrusted=await request(app).get('/api/player/profiles/p1/showcase').set('Cookie','player_token='+generatePlayerSessionToken('p2')+'; organizer_token=invalid');
    expect(untrusted.status).toBe(200);expect(find(untrusted).evidence).toBeNull();
    const publicSummary=await request(app).get('/api/player/profiles/p1/summary').set('Cookie','player_token='+generatePlayerSessionToken('p2'));
    expect(publicSummary.status).toBe(200);
    expect(publicSummary.body.viewer.is_organizer).toBe(false);
    expect(publicSummary.body.recent_achievements.find((a:any)=>a.id==='case_closed').evidence).toBeNull();


    const corrected='2026-10-02T20:00:00Z';
    await db.run('UPDATE games SET protocol_text=? WHERE id=1',[JSON.stringify(payload(corrected))]);
    await evaluatePlayerAchievements(db,'p1');
    expect((await db.get<any>("SELECT earned_at FROM player_achievements WHERE player_id='p1' AND achievement_id='case_closed'"))!.earned_at).toBe(new Date(corrected).toISOString());
    await db.run('UPDATE games SET protocol_text=? WHERE id=1',[JSON.stringify(payload(corrected,false))]);
    await evaluatePlayerAchievements(db,'p1');
    expect(await db.get("SELECT 1 FROM player_achievements WHERE player_id='p1' AND achievement_id='case_closed'")).toBeNull();
    const after=await request(app).get('/api/player/profiles/p1/showcase').set('Cookie',own);
    expect(after.body.achievement_preferences.pins).toEqual([]);
  });
});
