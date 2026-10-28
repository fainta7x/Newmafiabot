import {runEveningMvpRunoffs} from '../server/services/eveningVoteMessageService.ts';
import {afterEach,expect,it,vi} from 'vitest';
import request from 'supertest';
import {createApp} from '../app.ts';
import {createDatabaseConnection,type DatabaseWrapper} from '../db/index.ts';
import {generatePlayerSessionToken} from '../server/auth.ts';
import {castEveningVote,ensureEveningVoteSchema,loadVotingContext,loadPendingVoteForPlayer} from '../server/services/eveningVotingService.ts';
import {resolveEveningMvp,decideEveningMvp} from '../server/services/eveningMvpService.ts';
import {loadMvpRunoff} from '../server/services/eveningVoteRounds.ts';
import {PRIMARY_ORGANIZER_PLAYER_ID} from '../db/ensureOrganizerPlayerAccessSchema.ts';
let db:DatabaseWrapper;afterEach(()=>{db?.sqlite.close();vi.unstubAllEnvs();});
it('runs a separate finalist vote in app and bot, preserving first ballots and rejecting old buttons',async()=>{
 db=createDatabaseConnection(':memory:');const app=await createApp(db);await ensureEveningVoteSchema(db);const stamp=new Date().toISOString();const closed=new Date(Date.now()-4*86_400_000).toISOString();
 await db.run("INSERT INTO game_evenings(id,title,status,starts_at,settled_at,created_at,updated_at) VALUES('ev','Тест','completed',?,?,?,?)",[closed,closed,closed,closed]);
 for(const p of ['a','b','c','d']){await db.run('INSERT INTO players(id,nickname,created_at,updated_at) VALUES(?,?,?,?)',[p,p,stamp,stamp]);await db.run("INSERT INTO evening_participants(id,evening_id,player_id,attendance_status,created_at,updated_at) VALUES(?,'ev',?,'attended',?,?)",['ep'+p,p,stamp,stamp]);}
 for(const[v,n]of [['a','b'],['c','d']])await db.run("INSERT INTO evening_player_votes VALUES('ev',?,'best_player',?,?,?)",[v,n,closed,closed]);
 await runEveningMvpRunoffs(db);expect(await loadMvpRunoff(db,'ev')).not.toBeNull();
 const context=await loadVotingContext(db,'ev','a');expect(context.error).toBeNull();if(context.error)throw new Error('context');
 expect(context.round).toBe(1);expect(context.nominees.map(n=>n.player_id).sort()).toEqual(['b','d']);
 for(let i=0;i<3;i++){await db.run("INSERT INTO game_evenings(id,title,status,starts_at,settled_at,created_at,updated_at) VALUES(?,?,'completed',?,?,?,?)",['new'+i,'Недавний',stamp,stamp,stamp,stamp]);await db.run("INSERT INTO evening_participants(id,evening_id,player_id,attendance_status,created_at,updated_at) VALUES(?,?,'a','attended',?,?)",['new-ep'+i,'new'+i,stamp,stamp]);}
 expect((await loadPendingVoteForPlayer(db,'a'))?.evening_id).toBe('ev');
 const round=await loadMvpRunoff(db,'ev');expect(Date.parse(round!.deadline_at)-Date.parse(round!.started_at)).toBe(86_400_000);
 expect((await loadPendingVoteForPlayer(db,'a'))?.voted).toBe(false);
 expect(await castEveningVote(db,'ev','a','b')).toEqual({ok:false,code:'round_changed'});
 expect(await castEveningVote(db,'ev','a','c',{round:1})).toEqual({ok:false,code:'bad_nominee'});
 expect(await castEveningVote(db,'ev','b','b',{round:1})).toEqual({ok:false,code:'bad_nominee'});
 const cookie=`player_token=${generatePlayerSessionToken('a')}`;
 const view=(await request(app).get('/api/player/stories/ev/voting').set('Cookie',cookie)).body;expect(view.round).toBe(1);expect(view.my_votes).toEqual({});
 expect((await request(app).post('/api/player/stories/ev/vote').set('Cookie',cookie).send({category:'best_player',nominee_player_id:'d',round:1})).status).toBe(200);
 vi.stubEnv('BOT_API_SECRET','runoff-test-secret');
 await db.run("UPDATE players SET telegram_user_id='777101501' WHERE id='c'");
 const bot=await request(app).post('/api/bot/evenings/ev/vote').set('X-Bot-Token','runoff-test-secret').send({telegram_user_id:'777101501',nominee:'d',round:1});expect(bot.status).toBe(200);expect(bot.body.success).toBe(true);
 expect((await db.all("SELECT * FROM evening_player_votes WHERE category='best_player'"))).toHaveLength(2);
 expect((await resolveEveningMvp(db,'ev')).status).toBe('runoff');
 expect(await decideEveningMvp(db,'ev',PRIMARY_ORGANIZER_PLAYER_ID,'b')).toEqual({ok:false,code:'not_tie'});
 await db.run("UPDATE evening_mvp_runoffs SET deadline_at=? WHERE evening_id='ev'",[new Date(Date.now()-1000).toISOString()]);
 const result=await resolveEveningMvp(db,'ev');expect(result.status==='winner'&&result.source==='runoff'&&result.winner.player_id).toBe('d');
 expect((await loadPendingVoteForPlayer(db,'a'))).toBeNull();
 // An existing round remains actionable even if the primary evening is outside the old scan window.
 await db.run("DELETE FROM evening_player_votes WHERE category='best_player_runoff'");
 await db.run("UPDATE game_evenings SET settled_at=?,updated_at=?,starts_at=? WHERE id='ev'",Array(3).fill(new Date(Date.now()-20*86_400_000).toISOString()));
 await db.run("INSERT OR IGNORE INTO players(id,nickname,created_at,updated_at) VALUES(?,'Ведущий',?,?)",[PRIMARY_ORGANIZER_PLAYER_ID,stamp,stamp]);
 await runEveningMvpRunoffs(db);
 expect((await db.all("SELECT notification_key FROM personal_notification_deliveries WHERE event_type='evening_mvp_decision'"))).toHaveLength(1);
});
