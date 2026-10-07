import crypto from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { getPlayerSessionId, isClubOwner } from '../auth.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../../db/ensureOrganizerPlayerAccessSchema.ts';
import {
  addPokerBot, createPokerLobby, getPokerLobby, joinPokerLobby, kickPokerPlayer, leavePokerLobby, listPokerLobbies,
  POKER_BUY_IN_TOKENS, POKER_MIN_BUY_IN_TOKENS, pokerEffectiveStack, pokerMoneyMode, pokerTableForPlayer, sweepIdlePokerSeats, touchPokerSeat,
  publicPokerHistory, publicPokerLobby, rebuyPoker, setPokerSitOut, startPokerLobby, tickPokerLobby, type PokerSeatExit,
} from '../services/pokerLobbyService.ts';
import { applyPokerAction } from '../services/pokerEngine.ts';
import { withPersistedPokerRuntime } from '../services/pokerPersistenceService.ts';
import { mutateTokenBalance, TokenInsufficientFundsError } from '../services/tokenLedgerService.ts';
import { loadPokerInviteCandidates, PokerInviteError, queuePokerInvite } from '../services/pokerInviteService.ts';

const router = Router();
type Reply = { body: unknown; status?: number };

class PokerRouteError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const tokenMutationKey = (kind: string, lobbyId: string, playerId: string) =>
  `poker:${kind}:${lobbyId}:${playerId}:${crypto.randomUUID()}`;

const parsePokerBuyIn = (value: unknown) => {
  if (value === undefined || value === null || value === '') return POKER_BUY_IN_TOKENS;
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < POKER_MIN_BUY_IN_TOKENS) {
    throw new PokerRouteError(400, `Минимальный вход — ${POKER_MIN_BUY_IN_TOKENS.toLocaleString('ru-RU')} жетонов (10 ББ).`);
  }
  return amount;
};

const chargePokerBuyIn = async (db: any, playerId: string, lobbyId: string, amount: number, kind: 'buy_in' | 'rebuy') => {
  try {
    return await mutateTokenBalance(db, {
      playerId,
      delta: -amount,
      reasonType: kind === 'buy_in' ? 'poker_buy_in' : 'poker_rebuy',
      description: kind === 'buy_in' ? 'Покер: жетоны за стол' : 'Покер: докупка жетонов',
      sourceType: 'poker',
      sourceId: lobbyId,
      idempotencyKey: tokenMutationKey(kind, lobbyId, playerId),
      debitPolicy: 'prevent_negative',
      actorType: 'player',
      actorId: playerId,
      metadata: { lobby_id: lobbyId, amount, kind },
    });
  } catch (error) {
    if (error instanceof TokenInsufficientFundsError) {
      throw new PokerRouteError(409, `Для выбранного входа нужно ${amount.toLocaleString('ru-RU')} жетонов на балансе.`);
    }
    throw error;
  }
};

const returnPokerTokens = async (db: any, playerId: string, lobbyId: string, amount: number, kind: 'cash_out' | 'training_switch' | 'afk_cash_out') => {
  const safeAmount = Math.max(0, Math.trunc(Number(amount) || 0));
  if (!safeAmount) return null;
  return mutateTokenBalance(db, {
    playerId,
    delta: safeAmount,
    reasonType: 'poker_cash_out',
    description: kind === 'training_switch' ? 'Покер: возврат жетонов перед тренировкой' : 'Покер: возврат жетонов со стола',
    sourceType: 'poker',
    sourceId: lobbyId,
    idempotencyKey: tokenMutationKey(kind, lobbyId, playerId),
    actorType: kind === 'afk_cash_out' ? 'system' : 'player',
    actorId: kind === 'afk_cash_out' ? null : playerId,
    metadata: { lobby_id: lobbyId, amount: safeAmount, kind },
  });
};

const settlePokerExits = async (db: any, exits: PokerSeatExit[]) => {
  for (const exit of exits) {
    if (exit.moneyMode === 'club_tokens') {
      await returnPokerTokens(db, exit.playerId, exit.lobbyId, exit.amount, 'afk_cash_out');
    }
  }
};

