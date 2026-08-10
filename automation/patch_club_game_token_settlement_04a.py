from pathlib import Path

ROOT = Path('.')

def write(path: str, content: str):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding='utf-8')


def replace_once(path: str, old: str, new: str):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, got {count}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


def replace_between(path: str, start: str, end: str, new_block: str):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    a = text.find(start)
    if a < 0:
        raise RuntimeError(f'{path}: start marker not found: {start}')
    b = text.find(end, a)
    if b < 0:
        raise RuntimeError(f'{path}: end marker not found: {end}')
    p.write_text(text[:a] + new_block + '\n\n' + text[b:], encoding='utf-8')

migration = r'''CREATE TABLE IF NOT EXISTS club_game_token_settlements (
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('player', 'judge')),
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  target_amount INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  breakdown_json TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (game_id, subject_type, player_id)
);

CREATE INDEX IF NOT EXISTS idx_club_game_token_settlements_player
  ON club_game_token_settlements(player_id, game_id);
'''
write('drizzle/0010_club_game_token_settlements.sql', migration)

service = r'''import type { DatabaseWrapper } from '../../db/index.ts';
import { mutateTokenBalance } from './tokenLedgerService.ts';

export type ClubGameSettlementContext = 'completion' | 'correction' | 'reopen' | 'archive' | 'restore';

export interface ClubGameTokenFormulaInput {
  role: unknown;
  winnerTeam: unknown;
  judgeBonus?: unknown;
  protocolBonus?: unknown;
  bestMovePoints?: unknown;
  ciPoints?: unknown;
  disciplinaryPoints?: unknown;
  regularFouls?: unknown;
  minorTechnicalFouls?: unknown;
  majorTechnicalFouls?: unknown;
  removed?: boolean;
  ppkCulprit?: boolean;
}

export interface ClubGameTokenBreakdown {
  participation: number;
  victory: number;
  additional_points_tenths: number;
  additional_points_tokens: number;
  foul_bonus: number;
  minor_technical_penalty: number;
  major_technical_penalty: number;
  removal_penalty: number;
  ppk_penalty: number;
  uncapped_total: number;
  total: number;
}

interface SettlementRow {
  game_id: number;
  subject_type: 'player' | 'judge';
  player_id: string;
  target_amount: number;
  revision: number;
  breakdown_json: string | null;
  updated_at: string;
}

interface DesiredTarget {
  subjectType: 'player' | 'judge';
  playerId: string;
  amount: number;
  breakdown: ClubGameTokenBreakdown | { judge_reward: number };
}

const normalizeRole = (role: unknown): 'red' | 'black' | null => {
  const value = String(role || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['citizen', 'мирный', 'мирный житель', 'red', 'красный', 'sheriff', 'шериф'].includes(value)) return 'red';
  if (['mafia', 'мафия', 'маф', 'black', 'черный', 'don', 'дон'].includes(value)) return 'black';
  return null;
};

const normalizeWinner = (winner: unknown): 'red' | 'black' | null => {
  const value = String(winner || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['red', 'красные', 'красная', 'город'].includes(value)) return 'red';
  if (['black', 'черные', 'черная', 'мафия'].includes(value)) return 'black';
  return null;
};

const count = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
};

export const decimalPointsToTenths = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const tenths = Math.round(n * 10);
  if (!Number.isSafeInteger(tenths)) throw new Error('Дополнительные баллы выходят за безопасный диапазон');
  return tenths;
};

export const calculateClubGamePlayerTokens = (input: ClubGameTokenFormulaInput): ClubGameTokenBreakdown => {
  const roleTeam = normalizeRole(input.role);
  const winner = normalizeWinner(input.winnerTeam);
  const participation = 100;
  const victory = roleTeam && winner && roleTeam === winner ? 100 : 0;
  const additionalPointsTenths = [
    input.judgeBonus,
    input.protocolBonus,
    input.bestMovePoints,
    input.ciPoints,
    input.disciplinaryPoints,
  ].reduce((sum, value) => sum + decimalPointsToTenths(value), 0);
  const additionalPointsTokens = additionalPointsTenths * 10;
  const fouls = count(input.regularFouls);
  const foulBonus = fouls === 0 ? 15 : fouls === 1 ? 10 : fouls === 2 ? 5 : 0;
  const minorTechnicalPenalty = -30 * count(input.minorTechnicalFouls);
  const majorTechnicalPenalty = -60 * count(input.majorTechnicalFouls);
  const removalPenalty = input.removed ? -100 : 0;
  const ppkPenalty = input.ppkCulprit ? -500 : 0;
  const uncappedTotal = participation + victory + additionalPointsTokens + foulBonus
    + minorTechnicalPenalty + majorTechnicalPenalty + removalPenalty + ppkPenalty;
  if (!Number.isSafeInteger(uncappedTotal)) throw new Error('Расчёт жетонов выходит за безопасный целочисленный диапазон');
  return {
    participation,
    victory,
    additional_points_tenths: additionalPointsTenths,
    additional_points_tokens: additionalPointsTokens,
    foul_bonus: foulBonus,
    minor_technical_penalty: minorTechnicalPenalty,
    major_technical_penalty: majorTechnicalPenalty,
    removal_penalty: removalPenalty,
    ppk_penalty: ppkPenalty,
    uncapped_total: uncappedTotal,
    total: Math.max(-1000, uncappedTotal),
  };
};

const safeJsonParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const calculateBestMovePoints = (seatNumbers: unknown, playerResults: any[]): number => {
  if (!Array.isArray(seatNumbers)) return 0;
  const roles = new Map<number, 'red' | 'black' | null>();
  for (const result of playerResults) roles.set(Number(result?.seat_number), normalizeRole(result?.role));
  let blackCount = 0;
  for (const seat of seatNumbers) if (roles.get(Number(seat)) === 'black') blackCount += 1;
  if (blackCount >= 3) return 0.6;
  if (blackCount === 2) return 0.3;
  if (blackCount === 1) return 0.1;
  return 0;
};

const bestMovePointsForParticipant = (protocol: any, participantId: string, playerResults: any[]): number => {
  const modern = Array.isArray(protocol?.best_moves) ? protocol.best_moves : [];
  const relevant = modern.filter((move: any) => String(move?.participant_id || '') === participantId);
  if (relevant.length) {
    return relevant.reduce((sum: number, move: any) => sum + calculateBestMovePoints(move?.seat_numbers, playerResults), 0);
  }
  if (String(protocol?.best_move_participant_id || '') === participantId) {
    return calculateBestMovePoints(protocol?.best_move_seats, playerResults);
  }
  return 0;
};

const buildDesiredTargets = async (db: DatabaseWrapper, game: any): Promise<Map<string, DesiredTarget>> => {
  const desired = new Map<string, DesiredTarget>();
  if (!game?.evening_id || game.archived_at) return desired;
  const payload = safeJsonParse<any>(game.protocol_text, null);
  if (!payload || payload.kind !== 'club_evening_protocol' || payload.version !== 1) return desired;
  if (payload.protocol?.status !== 'completed') return desired;
  const results = Array.isArray(payload.player_results) ? payload.player_results : [];
  if (results.length !== 10) throw new Error('Для начисления жетонов завершённая клубная игра должна содержать ровно 10 результатов');

  const playerIds = results.map((result: any) => String(result?.player_id || '').trim());
  if (playerIds.some((id: string) => !id) || new Set(playerIds).size !== 10) {
    throw new Error('Для начисления жетонов нужны 10 уникальных UUID игроков');
  }
  const placeholders = playerIds.map(() => '?').join(',');
  const existingPlayers = await db.all<{ id: string }>(`SELECT id FROM players WHERE id IN (${placeholders})`, playerIds);
  if (existingPlayers.length !== 10) throw new Error('Один или несколько UUID игроков завершённой игры отсутствуют в CRM');

  const winnerTeam = payload.protocol?.winner_team;
  const ppkParticipantId = payload.protocol?.end_reason === 'ppk'
    ? String(payload.protocol?.ppk_culprit_participant_id || '')
    : '';

  for (const result of results) {
    const playerId = String(result.player_id);
    const participantId = String(result.participant_id || '');
    const breakdown = calculateClubGamePlayerTokens({
      role: result.role,
      winnerTeam,
      judgeBonus: result.judge_bonus,
      protocolBonus: result.protocol_bonus,
      bestMovePoints: bestMovePointsForParticipant(payload.protocol, participantId, results),
      ciPoints: result.ci_points,
      disciplinaryPoints: result.disciplinary_penalty_points,
      regularFouls: result.regular_fouls,
      minorTechnicalFouls: result.minor_technical_fouls,
      majorTechnicalFouls: result.major_technical_fouls,
      removed: result.exit_type === 'removed',
      ppkCulprit: Boolean(participantId && participantId === ppkParticipantId),
    });
    desired.set(`player:${playerId}`, { subjectType: 'player', playerId, amount: breakdown.total, breakdown });
  }

  if (game.judge_player_id) {
    const judge = await db.get<{ id: string }>('SELECT id FROM players WHERE id = ?', [String(game.judge_player_id)]);
    if (judge) {
      desired.set(`judge:${judge.id}`, {
        subjectType: 'judge',
        playerId: judge.id,
        amount: 100,
        breakdown: { judge_reward: 100 },
      });
    }
  }
  return desired;
};

const rowKey = (subjectType: string, playerId: string) => `${subjectType}:${playerId}`;

export interface ReconcileClubGameSettlementOptions {
  activateIfUntracked?: boolean;
  context: ClubGameSettlementContext;
}

export const reconcileClubGameTokenSettlement = async (
  db: DatabaseWrapper,
  gameId: number,
  options: ReconcileClubGameSettlementOptions,
) => {
  if (!Number.isInteger(gameId) || gameId <= 0) throw new Error('Некорректный ID клубной игры для settlement');
  const game = await db.get<any>('SELECT * FROM games WHERE id = ?', [gameId]);
  if (!game) throw new Error('Клубная игра для settlement не найдена');
  if (!game.evening_id) return { managed: false, mutations: 0 };

  const existingRows = await db.all<SettlementRow>(
    'SELECT * FROM club_game_token_settlements WHERE game_id = ? ORDER BY subject_type, player_id',
    [gameId],
  );
  const managed = existingRows.length > 0;
  if (!managed && !options.activateIfUntracked) return { managed: false, mutations: 0 };

  const desired = await buildDesiredTargets(db, game);
  const current = new Map(existingRows.map((row) => [rowKey(row.subject_type, row.player_id), row]));
  const keys = new Set([...current.keys(), ...desired.keys()]);
  const now = new Date().toISOString();
  let mutations = 0;

  for (const key of [...keys].sort()) {
    const previous = current.get(key);
    const target = desired.get(key);
    const subjectType = (target?.subjectType || previous?.subject_type) as 'player' | 'judge';
    const playerId = target?.playerId || previous?.player_id;
    if (!playerId) continue;
    const previousAmount = Number(previous?.target_amount || 0);
    const nextAmount = Number(target?.amount || 0);
    if (!Number.isSafeInteger(previousAmount) || !Number.isSafeInteger(nextAmount)) throw new Error('Settlement target must be an integer');
    const delta = nextAmount - previousAmount;
    const revision = previous ? Number(previous.revision) + (delta === 0 ? 0 : 1) : (delta === 0 ? 0 : 1);
    const breakdown = target?.breakdown || safeJsonParse(previous?.breakdown_json, null);

    if (delta !== 0) {
      const reasonType = subjectType === 'judge' ? 'club_game_judge' : 'club_game_player';
      const actionWord = previous ? 'корректировка' : 'начисление';
      const description = subjectType === 'judge'
        ? `Игра №${game.global_game_number}: ${actionWord} жетонов судье`
        : `Игра №${game.global_game_number}: ${actionWord} жетонов игроку`;
      await mutateTokenBalance(db, {
        playerId,
        delta,
        reasonType,
        description,
        sourceType: reasonType,
        sourceId: String(gameId),
        idempotencyKey: `club-game:${gameId}:${subjectType}:${playerId}:rev:${revision}`,
        debitPolicy: 'allow_negative',
        actorType: 'system',
        actorId: null,
        metadata: {
          game_id: gameId,
          game_number: Number(game.global_game_number),
          subject_type: subjectType,
          previous_target: previousAmount,
          target: nextAmount,
          delta,
          revision,
          context: options.context,
          breakdown,
        },
      });
      mutations += 1;
    }

    await db.run(
      `INSERT INTO club_game_token_settlements
       (game_id, subject_type, player_id, target_amount, revision, breakdown_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(game_id, subject_type, player_id) DO UPDATE SET
         target_amount = excluded.target_amount,
         revision = excluded.revision,
         breakdown_json = excluded.breakdown_json,
         updated_at = excluded.updated_at`,
      [gameId, subjectType, playerId, nextAmount, revision, breakdown ? JSON.stringify(breakdown) : null, now],
    );
  }

  return { managed: true, mutations };
};
'''
write('src/server/services/clubGameTokenSettlementService.ts', service)

