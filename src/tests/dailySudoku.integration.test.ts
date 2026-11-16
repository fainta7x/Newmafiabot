import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import dailySudokuRoutes from '../server/routes/dailySudokuRoutes.ts';
import { loadDailySudoku, moveDailySudoku, startDailySudoku } from '../server/services/dailySudokuService.ts';
import { countSolutions, generateSudoku } from '../server/services/sudokuGenerator.ts';
import { DAILY_SUDOKU_REWARD, SUDOKU_WEEK, dailySudokuShare, sudokuWeekday } from '../shared/dailySudoku.ts';
import { playerPathForSection, parsePlayerRoute, appBackTarget } from '../lib/appNavigation.ts';

// Daily sudoku (owner, 2026-11-16): one grid a day for the club, harder towards Sunday, 3 mistakes lose, 200 tokens, table by time.
const monday = new Date('2026-11-16T09:00:00Z'); // 12:00 Moscow, Monday
const sunday = new Date('2026-11-22T09:00:00Z');
describe('daily sudoku', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => { db = createDatabaseConnection(':memory:'); await db.run("INSERT INTO players(id,nickname,tokens,created_at,updated_at) VALUES ('a','Аня',0,'x','x'),('b','Борис',0,'x','x')"); });
  afterEach(() => db.sqlite.close());
  let n = 0;
  const move = (player: string, cell: number, digit: number, at = monday) => moveDailySudoku(db, player, { day: '2026-11-16', cell, digit, request_id: `move-${player}-${++n}` }, at);
  const solution = async () => (await db.get<{ solution: string }>("SELECT solution FROM daily_sudoku_puzzles WHERE day='2026-11-16'"))!.solution;
  const solveAll = async (player: string, at = monday) => { const s = await solution(); const st = await loadDailySudoku(db, player, at); let last; for (let i = 0; i < 81; i++) if (st.board[i] === '0') last = await move(player, i, Number(s[i]), at); return last!; };

  it('generates grids with exactly one solution and the asked number of open cells', () => {
    for (const { givens } of [SUDOKU_WEEK[0], SUDOKU_WEEK[6]]) {
      const { puzzle, solution } = generateSudoku(givens);
      expect([...puzzle].filter(c => c !== '0')).toHaveLength(givens);
      expect(countSolutions([...puzzle].map(Number), 2)).toBe(1);
      for (let i = 0; i < 81; i++) if (puzzle[i] !== '0') expect(puzzle[i]).toBe(solution[i]);
    }
  });

  it('difficulty grows over the week: Monday easiest, Sunday hardest', async () => {
    expect(sudokuWeekday('2026-11-16')).toBe(0);
    expect(sudokuWeekday('2026-11-22')).toBe(6);
    expect(SUDOKU_WEEK.map(d => d.givens)).toEqual([...SUDOKU_WEEK.map(d => d.givens)].sort((x, y) => y - x));
    expect((await loadDailySudoku(db, 'a', monday)).level).toBe('easy');
    expect((await loadDailySudoku(db, 'a', sunday)).level).toBe('expert');
  });

  it('hides the grid before «Начать» and the solution until the game ends; the same grid for everybody', async () => {
    const before = await loadDailySudoku(db, 'a', monday);
    expect(before).toMatchObject({ status: 'new', givens: '', board: '', solution: null, reward: DAILY_SUDOKU_REWARD, max_mistakes: 3 });
    const a = await startDailySudoku(db, 'a', { day: '2026-11-16' }, monday);
    const b = await startDailySudoku(db, 'b', { day: '2026-11-16' }, monday);
    expect(a.status).toBe('playing'); expect(a.givens).toBe(b.givens); expect(a.solution).toBeNull();
    expect(JSON.stringify(a)).not.toContain(await solution());
    await expect(move('a', 0, 1, new Date('2026-11-16T21:30:00Z'))).rejects.toThrow('новый день');
  });

  it('a right digit stays, a wrong one is a mistake, the third mistake loses without tokens', async () => {
    await startDailySudoku(db, 'a', { day: '2026-11-16' }, monday);
    const s = await solution(); const st = await loadDailySudoku(db, 'a', monday);
    const empty = [...st.board].map((c, i) => c === '0' ? i : -1).filter(i => i >= 0);
    const right = await move('a', empty[0], Number(s[empty[0]]));
    expect(right.last_move).toMatchObject({ ok: true }); expect(right.board[empty[0]]).toBe(s[empty[0]]);
    await expect(move('a', empty[0], Number(s[empty[0]]))).rejects.toThrow('уже заполнена');
    const wrongDigit = (i: number) => s[i] === '1' ? 2 : 1;
    expect((await move('a', empty[1], wrongDigit(empty[1]))).mistakes).toBe(1);
    expect((await move('a', empty[1], wrongDigit(empty[1]))).mistakes).toBe(2);
    const lost = await move('a', empty[2], wrongDigit(empty[2]));
    expect(lost).toMatchObject({ status: 'lost', mistakes: 3, reward_earned: 0, token_balance: 0 });
    expect(lost.solution).toBe(s);
    await expect(move('a', empty[3], Number(s[empty[3]]))).rejects.toThrow('завершена');
  });

  it('a solved grid pays 200 tokens once, a repeated request changes nothing, the table is by time', async () => {
    await startDailySudoku(db, 'a', { day: '2026-11-16' }, monday);
    await startDailySudoku(db, 'b', { day: '2026-11-16' }, new Date('2026-11-16T09:10:00Z'));
    expect((await loadDailySudoku(db, 'b', monday)).results).toEqual([]);
    const won = await solveAll('a', new Date('2026-11-16T09:12:05Z'));
    expect(won).toMatchObject({ status: 'won', seconds: 725, reward_earned: 200, token_balance: 200, streak: 1 });
    expect(dailySudokuShare(won)).toContain('Решено за 12:05');
    await solveAll('b', new Date('2026-11-16T09:15:00Z'));
    const table = (await loadDailySudoku(db, 'a', monday)).results;
    expect(table.map(r => [r.nickname, r.seconds])).toEqual([['Борис', 300], ['Аня', 725]]);
    expect((await db.get<{ n: number }>("SELECT COUNT(*) n FROM token_ledger WHERE reason_type='daily_sudoku_win' AND player_id='a'"))?.n).toBe(1);
  });

  it('routes need a player and the page lives at /player/sudoku', async () => {
    const app = express(); app.use(express.json()); app.use((req: any, _res, next) => { req.db = db; next(); }); app.use('/api/player', dailySudokuRoutes);
    expect((await request(app).get('/api/player/daily-sudoku')).status).toBe(401);
    expect(playerPathForSection('sudoku')).toBe('/player/sudoku');
    expect(parsePlayerRoute('/player/sudoku')).toMatchObject({ section: 'sudoku' });
    expect(appBackTarget('/player/sudoku')).toBe('/player/club/games');
  });
});
