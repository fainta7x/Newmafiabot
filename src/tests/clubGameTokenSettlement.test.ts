import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { generateOrganizerToken } from '../server/auth';
import {
  calculateClubGamePlayerTokens,
  decimalPointsToTenths,
  reconcileClubGameTokenSettlement,
} from '../server/services/clubGameTokenSettlementService';
import { verifyTokenLedgerConsistency } from '../server/services/tokenLedgerService';

const makeResult = (i: number, patch: any = {}) => ({
  participant_id: `ep-${i}`,
  player_id: `p-${i}`,
  seat_number: i,
  display_name: `P${i}`,
  role: i <= 7 ? (i === 7 ? 'sheriff' : 'citizen') : (i === 10 ? 'don' : 'mafia'),
  exit_type: 'alive',
  regular_fouls: 0,
  minor_technical_fouls: 0,
  major_technical_fouls: 0,
  technical_fouls: 0,
  judge_bonus: 0,
  protocol_bonus: 0,
  disciplinary_penalty_points: 0,
  ci_points: 0,
  ...patch,
});

const protocol = (status: 'draft'|'completed', results: any[], patch: any = {}) => ({
  version: 1,
  kind: 'club_evening_protocol',
  protocol: {
    game_id: '', status, winner_team: status === 'completed' ? 'red' : null,
    end_reason: 'normal', ppk_culprit_participant_id: null,
    first_killed_participant_id: null, best_moves: [], ...patch,
  },
  player_results: results,
});

describe('club game token formula', () => {
  it('is decimal-safe and covers win/loss and foul boundaries', () => {
    expect(decimalPointsToTenths(0.30000000000000004)).toBe(3);
    expect(decimalPointsToTenths(-0.6000000000000001)).toBe(-6);
    expect(calculateClubGamePlayerTokens({ role:'citizen', winnerTeam:'red', regularFouls:0 }).total).toBe(215);
    expect(calculateClubGamePlayerTokens({ role:'citizen', winnerTeam:'black', regularFouls:0 }).total).toBe(115);
    expect(calculateClubGamePlayerTokens({ role:'citizen', winnerTeam:'black', regularFouls:1 }).foul_bonus).toBe(10);
    expect(calculateClubGamePlayerTokens({ role:'citizen', winnerTeam:'black', regularFouls:2 }).foul_bonus).toBe(5);
    expect(calculateClubGamePlayerTokens({ role:'citizen', winnerTeam:'black', regularFouls:3 }).foul_bonus).toBe(0);
  });

  it('maps signed points and every sanction exactly', () => {
    const value = calculateClubGamePlayerTokens({
      role:'mafia', winnerTeam:'black', judgeBonus:0.3, protocolBonus:-0.1,
      bestMovePoints:0.6, ciPoints:0.2, disciplinaryPoints:-1,
      regularFouls:2, minorTechnicalFouls:1, majorTechnicalFouls:1,
      removed:true, ppkCulprit:true,
    });
    expect(value.additional_points_tenths).toBe(0);
    expect(value.minor_technical_penalty).toBe(-30);
    expect(value.major_technical_penalty).toBe(-60);
    expect(value.removal_penalty).toBe(-100);
    expect(value.ppk_penalty).toBe(-500);
    expect(value.total).toBe(-485);
  });

  it('uses current canonical PPK discipline and applies the -1000 lower cap', () => {
    const currentPpk = calculateClubGamePlayerTokens({
      role:'citizen', winnerTeam:'black', disciplinaryPoints:-1, ppkCulprit:true,
      minorTechnicalFouls:2, majorTechnicalFouls:2, removed:true, regularFouls:4,
    });
    expect(currentPpk.additional_points_tokens).toBe(-100);
    expect(currentPpk.total).toBe(-780);
    const capped = calculateClubGamePlayerTokens({
      role:'citizen', winnerTeam:'black', disciplinaryPoints:-8, ppkCulprit:true,
      minorTechnicalFouls:10, majorTechnicalFouls:10, removed:true, regularFouls:4,
    });
    expect(capped.uncapped_total).toBeLessThan(-1000);
    expect(capped.total).toBe(-1000);
  });
});

