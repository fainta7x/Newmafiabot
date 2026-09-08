import { Router } from 'express';
import { getPlayerSessionId, requireOrganizerAuth } from '../auth.ts';
import {
  loadPremiumProfileElo,
  loadPremiumProfileGames,
  loadPremiumProfileRoles,
  loadPremiumProfileSummary,
  type PremiumProfileRange,
} from '../services/premiumPlayerProfileService.ts';
import {
  createVerifiedClubMilestone,
  loadPremiumProfileShowcase,
  setPinnedVerifiedAwards,
} from '../services/premiumPlayerProfileShowcaseService.ts';
import {
  createEveningInvitation,
  getEveningInvitationContext,
  listIncomingEveningInvitations,
  respondToEveningInvitation,
  setHistoricalPlayerReferrer,
} from '../services/premiumPlayerConnectionsService.ts';
import { loadEnrichedProfileConnections } from '../services/premiumPlayerConnectionProfileService.ts';
import { loadSmartFriendInviteSuggestions } from '../services/smartFriendInviteSuggestionService.ts';
import { ensurePlayerProfileVisibilitySchema, parsePlayerProfileVisibility } from '../services/playerProfileVisibilityService.ts';

const router = Router();

type ViewerContext = { viewerId: string; organizer: boolean };

const requireViewer = (req: any, res: any): ViewerContext | null => {
  const playerId = getPlayerSessionId(req);
  if (playerId) return { viewerId: String(playerId), organizer: false };
  if (req.userRole === 'ORGANIZER') return { viewerId: '__organizer__', organizer: true };
  res.status(401).json({ error: 'Player authentication required.' });
  return null;
};

const requirePlayerViewer = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (playerId) return String(playerId);
  res.status(401).json({ error: 'Player authentication required.' });
  return null;
};

const canViewPlayer = async (db: any, playerId: string) => {
  await ensurePlayerProfileVisibilitySchema(db);
  const row = await db.get(`
    SELECT id, COALESCE(contact_status,lifecycle_status,'normal') AS status, profile_visibility_json
      FROM players WHERE id=? LIMIT 1
  `, [playerId]);
  if (!row) return { ok: false as const, status: 404, error: 'Игрок не найден' };
  return { ok: true as const, row };
};

const featureVisible = (row: any, viewer: ViewerContext, playerId: string, feature: 'game_statistics' | 'connections') => {
  if (viewer.organizer || viewer.viewerId === playerId) return true;
  const visibility = parsePlayerProfileVisibility(row?.profile_visibility_json);
  return visibility[feature] !== false;
};