replace_once('src/db/index.ts',
"    '0009_token_ledger.sql',\n",
"    '0009_token_ledger.sql',\n    '0010_club_game_token_settlements.sql',\n")

replace_once('src/server/routes/gamesRoutesBase.ts',
"import { evaluateAchievementsForPlayers } from '../services/playerAchievementsService.ts';",
"import { evaluateAchievementsForPlayers } from '../services/playerAchievementsService.ts';\nimport { JudgeAssignmentError, resolveJudgeAssignment } from '../services/judgeAssignmentService.ts';\nimport { reconcileClubGameTokenSettlement } from '../services/clubGameTokenSettlementService.ts';")

put_block = r'''// PUT /api/games/:gameId/evening-protocol - save a structured club protocol and reconcile canonical token settlement.
router.put('/:gameId/evening-protocol', requireOrganizerAuth, async (req, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });

    const db = (req as any).db || (await getDb());
    const existing = await db.get<any>('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!existing) return res.status(404).json({ error: 'Игра не найдена' });
    if (!existing.evening_id) return res.status(400).json({ error: 'Это не игра обычного вечера' });
    if (existing.archived_at) return res.status(409).json({ error: 'Игра находится в архиве. Сначала восстановите её.' });

    const incomingProtocol = req.body?.protocol;
    const incomingResults = req.body?.player_results;
    if (!incomingProtocol || !Array.isArray(incomingResults) || incomingResults.length !== 10) {
      return res.status(400).json({ error: 'Нужны protocol и 10 player_results' });
    }

    const previous = safeJsonParse<any>(existing.protocol_text, null);
    if (!previous || previous.kind !== 'club_evening_protocol') {
      return res.status(400).json({ error: 'У игры отсутствует структурированный клубный протокол' });
    }

    const previousStatus = previous.protocol?.status === 'completed' ? 'completed' : 'draft';
    const status = incomingProtocol.status === 'completed' ? 'completed' : 'draft';
    const winner = incomingProtocol.winner_team === 'red'
      ? 'Красные'
      : incomingProtocol.winner_team === 'black'
        ? 'Чёрные'
        : null;
    if (status === 'completed' && !winner) return res.status(400).json({ error: 'Для завершения игры укажите победившую команду' });

    const hasJudgePatch = Object.prototype.hasOwnProperty.call(req.body || {}, 'judge_player_id')
      || Object.prototype.hasOwnProperty.call(req.body || {}, 'judge_name');
    const judge = hasJudgePatch
      ? await resolveJudgeAssignment(db, {
          judge_player_id: req.body?.judge_player_id ?? null,
          judge_name: req.body?.judge_name ?? null,
        })
      : { judge_player_id: existing.judge_player_id || null, judge_name: existing.judge_name || null };

    const now = new Date().toISOString();
    const nextProtocol = {
      version: 1,
      kind: 'club_evening_protocol',
      protocol: {
        ...incomingProtocol,
        game_id: String(gameId),
        status,
        updated_at: now,
        completed_at: status === 'completed' ? now : null,
      },
      player_results: incomingResults,
    };
    const settlementContext = status === 'completed'
      ? (previousStatus === 'completed' ? 'correction' : 'completion')
      : (previousStatus === 'completed' ? 'reopen' : 'correction');

    await db.transaction(async (tx: any) => {
      await tx.run(
        `UPDATE games
            SET winner_team = ?, winner_label = ?, judge_name = ?, judge_player_id = ?, protocol_text = ?, slots_json = ?
          WHERE id = ?`,
        [
          winner || 'draft',
          winner ? `Победа ${winner}` : 'Черновик',
          judge.judge_name,
          judge.judge_player_id,
          JSON.stringify(nextProtocol),
          JSON.stringify(clubSlotsFromResults(incomingResults)),
          gameId,
        ],
      );
      await reconcileClubGameTokenSettlement(tx, gameId, {
        activateIfUntracked: previousStatus !== 'completed' && status === 'completed',
        context: settlementContext,
      });
    });

    if (status === 'completed') {
      const achievementIds = incomingResults.map((item: any) => String(item.player_id || '')).filter(Boolean);
      if (judge.judge_player_id) achievementIds.push(String(judge.judge_player_id));
      await evaluateAchievementsForPlayers(db, achievementIds);
    }

    const row = await db.get(
      `SELECT g.*, et.name AS table_name
         FROM games g
    LEFT JOIN evening_tables et ON et.id = g.evening_table_id
        WHERE g.id = ?`,
      [gameId],
    );
    res.json(normalizeGame(row));
  } catch (err: any) {
    const message = err instanceof JudgeAssignmentError ? err.message : (err.message || 'Не удалось сохранить протокол');
    res.status(400).json({ error: message });
  }
});'''
replace_between('src/server/routes/gamesRoutesBase.ts',
'// PUT /api/games/:gameId/evening-protocol',
'// POST /api/games/:gameId/archive',
put_block)

