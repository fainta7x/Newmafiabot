import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import {
  openVirtualRoleDeal, buyVirtualRole, revealVirtualRole, confirmVirtualRole, undoVirtualRole, resetVirtualRoleDeal,
} from '../server/services/virtualRoleDealService.ts';
import { listVipProbabilityRules, saveVipProbabilityRule, deleteVipProbabilityRule } from '../server/services/vipProbabilityRulesService.ts';
import { saveVipGameQuota } from '../server/services/vipGameQuotaService.ts';
import { tableRoleCounts } from '../lib/tableComposition.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

const isRed = (role: string) => role === 'citizen' || role === 'sheriff';
const ownerPlayerId = 'fad23405-9715-566f-acd9-5632c30eb198';
const gameId = 717;

async function setup(format: 'CASUAL' | 'NOVICE' | 'RATING' | 'STANDARD') {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  await db.run('INSERT INTO players(id,nickname,created_at,updated_at) VALUES(?,?,?,?)',[ownerPlayerId,'Чагин',now,now]);
  await db.run(`INSERT INTO game_evenings
    (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('role-ev','Вечер','2099-10-16T18:00:00Z','Europe/Moscow',?,'published',20,100,?,?)`,
    [format, now, now]);
  const results = Array.from({ length: 10 }, (_, i) => ({
    seat_number: i + 1,
    player_id: i === 9 ? ownerPlayerId : `other-${i}`,
    participant_id: `participant-${i}`,
  }));
  const protocol = { version: 1, kind: 'club_evening_protocol', protocol: { status: 'draft' }, player_results: results };
  await db.run(`INSERT INTO games
    (id,evening_id,global_game_number,game_date,winner_team,winner_label,slots_json,protocol_text,created_at)
    VALUES (?,'role-ev',1,?,'draft','Черновик','[]',?,?)`,
    [gameId, now, JSON.stringify(protocol), now]);
  return { db, app };
}

async function storedDeck(db: DatabaseWrapper) {
  const row = await db.get<{ state_json: string }>('SELECT state_json FROM game_role_deals WHERE game_key = ?', [`club:${gameId}`]);
  return JSON.parse(String(row?.state_json || '{}')).deck as Array<{ id: string; role: string }>;
}

