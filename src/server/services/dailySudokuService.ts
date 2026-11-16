import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureDailySudokuSchema } from '../../db/ensureDailySudokuSchema.ts';
import { DAILY_SUDOKU_MAX_MISTAKES, DAILY_SUDOKU_REWARD, SUDOKU_WEEK, formatSudokuTime, sudokuWeekday, type DailySudokuState, type SudokuLevel } from '../../shared/dailySudoku.ts';
import { dailyWordDay } from './dailyWordService.ts';
import { generateSudoku } from './sudokuGenerator.ts';
import { mutateTokenBalance } from './tokenLedgerService.ts';

/** Daily sudoku (owner, 2026-11-16): one grid per Moscow day for the whole club, harder towards the weekend, 3 mistakes lose, 200 tokens for a win. */
export class DailySudokuError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const nextDay = (day: string) => new Date(new Date(`${day}T00:00:00+03:00`).getTime() + 86400000).toISOString();
const previousDay = (day: string) => dailyWordDay(new Date(new Date(`${day}T00:00:00+03:00`).getTime() - 86400000));
type Puzzle = { day: string; level: SudokuLevel; puzzle: string; solution: string; reward: number };
type Move = { request_id: string; cell: number; digit: number; ok: boolean };
type Session = { board: string; mistakes: number; status: DailySudokuState['status']; moves_json: string; started_at: string; finished_at: string | null; reward_earned: number };
const secondsBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));

async function puzzleOf(db: DatabaseWrapper, now: Date): Promise<Puzzle> {
  const day = dailyWordDay(now);
  return db.transaction(async tx => {
    const existing = await tx.get<Puzzle>('SELECT * FROM daily_sudoku_puzzles WHERE day=?', [day]);
    if (existing) return existing;
    const { level, givens } = SUDOKU_WEEK[sudokuWeekday(day)];
    const { puzzle, solution } = generateSudoku(givens);
    await tx.run('INSERT INTO daily_sudoku_puzzles (day,level,puzzle,solution,reward,created_at) VALUES (?,?,?,?,?,?)', [day, level, puzzle, solution, DAILY_SUDOKU_REWARD, now.toISOString()]);
    return { day, level, puzzle, solution, reward: DAILY_SUDOKU_REWARD };
  });
}

export async function loadDailySudoku(db: DatabaseWrapper, playerId: string, now = new Date()): Promise<DailySudokuState> {
  await ensureDailySudokuSchema(db);
  const p = await puzzleOf(db, now);
  const player = await db.get<{ tokens: number }>('SELECT tokens FROM players WHERE id=?', [playerId]);
  if (!player) throw new DailySudokuError(404, 'Игрок не найден');
  const session = await db.get<Session>('SELECT * FROM daily_sudoku_sessions WHERE day=? AND player_id=?', [p.day, playerId]);
  const finished = session?.status === 'won' || session?.status === 'lost';
  const all = await db.all<{ day: string; status: string }>('SELECT day,status FROM daily_sudoku_sessions WHERE player_id=? AND day<=? ORDER BY day', [playerId, p.day]);
  let best = 0, run = 0, last = '';
  for (const row of all) { run = row.status === 'won' ? (last === previousDay(row.day) ? run + 1 : 1) : 0; best = Math.max(best, run); last = row.day; }
  // An unfinished current day does not break yesterday's streak.
  const wins = new Set(all.filter(row => row.status === 'won').map(row => row.day));
  let streak = 0, cursor = finished ? p.day : previousDay(p.day);
  while (wins.has(cursor)) { streak++; cursor = previousDay(cursor); }
  const counts = await db.get<{ played: number; solved: number }>(`SELECT COUNT(*) played, COALESCE(SUM(status='won'),0) solved FROM daily_sudoku_sessions WHERE day=?`, [p.day]);
  // The table of the day opens after one's own game: the fastest solvers first, then fewer mistakes; unsolved last.
  const results = finished ? await db.all<{ nickname: string; status: string; started_at: string; finished_at: string | null; mistakes: number }>(
    `SELECT p.nickname,s.status,s.started_at,s.finished_at,s.mistakes FROM daily_sudoku_sessions s JOIN players p ON p.id=s.player_id
     WHERE s.day=? AND s.status IN ('won','lost')
     ORDER BY CASE s.status WHEN 'won' THEN 0 ELSE 1 END, (julianday(s.finished_at)-julianday(s.started_at)), s.mistakes, s.finished_at LIMIT 100`, [p.day]) : [];
  return {
    day: p.day, next_at: nextDay(p.day), level: p.level, reward: p.reward, max_mistakes: DAILY_SUDOKU_MAX_MISTAKES,
    status: session?.status || 'new',
    givens: session ? p.puzzle : '', board: session?.board || '',
    solution: finished ? p.solution : null,
    mistakes: session?.mistakes || 0, started_at: session?.started_at || null,
    seconds: session?.finished_at ? secondsBetween(session.started_at, session.finished_at) : null,
    reward_earned: session?.reward_earned || 0, token_balance: Number(player.tokens),
    played: Number(counts?.played || 0), solved: Number(counts?.solved || 0), streak, best_streak: best,
    results: results.map(row => ({ nickname: row.nickname, won: row.status === 'won', seconds: row.status === 'won' && row.finished_at ? secondsBetween(row.started_at, row.finished_at) : null, mistakes: Number(row.mistakes) })),
  };
}

