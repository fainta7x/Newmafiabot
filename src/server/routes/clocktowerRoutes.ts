import { Router, type NextFunction, type Request, type Response } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import {
  ClocktowerRoomError, closeClocktowerRoom, createClocktowerRoom, joinClocktowerRoom, leaveClocktowerRoom,
  listClocktowerRooms, requireClocktowerMember, setClocktowerStoryteller,
} from '../services/clocktowerRoomService.ts';
import { loadPokerInviteCandidates, PokerInviteError, queuePokerInvite } from '../services/pokerInviteService.ts';

/** «Кровь на часовой башне» stub (owner, 2026-10-18): rooms to gather people and invitations. No game engine. */
const router = Router();

const handle = (work: (req: any, playerId: string, nickname: string) => Promise<unknown>, successStatus = 200) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getPlayerSessionId(req as any);
      if (!id) return res.status(401).json({ error: 'Нужен профиль игрока.' });
      const player = await (req as any).db.get('SELECT id, nickname FROM players WHERE id=? LIMIT 1', [id]) as { id: string; nickname?: string } | undefined;
      if (!player) return res.status(404).json({ error: 'Игрок не найден.' });
      const body = await work(req, String(player.id), String(player.nickname || 'Игрок'));
      res.setHeader('Cache-Control', 'no-store');
      return res.status(successStatus).json(body);
    } catch (error) {
      if (error instanceof ClocktowerRoomError) return res.status(error.status).json({ error: error.message });
      if (error instanceof PokerInviteError) {
        return res.status(error.code === 'cooldown' ? 429 : 409).json({ error: error.message, code: error.code, retry_after_seconds: error.retryAfterSeconds || 0 });
      }
      return next(error);
    }
  };

router.get('/clocktower/rooms', handle(async (req, playerId) => ({ rooms: await listClocktowerRooms(req.db, playerId) })));
router.post('/clocktower/rooms', handle(async (req, playerId) => {
  const id = await createClocktowerRoom(req.db, playerId, { title: req.body?.title, note: req.body?.note, startsAt: req.body?.starts_at });
  return { id };
}, 201));
router.post('/clocktower/rooms/:id/join', handle(async (req, playerId) => { await joinClocktowerRoom(req.db, String(req.params.id), playerId); return { success: true }; }));
router.post('/clocktower/rooms/:id/leave', handle(async (req, playerId) => { await leaveClocktowerRoom(req.db, String(req.params.id), playerId); return { success: true }; }));
router.post('/clocktower/rooms/:id/storyteller', handle(async (req, playerId) => {
  await setClocktowerStoryteller(req.db, String(req.params.id), playerId, req.body?.value !== false);
  return { success: true };
}));
router.post('/clocktower/rooms/:id/close', handle(async (req, playerId) => { await closeClocktowerRoom(req.db, String(req.params.id), playerId); return { success: true }; }));

router.get('/clocktower/invite-candidates', handle(async (req, playerId) => ({
  candidates: await loadPokerInviteCandidates(req.db, playerId, { kind: 'CLOCKTOWER' }),
})));

router.post('/clocktower/rooms/:id/invite', handle(async (req, playerId, nickname) => {
  const roomId = String(req.params.id);
  const room = await requireClocktowerMember(req.db, roomId, playerId);
  const targetPlayerId = String(req.body?.playerId || '').trim();
  if (!targetPlayerId) throw new ClocktowerRoomError(400, 'Выберите игрока.');
  const taken = await req.db.get('SELECT 1 AS x FROM clocktower_room_members WHERE room_id=? AND player_id=?', [roomId, targetPlayerId]);
  if (taken) throw new ClocktowerRoomError(409, 'Игрок уже в комнате.');
  if (room.full) throw new ClocktowerRoomError(409, 'В комнате уже нет мест.');
  const actionPath = `/player/clocktower/${encodeURIComponent(roomId)}`;
  const invite = await queuePokerInvite(req.db, {
    senderPlayerId: playerId,
    senderNickname: nickname,
    targetPlayerId,
    lobbyId: `clocktower:${roomId}`,
    lobbyTitle: room.title,
    other: {
      kind: 'CLOCKTOWER',
      eventType: 'clocktower_invite',
      actionPath,
      buttonText: '🕰 В комнату',
      text: `🕰 ${nickname} зовёт тебя сыграть в «Кровь на часовой башне»\n${room.title} · настольная игра за столом, правила — в приложении`,
      blockedMessage: 'Игрок не принимает приглашения в «Кровь на часовой башне».',
    },
  });
  return { success: true, invite };
}));

export default router;