describe('server virtual role deal', () => {
  it('«Покупка роли» takes that role out of the deck for the seat and undo puts it back', async () => {
    const { db } = await setup('CASUAL');
    let view = await openVirtualRoleDeal(db, gameId);
    const bought = await buyVirtualRole(db, gameId, 1, 'don', view.version);
    expect(bought.priceRub).toBe(150);
    expect(bought.cards).toHaveLength(9);
    expect(bought.history).toEqual([expect.objectContaining({ seat: 1, role: 'don' })]);
    expect((await storedDeck(db)).filter((card) => card.role === 'don')).toHaveLength(0);
    await expect(buyVirtualRole(db, gameId, 2, 'don', bought.version)).rejects.toThrow(/нет в колоде/);
    view = await undoVirtualRole(db, gameId, bought.version);
    expect((await storedDeck(db)).filter((card) => card.role === 'don')).toHaveLength(1);
    expect(view.history).toHaveLength(0);
  });

  it('adds the 150 ₽ of a bought role to the player debt for the evening and takes it back on undo', async () => {
    const { db } = await setup('CASUAL');
    const now = new Date().toISOString();
    await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', ['other-0', 'Покупатель', now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,attendance_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES ('participant-0','role-ev','other-0','attended','unpaid',0,0,?,?)`, [now, now]);
    const due = async () => Number((await db.get<any>("SELECT amount_due FROM evening_participants WHERE id = 'participant-0'"))!.amount_due);
    const view = await openVirtualRoleDeal(db, gameId);
    const bought = await buyVirtualRole(db, gameId, 1, 'don', view.version);
    expect(await due()).toBe(150);
    await undoVirtualRole(db, gameId, bought.version);
    expect(await due()).toBe(0);  });

  it('adds a bought role to the debt on a novice evening on top of the price already written, and takes it back on undo', async () => {
    const { db } = await setup('NOVICE');
    const now = new Date().toISOString();
    await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', ['other-0', 'Новичок', now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,attendance_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES ('participant-0','role-ev','other-0','attended','unpaid',300,0,?,?)`, [now, now]);
    const due = async () => Number((await db.get<any>("SELECT amount_due FROM evening_participants WHERE id = 'participant-0'"))!.amount_due);
    const view = await openVirtualRoleDeal(db, gameId);
    const bought = await buyVirtualRole(db, gameId, 1, 'don', view.version);
    expect(await due()).toBe(450);
    await undoVirtualRole(db, gameId, bought.version);
    expect(await due()).toBe(300);
  });

  it.each(['RATING', 'TOURNAMENT'] as const)('does not sell a role on a %s evening (owner, 2026-11-02)', async (format) => {
    const { db } = await setup(format as any);
    const view = await openVirtualRoleDeal(db, gameId);
    await expect(buyVirtualRole(db, gameId, 1, 'don', view.version)).rejects.toThrow(/недоступна на рейтинговых и турнирных/);
  });

  it.each(['CASUAL', 'NOVICE', 'STANDARD'] as const)('keeps a red for the tenth seat in %s without exposing unopened roles', async (format) => {
    const { db } = await setup(format);
    let view = await openVirtualRoleDeal(db, gameId);
    expect(view.cards).toHaveLength(10);
    expect(view.cards.every((card) => typeof card.id === 'string' && !('role' in card))).toBe(true);
    expect(new Set(view.cards.map((card) => card.id)).size).toBe(10);

    const revealed: string[] = [];
    for (let seat = 1; seat <= 10; seat += 1) {
      const privateDeck = await storedDeck(db);
      // Worst-case path: everybody before seat 10 tries to pick a red card.
      const picked = (seat === 10 ? privateDeck[0] : privateDeck.find((card) => isRed(card.role)) || privateDeck[0])!;
      const first = await revealVirtualRole(db, gameId, seat, picked.id, view.version);
      const retry = await revealVirtualRole(db, gameId, seat, picked.id, view.version);
      expect(retry).toEqual(first);
      if (seat === 10) expect(first.role).toBe('citizen');
      revealed.push(first.role);
      view = await confirmVirtualRole(db, gameId, seat, picked.id, first.version);
      expect(view.cards).toHaveLength(10 - seat);
      expect(view.history).toHaveLength(seat);
    }
    const expected = tableRoleCounts(10);
    for (const [role, count] of Object.entries(expected)) {
      expect(revealed.filter((item) => item === role)).toHaveLength(count);
    }
    expect(new Set(view.history.map((entry) => entry.seat)).size).toBe(10);
  });

  it('delivers red when the designated player draws first from a black card', async () => {
    const { db } = await setup('CASUAL');
    const opening = await openVirtualRoleDeal(db, gameId);
    const deck = await storedDeck(db);
    const black = deck.find((card) => !isRed(card.role))!;
    const revealed = await revealVirtualRole(db, gameId, 10, black.id, opening.version);
    expect(isRed(revealed.role)).toBe(true);
    const after = await confirmVirtualRole(db, gameId, 10, black.id, revealed.version);
    expect(after.history[0]).toMatchObject({ seat: 10, role: revealed.role });
  });

  it('does not apply a protected draw in a rating game', async () => {
    const { db } = await setup('RATING');
    let view = await openVirtualRoleDeal(db, gameId);
    for (let seat = 1; seat <= 10; seat += 1) {
      const deck = await storedDeck(db);
      const picked = seat <= 7 ? deck.find((card) => isRed(card.role))! : deck[0];
      const response = await revealVirtualRole(db, gameId, seat, picked.id, view.version);
      if (seat === 10) expect(isRed(response.role)).toBe(false);
      view = await confirmVirtualRole(db, gameId, seat, picked.id, response.version);
    }
  });

  it('undo restores a confirmed card; stale operations cannot mutate the deck', async () => {
    const { db } = await setup('CASUAL');
    const openedDeck = await openVirtualRoleDeal(db, gameId);
    const cardId = openedDeck.cards[0].id;
    const first = await revealVirtualRole(db, gameId, 1, cardId, openedDeck.version);
    const confirmed = await confirmVirtualRole(db, gameId, 1, cardId, first.version);
    await expect(confirmVirtualRole(db, gameId, 1, cardId, first.version)).rejects.toThrow();
    const undone = await undoVirtualRole(db, gameId, confirmed.version);
    expect(undone.cards).toHaveLength(10);
    expect(undone.history).toHaveLength(0);
    await expect(undoVirtualRole(db, gameId, confirmed.version)).rejects.toThrow();
    const reset = await resetVirtualRoleDeal(db, gameId, undone.version);
    expect(reset.cards).toHaveLength(10);
    expect(reset.version).toBe(undone.version + 1);
  });

  it('requires organizer authorization and never includes unrevealed roles in the start response', async () => {
    const { app } = await setup('CASUAL');
    const forbidden = await request(app).post(`/api/games/${gameId}/virtual-deal/open`);
    expect([401, 403]).toContain(forbidden.status);
    const authorized = await request(app).post(`/api/games/${gameId}/virtual-deal/open`)
      .set('Cookie', `organizer_token=${generateOrganizerToken()}`);
    expect(authorized.status).toBe(200);
    expect(authorized.body.cards).toHaveLength(10);
    expect(authorized.body.cards.every((card: any) => Object.keys(card).join(',') === 'id')).toBe(true);
    expect(JSON.stringify(authorized.body)).not.toContain('fad23405-9715-566f-acd9-5632c30eb198');
  });
});