archive_block = r'''// POST /api/games/:gameId/archive - soft-delete a structured club game and reconcile managed settlement to zero.
router.post('/:gameId/archive', requireOrganizerAuth, async (req, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });
    const db = (req as any).db || (await getDb());
    const existing = await db.get<any>('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!existing) return res.status(404).json({ error: 'Игра не найдена' });
    if (!existing.evening_id) return res.status(400).json({ error: 'Архив доступен только для игр обычного вечера' });
    const protocol = safeJsonParse<any>(existing.protocol_text, null);
    if (!protocol || protocol.kind !== 'club_evening_protocol') return res.status(400).json({ error: 'Архив доступен только для клубных игр вечера' });

    if (!existing.archived_at) {
      await db.transaction(async (tx: any) => {
        await tx.run('UPDATE games SET archived_at = ? WHERE id = ?', [new Date().toISOString(), gameId]);
        await reconcileClubGameTokenSettlement(tx, gameId, { activateIfUntracked: false, context: 'archive' });
      });
    }
    const row = await db.get(
      `SELECT g.*, et.name AS table_name FROM games g
       LEFT JOIN evening_tables et ON et.id = g.evening_table_id WHERE g.id = ?`,
      [gameId],
    );
    res.json(normalizeGame(row));
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Не удалось перенести игру в архив' });
  }
});'''
replace_between('src/server/routes/gamesRoutesBase.ts',
'// POST /api/games/:gameId/archive',
'// POST /api/games/:gameId/archive/restore',
archive_block)

