import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { applyFandorinAug28GameIdentityMigration } from '../db/fixFandorinAug28GameIdentityMigration.ts';

let db: DatabaseWrapper | null = null;
afterEach(() => {
  try { db?.sqlite.close(); } catch {}
  db = null;
});

describe('Fandorin Aug 28 game identity repair', () => {
  it('replaces only Chagin game identity while preserving seat result data and is idempotent', async () => {
    db = createDatabaseConnection(':memory:');
    // Production initializes these player operations columns before pricing reconciliation.
    // Keep the focused in-memory fixture aligned with that canonical runtime schema.
    await db.exec(`ALTER TABLE players ADD COLUMN club_role TEXT NOT NULL DEFAULT 'guest';`);
    await db.exec(`ALTER TABLE players ADD COLUMN judge_level TEXT NOT NULL DEFAULT 'none';`);

    const now = '2026-08-29T12:00:00.000Z';
    await db.run(`INSERT INTO players (id,nickname,created_at,updated_at) VALUES ('chagin','Чагин',?,?)`, [now, now]);
    await db.run(`INSERT INTO players (id,nickname,created_at,updated_at) VALUES ('fandorin','Фандорин',?,?)`, [now, now]);
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,format,status,default_price,created_at,updated_at)
                  VALUES ('evening-28','Игровой вечер — 28 августа','2026-08-28T20:00:00+03:00','CASUAL','completed',400,?,?)`, [now, now]);
    await db.run(`INSERT INTO evening_participants (
                    id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at
                  ) VALUES ('chagin-part','evening-28','chagin','going','going','attended','on_time','waived',0,0,?,?)`, [now, now]);

    const protocol = {
      version: 1,
      kind: 'club_evening_protocol',
      protocol: {
        game_id: '1',
        status: 'draft',
        winner_team: null,
        first_killed_participant_id: 'chagin-part',
        best_move_participant_id: 'chagin-part',
        best_moves: [{ source: 'first_killed', participant_id: 'chagin-part', seat_numbers: [2, 3, 4] }],
      },
      player_results: [{
        participant_id: 'chagin-part',
        player_id: 'chagin',
        seat_number: 6,
        display_name: 'Чагин',
        role: 'Мирный',
        regular_fouls: 2,
        judge_bonus: 0.3,
      }],
    };
    const slots = [{ slot_num: 6, participant_id: 'chagin-part', player_id: 'chagin', nickname: 'Чагин', role: 'Мирный', fouls: 2 }];
    await db.run(`INSERT INTO games (id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
                  VALUES (1,'evening-28',1,'2026-08-28T21:00:00+03:00','draft','Черновик',?,?,?)`,
      [JSON.stringify(protocol), JSON.stringify(slots), now]);

    const result = await applyFandorinAug28GameIdentityMigration(db);
    expect(result.applied).toBe(true);
    expect(result.gamesChanged).toEqual([1]);

    const fandorinParticipant = await db.get<any>(`SELECT * FROM evening_participants WHERE evening_id='evening-28' AND player_id='fandorin'`);
    expect(fandorinParticipant).toMatchObject({ response_status: 'going', registration_status: 'going', attendance_status: 'attended' });

    const game = await db.get<any>('SELECT protocol_text,slots_json FROM games WHERE id=1');
    const repairedProtocol = JSON.parse(game.protocol_text);
    const repairedSlots = JSON.parse(game.slots_json);
    const repaired = repairedProtocol.player_results[0];
    expect(repaired).toMatchObject({
      participant_id: fandorinParticipant.id,
      player_id: 'fandorin',
      seat_number: 6,
      display_name: 'Фандорин',
      role: 'Мирный',
      regular_fouls: 2,
      judge_bonus: 0.3,
    });
    expect(repairedProtocol.protocol.first_killed_participant_id).toBe(fandorinParticipant.id);
    expect(repairedProtocol.protocol.best_move_participant_id).toBe(fandorinParticipant.id);
    expect(repairedProtocol.protocol.best_moves[0].participant_id).toBe(fandorinParticipant.id);
    expect(repairedSlots[0]).toMatchObject({ participant_id: fandorinParticipant.id, player_id: 'fandorin', nickname: 'Фандорин', slot_num: 6, fouls: 2 });

    const second = await applyFandorinAug28GameIdentityMigration(db);
    expect(second.applied).toBe(false);
    expect((await db.all<any>(`SELECT id FROM evening_participants WHERE evening_id='evening-28' AND player_id='fandorin'`))).toHaveLength(1);
  });
});
