import { afterEach,describe,expect,it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { createApp } from '../app.ts';
import {
  migrateLegacyChaginRedGuarantee,listVipProbabilityRules,saveVipProbabilityRule,ensureVipProbabilityRulesSchema,
} from '../server/services/vipProbabilityRulesService.ts';

const playerId='fad23405-9715-566f-acd9-5632c30eb198';
const active:DatabaseWrapper[]=[];
afterEach(()=>{while(active.length)active.pop()?.sqlite.close();});
async function setup(){
  const db=createDatabaseConnection(':memory:');active.push(db);
  await createApp(db);
  const now=new Date().toISOString();
  await db.run('INSERT INTO players(id,nickname,created_at,updated_at) VALUES(?,?,?,?)',
    [playerId,'Чагин',now,now]);
  return db;
}
describe('legacy red-card owner preference migration',()=>{
  it('imports the previous guarantee into the organizer settings only once',async()=>{
    const db=await setup();
    const first=await listVipProbabilityRules(db);
    expect(first).toContainEqual(expect.objectContaining({
      playerId,kind:'red_color',percent:100,enabled:true,role:null,
    }));
    const quota=await db.get<any>(
      'SELECT whole_evening,max_successful_games FROM vip_player_game_quotas WHERE player_id=?',[playerId]);
    expect(quota).toMatchObject({whole_evening:1,max_successful_games:null});
    const rule=first.find(item=>item.kind==='red_color')!;
    await saveVipProbabilityRule(db,{...rule,percent:25,enabled:false},rule.id);
    await migrateLegacyChaginRedGuarantee(db);
    const second=await listVipProbabilityRules(db);
    expect(second.filter(item=>item.kind==='red_color')).toHaveLength(1);
    expect(second.find(item=>item.id===rule.id)).toMatchObject({percent:25,enabled:false});
  });
  it("keeps the owner deletion instead of silently restoring 100%",async()=>{
    const db=await setup();
    const rules=await listVipProbabilityRules(db);
    const rule=rules.find(item=>item.kind==='red_color')!;
    await db.run('DELETE FROM vip_probability_rules WHERE id=?',[rule.id]);
    await migrateLegacyChaginRedGuarantee(db);
    expect((await listVipProbabilityRules(db)).some(item=>item.kind==='red_color')).toBe(false);
  });
  it.each([true,false])('upgrades the old CHECK and preserves every existing value (scope column: %s)',async(hasScope)=>{
    const db=await setup();
    await db.exec(`CREATE TABLE vip_probability_rules (
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('role','same_color','different_color')),
      role TEXT,other_player_id TEXT,percent INTEGER NOT NULL,enabled INTEGER NOT NULL,
      personal_limit INTEGER,${hasScope ? "limit_scope TEXT NOT NULL DEFAULT 'evening'," : ''}
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    )`);
    await db.run(`INSERT INTO vip_probability_rules
      (id,player_id,kind,role,percent,enabled,personal_limit,created_at,updated_at)
      VALUES ('old',?,'role','don',37,0,4,'before','before')`,[playerId]);
    await migrateLegacyChaginRedGuarantee(db);
    expect(await db.get("SELECT * FROM vip_probability_rules WHERE id='old'")).toMatchObject({
      kind:'role',role:'don',percent:37,enabled:0,personal_limit:4,limit_scope:'evening',created_at:'before',
    });
    expect((await listVipProbabilityRules(db)).find(rule=>rule.kind==='red_color')?.percent).toBe(100);
    expect((await db.get<{integrity_check:string}>('PRAGMA integrity_check'))?.integrity_check).toBe('ok');
  });
  it('rolls back a failed old-table copy instead of dropping any source records',async()=>{
    const db=await setup();
    await db.exec(`CREATE TABLE vip_probability_rules (
      id TEXT PRIMARY KEY,player_id TEXT,kind TEXT CHECK(kind IN ('role','same_color','different_color')),
      role TEXT,other_player_id TEXT,percent INTEGER,enabled INTEGER,personal_limit INTEGER,
      created_at TEXT,updated_at TEXT
    ); INSERT INTO vip_probability_rules VALUES ('invalid','p','role','don',NULL,100,2,NULL,'before','before')`);
    await expect(ensureVipProbabilityRulesSchema(db)).rejects.toThrow();
    expect(await db.get("SELECT enabled,created_at FROM vip_probability_rules WHERE id='invalid'"))
      .toEqual({enabled:2,created_at:'before'});
    expect(await db.get("SELECT name FROM sqlite_master WHERE name='vip_probability_rules_next'")).toBeNull();
  });

});