restore_block = r'''// POST /api/games/:gameId/archive/restore - restore and reapply settlement only for already-managed games.
router.post('/:gameId/archive/restore', requireOrganizerAuth, async (req, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });
    const db = (req as any).db || (await getDb());
    const existing = await db.get<any>('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!existing) return res.status(404).json({ error: 'Игра не найдена' });
    const protocol = safeJsonParse<any>(existing.protocol_text, null);
    if (!existing.evening_id || !protocol || protocol.kind !== 'club_evening_protocol') {
      return res.status(400).json({ error: 'Это не клубная игра обычного вечера' });
    }
    await db.transaction(async (tx: any) => {
      await tx.run('UPDATE games SET archived_at = NULL WHERE id = ?', [gameId]);
      await reconcileClubGameTokenSettlement(tx, gameId, { activateIfUntracked: false, context: 'restore' });
    });
    const row = await db.get(
      `SELECT g.*, et.name AS table_name FROM games g
       LEFT JOIN evening_tables et ON et.id = g.evening_table_id WHERE g.id = ?`,
      [gameId],
    );
    res.json(normalizeGame(row));
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Не удалось восстановить игру' });
  }
});'''
replace_between('src/server/routes/gamesRoutesBase.ts',
'// POST /api/games/:gameId/archive/restore',
'// DELETE /api/games/:gameId/archive',
restore_block)

