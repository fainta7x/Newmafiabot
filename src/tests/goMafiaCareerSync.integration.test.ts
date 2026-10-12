import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureGoMafiaSchema } from '../db/ensureGoMafiaSchema.ts';
import { refreshVerifiedGoMafiaProfiles } from '../server/services/goMafiaFederationSync.ts';
import { parseGoMafiaStructuredStats, parseGoMafiaHistory } from '../server/services/goMafiaCareerSource.ts';
import { parseGoMafiaPlayerReference } from '../lib/gomafiaExternalProfile.ts';
import history1 from './fixtures/gomafia/chagin-history-1.json';
import history2 from './fixtures/gomafia/chagin-history-2.json';
import stats from './fixtures/gomafia/chagin-all-stats.json';
const ref = parseGoMafiaPlayerReference('1202')!;
let db: DatabaseWrapper;
afterEach(()=>{db?.sqlite.close();});
const first = '2026-10-12T13:00:00.000Z';
async function setup() {
  db = createDatabaseConnection(':memory:');
  await db.exec('CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY, elo REAL);');
  await db.run('INSERT INTO players(id,nickname,elo,created_at,updated_at) VALUES (?,?,?,?,?)',['club-player','Club',1234,first,first]);
  await db.run('INSERT INTO players(id,nickname,elo,created_at,updated_at) VALUES (?,?,?,?,?)',['pending-player','Pending',1300,first,first]);
  await ensureGoMafiaSchema(db);
  for (const [pid,ext,status] of [['club-player','1202','verified'],['pending-player','42','pending']]) {
    await db.run(`INSERT INTO gomafia_player_links(player_id,external_player_id,profile_url,status,linked_by,linked_at,updated_at) VALUES (?,?,?,?,'organizer',?,?)`,[pid,ext,`https://gomafia.pro/stats/${ext}`,status,first,first]);
  }
}
function snapshot(now: string) {
  const snapshot = parseGoMafiaStructuredStats(stats,ref,'all',now);
  snapshot.career = { tournaments:[...parseGoMafiaHistory(history1,ref).tournaments,...parseGoMafiaHistory(history2,ref).tournaments], yearlyStats:[], historyTotal:13, registrationsStatus:'unavailable',limitations:[] };
  return snapshot;
}
describe('one federation writer on a real isolated SQLite database',()=>{
  it('imports only verified links, updates without duplicates, respects TTL, and leaves club Elo unchanged',async()=>{
    await setup();
    const fetchSnapshot = vi.fn(async()=>snapshot(first));
    expect(await refreshVerifiedGoMafiaProfiles(db,{now:new Date(first),fetchSnapshot})).toEqual({attempted:1,updated:1,failed:0});
    expect(await refreshVerifiedGoMafiaProfiles(db,{now:new Date('2026-10-12T14:00:00Z'),fetchSnapshot})).toEqual({attempted:0,updated:0,failed:0});
    const updated = snapshot('2026-10-12T20:00:00Z');updated.career!.tournaments[0].totalScore=7.8;
    await refreshVerifiedGoMafiaProfiles(db,{now:new Date('2026-10-12T20:00:00Z'),fetchSnapshot:async()=>updated});
    const rows = await db.all('SELECT * FROM gomafia_player_snapshots'); expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].snapshot_json).career.tournaments).toHaveLength(13);
    expect(JSON.parse(rows[0].snapshot_json).career.tournaments[0].totalScore).toBe(7.8);
    expect((await db.get('SELECT elo FROM players WHERE id=?',['club-player']))?.elo).toBe(1234);
  });
  it('backs off failed refreshes, preserves saved data, and prevents concurrent workers from requesting the same profile',async()=>{
    await setup();
    await refreshVerifiedGoMafiaProfiles(db,{now:new Date(first),fetchSnapshot:async()=>snapshot(first)});
    const fetchSnapshot = vi.fn(async()=>{throw Error('unavailable');});
    await refreshVerifiedGoMafiaProfiles(db,{now:new Date('2026-10-12T20:00:00Z'),fetchSnapshot});
    await refreshVerifiedGoMafiaProfiles(db,{now:new Date('2026-10-12T21:00:00Z'),fetchSnapshot});
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(JSON.parse((await db.get('SELECT snapshot_json FROM gomafia_player_snapshots'))!.snapshot_json).totalGames).toBe(164);
    let release!:()=>void;
    const held = new Promise<void>(resolve=>{release=resolve;});
    const slow = vi.fn(async()=>{await held;return snapshot('2026-10-13T03:00:00Z');});
    const a=refreshVerifiedGoMafiaProfiles(db,{now:new Date('2026-10-13T03:00:00Z'),fetchSnapshot:slow});
    const b=refreshVerifiedGoMafiaProfiles(db,{now:new Date('2026-10-13T03:00:00Z'),fetchSnapshot:slow});
    await vi.waitFor(()=>expect(slow).toHaveBeenCalledTimes(1));release();await Promise.all([a,b]);
    expect(slow).toHaveBeenCalledTimes(1);
  });
  it('preserves previously sourced scores and annual statistics during enrichment failure',async()=>{
    await setup();const initial=snapshot(first);initial.career!.tournaments[0].totalScore=7.8;
    initial.career!.yearlyStats=[parseGoMafiaStructuredStats(stats,ref,2026,first)];
    await refreshVerifiedGoMafiaProfiles(db,{now:new Date(first),fetchSnapshot:async()=>initial});
    await refreshVerifiedGoMafiaProfiles(db,{now:new Date('2026-10-12T20:00:00Z'),fetchSnapshot:async()=>{const failed=snapshot('2026-10-12T20:00:00Z');failed.career!.tournaments[0].scoreStatus='refresh_failed';return failed;}});
    const saved=JSON.parse((await db.get('SELECT snapshot_json FROM gomafia_player_snapshots'))!.snapshot_json);
    expect(saved.career.tournaments[0].totalScore).toBe(7.8);expect(saved.career.yearlyStats[0].retrievedAt).toBe(first);
  });
});