/** «Начать»: the grid opens and the time starts. Repeating it changes nothing. */
export async function startDailySudoku(db: DatabaseWrapper, playerId: string, input: { day?: unknown }, now = new Date()) {
  await ensureDailySudokuSchema(db);
  if (input.day !== dailyWordDay(now)) throw new DailySudokuError(409, 'Начался новый день. Доступно новое судоку.');
  const p = await puzzleOf(db, now);
  const player = await db.get('SELECT id FROM players WHERE id=?', [playerId]);
  if (!player) throw new DailySudokuError(404, 'Игрок не найден');
  await db.run(`INSERT INTO daily_sudoku_sessions (day,player_id,board,mistakes,status,moves_json,started_at,updated_at) VALUES (?,?,?,0,'playing','[]',?,?) ON CONFLICT(day,player_id) DO NOTHING`, [p.day, playerId, p.puzzle, now.toISOString(), now.toISOString()]);
  return loadDailySudoku(db, playerId, now);
}

/** One digit in one cell. A right digit stays, a wrong one is a mistake; the third mistake ends the game. */
export async function moveDailySudoku(db: DatabaseWrapper, playerId: string, input: { day?: unknown; cell?: unknown; digit?: unknown; request_id?: unknown }, now = new Date()) {
  await ensureDailySudokuSchema(db);
  if (input.day !== dailyWordDay(now)) throw new DailySudokuError(409, 'Начался новый день. Доступно новое судоку.');
  const cell = Number(input.cell), digit = Number(input.digit);
  if (!Number.isInteger(cell) || cell < 0 || cell > 80 || !Number.isInteger(digit) || digit < 1 || digit > 9 || typeof input.request_id !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(input.request_id)) throw new DailySudokuError(400, 'Не удалось принять ход');
  const p = await puzzleOf(db, now);
  await db.transaction(async tx => {
    const session = await tx.get<Session>('SELECT * FROM daily_sudoku_sessions WHERE day=? AND player_id=?', [p.day, playerId]);
    if (!session) throw new DailySudokuError(409, 'Сначала нажмите «Начать»');
    const moves: Move[] = JSON.parse(session.moves_json);
    const repeat = moves.find(move => move.request_id === input.request_id);
    if (repeat) { if (repeat.cell !== cell || repeat.digit !== digit) throw new DailySudokuError(409, 'Этот ход уже сохранён с другой цифрой'); return; }
    if (session.status !== 'playing') throw new DailySudokuError(409, 'Игра на сегодня завершена');
    if (session.board[cell] !== '0') throw new DailySudokuError(409, 'Эта клетка уже заполнена');
    const ok = p.solution[cell] === String(digit);
    const board = ok ? session.board.slice(0, cell) + digit + session.board.slice(cell + 1) : session.board;
    const mistakes = session.mistakes + (ok ? 0 : 1);
    const status = board === p.solution ? 'won' : mistakes >= DAILY_SUDOKU_MAX_MISTAKES ? 'lost' : 'playing';
    const earned = status === 'won' ? p.reward : 0;
    moves.push({ request_id: input.request_id as string, cell, digit, ok });
    await tx.run('UPDATE daily_sudoku_sessions SET board=?,mistakes=?,status=?,moves_json=?,finished_at=?,reward_earned=?,updated_at=? WHERE day=? AND player_id=?',
      [board, mistakes, status, JSON.stringify(moves), status === 'playing' ? null : now.toISOString(), earned, now.toISOString(), p.day, playerId]);
    if (earned) await mutateTokenBalance(tx, { playerId, delta: earned, debitPolicy: 'allow_negative', reasonType: 'daily_sudoku_win', description: `Судоку ${p.day}: решено`, sourceType: 'daily_sudoku', sourceId: p.day, idempotencyKey: `daily-sudoku:${p.day}:${playerId}`, actorType: 'system', metadata: { day: p.day } });
  });
  const state = await loadDailySudoku(db, playerId, now);
  const last = (JSON.parse((await db.get<{ moves_json: string }>('SELECT moves_json FROM daily_sudoku_sessions WHERE day=? AND player_id=?', [p.day, playerId]))!.moves_json) as Move[]).find(move => move.request_id === input.request_id);
  return { ...state, last_move: last ? { cell: last.cell, digit: last.digit, ok: last.ok } : null };
}

/** Yesterday's line for the morning post in «Новости»: who solved it fastest. */
export async function dailySudokuYesterdayLine(db: DatabaseWrapper, day: string): Promise<string | null> {
  await ensureDailySudokuSchema(db);
  const yesterday = previousDay(day);
  const stats = await db.get<{ total: number; won: number }>(`SELECT COUNT(*) total, COALESCE(SUM(status='won'),0) won FROM daily_sudoku_sessions WHERE day=? AND status IN ('won','lost')`, [yesterday]);
  if (!Number(stats?.total)) return null;
  const best = await db.get<{ nickname: string; started_at: string; finished_at: string }>(`SELECT p.nickname,s.started_at,s.finished_at FROM daily_sudoku_sessions s JOIN players p ON p.id=s.player_id WHERE s.day=? AND s.status='won' ORDER BY (julianday(s.finished_at)-julianday(s.started_at)), s.mistakes, s.finished_at LIMIT 1`, [yesterday]);
  return best
    ? `Судоку вчера решили ${Number(stats!.won)} из ${Number(stats!.total)}, быстрее всех — ${best.nickname} (${formatSudokuTime(secondsBetween(best.started_at, best.finished_at))}).`
    : `Судоку вчера не решил никто из ${Number(stats!.total)}.`;
}
