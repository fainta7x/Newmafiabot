import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { STOPPED_REASON } from '../lib/playerAccess.ts';
import { autoActivityOf, ensurePlayerActivityAutoSchema, runAutoPlayerActivity } from '../server/services/playerActivityAutoService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const NOW = new Date('2026-11-10T09:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  await ensurePlayerActivityAutoSchema(db);
  const player = (id: string, extra = '') => db.run(`INSERT INTO players (id,nickname,tokens,created_at,updated_at,activity_auto${extra ? ',' + extra.split('=')[0] : ''}) VALUES (?,?,0,'x','x',1${extra ? ',' + extra.split('=')[1] : ''})`, [id, `N-${id}`]);
  const evening = async (id: string, daysBack: number, ...players: string[]) => {
    await db.run("INSERT INTO game_evenings (id,title,starts_at,status,format,created_at,updated_at) VALUES (?,?,?,'completed','CASUAL','x','x')", [id, id, daysAgo(daysBack)]);
    for (const p of players) await db.run("INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,created_at,updated_at) VALUES (?,?,?,'going','going','attended','x','x')", [`${id}-${p}`, id, p]);
  };
  return { db, player, evening };
}

describe('«как ходит» from the real visits', () => {
  it('thresholds: 3+ in 30 days regular; a visit in 21 days sometimes; none for 60+ days stopped; in between and never came unchanged', () => {
    expect(autoActivityOf({ recent: 3, short: 3, within: 3, total: 5 })).toBe('regular');
    expect(autoActivityOf({ recent: 2, short: 2, within: 2, total: 5 })).toBe('sometimes');
    expect(autoActivityOf({ recent: 1, short: 1, within: 1, total: 5 })).toBe('sometimes');
    expect(autoActivityOf({ recent: 1, short: 0, within: 1, total: 5 })).toBeNull();
    expect(autoActivityOf({ recent: 0, short: 0, within: 1, total: 5 })).toBeNull();
    expect(autoActivityOf({ recent: 0, short: 0, within: 0, total: 5 })).toBe('stopped');
    expect(autoActivityOf({ recent: 0, short: 0, within: 0, total: 0 })).toBeNull();
  });

  it('updates automatic players, pauses mailing on «перестал», keeps manual ones and other-city, and runs once a day', async () => {
    const { db, player, evening } = await setup();
    await player('reg'); await player('old'); await player('manual'); await player('city', 'from_other_city=1'); await player('never');
    await db.run("UPDATE players SET activity_auto = 0 WHERE id = 'manual'");
    await evening('e1', 3, 'reg', 'manual', 'city'); await evening('e2', 10, 'reg', 'manual', 'city'); await evening('e2b', 17, 'reg', 'manual', 'city'); await evening('e3', 120, 'old');
    const changes = await runAutoPlayerActivity(db, NOW);
    expect(changes.map((change) => `${change.id}:${change.to}`).sort()).toEqual(['old:stopped']);
    expect(await db.get("SELECT stopped_attending, contact_status, attends_sometimes FROM players WHERE id='old'")).toMatchObject({ stopped_attending: 1, contact_status: 'paused' });
    expect(await db.get("SELECT stopped_attending, attends_sometimes FROM players WHERE id='reg'")).toMatchObject({ stopped_attending: 0, attends_sometimes: 0 });
    expect(await db.get("SELECT stopped_attending FROM players WHERE id IN ('manual','city','never') AND stopped_attending=1")).toBeFalsy();
    expect(await runAutoPlayerActivity(db, NOW)).toEqual([]);
  });

  it('coming back lifts only the «перестал» pause', async () => {
    const { db, player, evening } = await setup();
    await player('back');
    await db.run(`UPDATE players SET stopped_attending = 1, contact_status = 'paused', lifecycle_status = 'paused', pause_reason = '${STOPPED_REASON}' WHERE id = 'back'`);
    await evening('e1', 2, 'back'); await evening('e2', 9, 'back'); await evening('e2b', 16, 'back');
    const changes = await runAutoPlayerActivity(db, NOW);
    expect(changes[0]?.to).toBe('regular');
    expect(await db.get("SELECT stopped_attending, contact_status FROM players WHERE id='back'")).toMatchObject({ stopped_attending: 0, contact_status: 'normal' });
  });
});