# Legacy unstructured POST must no longer mutate token balances.
replace_once('src/server/routes/gamesRoutesBase.ts',
"          let eloDelta = 0;\n          let tokensDelta = 0;",
"          let eloDelta = 0;")
replace_once('src/server/routes/gamesRoutesBase.ts',
"            if (isRedRole) { eloDelta = 15; tokensDelta = 1; }\n            else eloDelta = -10;",
"            if (isRedRole) eloDelta = 15;\n            else eloDelta = -10;")
replace_once('src/server/routes/gamesRoutesBase.ts',
"            if (!isRedRole) { eloDelta = 20; tokensDelta = 2; }\n            else eloDelta = -15;",
"            if (!isRedRole) eloDelta = 20;\n            else eloDelta = -15;")
replace_once('src/server/routes/gamesRoutesBase.ts',
"            'UPDATE players SET elo = ?, tokens = ?, updated_at = ? WHERE id = ?',\n            [Math.max(100, (player.elo || 1000) + eloDelta), (player.tokens || 0) + tokensDelta, now, player.id]",
"            'UPDATE players SET elo = ?, updated_at = ? WHERE id = ?',\n            [Math.max(100, (player.elo || 1000) + eloDelta), now, player.id]")

# Focused service + route tests.
tests = r'''import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { generateOrganizerToken } from '../server/auth';
import {
  calculateClubGamePlayerTokens,
  decimalPointsToTenths,
  reconcileClubGameTokenSettlement,
} from '../server/services/clubGameTokenSettlementService';
import { verifyTokenLedgerConsistency } from '../server/services/tokenLedgerService';

const makeResult = (i: number, patch: any = {}) => ({
  participant_id: `ep-${i}`,
  player_id: `p-${i}`,
  seat_number: i,
  display_name: `P${i}`,
  role: i <= 7 ? (i === 7 ? 'sheriff' : 'citizen') : (i === 10 ? 'don' : 'mafia'),
  exit_type: 'alive',
  regular_fouls: 0,
  minor_technical_fouls: 0,
  major_technical_fouls: 0,
  technical_fouls: 0,
  judge_bonus: 0,
  protocol_bonus: 0,
  disciplinary_penalty_points: 0,
  ci_points: 0,
  ...patch,
});

const protocol = (status: 'draft'|'completed', results: any[], patch: any = {}) => ({
  version: 1,
  kind: 'club_evening_protocol',
  protocol: {
    game_id: '', status, winner_team: status === 'completed' ? 'red' : null,
    end_reason: 'normal', ppk_culprit_participant_id: null,
    first_killed_participant_id: null, best_moves: [], ...patch,
  },
  player_results: results,
});

describe('club game token formula', () => {
  it('is decimal-safe and covers win/loss and foul boundaries', () => {
    expect(decimalPointsToTenths(0.30000000000000004)).toBe(3);
    expect(decimalPointsToTenths(-0.6000000000000001)).toBe(-6);
    expect(calculateClubGamePlayerTokens({ role:'citizen', winnerTeam:'red', regularFouls:0 }).total).toBe(215);
    expect(calculateClubGamePlayerTokens({ role:'citizen', winnerTeam:'black', regularFouls:0 }).total).toBe(115);
    expect(calculateClubGamePlayerTokens({ role:'citizen', winnerTeam:'black', regularFouls:1 }).foul_bonus).toBe(10);
    expect(calculateClubGamePlayerTokens({ role:'citizen', winnerTeam:'black', regularFouls:2 }).foul_bonus).toBe(5);
    expect(calculateClubGamePlayerTokens({ role:'citizen', winnerTeam:'black', regularFouls:3 }).foul_bonus).toBe(0);
  });

  it('maps signed points and every sanction exactly', () => {
    const value = calculateClubGamePlayerTokens({
      role:'mafia', winnerTeam:'black', judgeBonus:0.3, protocolBonus:-0.1,
      bestMovePoints:0.6, ciPoints:0.2, disciplinaryPoints:-1,
      regularFouls:2, minorTechnicalFouls:1, majorTechnicalFouls:1,
      removed:true, ppkCulprit:true,
    });
    expect(value.additional_points_tenths).toBe(0);
    expect(value.minor_technical_penalty).toBe(-30);
    expect(value.major_technical_penalty).toBe(-60);
    expect(value.removal_penalty).toBe(-100);
    expect(value.ppk_penalty).toBe(-500);
    expect(value.total).toBe(-385);
  });

  it('uses current canonical PPK discipline and applies the -1000 lower cap', () => {
    const currentPpk = calculateClubGamePlayerTokens({
      role:'citizen', winnerTeam:'black', disciplinaryPoints:-1, ppkCulprit:true,
      minorTechnicalFouls:2, majorTechnicalFouls:2, removed:true, regularFouls:4,
    });
    expect(currentPpk.additional_points_tokens).toBe(-100);
    expect(currentPpk.total).toBe(-940);
    const capped = calculateClubGamePlayerTokens({
      role:'citizen', winnerTeam:'black', disciplinaryPoints:-8, ppkCulprit:true,
      minorTechnicalFouls:10, majorTechnicalFouls:10, removed:true, regularFouls:4,
    });
    expect(capped.uncapped_total).toBeLessThan(-1000);
    expect(capped.total).toBe(-1000);
  });
});

describe('canonical club-game token settlement routes', () => {
  let db: DatabaseWrapper;
  let app: any;
  let cookie: string;
  let gameId: number;
  let results: any[];

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    cookie = `organizer_token=${generateOrganizerToken()}`;
    const now = '2026-08-10T05:00:00.000Z';
    for (let i=1;i<=12;i++) {
      await db.run(
        `INSERT INTO players (id,nickname,contact_status,lifecycle_status,elo,tokens,created_at,updated_at)
         VALUES (?,?,'normal','normal',1500,0,?,?)`,
        [`p-${i}`, `P${i}`, now, now],
      );
    }
    await db.run(
      `INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
       VALUES ('e-1','Evening',?,'Europe/Moscow','STANDARD','active',20,0,?,?)`, [now,now,now],
    );
    results = Array.from({length:10},(_,idx)=>makeResult(idx+1));
    const draft = protocol('draft', results);
    const inserted = await db.run(
      `INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,judge_name,judge_player_id,protocol_text,slots_json,created_at)
       VALUES ('e-1',501,?,'draft','Черновик','P11','p-11',?,'[]',?)`,
      [now,JSON.stringify(draft),now],
    );
    gameId = Number(inserted.lastID);
  });

  const save = (body: any) => request(app).put(`/api/games/${gameId}/evening-protocol`).set('Cookie',cookie).send(body);
  const ledgerCount = async () => Number((await db.get<{n:number}>('SELECT COUNT(*) AS n FROM token_ledger')).n);

  it('first completion settles all ten UUID players plus linked judge, replay is exact no-op, and metadata is readable', async () => {
    const completed = protocol('completed', results, { best_moves:[{participant_id:'ep-1',source:'first_killed',seat_numbers:[8,9,10]}] });
    completed.player_results[0].judge_bonus = 0.3;
    completed.player_results[0].protocol_bonus = -0.1;
    completed.player_results[0].ci_points = 0.2;
    const response = await save({ protocol: completed.protocol, player_results: completed.player_results });
    expect(response.status).toBe(200);
    expect(await ledgerCount()).toBe(11);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-1'")).tokens)).toBe(315);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-11'")).tokens)).toBe(100);
    const playerLedger = await db.get<any>("SELECT * FROM token_ledger WHERE reason_type='club_game_player' AND player_id='p-1'");
    expect(playerLedger.description).toContain('Игра №501');
    const metadata = JSON.parse(playerLedger.metadata_json);
    expect(metadata.breakdown.additional_points_tenths).toBe(10);
    expect(metadata.breakdown.additional_points_tokens).toBe(100);
    const replay = await save({ protocol: completed.protocol, player_results: completed.player_results });
    expect(replay.status).toBe(200);
    expect(await ledgerCount()).toBe(11);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-1'")).tokens)).toBe(315);
    expect((await verifyTokenLedgerConsistency(db)).every((row:any)=>row.matches)).toBe(true);
  });

  it('correction, PPK/removal, judge swap, reopen, re-complete, archive and restore produce compensating deltas only', async () => {
    let completed = protocol('completed', results);
    expect((await save({protocol:completed.protocol,player_results:completed.player_results})).status).toBe(200);
    const firstRows = await ledgerCount();

    completed.player_results[0] = { ...completed.player_results[0], judge_bonus:0.1 };
    expect((await save({protocol:completed.protocol,player_results:completed.player_results})).status).toBe(200);
    expect(await ledgerCount()).toBe(firstRows + 1);
    expect(Number((await db.get<any>("SELECT amount FROM token_ledger WHERE player_id='p-1' ORDER BY created_at DESC,id DESC LIMIT 1")).amount)).toBe(10);

    completed = protocol('completed', completed.player_results, { end_reason:'ppk', ppk_culprit_participant_id:'ep-2' });
    completed.player_results[1] = { ...completed.player_results[1], exit_type:'removed', disciplinary_penalty_points:-1 };
    expect((await save({protocol:completed.protocol,player_results:completed.player_results})).status).toBe(200);
    const p2Latest = await db.get<any>("SELECT amount FROM token_ledger WHERE player_id='p-2' ORDER BY created_at DESC,id DESC LIMIT 1");
    expect(Number(p2Latest.amount)).toBe(-700);

    expect((await save({protocol:completed.protocol,player_results:completed.player_results,judge_player_id:'p-12'})).status).toBe(200);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-11'")).tokens)).toBe(0);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-12'")).tokens)).toBe(100);

    const beforeReopen = await ledgerCount();
    const draft = protocol('draft', completed.player_results, { winner_team:null, end_reason:'normal', ppk_culprit_participant_id:null });
    expect((await save({protocol:draft.protocol,player_results:draft.player_results})).status).toBe(200);
    expect(await ledgerCount()).toBeGreaterThan(beforeReopen);
    for (let i=1;i<=12;i++) expect(Number((await db.get<any>('SELECT tokens FROM players WHERE id=?',[`p-${i}`])).tokens)).toBe(0);

    completed = protocol('completed', results);
    expect((await save({protocol:completed.protocol,player_results:completed.player_results})).status).toBe(200);
    const managedBalance = Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-1'")).tokens);
    expect(managedBalance).toBe(215);

    expect((await request(app).post(`/api/games/${gameId}/archive`).set('Cookie',cookie)).status).toBe(200);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-1'")).tokens)).toBe(0);
    expect((await request(app).post(`/api/games/${gameId}/archive/restore`).set('Cookie',cookie)).status).toBe(200);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='p-1'")).tokens)).toBe(215);
    expect((await verifyTokenLedgerConsistency(db)).every((row:any)=>row.matches)).toBe(true);
  });

  it('rolls back the game and every token mutation when a later player update fails', async () => {
    await db.exec(`CREATE TRIGGER fail_p6_tokens BEFORE UPDATE OF tokens ON players
      WHEN NEW.id='p-6' BEGIN SELECT RAISE(ABORT,'forced token failure'); END;`);
    const completed = protocol('completed', results);
    const response = await save({protocol:completed.protocol,player_results:completed.player_results});
    expect(response.status).toBe(400);
    const game = await db.get<any>('SELECT protocol_text,winner_team FROM games WHERE id=?',[gameId]);
    expect(JSON.parse(game.protocol_text).protocol.status).toBe('draft');
    expect(game.winner_team).toBe('draft');
    expect(await ledgerCount()).toBe(0);
    expect(Number((await db.get<any>('SELECT COUNT(*) AS n FROM club_game_token_settlements')).n)).toBe(0);
    for (let i=1;i<=12;i++) expect(Number((await db.get<any>('SELECT tokens FROM players WHERE id=?',[`p-${i}`])).tokens)).toBe(0);
  });

  it('external judge gets no judge reward and draft/untracked historical rows do not settle', async () => {
    await db.run("UPDATE games SET judge_player_id=NULL, judge_name='External Judge' WHERE id=?",[gameId]);
    const completed = protocol('completed', results);
    expect((await save({protocol:completed.protocol,player_results:completed.player_results,judge_player_id:null,judge_name:'External Judge'})).status).toBe(200);
    expect(Number((await db.get<any>("SELECT COUNT(*) AS n FROM token_ledger WHERE reason_type='club_game_judge'")).n)).toBe(0);

    const oldCompleted = protocol('completed', results);
    const old = await db.run(
      `INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
       VALUES ('e-1',502,'2026-08-09','Красные','old',?,'[]','2026-08-09')`, [JSON.stringify(oldCompleted)],
    );
    const before = await ledgerCount();
    await db.transaction(async (tx:any)=>{
      await reconcileClubGameTokenSettlement(tx, Number(old.lastID), {activateIfUntracked:false,context:'correction'});
    });
    expect(await ledgerCount()).toBe(before);

    const draftGame = await db.run(
      `INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
       VALUES ('e-1',503,'2026-08-10','draft','draft',?,'[]','2026-08-10')`, [JSON.stringify(protocol('draft',results))],
    );
    await db.transaction(async (tx:any)=>{
      await reconcileClubGameTokenSettlement(tx, Number(draftGame.lastID), {activateIfUntracked:true,context:'completion'});
    });
    expect(await ledgerCount()).toBe(before);
  });

  it('legacy unstructured POST no longer changes tokens', async () => {
    const legacy = await request(app).post('/api/games').set('Cookie',cookie).send({
      global_game_number:900, game_date:'2026-08-10', winner_team:'Красные', winner_label:'Победа города',
      judge_name:'Legacy', protocol_text:'legacy',
      slots: Array.from({length:10},(_,idx)=>({slot_num:idx+1,player_id:`p-${idx+1}`,nickname:`P${idx+1}`,role:idx<7?'Мирный':'Мафия'})),
    });
    expect(legacy.status).toBe(201);
    for (let i=1;i<=10;i++) expect(Number((await db.get<any>('SELECT tokens FROM players WHERE id=?',[`p-${i}`])).tokens)).toBe(0);
  });
});
'''
write('src/tests/clubGameTokenSettlement.test.ts', tests)

print('04A patch applied')
