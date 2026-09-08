import { Router } from 'express';
import { getPlayerSessionId, requireOrganizerAuth } from '../auth.ts';
import { loadCompletedGameSnapshots } from '../services/clubGameAnalyticsService.ts';
import { buildPlayerConnectionSummary } from '../services/playerConnectionService.ts';
import { enqueueTelegramMessage, kickTelegramMessageOutbox } from '../services/telegramMessageOutboxService.ts';

const router = Router();
const MAX_INVITES_PER_EVENING = 8;

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return String(playerId);
};

async function ensureSchema(db: any) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS player_referrals (
      invited_player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      inviter_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      source TEXT NOT NULL DEFAULT 'organizer',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (invited_player_id <> inviter_player_id)
    )
  `);
  await db.run(`
    CREATE TABLE IF NOT EXISTS player_evening_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      inviter_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      invited_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'sent',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (evening_id, inviter_player_id, invited_player_id),
      CHECK (inviter_player_id <> invited_player_id)
    )
  `);
  await db.run('CREATE INDEX IF NOT EXISTS idx_player_referrals_inviter ON player_referrals(inviter_player_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_player_evening_invites_invited ON player_evening_invites(invited_player_id, created_at DESC)');
}

router.get('/profiles/:playerId/connections', async (req, res) => {
  const viewerId = requirePlayerId(req, res);
  if (!viewerId) return;
  const targetId = String(req.params.playerId || '').trim();
  if (!targetId) return res.status(400).json({ error: 'playerId is required' });

  try {
    const db = req.db;
    await ensureSchema(db);
    const target = await db.get('SELECT id, nickname FROM players WHERE id = ? LIMIT 1', [targetId]);
    if (!target) return res.status(404).json({ error: 'Игрок не найден' });

    const [games, invitedBy, invitedPlayers] = await Promise.all([
      loadCompletedGameSnapshots(db),
      db.get(`
        SELECT p.id AS player_id, p.nickname
          FROM player_referrals r
          JOIN players p ON p.id = r.inviter_player_id
         WHERE r.invited_player_id = ? LIMIT 1
      `, [targetId]),
      db.all(`
        SELECT p.id AS player_id, p.nickname, r.created_at
          FROM player_referrals r
          JOIN players p ON p.id = r.invited_player_id
         WHERE r.inviter_player_id = ?
         ORDER BY datetime(r.created_at) DESC, p.nickname ASC
      `, [targetId]),
    ]);
    const connections = buildPlayerConnectionSummary(games, targetId);
    const decorate = (row: any) => row ? ({
      player_id: String(row.player_id),
      nickname: String(row.nickname || 'Игрок'),
      avatar_url: `/api/player/players/${encodeURIComponent(String(row.player_id))}/avatar`,
      ...(row.created_at ? { created_at: String(row.created_at) } : {}),
    }) : null;

    return res.json({
      player_id: targetId,
      viewer_id: viewerId,
      ...connections,
      invited_by: decorate(invitedBy),
      invited_players: invitedPlayers.map(decorate),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить связи игрока' });
  }
});

router.put('/profiles/:playerId/referrer', requireOrganizerAuth, async (req, res) => {
  const invitedPlayerId = String(req.params.playerId || '').trim();
  const inviterPlayerId = req.body?.inviter_player_id == null ? '' : String(req.body.inviter_player_id).trim();
  try {
    const db = req.db;
    await ensureSchema(db);
    if (!invitedPlayerId) return res.status(400).json({ error: 'playerId is required' });
    if (!inviterPlayerId) {
      await db.run('DELETE FROM player_referrals WHERE invited_player_id = ?', [invitedPlayerId]);
      return res.json({ success: true, invited_player_id: invitedPlayerId, inviter_player_id: null });
    }
    if (inviterPlayerId === invitedPlayerId) return res.status(400).json({ error: 'Игрок не может пригласить сам себя' });
    const rows = await db.all('SELECT id FROM players WHERE id IN (?, ?)', [invitedPlayerId, inviterPlayerId]);
    if (rows.length !== 2) return res.status(404).json({ error: 'Игрок не найден' });
    const now = new Date().toISOString();
    await db.run(`
      INSERT INTO player_referrals (invited_player_id, inviter_player_id, source, created_at, updated_at)
      VALUES (?, ?, 'organizer', ?, ?)
      ON CONFLICT(invited_player_id) DO UPDATE SET
        inviter_player_id = excluded.inviter_player_id,
        source = 'organizer',
        updated_at = excluded.updated_at
    `, [invitedPlayerId, inviterPlayerId, now, now]);
    return res.json({ success: true, invited_player_id: invitedPlayerId, inviter_player_id: inviterPlayerId });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось сохранить связь приглашения' });
  }
});

router.post('/evenings/:eveningId/invite-player', async (req, res) => {
  const inviterId = requirePlayerId(req, res);
  if (!inviterId) return;
  const eveningId = String(req.params.eveningId || '').trim();
  const invitedPlayerId = String(req.body?.player_id || '').trim();
  if (!eveningId || !invitedPlayerId) return res.status(400).json({ error: 'eveningId and player_id are required' });
  if (invitedPlayerId === inviterId) return res.status(400).json({ error: 'Нельзя пригласить самого себя' });

  try {
    const db = req.db;
    await ensureSchema(db);
    const [evening, inviter, invited, existing, countRow] = await Promise.all([
      db.get(`SELECT id, title, starts_at, venue, status, settled_at FROM game_evenings WHERE id = ? LIMIT 1`, [eveningId]),
      db.get('SELECT id, nickname FROM players WHERE id = ? LIMIT 1', [inviterId]),
      db.get('SELECT id, nickname, telegram_user_id FROM players WHERE id = ? LIMIT 1', [invitedPlayerId]),
      db.get(`SELECT id, status, created_at FROM player_evening_invites WHERE evening_id = ? AND inviter_player_id = ? AND invited_player_id = ? LIMIT 1`, [eveningId, inviterId, invitedPlayerId]),
      db.get(`SELECT COUNT(*) AS count FROM player_evening_invites WHERE evening_id = ? AND inviter_player_id = ?`, [eveningId, inviterId]),
    ]);
    if (!evening || !['published', 'active'].includes(String(evening.status || '')) || evening.settled_at) {
      return res.status(409).json({ error: 'Этот вечер уже нельзя приглашать игроков' });
    }
    const startsAt = new Date(String(evening.starts_at || '')).getTime();
    if (!Number.isFinite(startsAt) || startsAt < Date.now() - 6 * 60 * 60 * 1000) {
      return res.status(409).json({ error: 'Игровой вечер уже начался или завершён' });
    }
    if (!inviter || !invited) return res.status(404).json({ error: 'Игрок не найден' });
    if (existing) return res.json({ success: true, duplicate: true, invite: existing });
    if (Number(countRow?.count || 0) >= MAX_INVITES_PER_EVENING) {
      return res.status(429).json({ error: `На один вечер можно отправить не более ${MAX_INVITES_PER_EVENING} личных приглашений` });
    }

    const now = new Date().toISOString();
    const insert = await db.run(`
      INSERT INTO player_evening_invites (evening_id, inviter_player_id, invited_player_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'sent', ?, ?)
    `, [eveningId, inviterId, invitedPlayerId, now, now]);

    const chatId = String(invited.telegram_user_id || '').trim();
    if (chatId) {
      const when = new Date(String(evening.starts_at)).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      const venue = evening.venue ? `\n📍 ${String(evening.venue)}` : '';
      await enqueueTelegramMessage(db, {
        messageKey: `player-evening-invite:${eveningId}:${inviterId}:${invitedPlayerId}`,
        category: 'personal',
        eventType: 'player_evening_invite',
        entityId: eveningId,
        playerId: invitedPlayerId,
        chatId,
        text: `🎭 <b>${String(inviter.nickname || 'Игрок')}</b> приглашает тебя на ${String(evening.title || 'игровой вечер')}\n🗓 ${when}${venue}`,
        replyMarkup: { inline_keyboard: [[{ text: 'Открыть события', web_app: { url: `${String(process.env.PLAYER_APP_URL || '').replace(/\/$/, '')}/player/events?event=${encodeURIComponent(eveningId)}` } }]] },
      });
      kickTelegramMessageOutbox(db);
    }

    return res.status(201).json({ success: true, duplicate: false, invite: { id: insert.lastID, evening_id: eveningId, invited_player_id: invitedPlayerId, created_at: now } });
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE')) return res.json({ success: true, duplicate: true });
    return res.status(500).json({ error: error?.message || 'Не удалось отправить приглашение' });
  }
});

export default router;
