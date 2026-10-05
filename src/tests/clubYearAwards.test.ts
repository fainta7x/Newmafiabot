import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { buildAwards } from '../server/services/playerEveningSummaryService.ts';
import { buildYearPodium, loadEveningTitles, loadEveningWinTitles, loadPlayerEveningTitles, moscowYear, pickEveningWinners, syncClubEveningTrophies, syncClubYearAwards } from '../server/services/clubYearAwardsService.ts';

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

  it('awards «MVP года» (the vote) for closed years only, and takes it back when the count changes', async () => {
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
      { player_id: 'a', title: 'MVP года 2025', place_result: '1 место' },
      { player_id: 'b', title: 'MVP года 2025', place_result: '2 место' },
    ]);
    // a recounted vote: b is no longer on the podium
    await db.run("DELETE FROM evening_player_votes WHERE nominee_player_id = 'b'");
    await syncClubYearAwards(db, 'b', now);
    expect(await db.all<any>("SELECT 1 FROM player_verified_awards WHERE player_id = 'b' AND source_key LIKE 'club-year:%'")).toEqual([]);
  });

  it('ranks equal counts on the same place and stops after the third place', () => {
    const titles = ['a', 'b', 'c', 'd', 'e'].flatMap((player, index) => Array.from({ length: index < 2 ? 3 : index < 4 ? 2 : 1 }, (_, n) => ({ evening_id: `${player}${n}`, year: 2025, player_id: player, votes: 1 })));
    expect(buildYearPodium(titles, 2025).map((row) => ({ player_id: row.player_id, place: row.place, titles: row.titles }))).toEqual([
      { player_id: 'a', place: 1, titles: 3 }, { player_id: 'b', place: 1, titles: 3 },
      { player_id: 'c', place: 3, titles: 2 }, { player_id: 'd', place: 3, titles: 2 },
    ]);
  });

  it('names every tied winner of the evening summary, and only after the voting is closed', async () => {
    const db = await setup();
    await evening(db, 'closed', '2026-03-06T17:00:00Z');
    await vote(db, 'closed', 'v1', 'a'); await vote(db, 'closed', 'v2', 'b'); await vote(db, 'closed', 'v3', 'a'); await vote(db, 'closed', 'a', 'b');
    const awards = await buildAwards(db, 'closed', new Map(), true);
    expect(awards.map((award: any) => award.player_id).sort()).toEqual(['a', 'b']);
    expect(awards.every((award: any) => award.votes === 2 && award.label === 'MVP вечера')).toBe(true);

    const justNow = new Date(Date.now() - 3_600_000).toISOString();
    await evening(db, 'open', justNow);
    await vote(db, 'open', 'v1', 'a');
    expect(await buildAwards(db, 'open', new Map(), true)).toEqual([]);
  });
});

describe('«Игрок вечера» by wins and the evening trophies (owner, 2026-10-05)', () => {
  const game = (db: DatabaseWrapper, eveningId: string, number: number, winner: 'red' | 'black', results: Array<[string, 'citizen' | 'mafia']>) => db.run(
    `INSERT INTO games (evening_id, global_game_number, game_date, winner_team, winner_label, judge_name, protocol_text, slots_json, created_at)
     VALUES (?, ?, '2026-03-06', ?, ?, 'Судья', ?, '[]', '2026-03-06T18:00:00Z')`,
    [eveningId, number, winner, winner, JSON.stringify({ kind: 'club_evening_protocol', protocol: { status: 'completed', winner_team: winner }, player_results: results.map(([player_id, role], index) => ({ player_id, role, display_name: player_id.toUpperCase(), seat_number: index + 1 })) })],
  );

  it('picks the player with the most wins, then the better win rate, then more games; equal players share it', () => {
    const won = (id: string) => ({ player_id: id, won: true });
    const lost = (id: string) => ({ player_id: id, won: false });
    expect(pickEveningWinners([{ players: [won('a'), won('b'), lost('c')] }, { players: [won('a'), lost('b'), lost('c')] }]).map((row) => row.player_id)).toEqual(['a']);
    // equal wins: b played one game fewer, so the better win rate wins
    expect(pickEveningWinners([{ players: [won('a'), won('b')] }, { players: [lost('a')] }]).map((row) => row.player_id)).toEqual(['b']);
    // fully equal: shared
    expect(pickEveningWinners([{ players: [won('a'), won('b')] }]).map((row) => row.player_id).sort()).toEqual(['a', 'b']);
    // nobody has a win
    expect(pickEveningWinners([{ players: [lost('a'), lost('b')] }])).toEqual([]);
  });

  it('turns both titles into trophies in the showcase and takes them back when the data changes', async () => {
    const db = await setup();
    await evening(db, 'w1', '2026-03-06T17:00:00Z');
    await game(db, 'w1', 1, 'red', [['a', 'citizen'], ['b', 'mafia']]);
    await game(db, 'w1', 2, 'red', [['a', 'citizen'], ['b', 'mafia']]);
    await vote(db, 'w1', 'v1', 'b'); await vote(db, 'w1', 'v2', 'b');
    const now = new Date('2026-06-01T00:00:00Z').getTime();
    expect((await loadEveningWinTitles(db)).map((item) => `${item.player_id}:${item.wins}`)).toEqual(['a:2']);

    await syncClubEveningTrophies(db, 'a', now); await syncClubEveningTrophies(db, 'b', now);
    const trophies = async (playerId: string) => (await db.all<any>("SELECT title, kind, tournament_name FROM player_verified_awards WHERE player_id = ? AND source_key LIKE 'club-evening-%'", [playerId]));
    expect(await trophies('a')).toEqual([{ title: 'Игрок вечера', kind: 'trophy', tournament_name: 'Вечер' }]);
    expect(await trophies('b')).toEqual([{ title: 'MVP вечера', kind: 'trophy', tournament_name: 'Вечер' }]);

    // synced twice: no duplicates; a recounted vote moves the MVP trophy
    await syncClubEveningTrophies(db, 'a', now);
    expect(await trophies('a')).toHaveLength(1);
    await db.run("DELETE FROM evening_player_votes WHERE evening_id = 'w1'");
    await syncClubEveningTrophies(db, 'b', now);
    expect(await trophies('b')).toEqual([]);
  });
});