const route = (handler: (req: any) => Promise<Reply> | Reply) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reply = await withPersistedPokerRuntime((req as any).db, async () => {
      // Every request of a person for his table proves he is still there; five minutes of silence take him off it.
      const viewer = getPlayerSessionId(req as any);
      const tableId = (req as any).params?.id;
      if (viewer && tableId) { const seated = getPokerLobby(String(tableId)); if (seated) touchPokerSeat(seated, String(viewer)); }
      await settlePokerExits((req as any).db, sweepIdlePokerSeats());
      return handler(req);
    });
    const viewer = getPlayerSessionId(req as any);
    if (viewer && reply.body && typeof reply.body === 'object' && !Array.isArray(reply.body)) {
      const balance = await (req as any).db.get('SELECT tokens FROM players WHERE id = ? LIMIT 1', [String(viewer)]) as { tokens: number } | null;
      reply.body = { ...(reply.body as Record<string, unknown>), token_balance: Number(balance?.tokens || 0) };
    }
    return res.status(reply.status || 200).json(reply.body);
  } catch (error: any) {
    if (error instanceof PokerRouteError) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
};

const actor = async (req: any) => {
  const id = getPlayerSessionId(req);
  if (!id) throw new PokerRouteError(401, 'Для Poker нужен профиль игрока.');
  const player = await req.db.get('SELECT id, nickname FROM players WHERE id = ? LIMIT 1', [id]) as { id: string; nickname?: string } | undefined;
  if (!player) throw new PokerRouteError(404, 'Игрок не найден.');
  return { id: String(player.id), nickname: String(player.nickname || 'Игрок') };
};
const lobby = (id: unknown) => {
  const found = getPokerLobby(String(id));
  if (!found) throw new PokerRouteError(404, 'Лобби не найдено.');
  return found;
};
/** The club owner — his organizer session or his own player account — may take people off a poker table. */
const isPokerOwner = (req: any) => isClubOwner(req) || String(getPlayerSessionId(req) || '') === PRIMARY_ORGANIZER_PLAYER_ID;
/** The table as a viewer sees it, with whether he may kick people. */
const viewFor = (req: any, state: any) => ({ ...state, can_kick: isPokerOwner(req), viewer_player_id: String(getPlayerSessionId(req) || '') });
const conflict = (error: any, fallback: string): never => {
  if (error instanceof PokerRouteError) throw error;
  throw new PokerRouteError(409, error?.message || fallback);
};

router.get('/poker/invite-candidates', async (req, res, next) => {
  try {
    const player = await actor(req);
    const sourceLobbyId = await withPersistedPokerRuntime(req.db, () => {
      const table = pokerTableForPlayer(player.id);
      return table && pokerMoneyMode(table) === 'club_tokens' ? table.id : null;
    });
    if (!sourceLobbyId) return res.status(403).json({ error: 'Список приглашений доступен из живого стола на жетоны.' });

    // VK can take a network round-trip, so do it outside the serialized poker/SQLite transaction.
    const candidates = await loadPokerInviteCandidates(req.db, player.id);
    const enriched = await withPersistedPokerRuntime(req.db, () => candidates.flatMap((candidate) => {
      const seated = pokerTableForPlayer(candidate.player_id);
      if (seated?.id === sourceLobbyId) return [];
      const liveTable = seated && pokerMoneyMode(seated) === 'club_tokens' ? seated : null;
      return [{
        ...candidate,
        // Private bot training is deliberately invisible to other players. A trainee may still be invited to a live table.
        at_table: Boolean(liveTable),
        at_table_title: liveTable?.title || null,
        can_invite: candidate.can_invite && !liveTable,
      }];
    }));
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ source_lobby_id: sourceLobbyId, candidates: enriched });
  } catch (error) {
    return next(error);
  }
});

