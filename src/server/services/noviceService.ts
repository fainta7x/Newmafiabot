import type { DatabaseWrapper } from '../../db/index.ts';
import type { NoviceApplicationStatus, NoviceEntryRoute } from '../../shared/novice.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { enqueueOrganizerNotification } from './organizerNotificationService.ts';

export const NOVICE_APPLICATION_STATUSES = {
  NEW: 'NEW',
  CONFIRMED: 'CONFIRMED',
  ATTENDED: 'ATTENDED',
  COMPLETED: 'COMPLETED',
  CONVERTED: 'CONVERTED',
  CANCELLED: 'CANCELLED',
} as const;

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

const normalizeRoute = (value: unknown): NoviceEntryRoute =>
  String(value || '').toUpperCase() === 'EXPERIENCED' ? 'EXPERIENCED' : 'NOVICE';

export async function getNovicePlayerState(db: DatabaseWrapper, playerId: string) {
  const player = await db.get<any>(
    `SELECT id, nickname, game_level, COALESCE(club_stage, 'NEW') AS club_stage
       FROM players WHERE id = ? LIMIT 1`,
    [playerId],
  );
  if (!player) return null;
  const applications = await db.all<any>(
    `SELECT na.*, e.title AS evening_title, e.starts_at AS evening_starts_at
       FROM novice_applications na
       LEFT JOIN game_evenings e ON e.id = na.evening_id
      WHERE na.player_id = ?
      ORDER BY datetime(na.created_at) DESC`,
    [playerId],
  );
  const attendance = await db.get<any>(
    `SELECT COUNT(DISTINCT ep.evening_id) AS visits
       FROM evening_participants ep
       JOIN game_evenings e ON e.id = ep.evening_id
      WHERE ep.player_id = ? AND ep.attendance_status = 'attended'
        AND UPPER(COALESCE(e.format, '')) = 'NOVICE'`,
    [playerId],
  );
  const noviceVisits = Number(attendance?.visits || 0);
  return {
    player: {
      id: String(player.id), nickname: String(player.nickname || ''),
      game_level: String(player.game_level || 'unrated'), club_stage: String(player.club_stage || 'NEW'),
    },
    applications,
    novice_visits: noviceVisits,
    free_visits_remaining: Math.max(0, 2 - noviceVisits),
    next_novice_price_per_game: noviceVisits < 2 ? 0 : 200,
    can_self_register: ['NOVICE_ACTIVE', 'NOVICE_COMPLETED', 'CLUB_PLAYER'].includes(String(player.club_stage || 'NEW')),
  };
}

export async function createNoviceApplication(
  db: DatabaseWrapper,
  input: { playerId: string; eveningId?: string | null; source?: string; entryRoute?: NoviceEntryRoute; notes?: string },
) {
  const existing = await db.get<any>(
    `SELECT id, status FROM novice_applications
      WHERE player_id = ? AND COALESCE(evening_id, '') = COALESCE(?, '')
        AND status NOT IN ('CANCELLED', 'CONVERTED')
      ORDER BY datetime(created_at) DESC LIMIT 1`,
    [input.playerId, input.eveningId ?? null],
  );
  if (existing) return { id: String(existing.id), created: false };
  const timestamp = now();
  const applicationId = id();
  const entryRoute = normalizeRoute(input.entryRoute);

  await db.run(
    `INSERT INTO novice_applications
      (id, player_id, evening_id, source, entry_route, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'NEW', ?, ?, ?)`,
    [
      applicationId,
      input.playerId,
      input.eveningId ?? null,
      String(input.source || 'ORGANIZER').toUpperCase(),
      entryRoute,
      input.notes ?? null,
      timestamp,
      timestamp,
    ],
  );

  const player = await db.get<any>('SELECT nickname FROM players WHERE id = ? LIMIT 1', [input.playerId]);
  await enqueueOrganizerNotification(db, {
    messageKey: `novice-application:${applicationId}`,
    eventType: 'novice_application_created',
    entityId: applicationId,
    text: `🌱 Новая заявка: ${String(player?.nickname || 'игрок')} · ${entryRoute === 'NOVICE' ? 'новичок в мафии' : 'уже умеет играть'}.`,
  });
  return { id: applicationId, created: true };
}

export async function updateNoviceApplicationStatus(
  db: DatabaseWrapper,
  applicationId: string,
  status: NoviceApplicationStatus,
  organizerNotes?: string,
) {
  const application = await db.get<any>('SELECT * FROM novice_applications WHERE id = ? LIMIT 1', [applicationId]);
  if (!application) throw Object.assign(new Error('Заявка не найдена'), { statusCode: 404 });
  const timestamp = now();
  await db.run(
    `UPDATE novice_applications
        SET status = ?, organizer_notes = ?, decided_at = CASE WHEN ? IN ('CONFIRMED','CANCELLED') THEN ? ELSE decided_at END,
            updated_at = ? WHERE id = ?`,
    [status, organizerNotes?.trim() || null, status, timestamp, timestamp, applicationId],
  );
  if (application.player_id && status === 'CONFIRMED') {
    const route = normalizeRoute(application.entry_route);
    await db.run(
      `UPDATE players SET club_stage = ?, game_level = CASE WHEN ? = 'NOVICE' AND game_level = 'unrated' THEN 'novice' ELSE game_level END WHERE id = ?`,
      [route === 'NOVICE' ? 'NOVICE_ACTIVE' : 'CLUB_PLAYER', route, application.player_id],
    );
  }
  if (application.player_id && status === 'COMPLETED') {
    await db.run("UPDATE players SET club_stage = 'NOVICE_COMPLETED' WHERE id = ? AND club_stage != 'CLUB_PLAYER'", [application.player_id]);
  }
  if (application.player_id && ['CONFIRMED', 'CANCELLED', 'COMPLETED'].includes(status)) {
    const text = status === 'CONFIRMED'
      ? 'Ваша первая заявка в 2LA Noire подтверждена. Теперь можно самостоятельно записываться на доступные вечера.'
      : status === 'COMPLETED'
        ? 'Новичковый этап завершён. Организатор свяжется с вами по следующему шагу.'
        : 'Заявка отменена. Если планы изменятся, можно подать новую заявку в календаре.';
    await queuePersonalNotification(db, {
      notificationKey: `novice-application:${applicationId}:${status.toLowerCase()}`,
      playerId: String(application.player_id), eventType: `novice_application_${status.toLowerCase()}`,
      entityId: applicationId, text, actionPath: '/player/events',
    });
  }
  return getNovicePlayerState(db, String(application.player_id));
}

export async function convertNoviceToClubPlayer(
  db: DatabaseWrapper,
  playerId: string,
) {
  const timestamp = now();

  await db.run(
    `UPDATE players SET club_stage = 'CLUB_PLAYER' WHERE id = ?`,
    [playerId],
  );

  await db.run(
    `UPDATE novice_applications
        SET status = 'CONVERTED', updated_at = ?
      WHERE player_id = ?
        AND status != 'CONVERTED'`,
    [timestamp, playerId],
  );
}