async function copyGame(db:DatabaseWrapper,id:number,eveningId='role-ev') {
  await db.run(`INSERT INTO games(id,evening_id,global_game_number,game_date,winner_team,winner_label,slots_json,protocol_text,created_at)
    SELECT ?,?, ?,game_date,winner_team,winner_label,slots_json,protocol_text,created_at FROM games WHERE id=?`,[id,eveningId,id,gameId]);
}
async function drawBlack(db:DatabaseWrapper,id:number,seat=10){
  const view=await openVirtualRoleDeal(db,id);
  const row=await db.get<{state_json:string}>('SELECT state_json FROM game_role_deals WHERE game_key=?',[`club:${id}`]);
  const card=JSON.parse(row!.state_json).deck.find((c:any)=>!isRed(c.role));
  const reveal=await revealVirtualRole(db,id,seat,card.id,view.version);
  return {card,reveal,view};
}
async function privateSuccesses(db:DatabaseWrapper,id=gameId){
  const row=await db.get<{state_json:string}>('SELECT state_json FROM game_role_deals WHERE game_key=?',[`club:${id}`]);
  return JSON.parse(row!.state_json).history.flatMap((entry:any)=>entry.vipPlayerIds||[]);
}
describe('private VIP rules in the actual server deal',()=>{
  it('owner can disable/delete the migrated guarantee; no ID-based override remains',async()=>{
    const {db}=await setup('CASUAL');
    const rule=(await listVipProbabilityRules(db)).find(r=>r.kind==='red_color')!;
    await saveVipProbabilityRule(db,{...rule,percent:0},rule.id);
    expect(isRed((await drawBlack(db,gameId)).reveal.role)).toBe(false);
    await deleteVipProbabilityRule(db,rule.id);
    expect(isRed((await drawBlack(db,gameId)).reveal.role)).toBe(false);
  });
  it('a non-owner player uses the same configurable role algorithm',async()=>{
    const {db}=await setup('NOVICE');
    const now=new Date().toISOString();
    await db.run('INSERT INTO players(id,nickname,created_at,updated_at) VALUES(?,?,?,?)',['other-0','Игрок',now,now]);
    await saveVipProbabilityRule(db,{playerId:'other-0',kind:'role',role:'sheriff',percent:100,enabled:true});
    await saveVipGameQuota(db,'other-0',{wholeEvening:true,maxSuccessfulGames:null});
    const {card,reveal}=await drawBlack(db,gameId,1);
    expect(reveal.role).toBe('sheriff');
    const confirmed=await confirmVirtualRole(db,gameId,1,card.id,reveal.version);
    expect(await privateSuccesses(db)).toEqual(['other-0']);
    expect(JSON.stringify(confirmed)).not.toMatch(/vip|appliedRule|playerId|percent/i);
  });
  it('holds a pending success across simultaneous games, counts once, and undo releases it',async()=>{
    const {db}=await setup('CASUAL');
    await listVipProbabilityRules(db);
    await saveVipGameQuota(db,ownerPlayerId,{wholeEvening:false,maxSuccessfulGames:1});
    await copyGame(db,718);await copyGame(db,719);await copyGame(db,720);
    const first=await drawBlack(db,gameId);
    expect(isRed(first.reveal.role)).toBe(true);
    expect(await privateSuccesses(db)).toEqual([]); // still unconfirmed
    expect(isRed((await drawBlack(db,718)).reveal.role)).toBe(false); // held capacity
    const confirmed=await confirmVirtualRole(db,gameId,10,first.card.id,first.reveal.version);
    expect(await privateSuccesses(db)).toEqual([ownerPlayerId]);
    await expect(confirmVirtualRole(db,gameId,10,first.card.id,first.reveal.version)).rejects.toThrow();
    expect(isRed((await drawBlack(db,719)).reveal.role)).toBe(false);
    await undoVirtualRole(db,gameId,confirmed.version);
    expect(await privateSuccesses(db)).toEqual([]);
    expect(isRed((await drawBlack(db,720)).reveal.role)).toBe(true);
  });
  it('a natural red and a bought role never consume VIP quota; reset releases pending capacity',async()=>{
    const {db}=await setup('CASUAL');
    await listVipProbabilityRules(db);
    await saveVipGameQuota(db,ownerPlayerId,{wholeEvening:false,maxSuccessfulGames:1});
    let view=await openVirtualRoleDeal(db,gameId);
    const red=(await storedDeck(db)).find(c=>c.role==='citizen')!;
    const reveal=await revealVirtualRole(db,gameId,10,red.id,view.version);
    view=await confirmVirtualRole(db,gameId,10,red.id,reveal.version);
    expect(await privateSuccesses(db)).toEqual([]);
    view=await resetVirtualRoleDeal(db,gameId,view.version);
    view=await buyVirtualRole(db,gameId,10,'don',view.version);
    expect(view.history[0].role).toBe('don');
    expect(await privateSuccesses(db)).toEqual([]);
    view=await resetVirtualRoleDeal(db,gameId,view.version);
    const black=(await storedDeck(db)).find(c=>!isRed(c.role))!;
    const pending=await revealVirtualRole(db,gameId,10,black.id,view.version);
    await resetVirtualRoleDeal(db,gameId,pending.version);
    await copyGame(db,718);
    expect(isRed((await drawBlack(db,718)).reveal.role)).toBe(true);
  });
  it('starts a fresh quota for a different evening',async()=>{
    const {db}=await setup('CASUAL');
    await listVipProbabilityRules(db);
    await saveVipGameQuota(db,ownerPlayerId,{wholeEvening:false,maxSuccessfulGames:1});
    const first=await drawBlack(db,gameId);
    await confirmVirtualRole(db,gameId,10,first.card.id,first.reveal.version);
    await db.run(`INSERT INTO game_evenings(id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      SELECT 'next',title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at FROM game_evenings WHERE id='role-ev'`);
    await copyGame(db,718,'next');
    expect(isRed((await drawBlack(db,718)).reveal.role)).toBe(true);
  });
  it('rejects changed roster and old operations after reopening the deal',async()=>{
    const {db}=await setup('CASUAL');
    const first=await openVirtualRoleDeal(db,gameId);
    const row=await db.get<{protocol_text:string}>('SELECT protocol_text FROM games WHERE id=?',[gameId]);
    const protocol=JSON.parse(row!.protocol_text);
    protocol.player_results[9].player_id='replacement';
    await db.run('UPDATE games SET protocol_text=? WHERE id=?',[JSON.stringify(protocol),gameId]);
    await expect(revealVirtualRole(db,gameId,10,first.cards[0].id,first.version)).rejects.toThrow(/Состав игры изменился/);
    const second=await openVirtualRoleDeal(db,gameId);
    expect(second.version).toBeGreaterThan(first.version);
    await expect(revealVirtualRole(db,gameId,10,second.cards[0].id,first.version)).rejects.toThrow(/Состояние раздачи изменилось/);
  });
  it('a protected LAST citizen exchange credits its beneficiary and undo releases it',async()=>{
    const {db}=await setup('CASUAL');
    const opening=await openVirtualRoleDeal(db,gameId);
    const row=await db.get<{state_json:string}>('SELECT state_json FROM game_role_deals WHERE game_key=?',[`club:${gameId}`]);
    const state=JSON.parse(row!.state_json);
    state.deck=[{id:'last-c',role:'citizen'},{id:'last-s',role:'sheriff'},{id:'last-b',role:'mafia'}];
    state.history=['citizen','citizen','citizen','citizen','citizen','don','mafia'].map((role,i)=>({seat:i+1,cardId:'past-'+i,role,previousDeck:[]}));
    // The deal lives under the game key (stage C); the old club table is only its mirror.
    await db.run('UPDATE game_role_deals SET state_json=? WHERE game_key=?',[JSON.stringify(state),`club:${gameId}`]);
    const reveal=await revealVirtualRole(db,gameId,8,'last-c',opening.version);
    expect(reveal.role).not.toBe('citizen');
    const confirmed=await confirmVirtualRole(db,gameId,8,'last-c',reveal.version);
    expect(await privateSuccesses(db)).toEqual([ownerPlayerId]);
    await undoVirtualRole(db,gameId,confirmed.version);
    expect(await privateSuccesses(db)).toEqual([]);
  });
  it('assigned judge can deal, but neither judge nor another organizer can read/change private settings',async()=>{
    const {db,app}=await setup('CASUAL');
    const now=new Date().toISOString();
    await db.run(`INSERT INTO players(id,nickname,judge_level,created_at,updated_at) VALUES ('judge','Судья','judge',?,?)`,[now,now]);
    await db.run("UPDATE games SET judge_player_id='judge' WHERE id=?",[gameId]);
    const judge=`player_token=${generatePlayerSessionToken('judge')}`;
    const opened=await request(app).post(`/api/games/${gameId}/virtual-deal/open`).set('Cookie',judge);
    expect(opened.status).toBe(200);
    expect(JSON.stringify(opened.body)).not.toMatch(/vip|percent|playerId/);
    const root=`organizer_token=${generateOrganizerToken()}`;
    const other=`organizer_token=${generateOrganizerToken('judge')}; ${judge}`;
    await db.run("INSERT INTO organizer_player_access(player_id,granted_at,granted_via) VALUES ('judge',?,'test')",[now]);
    for (const cookie of [judge,other]) {
      for (const path of ['', '/game-quotas']) {
        const result=await request(app).get('/api/admin/vip-probability-rules'+path).set('Cookie',cookie);
        expect([401,403]).toContain(result.status);
        expect(JSON.stringify(result.body)).not.toMatch(/red_color|percent|wholeEvening/);
      }
      for (const method of ['post','put','delete'] as const) {
        const path=method==='post' ? '' : '/legacy-chagin-red-guarantee';
        expect([401,403]).toContain((await request(app)[method]('/api/admin/vip-probability-rules'+path).set('Cookie',cookie).send({})).status);
      }
    }
    expect((await request(app).get('/api/admin/vip-probability-rules').set('Cookie',root)).status).toBe(200);
  });
});
