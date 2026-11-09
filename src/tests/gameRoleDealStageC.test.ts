import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureGameRoleDealSchema } from '../db/ensureGameRoleDealSchema.ts';
import { openVirtualRoleDeal, revealVirtualRole, confirmVirtualRole } from '../server/services/virtualRoleDealService.ts';
import { loadRolePurchases } from '../server/services/eveningPaymentPricingService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const gameId = 717;

async function clubGame() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('ev','Вечер','2099-10-16T18:00:00Z','Europe/Moscow','CASUAL','published',20,100,?,?)`, [now, now]);
  const results = Array.from({ length: 10 }, (_, i) => ({ seat_number: i + 1, player_id: `p${i}`, participant_id: `pp${i}` }));
  const protocol = { version: 1, kind: 'club_evening_protocol', protocol: { status: 'draft' }, player_results: results };
  await db.run(`INSERT INTO games (id,evening_id,global_game_number,game_date,winner_team,winner_label,slots_json,protocol_text,created_at)
    VALUES (?,'ev',1,?,'draft','Черновик','[]',?,?)`, [gameId, now, JSON.stringify(protocol), now]);
  return db;
}

describe('stage C: the club deal under the game key (owner, 2026-11-09)', () => {
  it('copies the existing club deals at startup and takes only a newer row', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await db.exec(`CREATE TABLE game_virtual_role_deals (game_id INTEGER PRIMARY KEY, state_json TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE game_role_deals (game_key TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_at TEXT NOT NULL);`);
    await db.run("INSERT INTO game_virtual_role_deals VALUES (1,'{\"v\":\"old-club\"}','2026-11-01T10:00:00Z')");
    await db.run("INSERT INTO game_virtual_role_deals VALUES (2,'{\"v\":\"legacy-newer\"}','2026-11-03T10:00:00Z')");
    await db.run("INSERT INTO game_virtual_role_deals VALUES (3,'{\"v\":\"legacy-older\"}','2026-11-01T10:00:00Z')");
    await db.run("INSERT INTO game_role_deals VALUES ('club:2','{\"v\":\"key-older\"}','2026-11-02T10:00:00Z')");
    await db.run("INSERT INTO game_role_deals VALUES ('club:3','{\"v\":\"key-newer\"}','2026-11-02T10:00:00Z')");
    await db.run("INSERT INTO game_role_deals VALUES ('tournament:t1','{\"v\":\"tournament\"}','2026-11-02T10:00:00Z')");
    await ensureGameRoleDealSchema(db);
    const state = async (key: string) => (await db.get<{ state_json: string }>('SELECT state_json FROM game_role_deals WHERE game_key = ?', [key]))?.state_json;
    expect(await state('club:1')).toContain('old-club');
    expect(await state('club:2')).toContain('legacy-newer');
    expect(await state('club:3')).toContain('key-newer');
    expect(await state('tournament:t1')).toContain('tournament');
    // the legacy table is only read, never changed
    expect(await db.get("SELECT state_json FROM game_virtual_role_deals WHERE game_id = 3")).toMatchObject({ state_json: expect.stringContaining('legacy-older') });
  });

  it('every change of a club deal is written under the key and mirrored to the old table', async () => {
    const db = await clubGame();
    let view = await openVirtualRoleDeal(db, gameId);
    const card = view.cards[0];
    const revealed = await revealVirtualRole(db, gameId, 1, card.id, view.version);
    view = await confirmVirtualRole(db, gameId, 1, card.id, revealed.version);
    const key = await db.get<{ state_json: string }>("SELECT state_json FROM game_role_deals WHERE game_key = ?", [`club:${gameId}`]);
    const legacy = await db.get<{ state_json: string }>('SELECT state_json FROM game_virtual_role_deals WHERE game_id = ?', [gameId]);
    expect(key?.state_json).toBeTruthy();
    expect(legacy?.state_json).toBe(key?.state_json);
    expect(JSON.parse(String(key?.state_json)).history).toHaveLength(1);
  });

  it('the readers look at the key table: a purchase in the deal is charged, a deleted game takes its deal along', async () => {
    const db = await clubGame();
    const state = { version: 1, deck: [], history: [{ seat: 2, cardId: 'c', role: 'don', previousDeck: [], purchase: { playerId: 'p1', amountRub: 150 } }], pending: null };
    // written ONLY under the key: a reader still on the old table would not see it
    await db.run('INSERT INTO game_role_deals (game_key,state_json,updated_at) VALUES (?,?,?)', [`club:${gameId}`, JSON.stringify(state), new Date().toISOString()]);
    expect((await loadRolePurchases(db, 'ev')).get('p1')).toBe(150);
    await db.run('DELETE FROM games WHERE id = ?', [gameId]);
    expect(await db.get('SELECT 1 AS x FROM game_role_deals WHERE game_key = ?', [`club:${gameId}`])).toBeFalsy();
  });
});