router.get('/poker/lobbies', route((req) => {
  const viewer = getPlayerSessionId(req);
  return { body: { lobbies: listPokerLobbies(viewer ? String(viewer) : undefined) } };
}));
router.post('/poker/lobbies', route(async (req) => {
  const player = await actor(req);
  try {
    const training = req.body?.training === true;
    const buyIn = training ? POKER_BUY_IN_TOKENS : parsePokerBuyIn(req.body?.buy_in_tokens);
    const table = createPokerLobby(player, training ? 'Тренировка' : req.body?.title, training ? 'training' : 'club_tokens', buyIn);
    if (training) addPokerBot(table);
    else await chargePokerBuyIn(req.db, player.id, table.id, buyIn, 'buy_in');
    return { status: 201, body: { lobby: viewFor(req, publicPokerLobby(table, player.id)) } };
  } catch (error) { return conflict(error, 'Не удалось создать лобби.'); }
}));
router.get('/poker/lobbies/:id', route(async (req) => {
  const player = await actor(req); const table = lobby(req.params.id);
  if (pokerMoneyMode(table) === 'training' && !table.players.some((item) => item.id === player.id)) {
    throw new PokerRouteError(404, 'Тренировочная сессия приватная.');
  }
  tickPokerLobby(table);
  return { body: { lobby: viewFor(req, publicPokerLobby(table, player.id)) } };
}));
router.post('/poker/lobbies/:id/join', route(async (req) => {
  const player = await actor(req); const table = lobby(req.params.id);
  try {
    const alreadySeated = table.players.some((item) => item.id === player.id);
    const buyIn = alreadySeated || pokerMoneyMode(table) !== 'club_tokens' ? POKER_BUY_IN_TOKENS : parsePokerBuyIn(req.body?.buy_in_tokens);
    if (!alreadySeated && pokerMoneyMode(table) === 'club_tokens') {
      await chargePokerBuyIn(req.db, player.id, table.id, buyIn, 'buy_in');
    }
    joinPokerLobby(table, player, buyIn);
  } catch (error) { conflict(error, 'Не удалось войти в лобби.'); }
  return { body: { lobby: viewFor(req, publicPokerLobby(table, player.id)) } };
}));
router.post('/poker/lobbies/:id/bot', route(async (req) => {
  const player = await actor(req); const table = lobby(req.params.id);
  try {
    if (table.ownerId !== player.id) throw new Error('Добавить бота может создатель тренировки.');
    if (pokerMoneyMode(table) !== 'training') throw new Error('Боты доступны только в тренировке. Создайте отдельную тренировочную сессию.');
    addPokerBot(table);
  } catch (error) { conflict(error, 'Не удалось добавить бота.'); }
  return { body: { lobby: viewFor(req, publicPokerLobby(table, player.id)) } };
}));
router.post('/poker/lobbies/:id/invite', route(async (req) => {
  const sender = await actor(req);
  const table = lobby(req.params.id);
  if (pokerMoneyMode(table) !== 'club_tokens') throw new PokerRouteError(409, 'Из тренировки живых игроков не зовём.');
  if (!table.players.some((item) => item.id === sender.id)) throw new PokerRouteError(403, 'Сначала сядьте за этот стол.');
  if (table.players.length >= 8) throw new PokerRouteError(409, 'За столом уже нет свободных мест.');
  const targetPlayerId = String(req.body?.playerId || '').trim();
  if (!targetPlayerId) throw new PokerRouteError(400, 'Выберите игрока.');
  if (table.players.some((item) => item.id === targetPlayerId)) throw new PokerRouteError(409, 'Игрок уже за этим столом.');
  const targetTable = pokerTableForPlayer(targetPlayerId);
  if (targetTable && pokerMoneyMode(targetTable) === 'club_tokens') {
    throw new PokerRouteError(409, 'Игрок уже за другим покерным столом.');
  }

  try {
    const invite = await queuePokerInvite(req.db, {
      senderPlayerId: sender.id,
      senderNickname: sender.nickname,
      targetPlayerId,
      lobbyId: table.id,
      lobbyTitle: table.title,
    });
    return { body: { success: true, invite } };
  } catch (error) {
    if (error instanceof PokerInviteError) {
      return {
        status: error.code === 'cooldown' ? 429 : 409,
        body: { error: error.message, code: error.code, retry_after_seconds: error.retryAfterSeconds || 0 },
      };
    }
    throw error;
  }
}));

