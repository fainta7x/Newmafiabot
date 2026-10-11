import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while(opened.length) opened.pop()?.sqlite.close(); });

describe('anonymous testament training endpoint', () => {
  it('works without organizer login and returns pedagogical situations without player identities', async () => {
    const db = createDatabaseConnection(':memory:');
    opened.push(db);
    const app = await createApp(db);
    const answer = await request(app).get('/api/learning/anonymous-testaments?attempt=0');
    expect(answer.status).toBe(200);
    expect(answer.body.teachingOnly).toBe(true);
    expect(answer.body.cases.length).toBeGreaterThanOrEqual(4);
    expect(new Set(answer.body.cases.map((row:any)=>row.strength)).size).toBeGreaterThanOrEqual(4);
    for (const item of answer.body.cases) {
      expect(item).toHaveProperty('teachingWill');
      expect(item).toHaveProperty('explanation');
      expect(item.gameKey).toBeUndefined();
      expect(item.playerId).toBeUndefined();
      expect(item.actualRole).toBeUndefined();
      expect(item.sourceId).toBeUndefined();
    }
    const next = await request(app).get('/api/learning/anonymous-testaments?attempt=1');
    expect(next.status).toBe(200);
    expect(next.body.cases[0].id).not.toBe(answer.body.cases[0].id);
  });
});
