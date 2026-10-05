import { Router, type NextFunction, type Request, type Response } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import {
  addPokerBot, createPokerLobby, getPokerLobby, joinPokerLobby, leavePokerLobby, listPokerLobbies, sweepIdlePokerSeats, touchPokerSeat,
  publicPokerHistory, publicPokerLobby, rebuyPoker, setPokerSitOut, startPokerLobby, tickPokerLobby,
} from '../services/pokerLobbyService.ts';
import { applyPokerAction } from '../services/pokerEngine.ts';
import { withPersistedPokerRuntime } from '../services/pokerPersistenceService.ts';

const router = Router();
type Reply = { body: unknown; status?: number };

class PokerRouteError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const route = (handler: (req: any) => Promise<Reply> | Reply) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reply = await withPersistedPokerRuntime((req as any).db, () => {
      // Every request of a person for his table proves he is still there; five minutes of silence take him off it.
      const viewer = getPlayerSessionId(req as any);
      const tableId = (req as any).params?.id;
      if (viewer && tableId) { const seated = getPokerLobby(String(tableId)); if (seated) touchPokerSeat(seated, String(viewer)); }
      return handler(req);
    });
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
const conflict = (error: any, fallback: string): never => { throw new PokerRouteError(409, error?.message || fallback); };

router.get('/poker/lobbies', route((req) => {
  sweepIdlePokerSeats();
  const viewer = getPlayerSessionId(req);
  return { body: { lobbies: listPokerLobbies(viewer ? String(viewer) : undefined) } };
}));
router.post('/poker/lobbies', route(async (req) => {
  const player = await actor(req);
  try { return { status: 201, body: { lobby: publicPokerLobby(createPokerLobby(player, req.body?.title), player.id) } }; }
  catch (error) { return conflict(error, 'Не удалось создать лобби.'); }
}));
router.get('/poker/lobbies/:id', route(async (req) => {
  const player = await actor(req); const table = lobby(req.params.id); tickPokerLobby(table);
  return { body: { lobby: publicPokerLobby(table, player.id) } };
}));
router.post('/poker/lobbies/:id/join', route(async (req) => {
  const player = await actor(req); const table = lobby(req.params.id);
  try { joinPokerLobby(table, player); } catch (error) { conflict(error, 'Не удалось войти в лобби.'); }
  return { body: { lobby: publicPokerLobby(table, player.id) } };
}));
router.post('/poker/lobbies/:id/bot', route(async (req) => {
  const player = await actor(req); const table = lobby(req.params.id);
  try {
    if (table.ownerId !== player.id && !(table.permanent && table.players.some((item) => item.id === player.id))) throw new Error('Добавить бота может создатель лобби.');
    addPokerBot(table);
  } catch (error) { conflict(error, 'Не удалось добавить бота.'); }
  return { body: { lobby: publicPokerLobby(table, player.id) } };
}));
router.post('/poker/lobbies/:id/start', route(async (req) => {
  const player = await actor(req); const table = lobby(req.params.id);
  try { startPokerLobby(table, player.id, true); } catch (error) { conflict(error, 'Не удалось начать игру.'); }
  return { body: { lobby: publicPokerLobby(table, player.id) } };
}));
router.post('/poker/lobbies/:id/leave', route(async (req) => {
  const player = await actor(req); const table = getPokerLobby(String(req.params.id));
  if (!table) return { body: { lobby: null } };
  const left = leavePokerLobby(table, player.id);
  return { body: { lobby: left ? publicPokerLobby(left, player.id) : null } };
}));
router.post('/poker/lobbies/:id/sit-out', route(async (req) => {
  const player = await actor(req); const table = lobby(req.params.id);
  try { setPokerSitOut(table, player.id, req.body?.away !== false); } catch (error) { conflict(error, 'Не получилось.'); }
  return { body: { lobby: publicPokerLobby(table, player.id) } };
}));
router.post('/poker/lobbies/:id/action', route(async (req) => {
  const player = await actor(req); const table = lobby(req.params.id);
  if (!table.hand) throw new PokerRouteError(404, 'Активная раздача не найдена.');
  tickPokerLobby(table);
  if (table.hand.animation_phase !== 'playing') throw new PokerRouteError(409, 'Дождитесь окончания автоматической выкладки карт.');
  if (table.hand.players.find((item) => item.seat === table.hand?.current_seat)?.id !== player.id) throw new PokerRouteError(409, 'Сейчас ход другого игрока.');
  try { applyPokerAction(table.hand, req.body || {}); } catch (error) { conflict(error, 'Действие недоступно.'); }
  return { body: { lobby: publicPokerLobby(table, player.id) } };
}));
router.get('/poker/lobbies/:id/history', route(async (req) => {
  const player = await actor(req); const table = lobby(req.params.id);
  if (!table.players.some((item) => item.id === player.id)) throw new PokerRouteError(403, 'История видна игрокам за этим столом.');
  return { body: { history: publicPokerHistory(table, player.id) } };
}));
router.post('/poker/lobbies/:id/rebuy', route(async (req) => {
  const player = await actor(req); const table = lobby(req.params.id);
  try { rebuyPoker(table, player.id); } catch (error) { conflict(error, 'Не получилось взять фишки.'); }
  return { body: { lobby: publicPokerLobby(table, player.id) } };
}));
router.post('/poker/lobbies/:id/bot/remove', route(async (req) => {
  const player = await actor(req); const table = lobby(req.params.id);
  try {
    if (table.ownerId !== player.id && !(table.permanent && table.players.some((item) => item.id === player.id))) throw new Error('Убрать бота может создатель лобби.');
    const bot = table.players.find((item) => item.id === String(req.body?.botId || '') && item.is_bot);
    if (!bot) throw new Error('Бот не найден.');
    leavePokerLobby(table, bot.id);
  } catch (error) { conflict(error, 'Не удалось убрать бота.'); }
  return { body: { lobby: publicPokerLobby(table, player.id) } };
}));

export default router;
