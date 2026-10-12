import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensurePlayerProfileIntegritySchema } from '../db/ensurePlayerProfileIntegritySchema.ts';
import type { CareerAppearance } from '../lib/gomafiaCareer.ts';
import { enrichGoMafiaAppearance, nominationsOfPlayer } from '../server/services/goMafiaCareerSource.ts';
import { federationAwardsOf, syncGoMafiaAwards } from '../server/services/goMafiaAwardsService.ts';

const user = (id: string) => ({ user: { id, login: `u${id}` }, amount: null });
// The shape observed on the public tournament pages (2026-10-12): the nominations are lists of users.
const page = {
  tournament: { id: '2765', is_hidden_result: '0', status: 'completed' },
  nominations: { best_red: [user('1'), user('2709')], best_mafia: [user('6151')], best_don: [], best_sheriff: [user('39'), user('1202')], mvp: [user('1202')] },
  tournamentResultWithFinal: [], tournamentResultWithoutFinal: [], games: [],
};
const appearance = (patch: Partial<CareerAppearance> = {}): CareerAppearance => ({
  tournamentId: '2765', tournamentName: 'CHEATERS CUP 2026', dateStart: '2026-02-28', dateEnd: '2026-03-01', location: null, place: 2, totalScore: null,
  scoreRetrievedAt: null, scoreStatus: 'not_checked', eloDelta: null, eloAfter: null, status: 'results_published', sourceUrl: 'https://gomafia.pro/tournament/2765', games: [], ...patch,
});

describe('GoMafia nominations and podium places as awards', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await ensurePlayerProfileIntegritySchema(db);
    for (const id of ['p1', 'p2']) await db.run('INSERT INTO players(id,nickname,created_at,updated_at) VALUES (?,?,?,?)', [id, id, '2026-10-12', '2026-10-12']);
  });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('reads a nomination only by the exact federation ID, with the position in the list', () => {
    expect(nominationsOfPlayer(page, '1202')).toEqual([{ key: 'best_sheriff', rank: 2 }, { key: 'mvp', rank: 1 }]);
    expect(nominationsOfPlayer(page, '120')).toEqual([]);
    expect(enrichGoMafiaAppearance(appearance(), page, '1202').nominations).toEqual([{ key: 'best_sheriff', rank: 2 }, { key: 'mvp', rank: 1 }]);
  });

  it('turns places 1–3 and nominations into awards, and nothing for other places', () => {
    const awards = federationAwardsOf('1202', [
      appearance({ place: 2, nominations: [{ key: 'best_sheriff', rank: 2 }, { key: 'mvp', rank: 1 }] }),
      appearance({ tournamentId: '9', place: 27 }),
      appearance({ tournamentId: '10', place: 1, status: 'upcoming' }),
    ]);
    expect(awards.map((award) => [award.kind, award.title, award.sourceKey])).toEqual([
      ['placement', '2 место', 'gomafia:1202:2765:place'],
      ['nomination', 'Лучший шериф · 2 место', 'gomafia:1202:2765:nom:best_sheriff'],
      ['nomination', 'MVP турнира', 'gomafia:1202:2765:nom:mvp'],
    ]);
  });

  it('writes them once as verified automatic awards and never takes over another player’s row', async () => {
    const tournaments = [appearance({ place: 1, nominations: [{ key: 'mvp', rank: 1 }] })];
    expect(await syncGoMafiaAwards(db, 'p1', '1202', tournaments)).toBe(2);
    await syncGoMafiaAwards(db, 'p1', '1202', tournaments);
    const rows = await db.all<any>('SELECT * FROM player_verified_awards ORDER BY source_key');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ player_id: 'p1', kind: 'nomination', title: 'MVP турнира', source_type: 'automatic', verification_status: 'verified', tournament_name: 'CHEATERS CUP 2026', award_year: 2026 });
    expect(rows[1]).toMatchObject({ kind: 'placement', place_result: '1 место', tournament_id: null });
    // The same source key for a different player must not overwrite the first owner's row.
    await syncGoMafiaAwards(db, 'p2', '1202', tournaments);
    expect((await db.all<any>('SELECT player_id FROM player_verified_awards')).every((row) => row.player_id === 'p1')).toBe(true);
  });
});
