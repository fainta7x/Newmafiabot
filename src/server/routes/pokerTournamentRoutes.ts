import { Router, type NextFunction, type Request, type Response } from 'express';
import { getPlayerSessionId, isClubOwner } from '../auth.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../../db/ensureOrganizerPlayerAccessSchema.ts';
import { withPersistedPokerRuntime } from '../services/pokerPersistenceService.ts';
import { announcePokerTournament } from '../services/pokerTournamentAnnouncementService.ts';
import {
  cancelPokerTournament, createPokerTournament, getPokerTournamentRow, listPokerTournaments, PokerTournamentError,
  lateRegisterInPokerTournament, publicPokerTournament, rebuyInPokerTournament, registerForPokerTournament, tickPokerTournaments, unregisterFromPokerTournament, updatePokerTournament,
} from '../services/pokerTournamentService.ts';

const router = Router();

const isTournamentOrganizer = (req: any) => isClubOwner(req) || String(getPlayerSessionId(req) || '') === PRIMARY_ORGANIZER_PLAYER_ID;

const handle = (work: (req: any) => Promise<{ body: unknown; status?: number }>) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reply = await work(req);
    return res.status(reply.status || 200).json(reply.body);
  } catch (error) {
    if (error instanceof PokerTournamentError) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
};

const viewer = (req: any) => {
  const id = getPlayerSessionId(req);
  if (!id) throw new PokerTournamentError(401, 'Для турнира нужен профиль игрока.');
  return String(id);
};

router.get('/poker/tournaments', handle(async (req) => {
  await tickPokerTournaments(req.db);
  const playerId = getPlayerSessionId(req);
  const rows = await listPokerTournaments(req.db);
  // Read inside the poker runtime: a running tournament also tells the viewer which table is his.
  const tournaments = await withPersistedPokerRuntime(req.db, () => Promise.all(rows.map((row) => publicPokerTournament(req.db, row, playerId ? String(playerId) : null))));
  return { body: { tournaments, can_organize: isTournamentOrganizer(req) } };
}));

router.get('/poker/tournaments/:id', handle(async (req) => {
  await tickPokerTournaments(req.db);
  const playerId = getPlayerSessionId(req);
  const row = await getPokerTournamentRow(req.db, String(req.params.id));
  return { body: { tournament: await withPersistedPokerRuntime(req.db, () => publicPokerTournament(req.db, row, playerId ? String(playerId) : null)) } };
}));

router.post('/poker/tournaments/:id/register', handle(async (req) => {
  const playerId = viewer(req);
  const current = await getPokerTournamentRow(req.db, String(req.params.id));
  if (current.status === 'running') {
    // Entering a running tournament: the entry and the seat at a table are one step inside the poker runtime.
    const tournament = await withPersistedPokerRuntime(req.db, async () => {
      const row = await lateRegisterInPokerTournament(req.db, String(req.params.id), playerId);
      return publicPokerTournament(req.db, row, playerId);
    });
    return { body: { tournament } };
  }
  const row = await registerForPokerTournament(req.db, String(req.params.id), playerId);
  return { body: { tournament: await publicPokerTournament(req.db, row, playerId) } };
}));

router.delete('/poker/tournaments/:id/register', handle(async (req) => {
  const row = await unregisterFromPokerTournament(req.db, String(req.params.id), viewer(req));
  return { body: { tournament: await publicPokerTournament(req.db, row, viewer(req)) } };
}));

router.post('/poker/tournaments/:id/rebuy', handle(async (req) => {
  const playerId = viewer(req);
  // The token debit, the new stack at the table and the entry are one transaction with the poker snapshot.
  const tournament = await withPersistedPokerRuntime(req.db, async () => {
    const row = await rebuyInPokerTournament(req.db, String(req.params.id), playerId);
    return publicPokerTournament(req.db, row, playerId);
  });
  const balance = await req.db.get('SELECT tokens FROM players WHERE id = ? LIMIT 1', [playerId]) as { tokens: number } | undefined;
  return { body: { tournament, token_balance: Number(balance?.tokens || 0) } };
}));

router.post('/poker/tournaments', handle(async (req) => {
  if (!isTournamentOrganizer(req)) throw new PokerTournamentError(403, 'Турнир может создать только организатор клуба.');
  const organizerId = getPlayerSessionId(req);
  const row = await createPokerTournament(req.db, organizerId ? String(organizerId) : null, req.body || {});
  // The announcement goes out in the background; if a channel fails the scheduler retries it.
  void announcePokerTournament(req.db, row.id).catch((error) => console.error('[POKER TOURNAMENT] announcement failed:', error instanceof Error ? error.message : String(error)));
  return { status: 201, body: { tournament: await publicPokerTournament(req.db, row, organizerId ? String(organizerId) : null) } };
}));

router.patch('/poker/tournaments/:id', handle(async (req) => {
  if (!isTournamentOrganizer(req)) throw new PokerTournamentError(403, 'Изменить турнир может только организатор клуба.');
  const organizerId = getPlayerSessionId(req);
  const row = await updatePokerTournament(req.db, String(req.params.id), req.body || {});
  return { body: { tournament: await publicPokerTournament(req.db, row, organizerId ? String(organizerId) : null) } };
}));

router.post('/poker/tournaments/:id/cancel', handle(async (req) => {
  if (!isTournamentOrganizer(req)) throw new PokerTournamentError(403, 'Отменить турнир может только организатор клуба.');
  const reason = String(req.body?.reason || 'отменён организатором').trim().slice(0, 200) || 'отменён организатором';
  const row = await cancelPokerTournament(req.db, String(req.params.id), reason);
  return { body: { tournament: await publicPokerTournament(req.db, row as any, null) } };
}));

export default router;
