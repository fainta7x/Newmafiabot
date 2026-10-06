import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import { ensureClubDigestSchema } from '../server/services/clubDigestService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

describe('«Новости клуба» on the player home (owner, 2026-10-06)', () => {
  it('shows published digests newest first, each text once, without bold markers', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    const now = new Date().toISOString();
    await db.run("INSERT INTO players (id,nickname,created_at,updated_at) VALUES ('p','Игрок',?,?)", [now, now]);
    await ensureClubDigestSchema(db);
    const add = (id: string, at: string, text: string, hash: string, dest: string, status: string) => db.run(
      'INSERT INTO club_digest_posts (id, claim_key, created_at, text, text_hash, destination_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, id, at, text, hash, dest, status],
    );
    await add('a1', '2026-10-01T10:00:00Z', 'Старая **новость** клуба', 'h1', 'club', 'sent');
    await add('b1', '2026-10-05T10:00:00Z', 'Свежая новость клуба', 'h2', 'club', 'sent');
    await add('b2', '2026-10-05T10:01:00Z', 'Свежая новость клуба', 'h2', 'public', 'sent');
    await add('c1', '2026-10-06T10:00:00Z', 'Не отправилась', 'h3', 'club', 'failed');
    expect((await request(app).get('/api/player/news')).status).toBe(401);
    const response = await request(app).get('/api/player/news').set('Cookie', `player_token=${generatePlayerSessionToken('p')}`);
    expect(response.status).toBe(200);
    expect(response.body.news).toEqual([
      { text: 'Свежая новость клуба', published_at: '2026-10-05T10:01:00Z' },
      { text: 'Старая новость клуба', published_at: '2026-10-01T10:00:00Z' },
    ]);
  });
});
