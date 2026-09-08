import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';
import { loadCompletedGameSnapshots } from './clubGameAnalyticsService.ts';
import { enqueueTelegramMessage, kickTelegramMessageOutbox } from './telegramMessageOutboxService.ts';

export type EveningInvitationStatus = 'sent' | 'opened' | 'accepted' | 'declined' | 'ignored';

const avatarUrl = (playerId: string) => `/api/player/players/${encodeURIComponent(playerId)}/avatar`;
const nowIso = () => new Date().toISOString();

export async function ensurePremiumPlayerConnectionsSchema(db: DatabaseWrapper) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS player_evening_invitations (
      id TEXT PRIMARY KEY,
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      inviter_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      recipient_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'sent',
      created_at TEXT NOT NULL,
      opened_at TEXT,
      responded_at TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(evening_id, inviter_player_id, recipient_player_id)
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_player_evening_invitations_recipient ON player_evening_invitations(recipient_player_id, status, created_at DESC)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_player_evening_invitations_inviter ON player_evening_invitations(inviter_player_id, evening_id, created_at DESC)`);
}

export async function loadProfileConnections(db: DatabaseWrapper, playerId: string) {
  const snapshots = await loadCompletedGameSnapshots(db);
  const rows = new Map<string, {
    player_id: string;
    nickname: string;
    shared_games: number;
    same_team_games: number;
    opponent_games: number;
    last_played_at: string | null;
    last_played_ms: number;
  }>();

  for (const game of snapshots) {
    const self = game.players.find((item) => String(item.player_id) === playerId);
    if (!self) continue;
    for (const other of game.players) {
      if (!other.player_id || String(other.player_id) === playerId) continue;
      const id = String(other.player_id);
      const current = rows.get(id) || {
        player_id: id,
        nickname: String(other.nickname || 'Игрок'),
        shared_games: 0,
        same_team_games: 0,
        opponent_games: 0,
        last_played_at: null,
        last_played_ms: 0,
      };
      current.nickname = String(other.nickname || current.nickname || 'Игрок');
      current.shared_games += 1;
      if (other.team === self.team) current.same_team_games += 1;
      else current.opponent_games += 1;
      if (game.dateMs >= current.last_played_ms) {
        current.last_played_ms = game.dateMs;
        current.last_played_at = game.played_at || game.date || null;
      }
      rows.set(id, current);
    }
  }

  const connections = [...rows.values()]
    .filter((item) => item.shared_games >= 2)
    .sort((a, b) => b.shared_games - a.shared_games || b.last_played_ms - a.last_played_ms || a.nickname.localeCompare(b.nickname, 'ru'))
    .slice(0, 24)
    .map(({ last_played_ms: _lastPlayedMs, ...item }) => {
      let relationship = 'Часто за одним столом';
      if (item.same_team_games >= 3 && item.same_team_games > item.opponent_games) relationship = 'Часто в одной команде';
      else if (item.opponent_games >= 3 && item.opponent_games > item.same_team_games) relationship = 'Часто по разные стороны';
      return { ...item, relationship, avatar_url: avatarUrl(item.player_id) };
    });

  return {
    connections,
    meta: {
      source: 'completed_games',
      minimum_shared_games: 2,
      note: 'Связи считаются только по завершённым играм. Подписи описывают частоту совместных игр и не оценивают игроков.',
    },
  };
}

const loadPlayer = async (db: DatabaseWrapper, playerId: string) => db.get<any>(`
  SELECT id, nickname, telegram_user_id, game_level,
         COALESCE(contact_status, lifecycle_status, 'normal') AS status
    FROM players WHERE id = ? LIMIT 1
`, [playerId]);

const loadInviteCandidates = async (db: DatabaseWrapper, inviterPlayerId: string, recipientPlayerId: string) => {
  const [inviter, recipient] = await Promise.all([
    loadPlayer(db, inviterPlayerId),
    loadPlayer(db, recipientPlayerId),
  ]);
  if (!inviter || !recipient) return { inviter, recipient, evenings: [] as any[] };
  if (String(recipient.status) === 'blocked') return { inviter, recipient, evenings: [] as any[] };

  const rows = await db.all<any>(`
    SELECT e.id, e.title, e.starts_at, e.venue, e.format,
           inviter_ep.response_status AS inviter_response,
           inviter_ep.registration_status AS inviter_registration,
           recipient_ep.response_status AS recipient_response,
           recipient_ep.registration_status AS recipient_registration
      FROM game_evenings e
      JOIN evening_participants inviter_ep
        ON inviter_ep.evening_id = e.id AND inviter_ep.player_id = ?
 LEFT JOIN evening_participants recipient_ep
        ON recipient_ep.evening_id = e.id AND recipient_ep.player_id = ?
     WHERE e.status = 'published'
       AND e.settled_at IS NULL
       AND datetime(e.starts_at) >= datetime('now', '-6 hours')
     ORDER BY datetime(e.starts_at) ASC
     LIMIT 12
  `, [inviterPlayerId, recipientPlayerId]);

  const evenings = rows.filter((row) => {
    const inviterGoing = ['going', 'late'].includes(String(row.inviter_response || ''));
    const recipientGoing = ['going', 'late'].includes(String(row.recipient_response || ''));
    return inviterGoing
      && !recipientGoing
      && playerLevelAllowsEveningFormat(inviter.game_level, row.format)
      && playerLevelAllowsEveningFormat(recipient.game_level, row.format);
  });
  return { inviter, recipient, evenings };
};

export async function getEveningInvitationContext(db: DatabaseWrapper, inviterPlayerId: string, recipientPlayerId: string) {
  await ensurePremiumPlayerConnectionsSchema(db);
  if (inviterPlayerId === recipientPlayerId) return { can_invite: false, reason: 'self', evenings: [] };
  const { inviter, recipient, evenings } = await loadInviteCandidates(db, inviterPlayerId, recipientPlayerId);
  if (!inviter || !recipient) return { can_invite: false, reason: 'player_not_found', evenings: [] };
  if (String(recipient.status) === 'blocked') return { can_invite: false, reason: 'recipient_blocked', evenings: [] };

  const ids = evenings.map((item) => String(item.id));
  const existing = ids.length ? await db.all<any>(`
    SELECT id, evening_id, status, created_at
      FROM player_evening_invitations
     WHERE inviter_player_id = ? AND recipient_player_id = ?
       AND evening_id IN (${ids.map(() => '?').join(',')})
  `, [inviterPlayerId, recipientPlayerId, ...ids]) : [];
  const byEvening = new Map(existing.map((item) => [String(item.evening_id), item]));

  const payload = evenings.map((row) => ({
    id: String(row.id),
    title: String(row.title || 'Игровой вечер'),
    starts_at: row.starts_at || null,
    venue: row.venue || null,
    format: String(row.format || 'CASUAL'),
    existing_invitation: byEvening.get(String(row.id)) || null,
  }));
  return { can_invite: payload.some((item) => !item.existing_invitation), reason: payload.length ? null : 'no_eligible_evening', evenings: payload };
}

export async function createEveningInvitation(db: DatabaseWrapper, inviterPlayerId: string, recipientPlayerId: string, eveningId: string) {
  await ensurePremiumPlayerConnectionsSchema(db);
  if (!inviterPlayerId || !recipientPlayerId || inviterPlayerId === recipientPlayerId) throw new Error('Нельзя пригласить самого себя');
  const { inviter, recipient, evenings } = await loadInviteCandidates(db, inviterPlayerId, recipientPlayerId);
  if (!inviter || !recipient) throw new Error('Игрок не найден');
  if (String(recipient.status) === 'blocked') throw new Error('Игрок недоступен для приглашений');
  const evening = evenings.find((item) => String(item.id) === eveningId);
  if (!evening) throw new Error('Этот вечер недоступен для приглашения');

  const existing = await db.get<any>(`
    SELECT * FROM player_evening_invitations
     WHERE evening_id = ? AND inviter_player_id = ? AND recipient_player_id = ?
     LIMIT 1
  `, [eveningId, inviterPlayerId, recipientPlayerId]);
  if (existing) return { invitation: existing, created: false };

  const rateRow = await db.get<any>(`
    SELECT COUNT(DISTINCT recipient_player_id) AS total
      FROM player_evening_invitations
     WHERE evening_id = ? AND inviter_player_id = ?
  `, [eveningId, inviterPlayerId]);
  if (Number(rateRow?.total || 0) >= 5) throw new Error('На один вечер можно отправить не больше 5 приглашений');

  const id = `evening_invite_${crypto.randomUUID()}`;
  const now = nowIso();
  await db.run(`
    INSERT INTO player_evening_invitations
      (id, evening_id, inviter_player_id, recipient_player_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'sent', ?, ?)
  `, [id, eveningId, inviterPlayerId, recipientPlayerId, now, now]);

  if (recipient.telegram_user_id) {
    const starts = evening.starts_at ? new Date(String(evening.starts_at)).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'скоро';
    await enqueueTelegramMessage(db, {
      messageKey: `evening-invite:${id}`,
      category: 'personal',
      eventType: 'evening_invite',
      entityId: id,
      playerId: recipientPlayerId,
      chatId: String(recipient.telegram_user_id),
      text: `🎲 <b>${String(inviter.nickname || 'Игрок')}</b> зовёт тебя на «${String(evening.title || 'Игровой вечер')}» · ${starts}.\n\nОткрой личный кабинет, чтобы посмотреть приглашение. Запись на вечер подтверждается отдельно.`,
    });
    kickTelegramMessageOutbox(db);
  }

  const invitation = await db.get<any>('SELECT * FROM player_evening_invitations WHERE id = ?', [id]);
  return { invitation, created: true };
}

export async function listIncomingEveningInvitations(db: DatabaseWrapper, recipientPlayerId: string) {
  await ensurePremiumPlayerConnectionsSchema(db);
  const rows = await db.all<any>(`
    SELECT i.id, i.evening_id, i.status, i.created_at, i.opened_at, i.responded_at,
           e.title AS evening_title, e.starts_at, e.venue, e.format, e.status AS evening_status, e.settled_at,
           p.id AS inviter_player_id, p.nickname AS inviter_nickname
      FROM player_evening_invitations i
      JOIN game_evenings e ON e.id = i.evening_id
      JOIN players p ON p.id = i.inviter_player_id
     WHERE i.recipient_player_id = ?
       AND i.status IN ('sent','opened','accepted')
       AND e.status IN ('published','active')
       AND e.settled_at IS NULL
       AND datetime(e.starts_at) >= datetime('now', '-6 hours')
     ORDER BY datetime(e.starts_at) ASC, i.created_at DESC
     LIMIT 20
  `, [recipientPlayerId]);
  return rows.map((row) => ({
    id: String(row.id),
    evening_id: String(row.evening_id),
    status: String(row.status) as EveningInvitationStatus,
    created_at: row.created_at,
    opened_at: row.opened_at || null,
    responded_at: row.responded_at || null,
    evening: {
      id: String(row.evening_id), title: String(row.evening_title || 'Игровой вечер'), starts_at: row.starts_at || null,
      venue: row.venue || null, format: String(row.format || 'CASUAL'), status: String(row.evening_status || ''),
    },
    inviter: {
      player_id: String(row.inviter_player_id), nickname: String(row.inviter_nickname || 'Игрок'), avatar_url: avatarUrl(String(row.inviter_player_id)),
    },
    booking_changed: false,
  }));
}

export async function respondToEveningInvitation(
  db: DatabaseWrapper,
  recipientPlayerId: string,
  invitationId: string,
  action: 'open' | 'accept' | 'decline' | 'ignore',
) {
  await ensurePremiumPlayerConnectionsSchema(db);
  const invitation = await db.get<any>(`
    SELECT i.*, e.status AS evening_status, e.settled_at, e.starts_at
      FROM player_evening_invitations i
      JOIN game_evenings e ON e.id = i.evening_id
     WHERE i.id = ? AND i.recipient_player_id = ?
     LIMIT 1
  `, [invitationId, recipientPlayerId]);
  if (!invitation) throw new Error('Приглашение не найдено');
  if (!['published', 'active'].includes(String(invitation.evening_status || '')) || invitation.settled_at) throw new Error('Игровой вечер уже закрыт');

  const status: EveningInvitationStatus = action === 'open' ? 'opened' : action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'ignored';
  const now = nowIso();
  if (action === 'open' && ['accepted', 'declined', 'ignored'].includes(String(invitation.status))) {
    return { invitation, booking_changed: false };
  }
  await db.run(`
    UPDATE player_evening_invitations
       SET status = ?,
           opened_at = CASE WHEN ? IN ('opened','accepted') THEN COALESCE(opened_at, ?) ELSE opened_at END,
           responded_at = CASE WHEN ? IN ('accepted','declined','ignored') THEN ? ELSE responded_at END,
           updated_at = ?
     WHERE id = ? AND recipient_player_id = ?
  `, [status, status, now, status, now, now, invitationId, recipientPlayerId]);
  const updated = await db.get<any>('SELECT * FROM player_evening_invitations WHERE id = ?', [invitationId]);
  return { invitation: updated, evening_id: String(invitation.evening_id), booking_changed: false };
}