router.get('/profiles/:playerId/summary', async (req, res) => {
  const viewer = requireViewer(req, res);
  if (!viewer) return;
  try {
    const playerId = String(req.params.playerId);
    const access = await canViewPlayer(req.db, playerId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    return res.json(await loadPremiumProfileSummary(req.db, playerId, viewer.viewerId, viewer.organizer));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить профиль' });
  }
});

router.get('/profiles/:playerId/games', async (req, res) => {
  const viewer = requireViewer(req, res);
  if (!viewer) return;
  try {
    const playerId = String(req.params.playerId);
    const access = await canViewPlayer(req.db, playerId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (!featureVisible(access.row, viewer, playerId, 'game_statistics')) return res.status(403).json({ error: 'Игровая статистика скрыта игроком' });
    const result = await loadPremiumProfileGames(req.db, playerId, {
      role: typeof req.query.role === 'string' ? req.query.role : undefined,
      team: typeof req.query.team === 'string' ? req.query.team : undefined,
      result: typeof req.query.result === 'string' ? req.query.result : undefined,
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined,
      limit: Number(req.query.limit || 15),
      offset: Number(req.query.offset || 0),
    });
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить историю игр' });
  }
});

router.get('/profiles/:playerId/roles', async (req, res) => {
  const viewer = requireViewer(req, res);
  if (!viewer) return;
  try {
    const playerId = String(req.params.playerId);
    const access = await canViewPlayer(req.db, playerId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (!featureVisible(access.row, viewer, playerId, 'game_statistics')) return res.status(403).json({ error: 'Игровая статистика скрыта игроком' });
    return res.json(await loadPremiumProfileRoles(req.db, playerId));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить статистику ролей' });
  }
});

router.get('/profiles/:playerId/elo', async (req, res) => {
  const viewer = requireViewer(req, res);
  if (!viewer) return;
  try {
    const playerId = String(req.params.playerId);
    const access = await canViewPlayer(req.db, playerId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (!featureVisible(access.row, viewer, playerId, 'game_statistics')) return res.status(403).json({ error: 'Игровая статистика скрыта игроком' });
    const requested = String(req.query.range || 'all');
    const range: PremiumProfileRange = requested === 'month' || requested === 'season' ? requested : 'all';
    return res.json(await loadPremiumProfileElo(req.db, playerId, range));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить историю Elo' });
  }
});

router.get('/profiles/:playerId/showcase', async (req, res) => {
  const viewer = requireViewer(req, res);
  if (!viewer) return;
  try {
    const playerId = String(req.params.playerId);
    const access = await canViewPlayer(req.db, playerId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    return res.json(await loadPremiumProfileShowcase(req.db, playerId, viewer.organizer || viewer.viewerId === playerId));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить награды и историю клуба' });
  }
});

router.get('/profiles/:playerId/connections', async (req, res) => {
  const viewer = requireViewer(req, res);
  if (!viewer) return;
  try {
    const playerId = String(req.params.playerId);
    const access = await canViewPlayer(req.db, playerId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (!featureVisible(access.row, viewer, playerId, 'connections')) return res.status(403).json({ error: 'Связи скрыты игроком' });
    return res.json(await loadEnrichedProfileConnections(req.db, playerId));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить связи игрока' });
  }
});

router.get('/friend-invite-suggestions', async (req, res) => {
  const viewerId = requirePlayerViewer(req, res);
  if (!viewerId) return;
  try {
    const limit = Number(req.query.limit || 4);
    const suggestions = await loadSmartFriendInviteSuggestions(req.db, viewerId, limit);
    return res.json({ suggestions });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось подобрать друзей для приглашения' });
  }
});

router.put('/profiles/:playerId/referrer', requireOrganizerAuth, async (req, res) => {
  try {
    const raw = req.body?.inviter_player_id;
    const inviterPlayerId = raw == null || String(raw).trim() === '' ? null : String(raw).trim();
    const referrer = await setHistoricalPlayerReferrer(req.db, String(req.params.playerId), inviterPlayerId);
    return res.json({ success: true, referrer });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось сохранить клубную связь' });
  }
});

router.get('/profiles/:playerId/invitation-context', async (req, res) => {
  const viewerId = requirePlayerViewer(req, res);
  if (!viewerId) return;
  try {
    const recipientPlayerId = String(req.params.playerId);
    const context = await getEveningInvitationContext(req.db, viewerId, recipientPlayerId);
    return res.json(context);
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось проверить приглашение' });
  }
});

router.post('/profiles/:playerId/invitations', async (req, res) => {
  const viewerId = requirePlayerViewer(req, res);
  if (!viewerId) return;
  try {
    const recipientPlayerId = String(req.params.playerId);
    const eveningId = String(req.body?.evening_id || '').trim();
    if (!eveningId) return res.status(400).json({ error: 'Выбери игровой вечер' });
    const result = await createEveningInvitation(req.db, viewerId, recipientPlayerId, eveningId);
    return res.status(result.created ? 201 : 200).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось отправить приглашение' });
  }
});

router.get('/evening-invitations/inbox', async (req, res) => {
  const viewerId = requirePlayerViewer(req, res);
  if (!viewerId) return;
  try {
    return res.json({ invitations: await listIncomingEveningInvitations(req.db, viewerId) });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить приглашения' });
  }
});

router.post('/evening-invitations/:invitationId/respond', async (req, res) => {
  const viewerId = requirePlayerViewer(req, res);
  if (!viewerId) return;
  try {
    const action = String(req.body?.action || '') as 'open' | 'accept' | 'decline' | 'ignore';
    if (!['open', 'accept', 'decline', 'ignore'].includes(action)) return res.status(400).json({ error: 'Неизвестное действие' });
    return res.json(await respondToEveningInvitation(req.db, viewerId, String(req.params.invitationId), action));
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось обработать приглашение' });
  }
});

router.patch('/profiles/:playerId/awards/pins', async (req, res) => {
  const viewerId = requirePlayerViewer(req, res);
  if (!viewerId) return;
  const playerId = String(req.params.playerId);
  if (viewerId !== playerId) return res.status(403).json({ error: 'Закреплять награды можно только в своём профиле' });
  try {
    const awardIds = Array.isArray(req.body?.award_ids) ? req.body.award_ids.map(String) : [];
    const awards = await setPinnedVerifiedAwards(req.db, playerId, awardIds);
    return res.json({ success: true, awards });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось закрепить награды' });
  }
});

router.post('/profiles/:playerId/milestones', requireOrganizerAuth, async (req, res) => {
  try {
    const milestone = await createVerifiedClubMilestone(req.db, String(req.params.playerId), req.body, 'organizer');
    return res.status(201).json({ milestone });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось добавить этап клубной истории' });
  }
});

export default router;
