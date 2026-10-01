import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { registerNewPlayer } from '../server/services/playerRegistrationService.ts';
import { mutateTokenBalance } from '../server/services/tokenLedgerService.ts';
import { isClubPlayer } from '../lib/playerActivitySegments.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('player profile merge', () => {
  it('previews and atomically merges a manual duplicate while preserving references', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    const keeper = (await registerNewPlayer(db, { telegramUserId: '990001', nickname: 'Основной игрок' })).player;
    const source = (await registerNewPlayer(db, { telegramUserId: '990002', nickname: 'Дубликат', source: 'manual' })).player;
    await db.run("UPDATE players SET telegram_user_id = NULL, source = 'manual', tokens = 12 WHERE id = ?", [source.id]);
    await db.run("UPDATE players SET tokens = 8 WHERE id = ?", [keeper.id]);
    await db.run("INSERT INTO player_activities (id, player_id, type, occurred_at, created_at) VALUES (?, ?, 'note', ?, ?)", ['merge-activity', source.id, new Date().toISOString(), new Date().toISOString()]);
    const cookie = `organizer_token=${generateOrganizerToken()}`;

    const preview = await request(app).post(`/api/players/${keeper.id}/merge-preview`).set('Cookie', cookie).send({ source_player_id: source.id });
    expect(preview.status).toBe(200);
    expect(preview.body.blockers).toEqual([]);
    expect(preview.body.summary.source_tokens).toBe(12);

    const merged = await request(app).post(`/api/players/${keeper.id}/merge`).set('Cookie', cookie).send({
      source_player_id: source.id,
      preview_token: preview.body.token,
      confirmation_nickname: keeper.nickname,
    });
    expect(merged.status).toBe(200);
    expect((await db.get<any>('SELECT lifecycle_status, merged_into_player_id, tokens FROM players WHERE id = ?', [source.id]))).toMatchObject({ lifecycle_status: 'merged', merged_into_player_id: keeper.id, tokens: 0 });
    expect((await db.get<any>('SELECT player_id FROM player_activities WHERE id = ?', ['merge-activity']))?.player_id).toBe(keeper.id);
    expect((await db.get<any>('SELECT tokens FROM players WHERE id = ?', [keeper.id]))?.tokens).toBe(20);
    expect((await db.get<any>('SELECT COUNT(*) AS count FROM player_profile_merges'))?.count).toBe(1);
  });

  it('rejects a non-owner organizer before preview creation', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    const keeper = (await registerNewPlayer(db, { telegramUserId: '990003', nickname: 'Цель' })).player;
    const source = (await registerNewPlayer(db, { telegramUserId: '990004', nickname: 'Ручной', source: 'manual' })).player;
    await db.run("UPDATE players SET telegram_user_id = NULL, source = 'manual' WHERE id = ?", [source.id]);
    const response = await request(app).post(`/api/players/${keeper.id}/merge-preview`).set('Cookie', `organizer_token=${generateOrganizerToken('not-owner')}`).send({ source_player_id: source.id });
    expect(response.status).toBe(401);
  });

  it('keeps each token journal equal to its balance and hides the merged duplicate from the club lists', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    const keeper = (await registerNewPlayer(db, { telegramUserId: '990005', nickname: 'Основной' })).player;
    const source = (await registerNewPlayer(db, { telegramUserId: '990006', nickname: 'Дубль', source: 'manual' })).player;
    await db.run("UPDATE players SET telegram_user_id = NULL, source = 'manual' WHERE id = ?", [source.id]);
    const grant = (playerId: string, delta: number, key: string) => mutateTokenBalance(db, {
      playerId, delta, reasonType: 'admin_adjustment', description: 'Начисление', sourceType: 'manual', sourceId: key,
      idempotencyKey: key, debitPolicy: 'allow_negative', actorType: 'owner', actorId: 'owner',
    } as any);
    await grant(source.id, 12, 'grant-source');
    await grant(keeper.id, 8, 'grant-keeper');
    const balances = async () => Promise.all([keeper.id, source.id].map(async (id) => ({
      tokens: Number((await db.get<any>('SELECT tokens FROM players WHERE id = ?', [id]))?.tokens || 0),
      journal: Number((await db.get<any>('SELECT COALESCE(SUM(amount), 0) AS total FROM token_ledger WHERE player_id = ?', [id]))?.total || 0),
    })));
    const before = await balances();
    const cookie = `organizer_token=${generateOrganizerToken()}`;
    const preview = await request(app).post(`/api/players/${keeper.id}/merge-preview`).set('Cookie', cookie).send({ source_player_id: source.id });
    expect(preview.body.blockers).toEqual([]);
    const merged = await request(app).post(`/api/players/${keeper.id}/merge`).set('Cookie', cookie)
      .send({ source_player_id: source.id, preview_token: preview.body.token, confirmation_nickname: 'Основной' });
    expect(merged.status, JSON.stringify(merged.body)).toBe(200);

    const [keeperAfter, sourceAfter] = await balances();
    expect(keeperAfter.tokens).toBe(before[0].tokens + before[1].tokens);
    expect(keeperAfter.journal).toBe(keeperAfter.tokens);
    expect(sourceAfter).toEqual({ tokens: 0, journal: 0 });

    const list = await request(app).get('/api/players').set('Cookie', cookie);
    const duplicate = list.body.find((player: any) => player.id === source.id);
    expect(isClubPlayer(duplicate)).toBe(false);
  });
});
