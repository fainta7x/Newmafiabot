import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import {
  openVirtualRoleDeal, revealVirtualRole, confirmVirtualRole, undoVirtualRole, resetVirtualRoleDeal, buyVirtualRole, type DealRef,
} from '../server/services/virtualRoleDealService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const ref = (id = 'tg-1'): DealRef => ({ storage: 'tournament', id });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO tournaments (id,title,date,status,created_at,updated_at) VALUES ('t-1','Кубок',?,'active',?,?)`, [now, now, now]);
  await db.run(`INSERT INTO tournaments (id,title,date,status,created_at,updated_at) VALUES ('t-2','Другой',?,'active',?,?)`, [now, now, now]);
  await db.run(`INSERT INTO tournament_games (id,tournament_id,game_number,status) VALUES ('tg-1','t-1',1,'planned')`);
  await db.run(`INSERT INTO tournament_games (id,tournament_id,game_number,status) VALUES ('tg-done','t-1',2,'completed')`);
  for (let i = 1; i <= 10; i += 1) {
    await db.run('INSERT INTO players(id,nickname,created_at,updated_at) VALUES(?,?,?,?)', [`p${i}`, `Игрок ${i}`, now, now]);
    await db.run(`INSERT INTO tournament_participants (id,tournament_id,player_id,display_name,participant_number) VALUES (?, 't-1', ?, ?, ?)`, [`tp${i}`, `p${i}`, `Игрок ${i}`, i]);
    await db.run(`INSERT INTO tournament_game_seats (id,game_id,participant_id,seat_number) VALUES (?, 'tg-1', ?, ?)`, [`s${i}`, `tp${i}`, i]);
    await db.run(`INSERT INTO tournament_game_seats (id,game_id,participant_id,seat_number) VALUES (?, 'tg-done', ?, ?)`, [`d${i}`, `tp${i}`, i]);
  }
  return { db, app };
}

describe('one role deal for a tournament game (owner, 2026-11-09)', () => {
  it('deals ten cards with the table composition and keeps the deal under the game key', async () => {
    const { db } = await setup();
    let view = await openVirtualRoleDeal(db, ref());
    expect(view.cards).toHaveLength(10);
    const roles: string[] = [];
    for (let seat = 1; seat <= 10; seat += 1) {
      const card = view.cards[0];
      const revealed = await revealVirtualRole(db, ref(), seat, card.id, view.version);
      roles.push(revealed.role);
      view = await confirmVirtualRole(db, ref(), seat, card.id, revealed.version);
    }
    expect(roles.filter((r) => r === 'sheriff')).toHaveLength(1);
    expect(roles.filter((r) => r === 'don')).toHaveLength(1);
    expect(roles.filter((r) => r === 'mafia')).toHaveLength(2);
    expect(roles.filter((r) => r === 'citizen')).toHaveLength(6);
    expect(view.history).toHaveLength(10);
    // The cards stay hidden to the client; the state lives in the key-based table, not in the club table.
    expect(JSON.stringify(view.cards)).not.toMatch(/role/);
    expect(await db.get("SELECT 1 AS x FROM game_role_deals WHERE game_key='tournament:tg-1'")).toBeTruthy();
    expect(await db.get('SELECT 1 AS x FROM game_virtual_role_deals')).toBeFalsy();
  });

  it('undo and reset work like in a club game; a purchase of a role does not exist for a tournament', async () => {
    const { db } = await setup();
    let view = await openVirtualRoleDeal(db, ref());
    const card = view.cards[0];
    const revealed = await revealVirtualRole(db, ref(), 3, card.id, view.version);
    view = await confirmVirtualRole(db, ref(), 3, card.id, revealed.version);
    expect(view.history).toHaveLength(1);
    view = await undoVirtualRole(db, ref(), view.version);
    expect(view.history).toHaveLength(0);
    expect(view.cards).toHaveLength(10);
    await expect(buyVirtualRole(db, ref(), 1, 'don', view.version)).rejects.toThrow(/недоступна/);
    view = await resetVirtualRoleDeal(db, ref(), view.version);
    expect(view.cards).toHaveLength(10);
  });

  it('an interrupted deal is resumed, a finished one is dealt again', async () => {
    const { db } = await setup();
    let view = await openVirtualRoleDeal(db, ref());
    const card = view.cards[0];
    const revealed = await revealVirtualRole(db, ref(), 5, card.id, view.version);
    view = await confirmVirtualRole(db, ref(), 5, card.id, revealed.version);
    const again = await openVirtualRoleDeal(db, ref());
    expect(again.history).toEqual([expect.objectContaining({ seat: 5 })]);
    expect(again.version).toBe(view.version);
  });

  it('refuses a finished game and an unknown game', async () => {
    const { db } = await setup();
    await expect(openVirtualRoleDeal(db, ref('tg-done'))).rejects.toThrow(/недоступна/);
    await expect(openVirtualRoleDeal(db, ref('nope'))).rejects.toThrow(/не найдена/);
  });

  it('the route checks that the game belongs to the tournament', async () => {
    const { app } = await setup();
    const auth = { Authorization: `Bearer ${generateOrganizerToken()}` };
    const ok = await request(app).post('/api/tournaments/t-1/games/tg-1/virtual-deal/open').set(auth);
    expect(ok.status).toBe(200);
    expect(ok.body.cards).toHaveLength(10);
    const wrong = await request(app).post('/api/tournaments/t-2/games/tg-1/virtual-deal/open').set(auth);
    expect(wrong.status).toBe(404);
  });
});
