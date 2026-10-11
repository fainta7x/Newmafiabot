import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import { createPokerTournament, registerForPokerTournament, tickPokerTournaments } from '../server/services/pokerTournamentService.ts';
import { pokerTournamentAnnouncementText } from '../server/services/pokerTournamentAnnouncementService.ts';

const stamp = '2026-10-10T10:00:00.000Z';

describe('entering a running poker tournament over the API, and the table of levels in the payload and the announcement', () => {
  let db: DatabaseWrapper;
  let app: any;
  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    for (let index = 1; index <= 6; index += 1) {
      await db.run(`INSERT INTO players (id,nickname,contact_status,lifecycle_status,judge_level,elo,tokens,created_at,updated_at) VALUES (?,?,'normal','normal','none',1000,1000,?,?)`, [`p${index}`, `Игрок ${index}`, stamp, stamp]);
    }
  });
  const as = (playerId: string) => ({ Cookie: `player_token=${generatePlayerSessionToken(playerId)}` });
  const startRunning = async (extra: Record<string, unknown> = {}) => {
    const startAt = new Date(Date.now() + 60_000).toISOString();
    const row = await createPokerTournament(db, null, { title: 'Вечерний турбо', startAt, minPlayers: 2, lateRegUntilLevel: 6, ...extra });
    await registerForPokerTournament(db, row.id, 'p1');
    await registerForPokerTournament(db, row.id, 'p2');
    await tickPokerTournaments(db, Date.parse(startAt) + 1000);
    // the tournament has been running for 10 minutes: level 2
    const startedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    await db.run('UPDATE poker_tournaments SET started_at = ? WHERE id = ?', [startedAt, row.id]);
    return row.id;
  };

  it('lets a newcomer in through the registration route, shows him his table and the schedule, and does not let him in twice', async () => {
    const id = await startRunning();
    const before = await request(app).get(`/api/player/poker/tournaments/${id}`).set(as('p3'));
    expect(before.status, JSON.stringify(before.body)).toBe(200);
    expect(before.body.tournament).toMatchObject({ status: 'running', late_reg_open: true, my_table_id: null });
    expect(before.body.tournament.settings.lateRegUntilLevel).toBe(6);
    expect(before.body.tournament.schedule).toHaveLength(17);
    expect(before.body.tournament.schedule[5]).toMatchObject({ level: 6, big: 100, startMinute: 30, lateRegOpen: true, rebuyOpen: true });

    const entered = await request(app).post(`/api/player/poker/tournaments/${id}/register`).set(as('p3')).send({});
    expect(entered.status, JSON.stringify(entered.body)).toBe(200);
    expect(entered.body.tournament.my_entry).toMatchObject({ status: 'playing' });
    expect(entered.body.tournament.my_table_id).toMatch(/^ptt_/);
    expect(entered.body.tournament.players).toBe(3);

    const again = await request(app).post(`/api/player/poker/tournaments/${id}/register`).set(as('p3')).send({});
    expect(again.status).toBe(200);
    expect(again.body.tournament.players).toBe(3);
  });

  it('lists who is in the tournament with the state of each, newcomers included, and never a player who withdrew', async () => {
    const startAt = new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString();
    const row = await createPokerTournament(db, null, { title: 'Список', startAt, minPlayers: 4 });
    await registerForPokerTournament(db, row.id, 'p2');
    await registerForPokerTournament(db, row.id, 'p1');
    await registerForPokerTournament(db, row.id, 'p3');
    await db.run("UPDATE poker_tournament_entries SET status = 'cancelled' WHERE tournament_id = ? AND player_id = 'p3'", [row.id]);
    const view = await request(app).get(`/api/player/poker/tournaments/${row.id}`).set(as('p4'));
    expect(view.body.tournament.participants.map((item: any) => item.nickname).sort()).toEqual(['Игрок 1', 'Игрок 2']);
    expect(view.body.tournament.participants[0]).toEqual(expect.objectContaining({ id: expect.any(String), nickname: expect.any(String), status: 'registered', place: null, rebuys: 0, out: false }));
    expect(view.body.tournament.players).toBe(2);
  });

  it('refuses a newcomer once late registration has ended', async () => {
    const id = await startRunning({ lateRegUntilLevel: 1 });
    const late = await request(app).post(`/api/player/poker/tournaments/${id}/register`).set(as('p4')).send({});
    expect(late.status).toBe(409);
    expect(late.body.error).toContain('Поздняя запись');
    const view = await request(app).get(`/api/player/poker/tournaments/${id}`).set(as('p4'));
    expect(view.body.tournament.late_reg_open).toBe(false);
  });

  it('puts the clock of the levels and the closing times of the entry and the re-buy into the announcement', async () => {
    const startAt = '2026-10-20T18:00:00.000Z';
    const row = await createPokerTournament(db, null, { title: 'Вечерний турбо', startAt, minPlayers: 4 }, Date.parse('2026-10-20T10:00:00Z'));
    const text = pokerTournamentAnnouncementText(row as any);
    expect(text).toContain('⏱ Уровень 6 мин., блайнды с 10/20, стек 1');
    expect(text).toContain('➕ Войти в идущий турнир можно до конца 6-го уровня (до 21:36 МСК)');
    expect(text).toContain('🔁 Докупка до конца 6-го уровня (до 21:36 МСК): 1');
    expect(text).toContain('000 жетонов за 1');
    const none = await createPokerTournament(db, null, { title: 'Без позднего входа', startAt, minPlayers: 4, lateRegUntilLevel: 0, rebuyUntilLevel: 0 }, Date.parse('2026-10-20T10:00:00Z'));
    const plain = pokerTournamentAnnouncementText(none as any);
    expect(plain).not.toContain('➕');
    expect(plain).not.toContain('🔁');
  });
});
