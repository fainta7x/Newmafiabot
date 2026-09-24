import type { DatabaseWrapper } from '../../db/index.ts';
import type { NoviceApplicationStatus, NoviceEntryRoute } from '../../shared/novice.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { enqueueOrganizerNotification } from './organizerNotificationService.ts';
import { NOVICE_FREE_VISITS } from './eveningSlotPlanningService.ts';

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

async function getEveningReservationInfo(db: DatabaseWrapper, eveningId: string, playerId?: string | null) {
  const settings = await db.get<any>(
    'SELECT ready_players_per_slot FROM evening_slot_settings WHERE evening_id = ? LIMIT 1',
    [eveningId],
  );
  const capacity = Math.max(1, Number(settings?.ready_players_per_slot || 11));
  const reserved = await db.get<any>(
    `SELECT COUNT(*) AS reserved_count FROM (
       SELECT DISTINCT ep.player_id
         FROM evening_slot_registrations r
         JOIN evening_game_slots s ON s.id = r.slot_id
         JOIN evening_participants ep ON ep.id = r.participant_id
        WHERE s.evening_id = ? AND ep.player_id IS NOT NULL
       UNION
       SELECT DISTINCT na.player_id
         FROM novice_applications na
        WHERE na.evening_id = ? AND na.player_id IS NOT NULL
          AND na.status IN ('NEW', 'CONFIRMED')
     ) reserved_players`,
    [eveningId, eveningId],
  );
  const playerReservation = playerId
    ? await db.get<any>(
        `SELECT id, status FROM novice_applications
          WHERE evening_id = ? AND player_id = ? AND status IN ('NEW', 'CONFIRMED')
          ORDER BY datetime(created_at) DESC LIMIT 1`,
        [eveningId, playerId],
      )
    : null;
  const reservedCount = Number(reserved?.reserved_count || 0);
  return {
    capacity,
    reserved_count: reservedCount,
    available_places: Math.max(0, capacity - reservedCount),
    reserved: Boolean(playerReservation),
    reservation_status: playerReservation ? String(playerReservation.status).toLowerCase() : null,
  };
}

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
    `SELECT na.*, e.title AS evening_title, e.starts_at AS evening_starts_at,
              CASE WHEN na.evening_id IS NOT NULL AND na.status IN ('NEW', 'CONFIRMED') THEN 'reserved' ELSE NULL END AS reservation_status
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
    // Same eligibility as the charged price (novicePriceForPlayer): only the «Новичок» level gets free visits.
    free_visits_remaining: String(player.game_level || '') === 'novice' ? Math.max(0, NOVICE_FREE_VISITS - noviceVisits) : 0,
    next_novice_price_per_game: noviceVisits < 2 ? 0 : 200,
    can_self_register: ['NOVICE_ACTIVE', 'NOVICE_COMPLETED', 'CLUB_PLAYER'].includes(String(player.club_stage || 'NEW')),
  };
}

export async function createNoviceApplication(
  db: DatabaseWrapper,
  input: { playerId: string; eveningId?: string | null; source?: string; entryRoute?: NoviceEntryRoute; notes?: string; notifyOrganizer?: boolean },
) {
  const timestamp = now();
  const applicationId = id();
  const entryRoute = normalizeRoute(input.entryRoute);
  let result: { id: string; created: boolean; reservation?: Awaited<ReturnType<typeof getEveningReservationInfo>> };

  await db.transaction(async (tx) => {
    const existing = await tx.get<any>(
      `SELECT id, status FROM novice_applications
        WHERE player_id = ? AND COALESCE(evening_id, '') = COALESCE(?, '')
          AND status NOT IN ('CANCELLED', 'CONVERTED')
        ORDER BY datetime(created_at) DESC LIMIT 1`,
      [input.playerId, input.eveningId ?? null],
    );
    if (existing) {
      result = {
        id: String(existing.id),
        created: false,
        reservation: input.eveningId ? await getEveningReservationInfo(tx, input.eveningId, input.playerId) : undefined,
      };
      return;
    }

    const reservation = input.eveningId
      ? await getEveningReservationInfo(tx, input.eveningId, input.playerId)
      : undefined;
    if (reservation && !reservation.reserved && reservation.reserved_count >= reservation.capacity) {
      throw Object.assign(new Error('На этот вечер больше нет свободных мест для заявки'), {
        statusCode: 409,
        code: 'evening_full',
        reservation,
      });
    }

    await tx.run(
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
    result = {
      id: applicationId,
      created: true,
      // Re-read after the insert so the applicant sees their own held place.
      reservation: input.eveningId ? await getEveningReservationInfo(tx, input.eveningId, input.playerId) : undefined,
    };
  });

  if (input.notifyOrganizer === false) return result!;
  const player = await db.get<any>('SELECT nickname FROM players WHERE id = ? LIMIT 1', [input.playerId]);
  const evening = input.eveningId
    ? await db.get<any>('SELECT title, starts_at FROM game_evenings WHERE id = ? LIMIT 1', [input.eveningId])
    : null;
  const eveningPart = evening
    ? ` · на «${String(evening.title)}» ${new Date(evening.starts_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })}`
    : '';
  await enqueueOrganizerNotification(db, {
    messageKey: `novice-application:${applicationId}`,
    eventType: 'novice_application_created',
    entityId: applicationId,
    text: `🌱 Новая заявка: ${String(player?.nickname || 'игрок')} · ${entryRoute === 'NOVICE' ? 'новичок в мафии' : 'уже умеет играть'}${eveningPart}.\nПодтвердить: кабинет организатора → «Сегодня».`,
  });
  return result!;
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
  if (application.player_id && ['CONFIRMED', 'CANCELLED'].includes(status)) {
    // The organizer has decided on the newcomer, so the registration follow-up is done.
    const tasksTable = await db.get<any>("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'organizer_tasks'");
    if (tasksTable) await db.run(
      `UPDATE organizer_tasks SET status = 'done', completed_at = ?, updated_at = ?
        WHERE automation_key = ? AND status NOT IN ('done', 'cancelled')`,
      [timestamp, timestamp, `verified-onboarding:new-player:${application.player_id}`],
    );
  }
  if (application.player_id && status === 'COMPLETED') {
    await db.run("UPDATE players SET club_stage = 'NOVICE_COMPLETED' WHERE id = ? AND club_stage != 'CLUB_PLAYER'", [application.player_id]);
  }
  if (application.player_id && ['CONFIRMED', 'CANCELLED', 'COMPLETED'].includes(status)) {
    const text = status === 'CONFIRMED'
      ? (normalizeRoute(application.entry_route) === 'NOVICE'
        ? 'Ваша заявка в 2LA Noire подтверждена — добро пожаловать в Школу мафии! Записывайтесь на ближайший новичковый вечер в «Событиях»: первые два вечера бесплатно.'
        : 'Ваша первая заявка в 2LA Noire подтверждена. Теперь можно самостоятельно записываться на клубные вечера в «Событиях».')
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
    // User-approved 2026-09-24: finishing the school makes a novice/unassessed player a club-level player,
    // so CASUAL booking opens at once. A higher level set by the organizer is kept.
    `UPDATE players
        SET club_stage = 'CLUB_PLAYER',
            game_level = CASE WHEN COALESCE(game_level, 'unrated') IN ('novice', 'unrated') THEN 'club' ELSE game_level END
      WHERE id = ?`,
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

/** Newly registered accounts that have neither applied nor been reviewed yet. */
export async function listPlayersAwaitingFirstDecision(db: DatabaseWrapper) {
  return db.all<any>(
    `SELECT p.id, p.nickname, p.telegram_username, p.source, p.created_at,
            EXISTS(SELECT 1 FROM player_external_identities i WHERE i.player_id = p.id AND i.platform = 'vk') AS has_vk
       FROM players p
      WHERE COALESCE(p.club_stage, 'NEW') = 'NEW'
        AND (p.telegram_user_id IS NOT NULL
             OR EXISTS(SELECT 1 FROM player_external_identities i WHERE i.player_id = p.id AND i.platform = 'vk'))
        -- Any application, including a rejected one, means the organizer already has it in the queue below.
        AND NOT EXISTS(SELECT 1 FROM novice_applications na WHERE na.player_id = p.id)
      ORDER BY datetime(p.created_at) DESC
      LIMIT 50`,
  );
}

/** Organizer decision for a registered player who has not applied themselves. */
export async function admitPlayerWithoutApplication(db: DatabaseWrapper, playerId: string, entryRoute: NoviceEntryRoute) {
  const applicationConflict = () => Object.assign(
    new Error('Игрок уже подал заявку — решение принимается в списке заявок'),
    { statusCode: 409, code: 'application_exists' },
  );
  const existing = await db.get<any>('SELECT id FROM novice_applications WHERE player_id = ? LIMIT 1', [playerId]);
  if (existing) throw applicationConflict();
  const application = await createNoviceApplication(db, {
    playerId, source: 'ORGANIZER', entryRoute, notifyOrganizer: false,
  });
  // createNoviceApplication returns a concurrent player application instead of
  // inserting; never confirm that one with the organizer's route.
  if (!application.created) throw applicationConflict();
  return updateNoviceApplicationStatus(db, application.id, 'CONFIRMED');
}

export type LevelDecisionItem =
  | { kind: 'registration'; player_id: string; nickname: string; created_at: string }
  | { kind: 'application'; application_id: string; player_id: string; nickname: string; entry_route: NoviceEntryRoute; evening_title: string | null; created_at: string };

/** Everything waiting for an organizer's level decision, for the CRM «Сегодня» screen. */
export async function listLevelDecisionQueue(db: DatabaseWrapper): Promise<LevelDecisionItem[]> {
  const registrations = await listPlayersAwaitingFirstDecision(db);
  const applications = await db.all<any>(
    `SELECT na.id, na.player_id, na.entry_route, na.created_at, p.nickname, e.title AS evening_title
       FROM novice_applications na
       JOIN players p ON p.id = na.player_id
       LEFT JOIN game_evenings e ON e.id = na.evening_id
      WHERE na.status = 'NEW'
      ORDER BY datetime(na.created_at) DESC
      LIMIT 50`,
  );
  return [
    ...applications.map((row: any) => ({
      kind: 'application' as const,
      application_id: String(row.id),
      player_id: String(row.player_id),
      nickname: String(row.nickname || 'Игрок'),
      entry_route: normalizeRoute(row.entry_route),
      evening_title: row.evening_title ? String(row.evening_title) : null,
      created_at: String(row.created_at),
    })),
    ...registrations.map((row: any) => ({
      kind: 'registration' as const,
      player_id: String(row.id),
      nickname: String(row.nickname || 'Игрок'),
      created_at: String(row.created_at),
    })),
  ];
}