describe('canonical club-game token settlement routes', () => {
  let db: DatabaseWrapper;
  let app: any;
  let cookie: string;
  let gameId: number;
  let results: any[];
  let dbPath = '';

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `club-game-token-${crypto.randomUUID()}.sqlite`);
    const raw = new Database(dbPath);
    raw.exec(fs.readFileSync(path.join(process.cwd(), 'drizzle', '0000_initial.sql'), 'utf8'));
    raw.exec(`CREATE TABLE IF NOT EXISTS tournament_final_resolutions (
      id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL, type TEXT NOT NULL, category TEXT,
      participant_ids_json TEXT NOT NULL, ordered_participant_ids_json TEXT, winner_participant_id TEXT,
      resolution_method TEXT NOT NULL, comment TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );`);
    raw.close();
    db = createDatabaseConnection(dbPath);
    app = await createApp(db);
    cookie = `organizer_token=${generateOrganizerToken()}`;
    const now = '2026-08-10T05:00:00.000Z';
    for (let i=1;i<=12;i++) {
      await db.run(
        `INSERT INTO players (id,nickname,contact_status,lifecycle_status,elo,tokens,created_at,updated_at)
         VALUES (?,?,'normal','normal',1500,0,?,?)`,
        [`p-${i}`, `P${i}`, now, now],
      );
    }
    await db.run(
      `INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
       VALUES ('e-1','Evening',?,'Europe/Moscow','STANDARD','active',20,0,?,?)`, [now,now,now],
    );
    results = Array.from({length:10},(_,idx)=>makeResult(idx+1));
    const draft = protocol('draft', results);
    const inserted = await db.run(
      `INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,judge_name,judge_player_id,protocol_text,slots_json,created_at)
       VALUES ('e-1',501,?,'draft','Черновик','P11','p-11',?,'[]',?)`,
      [now,JSON.stringify(draft),now],
    );
    gameId = Number(inserted.lastID);
  });

  afterEach(() => {
    try { db?.sqlite.close(); } catch {}
    try { if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch {}
  });

  const save = (body: any) => request(app).put(`/api/games/${gameId}/evening-protocol`).set('Cookie',cookie).send(body);
  const ledgerCount = async () => Number((await db.get<{n:number}>('SELECT COUNT(*) AS n FROM token_ledger'))?.n || 0);

  it('first completion settles all ten UUID players plus linked judge, replay is exact no-op, and metadata is readable', async () => {
    const completed = protocol('completed', results, {
      first_killed_participant_id:'ep-1', zero_round_voted_participant_id:'ep-2',
      best_moves:[
        {participant_id:'ep-1',source:'first_killed',seat_numbers:[8,9,10]},
        {participant_id:'ep-2',source:'zero_round_voted',seat_numbers:[8,9,10]},
      ],
    });
    completed.player_results[0].judge_bonus = 0.3;
    completed.player_results[0].protocol_bonus = -0.1;
    completed.player_results[0].ci_points = 0.2;
    const response = await save({ protocol: completed.protocol, player_results: completed.player_results });
    expect(response.status).toBe(200);
    expect(await ledgerCount()).toBe(11);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-1'")).tokens)).toBe(315);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-2'")).tokens)).toBe(215);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-11'")).tokens)).toBe(100);
    const playerLedger = await db.get<any>("SELECT * FROM token_ledger WHERE reason_type='club_game_player' AND player_id='p-1'");
    expect(playerLedger.description).toContain('Игра №501');
    const metadata = JSON.parse(playerLedger.metadata_json);
    expect(metadata.breakdown.additional_points_tenths).toBe(10);
    expect(metadata.breakdown.additional_points_tokens).toBe(100);
    const replay = await save({ protocol: completed.protocol, player_results: completed.player_results });
    expect(replay.status).toBe(200);
    expect(await ledgerCount()).toBe(11);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-1'")).tokens)).toBe(315);
    expect((await verifyTokenLedgerConsistency(db)).every((row:any)=>row.matches)).toBe(true);
  });

  it('correction, PPK/removal, judge swap, reopen, re-complete, archive and restore produce compensating deltas only', async () => {
    let completed = protocol('completed', results);
    expect((await save({protocol:completed.protocol,player_results:completed.player_results})).status).toBe(200);
    const firstRows = await ledgerCount();

    completed.player_results[0] = { ...completed.player_results[0], judge_bonus:0.1 };
    expect((await save({protocol:completed.protocol,player_results:completed.player_results})).status).toBe(200);
    expect(await ledgerCount()).toBe(firstRows + 1);
    expect(Number((await db.get<any>("SELECT amount FROM token_ledger WHERE player_id='p-1' ORDER BY created_at DESC,id DESC LIMIT 1")).amount)).toBe(10);

    completed = protocol('completed', completed.player_results, { end_reason:'ppk', ppk_culprit_participant_id:'ep-2' });
    completed.player_results[1] = { ...completed.player_results[1], exit_type:'removed', disciplinary_penalty_points:-1 };
    expect((await save({protocol:completed.protocol,player_results:completed.player_results})).status).toBe(200);
    const p2Latest = await db.get<any>("SELECT amount FROM token_ledger WHERE player_id='p-2' ORDER BY created_at DESC,id DESC LIMIT 1");
    expect(Number(p2Latest.amount)).toBe(-700);

    expect((await save({protocol:completed.protocol,player_results:completed.player_results,judge_player_id:'p-12'})).status).toBe(200);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-11'")).tokens)).toBe(0);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-12'")).tokens)).toBe(100);

    const beforeReopen = await ledgerCount();
    const draft = protocol('draft', completed.player_results, { winner_team:null, end_reason:'normal', ppk_culprit_participant_id:null });
    expect((await save({protocol:draft.protocol,player_results:draft.player_results})).status).toBe(200);
    expect(await ledgerCount()).toBeGreaterThan(beforeReopen);
    for (let i=1;i<=12;i++) expect(Number((await db.get<any>('SELECT tokens FROM players WHERE id=?',[`p-${i}`])).tokens)).toBe(0);

    completed = protocol('completed', results);
    expect((await save({protocol:completed.protocol,player_results:completed.player_results})).status).toBe(200);
    const managedBalance = Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-1'")).tokens);
    expect(managedBalance).toBe(225);

    expect((await request(app).post(`/api/games/${gameId}/archive`).set('Cookie',cookie)).status).toBe(200);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-1'")).tokens)).toBe(0);
    expect((await request(app).post(`/api/games/${gameId}/archive/restore`).set('Cookie',cookie)).status).toBe(200);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-1'")).tokens)).toBe(225);
    expect((await verifyTokenLedgerConsistency(db)).every((row:any)=>row.matches)).toBe(true);
  });

  it('rolls back the game and every token mutation when a later player update fails', async () => {
    await db.exec(`CREATE TRIGGER fail_p6_tokens BEFORE UPDATE OF tokens ON players
      WHEN NEW.id='p-6' BEGIN SELECT RAISE(ABORT,'forced token failure'); END;`);
    const completed = protocol('completed', results);
    const response = await save({protocol:completed.protocol,player_results:completed.player_results});
    expect(response.status).toBe(400);
    const game = await db.get<any>('SELECT protocol_text,winner_team FROM games WHERE id=?',[gameId]);
    expect(JSON.parse(game.protocol_text).protocol.status).toBe('draft');
    expect(game.winner_team).toBe('draft');
    expect(await ledgerCount()).toBe(0);
    expect(Number((await db.get<any>('SELECT COUNT(*) AS n FROM club_game_token_settlements')).n)).toBe(0);
    for (let i=1;i<=12;i++) expect(Number((await db.get<any>('SELECT tokens FROM players WHERE id=?',[`p-${i}`])).tokens)).toBe(0);
  });

  it('external judge gets no judge reward and draft/untracked historical rows do not settle', async () => {
    await db.run("UPDATE games SET judge_player_id=NULL, judge_name='External Judge' WHERE id=?",[gameId]);
    const completed = protocol('completed', results);
    expect((await save({protocol:completed.protocol,player_results:completed.player_results,judge_player_id:null,judge_name:'External Judge'})).status).toBe(200);
    expect(Number((await db.get<any>("SELECT COUNT(*) AS n FROM token_ledger WHERE reason_type='club_game_judge'")).n)).toBe(0);

    const oldCompleted = protocol('completed', results);
    const old = await db.run(
      `INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
       VALUES ('e-1',502,'2026-08-09','Красные','old',?,'[]','2026-08-09')`, [JSON.stringify(oldCompleted)],
    );
    const before = await ledgerCount();
    await db.transaction(async (tx:any)=>{
      await reconcileClubGameTokenSettlement(tx, Number(old.lastID), {activateIfUntracked:false,context:'correction'});
    });
    expect(await ledgerCount()).toBe(before);

    const draftGame = await db.run(
      `INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
       VALUES ('e-1',503,'2026-08-10','draft','draft',?,'[]','2026-08-10')`, [JSON.stringify(protocol('draft',results))],
    );
    await db.transaction(async (tx:any)=>{
      await reconcileClubGameTokenSettlement(tx, Number(draftGame.lastID), {activateIfUntracked:true,context:'completion'});
    });
    expect(await ledgerCount()).toBe(before);
  });

  it('legacy unstructured POST no longer changes tokens', async () => {
    const legacy = await request(app).post('/api/games').set('Cookie',cookie).send({
      global_game_number:900, game_date:'2026-08-10', winner_team:'Красные', winner_label:'Победа города',
      judge_name:'Legacy', protocol_text:'legacy',
      slots: Array.from({length:10},(_,idx)=>({slot:idx+1,player_id:`p-${idx+1}`,nickname:`P${idx+1}`,role:idx<7?'Мирный':'Мафия'})),
    });
    expect(legacy.status).toBe(410);
    expect(Number((await db.get<any>("SELECT COUNT(*) AS n FROM token_ledger WHERE reason_type IN ('club_game_player','club_game_judge')")).n)).toBe(0);
    for (let i=1;i<=10;i++) expect(Number((await db.get<any>('SELECT tokens FROM players WHERE id=?',[`p-${i}`])).tokens)).toBe(0);
  });
});
