import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { mutateTokenBalance } from './tokenLedgerService.ts';

export type BetTeam = 'red' | 'black';

export type BettingRoleSnapshot = {
  seat_number: number;
  participant_id: string | null;
  player_id: string;
  nickname: string;
  role: 'citizen' | 'sheriff' | 'mafia' | 'don';
  team: BetTeam;
};

export type BettingPoolRow = {
  id: string;
  game_id: number;
  game_number: number | null;
  game_date: string | null;
  judge_player_id: string | null;
  status: 'open' | 'closed' | 'settled' | 'refunded';
  opens_at: string;
  closes_at: string;
  role_snapshot_json: string;
  house_rate_bps: number;
  max_coefficient: number;
  red_pool: number;
  black_pool: number;
  settlement_seq: number;
  settled_winner: BetTeam | null;
  reserve_amount: number;
  settled_at: string | null;
  notified_at: string | null;
  notification_count: number;
  created_at: string;
  updated_at: string;
};

export class BettingValidationError extends Error {}
export class BettingNotFoundError extends Error {}
export class BettingClosedError extends Error {}
export class BettingIneligibleError extends Error {}
export class BettingDuplicateError extends Error {}

const safeJsonParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const normalizeRole = (value: unknown): BettingRoleSnapshot['role'] | null => {
  const role = String(value || '').trim().toLocaleLowerCase('ru-RU');
  if (role === 'мирный' || role === 'citizen') return 'citizen';
  if (role === 'шериф' || role === 'sheriff') return 'sheriff';
  if (role === 'мафия' || role === 'mafia') return 'mafia';
  if (role === 'дон' || role === 'don') return 'don';
  return null;
};

const roleTeam = (role: BettingRoleSnapshot['role']): BetTeam => role === 'mafia' || role === 'don' ? 'black' : 'red';

const withTransaction = async <T>(db: DatabaseWrapper, work: (tx: DatabaseWrapper) => Promise<T>): Promise<T> => {
  if (db.sqlite.inTransaction) return work(db);
  return db.transaction(work);
};

export const calculatePoolCoefficient = (
  sidePool: number,
  otherPool: number,
  houseRateBps = 1000,
  maxCoefficient = 10,
): number => {
  const side = Math.max(0, Math.trunc(sidePool || 0));
  const other = Math.max(0, Math.trunc(otherPool || 0));
  const houseRate = Math.max(0, Math.min(10_000, Math.trunc(houseRateBps || 0))) / 10_000;
  const maxCoef = Math.max(1, Number(maxCoefficient || 10));
  if (side <= 0) return other > 0 ? maxCoef : 1;
  const distributableLoserPool = Math.floor(other * (1 - houseRate));
  return Math.min(maxCoef, (side + distributableLoserPool) / side);
};

export const calculatePoolPayout = (
  amount: number,
  winnerPool: number,
  loserPool: number,
  houseRateBps = 1000,
  maxCoefficient = 10,
): { coefficient: number; payout: number } => {
  const coefficient = calculatePoolCoefficient(winnerPool, loserPool, houseRateBps, maxCoefficient);
  return { coefficient, payout: Math.floor(Math.max(0, Math.trunc(amount || 0)) * coefficient) };
};

export const parseRoleSnapshot = (pool: Pick<BettingPoolRow, 'role_snapshot_json'>): BettingRoleSnapshot[] =>
  safeJsonParse<BettingRoleSnapshot[]>(pool.role_snapshot_json, []);

export const closeExpiredBetPool = async (db: DatabaseWrapper, pool: BettingPoolRow): Promise<BettingPoolRow> => {
  if (pool.status !== 'open') return pool;
  if (new Date(pool.closes_at).getTime() > Date.now()) return pool;
  const now = new Date().toISOString();
  await db.run("UPDATE betting_pools SET status = 'closed', updated_at = ? WHERE id = ? AND status = 'open'", [now, pool.id]);
  return { ...pool, status: 'closed', updated_at: now };
};

export const getBetPoolByGame = async (db: DatabaseWrapper, gameId: number): Promise<BettingPoolRow | null> => {
  const pool = await db.get<BettingPoolRow>('SELECT * FROM betting_pools WHERE game_id = ? LIMIT 1', [gameId]);
  return pool ? closeExpiredBetPool(db, pool) : null;
};

