import { Router } from 'express';
import { ensureSplitVoteProgressSchema } from '../../db/ensureSplitVoteProgressSchema.ts';
import { correctSplitVote, isCorrectSplitVoteAssignment, type SplitVoteScenario } from '../../lib/splitVoteTraining.ts';
import { getPlayerSessionId } from '../auth.ts';

const router = Router();
type Level = 'basic' | 'advanced' | 'interactive';
const LEVELS: Level[] = ['basic', 'advanced', 'interactive'];

const validScenario = (value: unknown, level: Level): value is SplitVoteScenario => {
  if (!value || typeof value !== 'object') return false;
  const scenario = value as SplitVoteScenario;
  const candidates = scenario.candidates;
  const pair = scenario.pair;
  return Array.isArray(candidates) && candidates.length >= 2 && candidates.length <= 10 &&
    candidates.every((seat) => Number.isInteger(seat) && seat >= 1 && seat <= 10) &&
    new Set(candidates).size === candidates.length &&
    Array.isArray(pair) && pair.length === 2 && pair.every((seat) => candidates.includes(seat)) && pair[0] < pair[1] &&
    Number.isInteger(scenario.seat) && scenario.seat >= 1 && scenario.seat <= 10 &&
    (level !== 'basic' || (pair[0] === 1 && candidates.length <= 4)) &&
    (level !== 'advanced' || pair[0] !== 1);
};

router.get('/split-vote-progress', async (req, res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return res.status(401).json({ error: 'Войдите в кабинет игрока, чтобы сохранить прогресс.' });
  try {
    await ensureSplitVoteProgressSchema(req.db);
    const rows = await req.db.all('SELECT level FROM player_split_vote_progress WHERE player_id = ?', [playerId]);
    res.json({ passed: rows.map((row: { level: Level }) => row.level) });
  } catch (error) {
    console.error('[SPLIT_VOTE] Failed to load progress:', error);
    res.status(500).json({ error: 'Не удалось загрузить прогресс.' });
  }
});

router.post('/split-vote-progress', async (req, res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return res.status(401).json({ error: 'Войдите в кабинет игрока, чтобы сохранить прогресс.' });
  const level = req.body?.level as Level;
  const answers = req.body?.answers;
  if (!LEVELS.includes(level) || !Array.isArray(answers) || answers.length !== 5 ||
    new Set(answers.map((entry: { scenario?: unknown }) => JSON.stringify(entry?.scenario))).size !== 5 ||
    !answers.every((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return false;
      const { scenario, answer } = entry as { scenario: unknown; answer: unknown };
      if (!validScenario(scenario, level)) return false;
      return level === 'interactive'
        ? answer !== null && typeof answer === 'object' && !Array.isArray(answer) &&
          Object.values(answer).every((seats) => Array.isArray(seats) && seats.every((seat) => Number.isInteger(seat) && seat >= 1 && seat <= 10)) &&
          isCorrectSplitVoteAssignment(scenario, answer as Record<number, number[]>)
        : answer === correctSplitVote(scenario);
    })) return res.status(400).json({ error: 'Экзамен не сдан: проверьте все пять ответов.' });
  try {
    await ensureSplitVoteProgressSchema(req.db);
    if (level !== 'basic') {
      const prerequisite = LEVELS[LEVELS.indexOf(level) - 1];
      const prior = await req.db.get('SELECT 1 AS passed FROM player_split_vote_progress WHERE player_id = ? AND level = ?', [playerId, prerequisite]);
      if (!prior) return res.status(403).json({ error: 'Сначала сдайте предыдущий экзамен.' });
    }
    await req.db.run('INSERT OR IGNORE INTO player_split_vote_progress (player_id, level) VALUES (?, ?)', [playerId, level]);
    const rows = await req.db.all('SELECT level FROM player_split_vote_progress WHERE player_id = ?', [playerId]);
    res.json({ passed: rows.map((row: { level: Level }) => row.level) });
  } catch (error) {
    console.error('[SPLIT_VOTE] Failed to save progress:', error);
    res.status(500).json({ error: 'Не удалось сохранить прогресс.' });
  }
});

export default router;
