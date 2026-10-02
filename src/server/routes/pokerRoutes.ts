import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { addPokerBot, publicPokerHistory, rebuyPoker, createPokerLobby, getPokerLobby, joinPokerLobby, leavePokerLobby, listPokerLobbies, setPokerSitOut, publicPokerLobby, startPokerLobby, tickPokerLobby } from '../services/pokerLobbyService.ts';
import { applyPokerAction } from '../services/pokerEngine.ts';

const router = Router();
const actor = async (req: any, res: any) => {
  const id = getPlayerSessionId(req);
  if (!id) { res.status(401).json({ error: 'Для Poker нужен профиль игрока.' }); return null; }
  const player = await req.db.get('SELECT id, nickname FROM players WHERE id = ? LIMIT 1', [id]) as { id: string; nickname?: string } | undefined;
  if (!player) { res.status(404).json({ error: 'Игрок не найден.' }); return null; }
  return { id: String(player.id), nickname: String(player.nickname || 'Игрок') };
};

router.get('/poker/lobbies', async (_req, res) => res.json({ lobbies: listPokerLobbies() }));
router.post('/poker/lobbies', async (req, res) => { const player = await actor(req, res); if (!player) return; return res.status(201).json({ lobby: publicPokerLobby(createPokerLobby(player, req.body?.title), player.id) }); });
router.get('/poker/lobbies/:id', async (req, res) => { const lobby = getPokerLobby(String(req.params.id)); if (!lobby) return res.status(404).json({ error: 'Лобби не найдено.' }); tickPokerLobby(lobby); const player = await actor(req, res); if (!player) return; return res.json({ lobby: publicPokerLobby(lobby, player.id) }); });
router.post('/poker/lobbies/:id/join', async (req, res) => { const lobby = getPokerLobby(String(req.params.id)); if (!lobby) return res.status(404).json({ error: 'Лобби не найдено.' }); const player = await actor(req, res); if (!player) return; try { joinPokerLobby(lobby, player); return res.json({ lobby: publicPokerLobby(lobby, player.id) }); } catch (error: any) { return res.status(409).json({ error: error?.message || 'Не удалось войти в лобби.' }); } });
router.post('/poker/lobbies/:id/bot', async (req, res) => { const lobby = getPokerLobby(String(req.params.id)); if (!lobby) return res.status(404).json({ error: 'Лобби не найдено.' }); const player = await actor(req, res); if (!player) return; try { if (lobby.ownerId !== player.id && !(lobby.permanent && lobby.players.some((item) => item.id === player.id))) throw new Error('Добавить бота может создатель лобби.'); addPokerBot(lobby); return res.json({ lobby: publicPokerLobby(lobby, player.id) }); } catch (error: any) { return res.status(409).json({ error: error?.message || 'Не удалось добавить бота.' }); } });
router.post('/poker/lobbies/:id/start', async (req, res) => { const lobby = getPokerLobby(String(req.params.id)); if (!lobby) return res.status(404).json({ error: 'Лобби не найдено.' }); const player = await actor(req, res); if (!player) return; try { startPokerLobby(lobby, player.id); return res.json({ lobby: publicPokerLobby(lobby, player.id) }); } catch (error: any) { return res.status(409).json({ error: error?.message || 'Не удалось начать игру.' }); } });
router.post('/poker/lobbies/:id/leave', async (req, res) => { const lobby = getPokerLobby(String(req.params.id)); if (!lobby) return res.json({ lobby: null }); const player = await actor(req, res); if (!player) return; const left = leavePokerLobby(lobby, player.id); return res.json({ lobby: left ? publicPokerLobby(left, player.id) : null }); });
router.post('/poker/lobbies/:id/sit-out', async (req, res) => { const lobby = getPokerLobby(String(req.params.id)); if (!lobby) return res.status(404).json({ error: 'Лобби не найдено.' }); const player = await actor(req, res); if (!player) return; try { setPokerSitOut(lobby, player.id, req.body?.away !== false); return res.json({ lobby: publicPokerLobby(lobby, player.id) }); } catch (error: any) { return res.status(409).json({ error: error?.message || 'Не получилось.' }); } });
router.post('/poker/lobbies/:id/action', async (req, res) => { const lobby = getPokerLobby(String(req.params.id)); if (!lobby?.hand) return res.status(404).json({ error: 'Активная раздача не найдена.' }); const player = await actor(req, res); if (!player) return; if (lobby.hand.players.find((item) => item.seat === lobby.hand?.current_seat)?.id !== player.id) return res.status(409).json({ error: 'Сейчас ход другого игрока.' }); try { applyPokerAction(lobby.hand, req.body || {}); return res.json({ lobby: publicPokerLobby(lobby, player.id) }); } catch (error: any) { return res.status(409).json({ error: error?.message || 'Действие недоступно.' }); } });

router.get('/poker/lobbies/:id/history', async (req, res) => { const lobby = getPokerLobby(String(req.params.id)); if (!lobby) return res.status(404).json({ error: 'Лобби не найдено.' }); const player = await actor(req, res); if (!player) return; if (!lobby.players.some((item) => item.id === player.id)) return res.status(403).json({ error: 'История видна игрокам за этим столом.' }); return res.json({ history: publicPokerHistory(lobby, player.id) }); });
router.post('/poker/lobbies/:id/rebuy', async (req, res) => { const lobby = getPokerLobby(String(req.params.id)); if (!lobby) return res.status(404).json({ error: 'Лобби не найдено.' }); const player = await actor(req, res); if (!player) return; try { rebuyPoker(lobby, player.id); return res.json({ lobby: publicPokerLobby(lobby, player.id) }); } catch (error: any) { return res.status(409).json({ error: error?.message || 'Не получилось взять фишки.' }); } });

export default router;
