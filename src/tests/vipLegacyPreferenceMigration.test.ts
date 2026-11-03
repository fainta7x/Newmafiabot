import { afterEach,describe,expect,it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { createApp } from '../app.ts';
import {
  migrateLegacyChaginRedGuarantee,listVipProbabilityRules,saveVipProbabilityRule,
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
  it('keeps the owner's deletion instead of silently restoring 100%',async()=>{
    const db=await setup();
    const rules=await listVipProbabilityRules(db);
    const rule=rules.find(item=>item.kind==='red_color')!;
    await db.run('DELETE FROM vip_probability_rules WHERE id=?',[rule.id]);
    await migrateLegacyChaginRedGuarantee(db);
    expect((await listVipProbabilityRules(db)).some(item=>item.kind==='red_color')).toBe(false);
  });
  it('preserves existing records when the old SQLite CHECK is upgraded',async()=>{
    const db=await setup();
    const rules=await listVipProbabilityRules(db);
    const rule=rules.find(item=>item.kind==='red_color');
    expect(rule?.percent).toBe(100);
    const schema=await db.get<{sql:string}>("SELECT sql FROM sqlite_master WHERE name='vip_probability_rules'");
    expect(schema?.sql).toContain("'red_color'");
  });
});