describe('yearly rating: the weighted rating and the two yearly titles (owner, 2026-10-05)', () => {
  const titlesOf = (player: string, count: number) => Array.from({ length: count }, (_, index) => ({ evening_id: `${player}${index}`, year: 2026, player_id: player }));

  it('does not let two evenings with two titles beat a regular with ten evenings and seven titles', () => {
    const titles = [...titlesOf('lucky', 2), ...titlesOf('regular', 7)];
    const attendance = new Map([['lucky', 2], ['regular', 10], ['other', 8]]);
    const podium = buildYearPodium(titles, 2026, attendance);
    expect(podium.map((row) => row.player_id)).toEqual(['regular', 'lucky']);
    // the lucky one is pulled toward the club average: his rating is far below his raw 100%
    expect(podium[1].rating).toBeLessThan(0.7);
  });

  it('still lets a newcomer in the podium when he wins a lot, and never ranks someone without a title', () => {
    const titles = [...titlesOf('newcomer', 4), ...titlesOf('regular', 3)];
    const attendance = new Map([['newcomer', 4], ['regular', 14], ['nothing', 14]]);
    const podium = buildYearPodium(titles, 2026, attendance);
    expect(podium.map((row) => row.player_id)).toEqual(['newcomer', 'regular']);
    expect(podium.some((row) => row.player_id === 'nothing')).toBe(false);
  });

  it('gives the two yearly titles from the two kinds of evening titles, each with its own podium', async () => {
    const db = await setup();
    // 2025: x wins every game, y gets every vote
    for (const [index, month] of ['03', '04', '05'].entries()) {
      const id = `y${index}`;
      await evening(db, id, `2025-${month}-07T17:00:00Z`);
      await vote(db, id, 'v1', 'y');
      await db.run(`INSERT INTO games (evening_id, global_game_number, game_date, winner_team, winner_label, judge_name, protocol_text, slots_json, created_at)
        VALUES (?, 1, '2025-03-07', 'red', 'red', 'Судья', ?, '[]', '2025-03-07T18:00:00Z')`,
        [id, JSON.stringify({ kind: 'club_evening_protocol', protocol: { status: 'completed', winner_team: 'red' }, player_results: [{ player_id: 'a', role: 'citizen', display_name: 'A', seat_number: 1 }, { player_id: 'b', role: 'mafia', display_name: 'B', seat_number: 2 }] })]);
      for (const player of ['a', 'b', 'c']) {
        await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,payment_status,created_at,updated_at) VALUES (?,?,?,'going','confirmed','attended','paid','2025-03-01','2025-03-01')`, [`${id}-${player}`, id, player]);
      }
    }
    const now = new Date('2026-06-01T00:00:00Z').getTime();
    await syncClubYearAwards(db, 'a', now); await syncClubYearAwards(db, 'c', now);
    await syncClubYearAwards(db, 'v1', now);
    const awards = async (player: string) => db.all<any>("SELECT title, place_result, description FROM player_verified_awards WHERE player_id = ? AND source_key LIKE 'club-year:%'", [player]);
    expect(await awards('a')).toEqual([{ title: 'Игрок года 2025', place_result: '1 место', description: 'Званий «Игрок вечера»: 3 за 3 вечеров' }]);
    expect(await awards('c')).toEqual([]);
    await db.run("INSERT OR IGNORE INTO players (id, nickname, created_at, updated_at) VALUES ('y', 'Y', '2025-01-01', '2025-01-01')");
    await syncClubYearAwards(db, 'y', now);
    expect((await awards('y')).map((row) => row.title)).toEqual(['MVP года 2025']);
  });
});
