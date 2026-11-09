import type {DatabaseWrapper} from '../../db/index.ts';
import {eveningVotingSchedule} from '../../shared/eveningVotingSchedule.ts';
export const MVP_RUNOFF_CATEGORY='best_player_runoff';
export type MvpRunoff={nominees:string[];started_at:string;deadline_at:string};
export async function ensureRunoffSchema(db:DatabaseWrapper){await db.run(`CREATE TABLE IF NOT EXISTS evening_mvp_runoffs(evening_id TEXT PRIMARY KEY REFERENCES game_evenings(id) ON DELETE CASCADE,nominees_json TEXT NOT NULL,started_at TEXT NOT NULL,deadline_at TEXT NOT NULL)`);}
export async function loadMvpRunoff(db:DatabaseWrapper,id:string):Promise<MvpRunoff|null>{
 await ensureRunoffSchema(db);const r=await db.get<any>('SELECT * FROM evening_mvp_runoffs WHERE evening_id=?',[id]);
 if(!r)return null;let nominees:string[]=[];try{nominees=JSON.parse(r.nominees_json);}catch{return null;}
 return {nominees:nominees.map(String),started_at:r.started_at,deadline_at:r.deadline_at};
}
/** The additional vote ends at the evening's fixed time (owner, 2026-11-09), `deadlineMs`; without it one day from `now`. */
export async function startMvpRunoff(db:DatabaseWrapper,id:string,nominees:string[],now=Date.now(),deadlineMs?:number){
 await ensureRunoffSchema(db);const ids=[...new Set(nominees)].sort();if(ids.length<2)return null;
 await db.run('INSERT OR IGNORE INTO evening_mvp_runoffs(evening_id,nominees_json,started_at,deadline_at) VALUES(?,?,?,?)',[id,JSON.stringify(ids),new Date(now).toISOString(),new Date(deadlineMs&&deadlineMs>now?deadlineMs:now+24*60*60*1000).toISOString()]);
 return loadMvpRunoff(db,id);
}
/** Already awarded/published historical MVPs retain their result; a new rule does not reopen them. */
export async function hasFinalizedMvp(db:DatabaseWrapper,id:string){
 const exists=async(name:string)=>!!await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?",[name]);
 if(await exists('club_result_posts'))if(await db.get("SELECT 1 FROM club_result_posts WHERE post_key IN (?,?) AND status='sent' LIMIT 1",['mvp-result:'+id,'mvp-result-vk:'+id]))return true;
 if(await exists('player_verified_awards'))if(await db.get("SELECT 1 FROM player_verified_awards WHERE source_type='automatic' AND source_key LIKE ? LIMIT 1",['club-evening-mvp:'+id+':%']))return true;
 return false;
}
/** Lifecycle transitions also run from app/bot reads, independently of public-post settings. */
export async function ensureMvpRunoffIfNeeded(db:DatabaseWrapper,id:string,now=Date.now()){
 const existing=await loadMvpRunoff(db,id);if(existing)return existing;
 const e=await db.get<any>('SELECT status,settled_at,updated_at,starts_at FROM game_evenings WHERE id=?',[id]);
 if(!e||e.status!=='completed')return null;
 const schedule=eveningVotingSchedule(e);
 if(!schedule)return null;const deadline=schedule.deadlineMs;
 if(now<deadline||now>=schedule.runoffDeadlineMs||now-deadline>14*86_400_000||await hasFinalizedMvp(db,id))return null;
 const decided=await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='evening_mvp_decisions'");
 if(decided&&await db.get('SELECT 1 FROM evening_mvp_decisions WHERE evening_id=?',[id]))return null;
 const votes=await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='evening_player_votes'");if(!votes)return null;
 const rows=await db.all<any>("SELECT nominee_player_id,COUNT(*) AS votes FROM evening_player_votes WHERE evening_id=? AND category='best_player' GROUP BY nominee_player_id",[id]);
 const best=Math.max(0,...rows.map(r=>Number(r.votes)));const top=rows.filter(r=>Number(r.votes)===best);
 return top.length>1&&best>0?startMvpRunoff(db,id,top.map(r=>String(r.nominee_player_id)),now,schedule.runoffDeadlineMs):null;
}