router.post('/poker/lobbies/:id/start', route(async (req) => {
  const player = await actor(req); const table = lobby(req.params.id);
  try { startPokerLobby(table, player.id, true); } catch (error) { conflict(error, 'Не удалось начать игру.'); }
  return { body: { lobby: viewFor(req, publicPokerLobby(table, player.id)) } };
}));
router.post('/poker/lobbies/:id/leave', route(async (req) => {
  const player = await actor(req); const table = getPokerLobby(String(req.params.id));
  if (!table) return { body: { lobby: null } };
  const payout = pokerMoneyMode(table) === 'club_tokens' && table.players.some((item) => item.id === player.id)
    ? pokerEffectiveStack(table, player.id) : 0;
  const left = leavePokerLobby(table, player.id);
  if (payout > 0) await returnPokerTokens(req.db, player.id, table.id, payout, 'cash_out');
  return { body: { lobby: left ? viewFor(req, publicPokerLobby(left, player.id)) : null } };
}));
router.post('/poker/lobbies/:id/kick', route(async (req) => {
  const player = await actor(req);
  if (!isPokerOwner(req)) throw new PokerRouteError(403, 'Убрать игрока со стола может только владелец клуба.');
  const table = lobby(req.params.id);
  const targetId = String(req.body?.playerId || '');
  try {
    const payout = pokerMoneyMode(table) === 'club_tokens' ? pokerEffectiveStack(table, targetId) : 0;
    kickPokerPlayer(table, targetId);
    if (payout > 0) await returnPokerTokens(req.db, targetId, table.id, payout, 'cash_out');
  } catch (error) { conflict(error, 'Не получилось убрать игрока.'); }
  return { body: { lobby: viewFor(req, publicPokerLobby(table, player.id)) } };
}));
router.post('/poker/lobbies/:id/sit-out', route(async (req) => {
  const player = await actor(req); const table = lobby(req.params.id);
  try { setPokerSitOut(table, player.id, req.body?.away !== false); } catch (error) { conflict(error, 'Не получилось.'); }
  return { body: { lobby: viewFor(req, publicPokerLobby(table, player.id)) } };
}));
router.post('/poker/lobbies/:id/action', route(async (req) => {
  const player = await actor(req); const table = lobby(req.params.id);
  if (!table.hand) throw new PokerRouteError(404, 'Активная раздача не найдена.');
  tickPokerLobby(table);
  if (table.hand.animation_phase !== 'playing') throw new PokerRouteError(409, 'Дождитесь окончания автоматической выкладки карт.');
  if (table.hand.players.find((item) => item.seat === table.hand?.current_seat)?.id !== player.id) throw new PokerRouteError(409, 'Сейчас ход другого игрока.');
  try { applyPokerAction(table.hand, req.body || {}); } catch (error) { conflict(error, 'Действие недоступно.'); }
  return { body: { lobby: viewFor(req, publicPokerLobby(table, player.id)) } };
}));
router.get('/poker/lobbies/:id/history', route(async (req) => {
  const player = await actor(req); const table = lobby(req.params.id);
  if (!table.players.some((item) => item.id === player.id)) throw new PokerRouteError(403, 'История видна игрокам за этим столом.');
  return { body: { history: publicPokerHistory(table, player.id) } };
}));
router.post('/poker/lobbies/:id/rebuy', route(async (req) => {
  const player = await actor(req); const table = lobby(req.params.id);
  try {
    const amount = pokerMoneyMode(table) === 'club_tokens' ? parsePokerBuyIn(req.body?.buy_in_tokens) : POKER_BUY_IN_TOKENS;
    if (pokerMoneyMode(table) === 'club_tokens') await chargePokerBuyIn(req.db, player.id, table.id, amount, 'rebuy');
    rebuyPoker(table, player.id, amount);
  } catch (error) { conflict(error, 'Не получилось докупить жетоны.'); }
  return { body: { lobby: viewFor(req, publicPokerLobby(table, player.id)) } };
}));
router.post('/poker/lobbies/:id/bot/remove', route(async (req) => {
  const player = await actor(req); const table = lobby(req.params.id);
  try {
    if (table.ownerId !== player.id && !(table.permanent && table.players.some((item) => item.id === player.id))) throw new Error('Убрать бота может создатель лобби.');
    const bot = table.players.find((item) => item.id === String(req.body?.botId || '') && item.is_bot);
    if (!bot) throw new Error('Бот не найден.');
    leavePokerLobby(table, bot.id);
  } catch (error) { conflict(error, 'Не удалось убрать бота.'); }
  return { body: { lobby: viewFor(req, publicPokerLobby(table, player.id)) } };
}));

export default router;
