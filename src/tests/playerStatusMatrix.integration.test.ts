import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { membershipOfPlayer, STOPPED_REASON } from '../lib/playerAccess.ts';
import { hostFormatsOf } from '../lib/hostFormats.ts';

/**
 * Every status the organizer sets in «Уровни и роли» and in the player card, changed back and forth
 * (owner, 2026-09-30: «Спящий» could not go from «Ходит постоянно» to «Ходит иногда»).
 */
const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const stamp = new Date().toISOString();
  await db.run(
    "INSERT INTO players (id,nickname,telegram_user_id,game_level,club_role,created_at,updated_at) VALUES ('p','Спящий','tg-p','club','team',?,?)",
    [stamp, stamp],
  );
  const cookie = `organizer_token=${generateOrganizerToken()}`;
  const bulk = async (body: object) => {
    const response = await request(app).post('/api/players/access/bulk').set('Cookie', cookie).send({ player_ids: ['p'], ...body });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body;
  };
  const card = async (body: object) => {
    const response = await request(app).patch('/api/players/p').set('Cookie', cookie).send(body);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body;
  };
  const read = async () => {
    const row = await db.get<any>('SELECT * FROM players WHERE id = ?', ['p']);
    const stopped = Number(row.stopped_attending || 0) === 1;
    return {
      level: row.game_level,
      activity: stopped ? 'stopped' : Number(row.from_other_city || 0) === 1 ? 'other_city' : membershipOfPlayer(row) === 'guest' ? 'sometimes' : 'regular',
      role: ['team', 'organizer'].includes(row.club_role) ? row.club_role : 'none',
      paused: row.contact_status === 'paused' && row.pause_reason === STOPPED_REASON,
      host: hostFormatsOf(row).join(','),
      organize: String(row.organize_formats || ''),
    };
  };
  return { db, bulk, card, read };
}

describe('«Уровни и роли»: every status changes and sticks', () => {
  it('«Как часто ходит» for a helper of the club, every way round', async () => {
    const { bulk, read } = await setup();
    expect((await read()).role).toBe('team');
    for (const activity of ['sometimes', 'regular', 'stopped', 'sometimes', 'other_city', 'regular', 'stopped', 'regular'] as const) {
      await bulk({ activity });
      const state = await read();
      expect(state.activity, `after ${activity}`).toBe(activity);
      expect(state.paused, `pause after ${activity}`).toBe(activity === 'stopped');
      // A guest from another city takes no club role; otherwise the role stays.
      expect(state.role, `role after ${activity}`).toBe(activity === 'other_city' ? 'none' : state.role);
      if (activity === 'other_city') await bulk({ activity: 'regular', organization: 'team' });
    }
  });

  it('the role changes without touching «Как часто ходит», and back', async () => {
    const { bulk, read } = await setup();
    await bulk({ activity: 'sometimes' });
    for (const organization of ['none', 'team', 'none', 'team'] as const) {
      await bulk({ organization });
      expect(await read()).toMatchObject({ role: organization, activity: 'sometimes' });
    }
    await bulk({ activity: 'regular' });
    await bulk({ organization: 'none' });
    expect(await read()).toMatchObject({ role: 'none', activity: 'regular' });
  });

  it('the level, «Может вести» and «Может проводить» change and change back', async () => {
    const { bulk, read } = await setup();
    for (const game_level of ['novice', 'tournament', 'club'] as const) {
      await bulk({ game_level });
      expect((await read()).level).toBe(game_level);
    }
    await bulk({ host_formats_add: ['NOVICE', 'RATING'] });
    expect((await read()).host).toBe('NOVICE,RATING');
    await bulk({ host_formats_remove: ['NOVICE'] });
    expect((await read()).host).toBe('RATING');
    await bulk({ organize_formats_add: ['CASUAL', 'TOURNAMENT'] });
    expect((await read()).organize).toBe('CASUAL,TOURNAMENT');
    await bulk({ organize_formats_remove: ['CASUAL', 'TOURNAMENT'] });
    expect((await read()).organize).toBe('');
  });

  it('the player card keeps «Ходит иногда» for a helper, and the bulk screen sees it', async () => {
    const { card, bulk, read } = await setup();
    await card({ club_role: 'team', attends_sometimes: true });
    expect(await read()).toMatchObject({ role: 'team', activity: 'sometimes' });
    await card({ club_role: 'member' });
    expect(await read()).toMatchObject({ role: 'none', activity: 'regular' });
    await card({ club_role: 'guest' });
    expect(await read()).toMatchObject({ role: 'none', activity: 'sometimes' });
    await bulk({ organization: 'team' });
    expect(await read()).toMatchObject({ role: 'team', activity: 'sometimes' });
    await card({ game_level: 'tournament', host_formats: ['CASUAL'] });
    expect(await read()).toMatchObject({ level: 'tournament', host: 'CASUAL', role: 'team', activity: 'sometimes' });
  });
});
