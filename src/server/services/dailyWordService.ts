import { randomInt } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureDailyWordSchema } from '../../db/ensureDailyWordSchema.ts';
import { DAILY_WORD_ANSWERS } from '../data/dailyWordAnswers.ts';
import { DAILY_WORD_GUESSES } from '../data/dailyWordGuesses.ts';
import { DAILY_WORD_TRIES, DAILY_WORD_REWARD, DAILY_WORD_MIN, DAILY_WORD_MAX, markDailyWord, normalizeDailyWord, type DailyWordState } from '../../shared/dailyWord.ts';
import { mutateTokenBalance } from './tokenLedgerService.ts';

export class DailyWordError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const dailyWordDay = (now = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const nextDay = (day: string) => new Date(new Date(`${day}T00:00:00+03:00`).getTime() + 86400000).toISOString();
const previousDay = (day: string) => dailyWordDay(new Date(new Date(`${day}T00:00:00+03:00`).getTime() - 86400000));
const dictionary = new Set<string>([...DAILY_WORD_GUESSES, ...DAILY_WORD_ANSWERS]);
type Puzzle = { day: string; answer: string; author_player_id: string | null; reward: number };
type SavedGuess = { word: string; request_id: string };
type Session = { guesses_json: string; status: DailyWordState['status']; reward_earned: number };
const guessesOf = (session: Session | null): SavedGuess[] => session ? JSON.parse(session.guesses_json) : [];
async function puzzle(db: DatabaseWrapper, now: Date): Promise<Puzzle> {
  const day = dailyWordDay(now);
  return db.transaction(async tx => {
    const existing = await tx.get<Puzzle>('SELECT * FROM daily_word_puzzles WHERE day=?', [day]);
    if (existing) return existing;
    const recent = await tx.all<{answer: string}>('SELECT answer FROM daily_word_puzzles WHERE day < ? ORDER BY day DESC LIMIT 90', [day]);
    const excluded = new Set(recent.map(row => row.answer));
    const choices = DAILY_WORD_ANSWERS.filter(word => !excluded.has(word));
    const answer = choices[randomInt(choices.length)];
    await tx.run('INSERT INTO daily_word_puzzles (day,answer,author_player_id,reward,created_at) VALUES (?,?,NULL,?,?)', [day,answer,DAILY_WORD_REWARD,now.toISOString()]);
    return { day, answer, author_player_id: null, reward: DAILY_WORD_REWARD };
  });
}
export async function loadDailyWord(db: DatabaseWrapper, playerId: string, now = new Date()): Promise<DailyWordState> {
  await ensureDailyWordSchema(db);
  const p = await puzzle(db, now);
  const player = await db.get<{tokens: number}>('SELECT tokens FROM players WHERE id=?', [playerId]);
  if (!player) throw new DailyWordError(404, 'Игрок не найден');
  const session = await db.get<Session>('SELECT * FROM daily_word_sessions WHERE day=? AND player_id=?', [p.day,playerId]);
  const all = await db.all<{ day: string; status: string }>('SELECT day,status FROM daily_word_sessions WHERE player_id=? AND day<=? ORDER BY day', [playerId,p.day]);
  let best = 0, run = 0, last = '';
  for (const row of all) { run = row.status === 'won' ? (last === previousDay(row.day) ? run + 1 : 1) : 0; best = Math.max(best,run); last=row.day; }
  // An unfinished/new current day does not break yesterday's winning streak.
  let streak = 0;
  let cursor = session?.status === 'won' || session?.status === 'lost' ? p.day : previousDay(p.day);
  const wins = new Set(all.filter(row => row.status==='won').map(row => row.day));
  while (wins.has(cursor)) { streak++; cursor=previousDay(cursor); }
  const counts = await db.get<{played: number; solved: number}>(`SELECT COUNT(*) played, COALESCE(SUM(status='won'),0) solved FROM daily_word_sessions WHERE day=?`, [p.day]);
  const results = session?.status === 'won' || session?.status === 'lost' ? await db.all<{nickname:string;status:string;guesses_json:string}>(`SELECT p.nickname,s.status,s.guesses_json FROM daily_word_sessions s JOIN players p ON p.id=s.player_id WHERE s.day=? AND s.status IN ('won','lost') AND p.id<>COALESCE(?, '') ORDER BY CASE s.status WHEN 'won' THEN 0 ELSE 1 END, json_array_length(s.guesses_json),s.updated_at LIMIT 100`, [p.day,p.author_player_id]) : [];
  return { day:p.day, next_at:nextDay(p.day), length:p.answer.length, max_tries:DAILY_WORD_TRIES, reward:p.reward,
    status:session?.status || 'new', guesses:guessesOf(session).map(g=>({word:g.word, marks:markDailyWord(p.answer,g.word)})),
    reward_earned:session?.reward_earned || 0, reward_eligible:p.author_player_id !== playerId, token_balance:Number(player.tokens),
    played:Number(counts?.played || 0), solved:Number(counts?.solved || 0), streak,best_streak:best,
    results:results.map(row=>({nickname:row.nickname,won:row.status==='won',attempts:JSON.parse(row.guesses_json).length})), can_manage:false };
}
export async function guessDailyWord(db: DatabaseWrapper, playerId: string, input: { day?: unknown; word?: unknown; request_id?: unknown; expected_count?: unknown }, now = new Date()) {
  await ensureDailyWordSchema(db);
  if (input.day !== dailyWordDay(now)) throw new DailyWordError(409, 'Начался новый день. Доступно новое слово.');
  if (typeof input.word !== 'string' || input.word.length > 30 || typeof input.request_id !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(input.request_id)) throw new DailyWordError(400, 'Не удалось принять попытку');
  const word = normalizeDailyWord(input.word);
  const p = await puzzle(db, now);
  await db.transaction(async tx=>{
    const player = await tx.get('SELECT id FROM players WHERE id=?', [playerId]);
    if (!player) throw new DailyWordError(404, 'Игрок не найден');
    const session = await tx.get<Session>('SELECT * FROM daily_word_sessions WHERE day=? AND player_id=?', [p.day,playerId]);
    const guesses = guessesOf(session);
    const duplicate = guesses.find(g=>g.request_id===input.request_id);
    if (duplicate) { if (duplicate.word!==word) throw new DailyWordError(409,'Эта попытка уже сохранена с другим словом'); return; }
    if (session?.status==='won' || session?.status==='lost') throw new DailyWordError(409,'Партия на сегодня завершена');
    if (input.expected_count !== guesses.length) throw new DailyWordError(409,'Партия изменилась на другом устройстве. Данные обновлены.');
    if (!/^[а-я]+$/.test(word) || word.length!==p.answer.length) throw new DailyWordError(400,`Нужно слово из ${p.answer.length} букв`);
    if (word!==p.answer && !dictionary.has(word)) throw new DailyWordError(400,'Слова нет в словаре. Нужны существительные в начальной форме.');
    if (guesses.some(g=>g.word===word)) throw new DailyWordError(400,'Это слово уже было');
    guesses.push({word,request_id:input.request_id as string});
    const status=word===p.answer?'won':guesses.length>=DAILY_WORD_TRIES?'lost':'playing';
    const earned=status==='won' && p.author_player_id!==playerId ? p.reward : 0;
    await tx.run(`INSERT INTO daily_word_sessions (day,player_id,guesses_json,status,reward_earned,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(day,player_id) DO UPDATE SET guesses_json=excluded.guesses_json,status=excluded.status,reward_earned=excluded.reward_earned,updated_at=excluded.updated_at`, [p.day,playerId,JSON.stringify(guesses),status,earned,now.toISOString()]);
    if (earned) await mutateTokenBalance(tx,{playerId,delta:earned,debitPolicy:'allow_negative',reasonType:'daily_word_win',description:`Слово дня ${p.day}: победа`,sourceType:'daily_word',sourceId:p.day,idempotencyKey:`daily-word:${p.day}:${playerId}`,actorType:'system',metadata:{day:p.day}});
  });
  return loadDailyWord(db,playerId,now);
}
export async function revealDailyWord(db: DatabaseWrapper, playerId: string, day: string, now = new Date()) {
  await ensureDailyWordSchema(db);
  if (day!==dailyWordDay(now)) throw new DailyWordError(409,'Доступно новое слово');
  const s=await db.get<Session>('SELECT * FROM daily_word_sessions WHERE day=? AND player_id=?',[day,playerId]);
  if (!s || !['won','lost'].includes(s.status)) throw new DailyWordError(403,'Ответ доступен после завершения партии');
  const p=await db.get<Puzzle>('SELECT * FROM daily_word_puzzles WHERE day=?',[day]);
  return {answer:p!.answer};
}
export async function scheduleDailyWord(db: DatabaseWrapper, authorId: string, day: string, value: string, now = new Date()) {
  await ensureDailyWordSchema(db);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(`${day}T00:00:00+03:00`)) || dailyWordDay(new Date(`${day}T00:00:00+03:00`))!==day || day<=dailyWordDay(now)) throw new DailyWordError(400,'Можно назначить слово только на будущую дату');
  const answer=normalizeDailyWord(value);
  if (!/^[а-я]+$/.test(answer) || answer.length<DAILY_WORD_MIN || answer.length>DAILY_WORD_MAX || !dictionary.has(answer)) throw new DailyWordError(400,'Нужно существительное из словаря длиной от 4 до 8 букв');
  await db.transaction(async tx=>{await tx.run(`INSERT INTO daily_word_puzzles (day,answer,author_player_id,reward,created_at) VALUES (?,?,?,?,?) ON CONFLICT(day) DO UPDATE SET answer=excluded.answer,author_player_id=excluded.author_player_id`,[day,answer,authorId,DAILY_WORD_REWARD,now.toISOString()]);});
}
