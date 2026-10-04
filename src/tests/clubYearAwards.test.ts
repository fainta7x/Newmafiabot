import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { buildYearPodium, loadEveningTitles, loadPlayerEveningTitles, moscowYear, syncClubYearAwards } from '../server/services/clubYearAwardsService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

const setup = async () => {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  await db.run(`CREATE TABLE IF NOT EXISTS evening_player_votes (evening_id TEXT NOT NULL, voter_player_id TEXT NOT NULL, category TEXT NOT NULL, nominee_player_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (evening_id, voter_player_id, category))`);
  const now = new Date().toISOString();
  for (const id of ['a', 'b', 'c', 'd', 'v1', 'v2', 'v3']) await db.run('INSERT INTO players (id, nickname, created_at, updated_at) VALUES (?,?,?,?)', [id, id.toUpperCase(), now, now]);
  return db;
};
const evening = (db: DatabaseWrapper, id: string, startsAt: string) => db.run(
  `INSERT INTO game_evenings (id, title, starts_at, status, settled_at, created_at, updated_at) VALUES (?, 'Вечер', ?, 'completed', ?, ?, ?)`,
  [id, startsAt, startsAt, startsAt, startsAt],
);
const vote = (db: DatabaseWrapper, eveningId: string, voter: string, nominee: string, category = 'best_player') => db.run(
  'INSERT INTO evening_player_votes (evening_id, voter_player_id, category, nominee_player_id, created_at, updated_at) VALUES (?,?,?,?,?,?)',
  [eveningId, voter, category, nominee, '2026-01-01', '2026-01-01'],
);

describe('club evening titles and yearly awards', () => {
  it('gives the title to the most voted player of an evening whose voting is closed, ties share it', async () => {
    const db = await setup();
    await evening(db, 'e1', '2026-03-06T17:00:00Z');
    await vote(db, 'e1', 'v1', 'a'); await vote(db, 'e1', 'v2', 'a'); await vote(db, 'e1', 'v3', 'b');
    await evening(db, 'e2', '2026-03-13T17:00:00Z');
    await vote(db, 'e2', 'v1', 'c'); await vote(db, 'e2', 'v2', 'd');
    const titles = await loadEveningTitles(db, new Date('2026-06-01T00:00:00Z').getTime());
    expect(titles.filter((item) => item.evening_id === 'e1').map((item) => item.player_id)).toEqual(['a']);
    expect(titles.filter((item) => item.evening_id === 'e2').map((item) => item.player_id).sort()).toEqual(['c', 'd']);
  });

  it('does not count an evening whose voting is still open, nor the retired role categories', async () => {
    const db = await setup();
    await evening(db, 'open', '2026-05-30T17:00:00Z');
    await vote(db, 'open', 'v1', 'a');
    await evening(db, 'old', '2026-03-06T17:00:00Z');
    await vote(db, 'old', 'v1', 'b', 'sympathy');
    await vote(db, 'old', 'v2', 'b', 'best_red');
    expect(await loadEveningTitles(db, new Date('2026-06-01T00:00:00Z').getTime())).toEqual([]);
  });

  it('counts titles per calendar year and starts again every January', async () => {
    const db = await setup();
    await evening(db, 'y25', '2025-12-26T17:00:00Z'); await vote(db, 'y25', 'v1', 'a');
    await evening(db, 'y26', '2026-01-09T17:00:00Z'); await vote(db, 'y26', 'v1', 'a');
    const years = await loadPlayerEveningTitles(db, 'a', new Date('2026-03-01T00:00:00Z').getTime());
    expect(years).toEqual([{ year: 2026, count: 1 }, { year: 2025, count: 1 }]);
    expect(moscowYear('2025-12-31T22:00:00Z')).toBe(2026);
  });

  it('awards «Игрок года» for closed years only, and takes it back when the count changes', async () => {
    const db = await setup();
    for (const [index, winner] of ['a', 'a', 'b'].entries()) {
      const id = `p${index}`;
      await evening(db, id, `2025-0${index + 3}-07T17:00:00Z`);
      await vote(db, id, 'v1', winner);
    }
    await evening(db, 'now', '2026-02-06T17:00:00Z'); await vote(db, 'now', 'v1', 'a');
    const now = new Date('2026-06-01T00:00:00Z').getTime();
    await syncClubYearAwards(db, 'a', now);
    await syncClubYearAwards(db, 'b', now);
    const awards = await db.all<any>("SELECT player_id, title, place_result FROM player_verified_awards WHERE source_key LIKE 'club-year:%' ORDER BY player_id");
    expect(awards).toEqual([
      { player_id: 'a', title: 'Игрок года 2025', place_result: '1 место' },
      { player_id: 'b', title: 'Игрок года 2025', place_result: '2 место' },
    ]);
    // a recounted vote: b is no longer on the podium
    await db.run("DELETE FROM evening_player_votes WHERE nominee_player_id = 'b'");
    await syncClubYearAwards(db, 'b', now);
    expect(await db.all<any>("SELECT 1 FROM player_verified_awards WHERE player_id = 'b' AND source_key LIKE 'club-year:%'")).toEqual([]);
  });

  it('ranks equal counts on the same place and stops after the third place', () => {
    const titles = ['a', 'b', 'c', 'd', 'e'].flatMap((player, index) => Array.from({ length: index < 2 ? 3 : index < 4 ? 2 : 1 }, (_, n) => ({ evening_id: `${player}${n}`, year: 2025, player_id: player, votes: 1 })));
    expect(buildYearPodium(titles, 2025)).toEqual([
      { player_id: 'a', place: 1, titles: 3 }, { player_id: 'b', place: 1, titles: 3 },
      { player_id: 'c', place: 3, titles: 2 }, { player_id: 'd', place: 3, titles: 2 },
    ]);
  });
});