const poolPayload = (pool: BettingPoolRow) => ({
  ...pool,
  red_pool: Number(pool.red_pool || 0),
  black_pool: Number(pool.black_pool || 0),
  house_rate_bps: Number(pool.house_rate_bps || 0),
  max_coefficient: Number(pool.max_coefficient || 10),
  red_coefficient: calculatePoolCoefficient(pool.red_pool, pool.black_pool, pool.house_rate_bps, pool.max_coefficient),
  black_coefficient: calculatePoolCoefficient(pool.black_pool, pool.red_pool, pool.house_rate_bps, pool.max_coefficient),
  role_snapshot: parseRoleSnapshot(pool),
});

export const openBetPoolForGame = async (
  db: DatabaseWrapper,
  gameId: number,
  roleAssignments: Array<{ seat_number: number; role: unknown }>,
) => withTransaction(db, async (tx) => {
  const existing = await tx.get<BettingPoolRow>('SELECT * FROM betting_pools WHERE game_id = ? LIMIT 1', [gameId]);
  if (existing) return poolPayload(await closeExpiredBetPool(tx, existing));

  const game = await tx.get<any>('SELECT * FROM games WHERE id = ? LIMIT 1', [gameId]);
  if (!game) throw new BettingNotFoundError('Игра не найдена');
  if (!game.evening_id) throw new BettingValidationError('Ставки доступны только для клубной игры вечера');
  if (game.archived_at) throw new BettingValidationError('Игра находится в архиве');

  const protocolEnvelope = safeJsonParse<any>(game.protocol_text, null);
  if (!protocolEnvelope || protocolEnvelope.kind !== 'club_evening_protocol') {
    throw new BettingValidationError('У игры нет структурированного клубного протокола');
  }
  if (protocolEnvelope.protocol?.status === 'completed') throw new BettingClosedError('Игра уже завершена');

  const results = Array.isArray(protocolEnvelope.player_results) ? protocolEnvelope.player_results : [];
  if (results.length !== 10) throw new BettingValidationError('Для ставок нужен полный состав из 10 игроков');

  const assignmentBySeat = new Map<number, BettingRoleSnapshot['role']>();
  for (const assignment of roleAssignments || []) {
    const seat = Number(assignment?.seat_number);
    const role = normalizeRole(assignment?.role);
    if (!Number.isInteger(seat) || seat < 1 || seat > 10 || !role) {
      throw new BettingValidationError('Некорректные роли для открытия ставок');
    }
    assignmentBySeat.set(seat, role);
  }
  if (assignmentBySeat.size !== 10) throw new BettingValidationError('Нужно передать роли для всех 10 мест');

  const counts = { citizen: 0, sheriff: 0, mafia: 0, don: 0 };
  assignmentBySeat.forEach((role) => { counts[role] += 1; });
  if (counts.citizen !== 6 || counts.sheriff !== 1 || counts.mafia !== 2 || counts.don !== 1) {
    throw new BettingValidationError('Нужны роли ФСМ: 6 мирных, Шериф, 2 мафии и Дон');
  }

  const roleSnapshot: BettingRoleSnapshot[] = results
    .map((result: any) => {
      const seat = Number(result.seat_number);
      const role = assignmentBySeat.get(seat);
      if (!role || !result.player_id) throw new BettingValidationError('Не удалось сопоставить роли и игроков');
      return {
        seat_number: seat,
        participant_id: result.participant_id ? String(result.participant_id) : null,
        player_id: String(result.player_id),
        nickname: String(result.display_name || `Игрок ${seat}`),
        role,
        team: roleTeam(role),
      };
    })
    .sort((a: BettingRoleSnapshot, b: BettingRoleSnapshot) => a.seat_number - b.seat_number);

  let judgePlayerId = game.judge_player_id ? String(game.judge_player_id) : null;
  if (!judgePlayerId && game.judge_name) {
    const judgeCandidate = await tx.get<any>(
      `SELECT id FROM players
        WHERE LOWER(TRIM(nickname)) = LOWER(TRIM(?))
           OR LOWER(TRIM(COALESCE(full_name, ''))) = LOWER(TRIM(?))
        LIMIT 1`,
      [String(game.judge_name), String(game.judge_name)],
    );
    if (judgeCandidate?.id) judgePlayerId = String(judgeCandidate.id);
  }

  const now = new Date();
  const closes = new Date(now.getTime() + 90_000);
  const pool: BettingPoolRow = {
    id: `betpool_${crypto.randomUUID()}`,
    game_id: gameId,
    game_number: Number(game.global_game_number || 0) || null,
    game_date: game.game_date ? String(game.game_date) : null,
    judge_player_id: judgePlayerId,
    status: 'open',
    opens_at: now.toISOString(),
    closes_at: closes.toISOString(),
    role_snapshot_json: JSON.stringify(roleSnapshot),
    house_rate_bps: 1000,
    max_coefficient: 10,
    red_pool: 0,
    black_pool: 0,
    settlement_seq: 0,
    settled_winner: null,
    reserve_amount: 0,
    settled_at: null,
    notified_at: null,
    notification_count: 0,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  await tx.run(
    `INSERT INTO betting_pools (
      id, game_id, game_number, game_date, judge_player_id, status, opens_at, closes_at,
      role_snapshot_json, house_rate_bps, max_coefficient, red_pool, black_pool,
      settlement_seq, settled_winner, reserve_amount, settled_at, notified_at, notification_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      pool.id, pool.game_id, pool.game_number, pool.game_date, pool.judge_player_id, pool.status,
      pool.opens_at, pool.closes_at, pool.role_snapshot_json, pool.house_rate_bps, pool.max_coefficient,
      pool.red_pool, pool.black_pool, pool.settlement_seq, pool.settled_winner, pool.reserve_amount,
      pool.settled_at, pool.notified_at, pool.notification_count, pool.created_at, pool.updated_at,
    ],
  );

  return poolPayload(pool);
});

export const assertBettingEligibility = (pool: BettingPoolRow, playerId: string) => {
  const snapshot = parseRoleSnapshot(pool);
  if (snapshot.some((item) => item.player_id === playerId)) {
    throw new BettingIneligibleError('Вы участвуете в этой игре и не можете делать ставку');
  }
  if (pool.judge_player_id && pool.judge_player_id === playerId) {
    throw new BettingIneligibleError('Судья этой игры не может делать ставку');
  }
};

export const placePoolBet = async (
  db: DatabaseWrapper,
  input: { gameId: number; playerId: string; team: BetTeam; amount: number; requestId: string },
) => withTransaction(db, async (tx) => {
  if (input.team !== 'red' && input.team !== 'black') throw new BettingValidationError('Выберите красных или чёрных');
  if (!Number.isInteger(input.amount) || input.amount < 50) throw new BettingValidationError('Минимальная ставка — 50 жетонов');
  if (!input.requestId?.trim() || input.requestId.length > 160) throw new BettingValidationError('Некорректный идентификатор ставки');

  let pool = await tx.get<BettingPoolRow>('SELECT * FROM betting_pools WHERE game_id = ? LIMIT 1', [input.gameId]);
  if (!pool) throw new BettingNotFoundError('Ставки на эту игру не найдены');
  pool = await closeExpiredBetPool(tx, pool);
  if (pool.status !== 'open') throw new BettingClosedError('Ставки на эту игру уже закрыты');
  assertBettingEligibility(pool, input.playerId);

  const sameRequest = await tx.get<any>('SELECT * FROM betting_bets WHERE player_id = ? AND request_id = ? LIMIT 1', [input.playerId, input.requestId]);
  if (sameRequest) {
    const player = await tx.get<any>('SELECT tokens FROM players WHERE id = ?', [input.playerId]);
    return { bet: sameRequest, pool: poolPayload(pool), balance: Number(player?.tokens || 0), idempotent: true };
  }
  const previousBet = await tx.get<any>('SELECT id FROM betting_bets WHERE game_id = ? AND player_id = ? LIMIT 1', [input.gameId, input.playerId]);
  if (previousBet) throw new BettingDuplicateError('На эту игру уже сделана ставка');

  const betId = `bet_${crypto.randomUUID()}`;
  const ledger = await mutateTokenBalance(tx, {
    playerId: input.playerId,
    delta: -input.amount,
    reasonType: 'bet_stake',
    description: `Ставка на ${input.team === 'red' ? 'красных' : 'чёрных'} · игра №${pool.game_number || input.gameId}`,
    sourceType: 'bet',
    sourceId: betId,
    idempotencyKey: `bet-stake:${input.playerId}:${input.requestId}`,
    debitPolicy: 'prevent_negative',
    actorType: 'player',
    actorId: input.playerId,
    metadata: { game_id: input.gameId, pool_id: pool.id, team: input.team, amount: input.amount },
  });

  const placedAt = new Date().toISOString();
  await tx.run(
    `INSERT INTO betting_bets (
      id, pool_id, game_id, player_id, team, amount, request_id, stake_ledger_entry_id,
      status, payout_amount, placed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'placed', 0, ?)`,
    [betId, pool.id, input.gameId, input.playerId, input.team, input.amount, input.requestId, ledger.id, placedAt],
  );
  const poolColumn = input.team === 'red' ? 'red_pool' : 'black_pool';
  await tx.run(`UPDATE betting_pools SET ${poolColumn} = ${poolColumn} + ?, updated_at = ? WHERE id = ?`, [input.amount, placedAt, pool.id]);
  pool = (await tx.get<BettingPoolRow>('SELECT * FROM betting_pools WHERE id = ?', [pool.id]))!;
  const bet = await tx.get<any>('SELECT * FROM betting_bets WHERE id = ?', [betId]);
  return { bet, pool: poolPayload(pool), balance: ledger.balance_after, idempotent: false };
});

const reverseSettledPayouts = async (tx: DatabaseWrapper, pool: BettingPoolRow) => {
  if (pool.status !== 'settled' || !pool.settled_winner) return pool;
  const bets = await tx.all<any>('SELECT * FROM betting_bets WHERE pool_id = ? ORDER BY placed_at ASC, id ASC', [pool.id]);
  for (const bet of bets) {
    const payout = Number(bet.payout_amount || 0);
    if (payout > 0) {
      await mutateTokenBalance(tx, {
        playerId: String(bet.player_id),
        delta: -payout,
        reasonType: 'bet_payout_reversal',
        description: `Перерасчёт ставки · игра №${pool.game_number || pool.game_id}`,
        sourceType: 'bet_correction',
        sourceId: String(bet.id),
        idempotencyKey: `bet-payout-reversal:${pool.id}:v${pool.settlement_seq}:${bet.id}`,
        debitPolicy: 'allow_negative',
        actorType: 'system',
        actorId: null,
        metadata: { game_id: pool.game_id, old_winner: pool.settled_winner, old_payout: payout },
      });
    }
    await tx.run(
      "UPDATE betting_bets SET status = 'placed', payout_amount = 0, payout_ledger_entry_id = NULL, final_coefficient = NULL, settled_at = NULL WHERE id = ?",
      [bet.id],
    );
  }
  const now = new Date().toISOString();
  await tx.run(
    "UPDATE betting_pools SET status = 'closed', settled_winner = NULL, reserve_amount = 0, settled_at = NULL, updated_at = ? WHERE id = ?",
    [now, pool.id],
  );
  return { ...pool, status: 'closed' as const, settled_winner: null, reserve_amount: 0, settled_at: null, updated_at: now };
};

export const settleBetPool = async (db: DatabaseWrapper, gameId: number, winner: BetTeam) => withTransaction(db, async (tx) => {
  let pool = await tx.get<BettingPoolRow>('SELECT * FROM betting_pools WHERE game_id = ? LIMIT 1', [gameId]);
  if (!pool) return null;
  if (pool.status === 'refunded') return poolPayload(pool);
  if (pool.status === 'settled' && pool.settled_winner === winner) return poolPayload(pool);
  if (pool.status === 'settled') pool = await reverseSettledPayouts(tx, pool);

  const bets = await tx.all<any>("SELECT * FROM betting_bets WHERE pool_id = ? AND status != 'refunded' ORDER BY placed_at ASC, id ASC", [pool.id]);
  const winnerPool = winner === 'red' ? Number(pool.red_pool || 0) : Number(pool.black_pool || 0);
  const loserPool = winner === 'red' ? Number(pool.black_pool || 0) : Number(pool.red_pool || 0);
  const nextSeq = Number(pool.settlement_seq || 0) + 1;
  const { coefficient } = calculatePoolPayout(1, winnerPool, loserPool, pool.house_rate_bps, pool.max_coefficient);
  const now = new Date().toISOString();
  let totalPayout = 0;

  for (const bet of bets) {
    const won = String(bet.team) === winner;
    let payout = 0;
    let ledgerId: string | null = null;
    let finalCoefficient: number | null = null;
    if (won) {
      payout = Math.floor(Number(bet.amount || 0) * coefficient);
      finalCoefficient = Number(bet.amount || 0) > 0 ? payout / Number(bet.amount) : null;
      if (payout > 0) {
        const ledger = await mutateTokenBalance(tx, {
          playerId: String(bet.player_id),
          delta: payout,
          reasonType: 'bet_payout',
          description: `Выигрыш ставки · игра №${pool.game_number || gameId}`,
          sourceType: 'bet',
          sourceId: String(bet.id),
          idempotencyKey: `bet-payout:${pool.id}:v${nextSeq}:${bet.id}`,
          debitPolicy: 'allow_negative',
          actorType: 'system',
          actorId: null,
          metadata: { game_id: gameId, winner, stake: Number(bet.amount), coefficient: finalCoefficient },
        });
        ledgerId = ledger.id;
      }
      totalPayout += payout;
    }
    await tx.run(
      `UPDATE betting_bets
          SET status = ?, payout_amount = ?, payout_ledger_entry_id = ?, final_coefficient = ?, settled_at = ?
        WHERE id = ?`,
      [won ? 'won' : 'lost', payout, ledgerId, finalCoefficient, now, bet.id],
    );
  }

  const totalPool = Number(pool.red_pool || 0) + Number(pool.black_pool || 0);
  const reserve = Math.max(0, totalPool - totalPayout);
  await tx.run(
    `UPDATE betting_pools
        SET status = 'settled', settlement_seq = ?, settled_winner = ?, reserve_amount = ?, settled_at = ?, updated_at = ?
      WHERE id = ?`,
    [nextSeq, winner, reserve, now, now, pool.id],
  );
  pool = (await tx.get<BettingPoolRow>('SELECT * FROM betting_pools WHERE id = ?', [pool.id]))!;
  return poolPayload(pool);
});

export const closeUnsettledPoolAfterReopen = async (db: DatabaseWrapper, gameId: number) => withTransaction(db, async (tx) => {
  let pool = await tx.get<BettingPoolRow>('SELECT * FROM betting_pools WHERE game_id = ? LIMIT 1', [gameId]);
  if (!pool || pool.status === 'refunded') return pool ? poolPayload(pool) : null;
  if (pool.status === 'settled') pool = await reverseSettledPayouts(tx, pool);
  if (pool.status === 'open') {
    const now = new Date().toISOString();
    await tx.run("UPDATE betting_pools SET status = 'closed', updated_at = ? WHERE id = ?", [now, pool.id]);
    pool = { ...pool, status: 'closed', updated_at: now };
  }
  return poolPayload(pool);
});

export const refundBetPool = async (db: DatabaseWrapper, gameId: number) => withTransaction(db, async (tx) => {
  let pool = await tx.get<BettingPoolRow>('SELECT * FROM betting_pools WHERE game_id = ? LIMIT 1', [gameId]);
  if (!pool) return null;
  if (pool.status === 'refunded') return poolPayload(pool);
  if (pool.status === 'settled') pool = await reverseSettledPayouts(tx, pool);

  const bets = await tx.all<any>("SELECT * FROM betting_bets WHERE pool_id = ? AND status != 'refunded' ORDER BY placed_at ASC, id ASC", [pool.id]);
  const now = new Date().toISOString();
  for (const bet of bets) {
    const refund = Number(bet.amount || 0);
    if (refund > 0) {
      await mutateTokenBalance(tx, {
        playerId: String(bet.player_id),
        delta: refund,
        reasonType: 'bet_refund',
        description: `Возврат ставки · игра №${pool.game_number || gameId}`,
        sourceType: 'bet_refund',
        sourceId: String(bet.id),
        idempotencyKey: `bet-refund:${pool.id}:${bet.id}`,
        debitPolicy: 'allow_negative',
        actorType: 'system',
        actorId: null,
        metadata: { game_id: gameId, stake: refund },
      });
    }
    await tx.run(
      "UPDATE betting_bets SET status = 'refunded', payout_amount = ?, final_coefficient = 1, settled_at = ? WHERE id = ?",
      [refund, now, bet.id],
    );
  }
  await tx.run(
    "UPDATE betting_pools SET status = 'refunded', settled_winner = NULL, reserve_amount = 0, settled_at = ?, updated_at = ? WHERE id = ?",
    [now, now, pool.id],
  );
  pool = (await tx.get<BettingPoolRow>('SELECT * FROM betting_pools WHERE id = ?', [pool.id]))!;
  return poolPayload(pool);
});

const completedWinner = (game: any): BetTeam | null => {
  const envelope = safeJsonParse<any>(game?.protocol_text, null);
  const status = envelope?.kind === 'club_evening_protocol' ? envelope.protocol?.status : null;
  if (status !== 'completed') return null;
  if (envelope.protocol?.winner_team === 'red' || String(game?.winner_team || '').toLocaleLowerCase('ru-RU').includes('крас')) return 'red';
  if (envelope.protocol?.winner_team === 'black' || String(game?.winner_team || '').toLocaleLowerCase('ru-RU').includes('чёр') || String(game?.winner_team || '').toLocaleLowerCase('ru-RU').includes('чер')) return 'black';
  return null;
};

export const reconcileAllBettingPools = async (db: DatabaseWrapper): Promise<number> => {
  const pools = await db.all<BettingPoolRow>("SELECT * FROM betting_pools WHERE status IN ('open', 'closed', 'settled') ORDER BY created_at ASC");
  let changed = 0;
  for (let pool of pools) {
    const before = `${pool.status}:${pool.settled_winner || ''}:${pool.updated_at}`;
    pool = await closeExpiredBetPool(db, pool);
    const game = await db.get<any>('SELECT id, protocol_text, winner_team FROM games WHERE id = ? LIMIT 1', [pool.game_id]);
    if (!game) {
      await refundBetPool(db, pool.game_id);
      changed += 1;
      continue;
    }
    const winner = completedWinner(game);
    if (winner) {
      await settleBetPool(db, pool.game_id, winner);
    } else if (pool.status === 'settled') {
      await closeUnsettledPoolAfterReopen(db, pool.game_id);
    }
    const after = await db.get<BettingPoolRow>('SELECT * FROM betting_pools WHERE id = ?', [pool.id]);
    if (after && `${after.status}:${after.settled_winner || ''}:${after.updated_at}` !== before) changed += 1;
  }
  return changed;
};

export const getPlayerBettingDashboard = async (db: DatabaseWrapper, playerId: string) => {
  await reconcileAllBettingPools(db);
  const player = await db.get<any>('SELECT id, tokens FROM players WHERE id = ? LIMIT 1', [playerId]);
  if (!player) throw new BettingNotFoundError('Игрок не найден');

  let activePool = await db.get<BettingPoolRow>(
    "SELECT * FROM betting_pools WHERE status IN ('open', 'closed') ORDER BY opens_at DESC LIMIT 1",
  );
  if (activePool) activePool = await closeExpiredBetPool(db, activePool);

  let active: any = null;
  let blocked: any = null;
  if (activePool) {
    try {
      assertBettingEligibility(activePool, playerId);
      const myBet = await db.get<any>('SELECT * FROM betting_bets WHERE game_id = ? AND player_id = ? LIMIT 1', [activePool.game_id, playerId]);
      active = { ...poolPayload(activePool), my_bet: myBet || null };
    } catch (error) {
      if (error instanceof BettingIneligibleError) {
        blocked = { game_id: activePool.game_id, game_number: activePool.game_number, reason: error.message };
      } else throw error;
    }
  }

  const history = await db.all<any>(`
    SELECT b.id, b.game_id, b.team, b.amount, b.status, b.payout_amount, b.final_coefficient,
           b.placed_at, b.settled_at, p.game_number, p.game_date, p.settled_winner
      FROM betting_bets b
      JOIN betting_pools p ON p.id = b.pool_id
     WHERE b.player_id = ?
     ORDER BY b.placed_at DESC, b.id DESC
     LIMIT 30
  `, [playerId]);

  const stats = await db.get<any>(`
    SELECT COUNT(*) AS games,
           SUM(CASE WHEN winner_team = 'Чёрные' THEN 1 ELSE 0 END) AS black_wins,
           SUM(CASE WHEN winner_team = 'Красные' THEN 1 ELSE 0 END) AS red_wins
      FROM games
     WHERE archived_at IS NULL AND winner_team IN ('Красные', 'Чёрные')
  `);
  const games = Number(stats?.games || 0);

  return {
    balance: Number(player.tokens || 0),
    active,
    blocked,
    history,
    club_stats: {
      games,
      black_wins: Number(stats?.black_wins || 0),
      red_wins: Number(stats?.red_wins || 0),
      black_win_rate: games > 0 ? Number(stats?.black_wins || 0) / games : null,
      red_win_rate: games > 0 ? Number(stats?.red_wins || 0) / games : null,
    },
  };
};
