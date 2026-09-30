import { Router } from 'express';
import { PLAYER_VISIT_STATS_SQL } from '../services/playerVisitsService.ts';
import { z } from 'zod';
import { STOPPED_REASON, clubRoleFrom, membershipOfPlayer, normalizeClubRole, organizationOf } from '../../lib/playerAccess.ts';
import { HOST_FORMATS, hostFormatsOf, legacyJudgeLevelFor } from '../../lib/hostFormats.ts';
import { ORGANIZE_FORMATS, normalizeOrganizeFormats } from '../../lib/organizeFormats.ts';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { getDb } from '../../db/index.ts';
import { getAuthenticatedOrganizerActorId, isClubOwner, requireClubOwner, requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { setOrganizerPlayerAccess } from '../services/organizerPlayerAccessService.ts';
import { updatePlayerSchema } from '../validation.ts';
import { getPublicAppBaseUrl } from '../runtimeConfig.ts';
import { createPlayerClaimLink, ensurePlayerClaimLinkSchema } from '../services/playerClaimLinkService.ts';
import { linkPlayerVkByProfileLink, loadPlayerVkIdentity } from '../services/vkProfileLinkService.ts';
import { runCrmAutomations } from '../services/crmAutomationService.ts';
import { calculateEngagementStage } from '../../lib/playerUtils.ts';
import { getEveningResponse } from '../../lib/eveningResponse.ts';
import { createPreviewCheckpoint } from '../../db/previewDatabaseCheckpoint.ts';
import { getRepositoryPlayerAvatarAsset, resolveRepositoryPlayerAvatarPath } from '../../lib/playerAvatarManifest.ts';
import { loadPlayerGameProfile } from '../services/playerProfileService.ts';
import { loadPlayerAchievementProfile } from '../services/playerAchievementsService.ts';
import { loadPlayerStaffStats } from '../services/playerStaffStatsService.ts';
import {
  getHistoricalAwardDefaultTitle,
  isHistoricalAwardKey,
  type HistoricalAwardKey,
} from '../services/tournamentAwardsService.ts';

const router = Router();

type HistoricalAwardPayload = {
  awardKey: HistoricalAwardKey;
  title: string;
  tournamentTitle: string;
  tournamentDate: string | null;
  comment: string | null;
};

const parseHistoricalAwardPayload = (body: any): { value?: HistoricalAwardPayload; error?: string } => {
  const awardKey = String(body?.award_key || '').trim();
  if (!isHistoricalAwardKey(awardKey)) return { error: 'Неизвестный тип награды' };

  const tournamentTitle = typeof body?.tournament_title === 'string' ? body.tournament_title.trim().slice(0, 180) : '';
  if (!tournamentTitle) return { error: 'Укажи название турнира' };

  const rawDate = typeof body?.tournament_date === 'string' ? body.tournament_date.trim() : '';
  if (rawDate && (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || Number.isNaN(new Date(`${rawDate}T00:00:00Z`).getTime()))) {
    return { error: 'Некорректная дата турнира' };
  }

  const customTitle = typeof body?.title === 'string' ? body.title.trim().slice(0, 120) : '';
  if (awardKey === 'nomination_other' && !customTitle) return { error: 'Укажи название номинации' };

  const comment = typeof body?.comment === 'string' && body.comment.trim()
    ? body.comment.trim().slice(0, 500)
    : null;

  return {
    value: {
      awardKey,
      title: awardKey === 'nomination_other' ? customTitle : getHistoricalAwardDefaultTitle(awardKey),
      tournamentTitle,
      tournamentDate: rawDate || null,
      comment,
    },
  };
};

const checkpointAfterPlayerMutation = async (db: any) => {
  if (path.basename(db.dbPath) !== 'mafia_crm.runtime.sqlite') return undefined;
  const result = await createPreviewCheckpoint(db);
  return result.success ? undefined : result.message;
};

// GET /api/players - List all players with advanced CRM filters (Auth required)
router.get('/', requireOrganizerAuth, async (req, res) => {
  try {
    const {
      lifecycle_status,
      contact_status,
      engagement_stage,
      never_attended,
      first_visit_only,
      inactive_days,
      has_open_tasks,
      search,
    } = req.query;

    const db = req.db || (await getDb());

    // Query base player data with aggregated evening stats
    const players = await db.all(`
      SELECT p.*,
        (SELECT updated_at FROM player_avatars pa WHERE pa.player_id = p.id) as avatar_updated_at,
        COALESCE(visits.visits, 0) as attendance_count,
        (SELECT COUNT(*) FROM evening_participants ep JOIN game_evenings e ON ep.evening_id = e.id WHERE ep.player_id = p.id AND ep.attendance_status = 'no_show' AND e.status = 'completed') as no_show_count,
        visits.last_visit as last_visit,
        visits.first_visit as first_visit,
        (SELECT COUNT(*) FROM organizer_tasks t WHERE t.player_id = p.id AND t.status != 'done' AND t.status != 'cancelled') as open_tasks_count,
        (SELECT COALESCE(SUM(ep.amount_due - ep.amount_paid), 0)
           FROM evening_participants ep
           JOIN game_evenings debt_evening ON debt_evening.id = ep.evening_id
          WHERE ep.player_id = p.id
            AND (debt_evening.status = 'completed' OR debt_evening.settled_at IS NOT NULL)
            AND ep.attendance_status = 'attended'
            AND ep.payment_status != 'waived'
            AND ep.amount_due > ep.amount_paid) as outstanding_debt
      FROM players p
      -- A visit = marked «пришёл» or seated in a game of that evening (owner, 2026-09-30).
      LEFT JOIN (${PLAYER_VISIT_STATS_SQL}) visits ON visits.player_id = CAST(p.id AS TEXT)
      ORDER BY p.nickname ASC
    `);

    const nowMs = Date.now();

    const mapped = players.map((p: any) => {
      const cStatus = p.contact_status || (p.lifecycle_status === 'blocked' ? 'blocked' : p.lifecycle_status === 'paused' ? 'paused' : 'normal');
      const eStage = calculateEngagementStage(p.attendance_count || 0, p.last_visit);

      let days_since_last_visit: number | null = null;
      if (p.last_visit) {
        const lastMs = new Date(p.last_visit).getTime();
        days_since_last_visit = Math.floor((nowMs - lastMs) / (1000 * 60 * 60 * 24));
      }

      return {
        ...p,
        contact_status: cStatus,
        engagement_stage: eStage,
        calculated_stage: eStage,
        lifecycle_status: cStatus === 'blocked' ? 'blocked' : eStage,
        stored_lifecycle_status: p.lifecycle_status || null,
        days_since_last_visit,
      };
    });

    // Apply post-aggregation filters
    const filtered = mapped.filter((p: any) => {
      // 1. Search filter
      if (search && typeof search === 'string' && search.trim()) {
        const q = search.toLowerCase().trim();
        const matches =
          p.nickname?.toLowerCase().includes(q) ||
          p.full_name?.toLowerCase().includes(q) ||
          p.phone?.toLowerCase().includes(q) ||
          p.telegram_username?.toLowerCase().includes(q);
        if (!matches) return false;
      }

      // 2. Explicit contact status filter
      if (contact_status && p.contact_status !== contact_status) {
        return false;
      }

      // 3. Explicit engagement stage filter
      if (engagement_stage && p.engagement_stage !== engagement_stage) {
        return false;
      }

      // 4. Legacy / unified status filter
      if (lifecycle_status) {
        if (['normal', 'paused', 'blocked'].includes(lifecycle_status as string)) {
          if (p.contact_status !== lifecycle_status) return false;
        } else {
          if (p.engagement_stage !== lifecycle_status) return false;
        }
      }

      // 5. Never attended filter
      if (never_attended === 'true' || never_attended === '1') {
        if (p.attendance_count > 0) return false;
      }

      // 6. First visit only filter (newcomers who haven't returned)
      if (first_visit_only === 'true' || first_visit_only === '1') {
        if (p.attendance_count !== 1) return false;
      }

      // 7. Inactive days filter
      if (inactive_days && !isNaN(Number(inactive_days))) {
        const daysLimit = Number(inactive_days);
        if (p.days_since_last_visit === null || p.days_since_last_visit < daysLimit) return false;
      }

      // 8. Has open tasks filter
      if (has_open_tasks === 'true' || has_open_tasks === '1') {
        if (p.open_tasks_count === 0) return false;
      }

      return true;
    });

    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

const bulkAccessSchema = z.object({
  player_ids: z.array(z.string().min(1)).min(1).max(500),
  game_level: z.enum(['novice', 'club', 'tournament']).optional(),
  // club_role holds two answers, so they change separately (as in the player card):
  // how often the player comes and the organization role. Changing one keeps the other.
  // «stopped» pauses announcements and invitations instead of touching club_role.
  activity: z.enum(['regular', 'sometimes', 'stopped', 'other_city']).optional(),
  organization: z.enum(['none', 'team', 'organizer']).optional(),
  // «Может вести»: marks to add and to remove; formats in neither list stay as they are for each player.
  host_formats_add: z.array(z.enum(HOST_FORMATS)).optional(),
  host_formats_remove: z.array(z.enum(HOST_FORMATS)).optional(),
  // «Может проводить»: owner-only marks to add and to remove, like «Может вести».
  organize_formats_add: z.array(z.enum(ORGANIZE_FORMATS)).optional(),
  organize_formats_remove: z.array(z.enum(ORGANIZE_FORMATS)).optional(),
}).refine(
  (data) => data.game_level || data.activity || data.organization || data.host_formats_add?.length || data.host_formats_remove?.length
    || data.organize_formats_add?.length || data.organize_formats_remove?.length,
  { message: 'Выберите, что поменять' },
);

// POST /api/players/access/bulk - set level, how often the player comes, club role and «Может вести» for many players at once.
// Access to the organizer cabinet is never changed here; it stays a deliberate per-player action.
router.post('/access/bulk', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const data = bulkAccessSchema.parse(req.body);
    const db = req.db || (await getDb());
    const ids = Array.from(new Set(data.player_ids));
    const now = new Date().toISOString();
    let updated = 0;
    // «Организатор клуба» opens the cabinet: only the owner gives or takes it, and the cabinet follows the role.
    const organizerChanges: Array<{ id: string; enabled: boolean }> = [];
    if (data.organization) {
      const placeholders = ids.map(() => '?').join(',');
      const rows = await db.all<any>(`SELECT id, club_role FROM players WHERE id IN (${placeholders})`, ids);
      for (const row of rows) {
        const was = String(row.club_role || '') === 'organizer';
        const will = data.organization === 'organizer';
        if (was !== will) organizerChanges.push({ id: String(row.id), enabled: will });
      }
      if (organizerChanges.length && !isClubOwner(req)) {
        return res.status(403).json({ error: 'Назначить или снять организатора клуба может только владелец', code: 'club_owner_required' });
      }
    }
    const organizeChanged = Boolean(data.organize_formats_add?.length || data.organize_formats_remove?.length);
    if (organizeChanged && !isClubOwner(req)) {
      return res.status(403).json({ error: 'Отметки «Может проводить» ставит только владелец', code: 'club_owner_required' });
    }
    // «Из другого города»: only the level is set; they may judge rating games and tournaments, nothing else.
    const otherCityWarnings: string[] = [];
    await db.transaction(async (tx) => {
      for (const id of ids) {
        const current = await tx.get<any>(
          "SELECT nickname, organize_formats, game_level, club_role, judge_level, host_formats, contact_status, lifecycle_status, pause_reason, stopped_attending, from_other_city, attends_sometimes FROM players WHERE id = ? AND COALESCE(source, '') != 'legacy_guest_migrated' LIMIT 1",
          [id],
        );
        if (!current) continue;
        const role = normalizeClubRole(current.club_role);
        let activity = data.activity;
        if (activity === 'other_city' && organizationOf(role) === 'organizer') {
          otherCityWarnings.push(`${current.nickname}: организатор клуба не может быть «Из другого города»`);
          activity = undefined;
        }
        const otherCity = activity ? activity === 'other_city' : Number(current.from_other_city || 0) === 1;
        const membership = activity === 'regular' ? 'member' : activity === 'sometimes' || activity === 'other_city' ? 'guest' : membershipOfPlayer(current);
        let organization = data.organization ?? organizationOf(role);
        if (otherCity && organization !== 'none') {
          if (data.organization && data.organization !== 'none') otherCityWarnings.push(`${current.nickname}: игроку из другого города роль в клубе не ставится`);
          organization = 'none';
        }
        const clubRole = clubRoleFrom(membership, organization);
        // Blocked players stay blocked. «Перестал ходить» pauses mailing; coming back lifts only that pause.
        const contact = String(current.contact_status || current.lifecycle_status || 'normal');
        let contactStatus = contact;
        let pauseReason = current.pause_reason ?? null;
        if (activity === 'stopped' && contact === 'normal') {
          contactStatus = 'paused';
          pauseReason = STOPPED_REASON;
        } else if (activity && activity !== 'stopped' && contact === 'paused' && pauseReason === STOPPED_REASON) {
          contactStatus = 'normal';
          pauseReason = null;
        }
        const statusChanged = contactStatus !== contact;
        // «Перестал ходить» is saved even when the mailing is already off for another reason (owner, 2026-09-30):
        // that other pause or a block stays as it is.
        const stoppedAttending = activity ? (activity === 'stopped' ? 1 : 0) : Number(current.stopped_attending || 0);
        const formats = new Set(hostFormatsOf(current));
        data.host_formats_add?.forEach((format) => formats.add(format));
        data.host_formats_remove?.forEach((format) => formats.delete(format));
        if (otherCity && (formats.has('NOVICE') || formats.has('CASUAL'))) {
          if (data.host_formats_add?.some((format) => format !== 'RATING')) otherCityWarnings.push(`${current.nickname}: игрок из другого города может вести только рейтинг и турниры`);
          formats.delete('NOVICE'); formats.delete('CASUAL');
        }
        const nextFormats = HOST_FORMATS.filter((format) => formats.has(format));
        const hostChanged = nextFormats.join(',') !== hostFormatsOf(current).join(',');
        const organize = new Set(normalizeOrganizeFormats(current.organize_formats));
        data.organize_formats_add?.forEach((format) => organize.add(format));
        data.organize_formats_remove?.forEach((format) => organize.delete(format));
        if (otherCity && organize.size) {
          if (data.organize_formats_add?.length) otherCityWarnings.push(`${current.nickname}: игрок из другого города не проводит вечера`);
          organize.clear();
        }
        const nextOrganize = ORGANIZE_FORMATS.filter((format) => organize.has(format));
        const organizeWritten = organizeChanged || nextOrganize.join(',') !== normalizeOrganizeFormats(current.organize_formats).join(',');
        const result = await tx.run(
          `UPDATE players SET game_level = ?, club_role = ?${hostChanged ? ', host_formats = ?, judge_level = ?' : ''}${organizeWritten ? ', organize_formats = ?' : ''}${statusChanged ? ', contact_status = ?, lifecycle_status = ?, pause_reason = ?' : ''}, stopped_attending = ?, from_other_city = ?, attends_sometimes = ?, updated_at = ? WHERE id = ?`,
          [data.game_level ?? current.game_level, clubRole,
            ...(hostChanged ? [nextFormats.join(','), legacyJudgeLevelFor(nextFormats)] : []),
            ...(organizeWritten ? [nextOrganize.length ? nextOrganize.join(',') : null] : []),
            ...(statusChanged ? [contactStatus, contactStatus, pauseReason] : []), stoppedAttending, otherCity ? 1 : 0, membership === 'guest' ? 1 : 0, now, id],
        );
        updated += Number(result.changes || 0);
      }
    });
    const actorId = getAuthenticatedOrganizerActorId(req) || 'organizer:unknown-session';
    const accessErrors: string[] = [];
    for (const change of organizerChanges) {
      try {
        await setOrganizerPlayerAccess(db, { playerId: change.id, enabled: change.enabled, actorId });
      } catch (error: any) {
        // The owner and the last cabinet holder keep their access; their role goes back to organizer.
        await db.run("UPDATE players SET club_role = 'organizer' WHERE id = ?", [change.id]);
        accessErrors.push(String(error?.message || 'Не удалось изменить доступ'));
      }
    }
    const warnings = [...accessErrors, ...otherCityWarnings];
    return res.json({ success: true, updated, ...(warnings.length ? { warnings: Array.from(new Set(warnings)) } : {}) });
  } catch (err: any) {
    return res.status(400).json({ error: err?.errors?.[0]?.message || 'Не удалось сохранить изменения', details: err.errors || err.message });
  }
});

// Account links of a profile the organizer made (owner, 2026-09-30): which Telegram/VK is linked,
// and a live personal claim link, if any.
router.get('/:id/account-links', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const player = await db.get<any>('SELECT id, telegram_user_id, telegram_username FROM players WHERE id = ? LIMIT 1', [String(req.params.id)]);
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });
    await ensurePlayerClaimLinkSchema(db);
    const claim = await db.get<any>(
      'SELECT expires_at FROM player_claim_links WHERE player_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
      [player.id, new Date().toISOString()],
    );
    return res.json({
      telegram: { linked: Boolean(player.telegram_user_id), username: player.telegram_username || null },
      vk: await loadPlayerVkIdentity(db, String(player.id)),
      claim_link: claim ? { expires_at: claim.expires_at } : null,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить привязки' });
  }
});

// «Ссылка для привязки»: a one-time personal link; a new one replaces the previous one.
router.post('/:id/claim-link', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const db = req.db || (await getDb());
    const link = await createPlayerClaimLink(db, {
      playerId: String(req.params.id), actorId: getAuthenticatedOrganizerActorId(req), baseUrl: getPublicAppBaseUrl(),
    });
    return res.status(201).json(link);
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось создать ссылку' });
  }
});

// Поле «VK»: link the profile to a VK page the organizer pasted.
router.post('/:id/vk-link', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    return res.json(await linkPlayerVkByProfileLink(db, { playerId: String(req.params.id), vk: req.body?.vk }));
  } catch (error: any) {
    return res.status(Number(error?.statusCode || 500)).json({ error: error?.message || 'Не удалось привязать VK' });
  }
});

// GET /api/players/:id - Detailed Player Card with complete history & tasks (Auth required)
router.get('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const player = await db.get(`
      SELECT p.*,
        (SELECT updated_at FROM player_avatars pa WHERE pa.player_id = p.id) as avatar_updated_at
      FROM players p WHERE p.id = ?
    `, [String(req.params.id)]);
    if (!player) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    // Evening Attendance History
    const eveningHistoryRows = await db.all(`
      SELECT ep.*, e.title as evening_title, e.starts_at as evening_date, e.format as evening_format, e.status as evening_status
      FROM evening_participants ep
      JOIN game_evenings e ON ep.evening_id = e.id
      WHERE ep.player_id = ?
      ORDER BY e.starts_at DESC
    `, [String(req.params.id)]);
    const eveningHistory = eveningHistoryRows.map((row: any) => ({ ...row, response_status: getEveningResponse(row) }));

    // Tasks associated with player
    const tasks = await db.all(`
      SELECT * FROM organizer_tasks
      WHERE player_id = ?
      ORDER BY status ASC, due_at ASC
    `, [String(req.params.id)]);

    // Financial Transactions
    const transactions = await db.all(`
      SELECT * FROM financial_transactions
      WHERE player_id = ?
      ORDER BY created_at DESC
    `, [String(req.params.id)]);

    // Player Activities
    const activities = await db.all(`
      SELECT * FROM player_activities
      WHERE player_id = ?
      ORDER BY occurred_at DESC
    `, [String(req.params.id)]);

    const futureBookings = eveningHistory.filter(
      (h: any) => h.evening_status !== 'completed' && h.evening_status !== 'cancelled'
    );
    // A marked visit counts as soon as attendance is taken, including the running evening.
    const attendedEvenings = eveningHistory.filter(
      (h: any) => h.attendance_status === 'attended' && (h.evening_status === 'completed' || h.evening_status === 'active')
    );
    const cancelledEvenings = eveningHistory.filter(
      (h: any) => h.response_status === 'declined'
    );
    const noShowEvenings = eveningHistory.filter(
      (h: any) => h.attendance_status === 'no_show' && h.evening_status === 'completed'
    );

    const attendanceCount = attendedEvenings.length;
    const noShowCount = noShowEvenings.length;

    const firstVisit = attendedEvenings.length > 0 ? attendedEvenings[attendedEvenings.length - 1].evening_date : null;
    const lastVisit = attendedEvenings.length > 0 ? attendedEvenings[0].evening_date : null;

    let daysSinceLastVisit: number | null = null;
    if (lastVisit) {
      const lastMs = new Date(lastVisit).getTime();
      daysSinceLastVisit = Math.floor((Date.now() - lastMs) / (1000 * 60 * 60 * 24));
    }

    const contact_status = player.contact_status || (player.lifecycle_status === 'blocked' ? 'blocked' : player.lifecycle_status === 'paused' ? 'paused' : 'normal');
    const engagement_stage = calculateEngagementStage(attendanceCount, lastVisit);

    const nextTask = tasks.find((t: any) => t.status === 'todo' || t.status === 'in_progress') || null;
    const gameProfile = await loadPlayerGameProfile(db, String(req.params.id));
    const achievements = await loadPlayerAchievementProfile(db, String(req.params.id));
    const staffStats = await loadPlayerStaffStats(db, String(req.params.id));

    res.json({
      ...player,
      staff_stats: staffStats,
      contact_status,
      engagement_stage,
      calculated_stage: engagement_stage,
      lifecycle_status: contact_status === 'blocked' ? 'blocked' : engagement_stage,
      stats: {
        attendanceCount,
        noShowCount,
        futureBookingsCount: futureBookings.length,
        cancelledCount: cancelledEvenings.length,
        firstVisit,
        lastVisit,
        daysSinceLastVisit,
      },
      futureBookings,
      attendedEvenings,
      cancelledEvenings,
      noShowEvenings,
      eveningHistory,
      tasks,
      nextTask,
      transactions,
      activities,
      ...gameProfile,
      achievements,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// GET /api/players/:id/activities - Get player activities (Auth required)
router.get('/:id/activities', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const activities = await db.all(
      'SELECT * FROM player_activities WHERE player_id = ? ORDER BY occurred_at DESC',
      [String(req.params.id)]
    );
    res.json(activities);
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// POST /api/players/:id/activities - Record new activity (Auth required)
router.post('/:id/activities', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const { type, outcome, description, evening_id, task_id, occurred_at } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'Тип активности обязателен' });
    }

    const activityId = `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const nowIso = new Date().toISOString();

    await db.run(
      `INSERT INTO player_activities (id, player_id, evening_id, task_id, type, outcome, description, occurred_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        activityId,
        String(req.params.id),
        evening_id || null,
        task_id || null,
        type,
        outcome || null,
        description || null,
        occurred_at || nowIso,
        nowIso,
      ]
    );

    const created = await db.get('SELECT * FROM player_activities WHERE id = ?', [activityId]);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// POST /api/players/:id/invite - Invite player to evening with optional task (Auth required)
router.post('/:id/invite', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const { evening_id, table_id, create_followup_task, task_due_days } = req.body;

    if (!evening_id) {
      return res.status(400).json({ error: 'Не выбран вечер' });
    }

    const player = await db.get('SELECT * FROM players WHERE id = ?', [String(req.params.id)]);
    if (!player) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    const contactStatus = player.contact_status || (player.lifecycle_status === 'blocked' ? 'blocked' : player.lifecycle_status === 'paused' ? 'paused' : 'normal');
    if (player.is_blocked === 1 || player.is_blocked === true || contactStatus === 'blocked' || contactStatus === 'paused') {
      return res.status(400).json({ error: 'Заблокированного или поставленного на паузу игрока нельзя пригласить' });
    }

    const nowIso = new Date().toISOString();

    if (player.do_not_invite_until && player.do_not_invite_until.trim() !== '') {
      if (new Date(player.do_not_invite_until).getTime() > Date.now()) {
        return res.status(400).json({ error: 'Игроку установлена задержка приглашений (do_not_invite_until)' });
      }
    }

    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [evening_id]);
    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }

    if (evening.status === 'completed' || evening.status === 'cancelled' || new Date(evening.starts_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Приглашать можно только на будущие и не завершенные вечера' });
    }

    let selectedTable: any = null;
    if (table_id) {
      selectedTable = await db.get('SELECT * FROM evening_tables WHERE id = ? AND evening_id = ?', [table_id, evening_id]);
      if (!selectedTable) {
        return res.status(400).json({ error: 'Выбранный стол не принадлежит этому вечеру' });
      }
    }

    // Determine price: table price if defined, otherwise evening price
    let price = evening.default_price || 0;
    if (selectedTable && selectedTable.default_price !== null && selectedTable.default_price !== undefined) {
      price = selectedTable.default_price;
    } else if (selectedTable && selectedTable.price !== null && selectedTable.price !== undefined) {
      price = selectedTable.price;
    }

    const paymentStatus = price === 0 ? 'waived' : 'unpaid';

    // Check if participant already exists
    let participant = await db.get(
      'SELECT * FROM evening_participants WHERE evening_id = ? AND player_id = ?',
      [evening_id, String(req.params.id)]
    );

    const tgUsername = player.telegram_username ? player.telegram_username.replace('@', '') : null;
    const telegramLink = tgUsername ? `https://t.me/${tgUsername}` : null;

    if (participant) {
      return res.json({
        success: true,
        alreadyParticipant: true,
        participant,
        response_status: getEveningResponse(participant),
        telegramLink,
        message: 'Игрок уже добавлен на этот вечер',
      });
    }

    const partId = crypto.randomUUID();
    await db.run(
      `INSERT INTO evening_participants (id, evening_id, player_id, table_id, response_status, registration_status, attendance_status, arrival_status, payment_status, amount_due, amount_paid, registered_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'unanswered', 'unanswered', 'pending', 'unknown', ?, ?, 0, ?, ?, ?)`,
      [partId, evening_id, String(req.params.id), selectedTable ? selectedTable.id : null, paymentStatus, price, nowIso, nowIso, nowIso]
    );
    participant = await db.get('SELECT * FROM evening_participants WHERE id = ?', [partId]);

    // Create player_activity (type=invite, outcome=sent, evening_id) if not exists
    const existingActivity = await db.get(
      `SELECT * FROM player_activities WHERE player_id = ? AND evening_id = ? AND type = 'invite'`,
      [String(req.params.id), evening_id]
    );

    if (!existingActivity) {
      const actId = `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const descTable = selectedTable ? ` (стол "${selectedTable.name}")` : '';
      const description = `Приглашение на вечер "${evening.title}"${descTable}`;

      await db.run(
        `INSERT INTO player_activities (id, player_id, evening_id, type, outcome, description, occurred_at, created_at)
         VALUES (?, ?, ?, 'invite', 'sent', ?, ?, ?)`,
        [actId, String(req.params.id), evening_id, description, nowIso, nowIso]
      );
    }

    // Create followup reminder task with key: invite-followup:{eveningId}:{playerId}
    const automationKey = `invite-followup:${evening_id}:${player.id}`;
    let followupTask = await db.get('SELECT * FROM organizer_tasks WHERE automation_key = ?', [automationKey]);

    if (create_followup_task) {
      const existingOpenTask = await db.get(
        `SELECT * FROM organizer_tasks WHERE automation_key = ? AND status NOT IN ('done', 'cancelled')`,
        [automationKey]
      );

      if (!existingOpenTask) {
        const taskId = `tsk_${crypto.randomUUID()}`;
        const days = typeof task_due_days === 'number' ? task_due_days : 2;
        const dueAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        const descTable = selectedTable ? ` (${selectedTable.name})` : '';

        await db.run(
          `INSERT OR IGNORE INTO organizer_tasks (id, title, description, type, status, priority, due_at, automation_key, player_id, evening_id, created_at, updated_at)
           VALUES (?, ?, ?, 'invite', 'todo', 'medium', ?, ?, ?, ?, ?, ?)`,
          [
            taskId,
            `Подтвердить запись: ${player.nickname} на ${evening.title}`,
            `Напомнить про игровой вечер ${evening.title}${descTable} (${evening.starts_at})`,
            dueAt,
            automationKey,
            player.id,
            evening.id,
            nowIso,
            nowIso,
          ]
        );
        followupTask = await db.get('SELECT * FROM organizer_tasks WHERE automation_key = ?', [automationKey]);
      } else {
        followupTask = existingOpenTask;
      }
    }

    // Run automations after invitation
    await runCrmAutomations(db);

    res.json({
      success: true,
      participant,
      task: followupTask,
      telegramLink,
      message: `Приглашение игрока ${player.nickname} на вечер "${evening.title}" создано`,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// POST /api/players/:id/communication-log - Record communication outcome (Auth required)
router.post('/:id/communication-log', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const player = await db.get('SELECT * FROM players WHERE id = ?', [String(req.params.id)]);
    if (!player) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    const { channel, outcome, comment, create_next_task, task_due_at, task_title } = req.body;

    if (!channel || !outcome) {
      return res.status(400).json({ error: 'Канал и результат общения обязательны' });
    }

    const channelLabels: Record<string, string> = {
      telegram: 'Telegram',
      phone: 'Телефон',
      in_person: 'Лично',
      other: 'Другое',
    };

    const outcomeLabels: Record<string, string> = {
      answered: 'Ответил',
      no_answer: 'Не ответил',
      interested: 'Заинтересован',
      declined: 'Отказался',
      call_later: 'Связаться позже',
    };

    const channelLabel = channelLabels[channel] || channel;
    const outcomeLabel = outcomeLabels[outcome] || outcome;

    const desc = `[${channelLabel}] ${outcomeLabel}${comment ? '. ' + comment.trim() : ''}`;
    const actId = `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const nowIso = new Date().toISOString();

    await db.run(
      `INSERT INTO player_activities (id, player_id, evening_id, task_id, type, outcome, description, occurred_at, created_at)
       VALUES (?, ?, null, null, 'contact', ?, ?, ?, ?)`,
      [actId, String(req.params.id), outcome, desc, nowIso, nowIso]
    );

    const activity = await db.get('SELECT * FROM player_activities WHERE id = ?', [actId]);

    let createdTask = null;
    if (create_next_task) {
      let dueAt: string | null = null;
      if (task_due_at && typeof task_due_at === 'string' && task_due_at.trim() !== '') {
        const parsed = new Date(task_due_at);
        if (!isNaN(parsed.getTime())) {
          dueAt = parsed.toISOString();
        }
      }

      const taskId = `task_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      await db.run(
        `INSERT INTO organizer_tasks (id, title, description, type, status, priority, due_at, player_id, created_at, updated_at)
         VALUES (?, ?, ?, 'call', 'todo', 'medium', ?, ?, ?, ?)`,
        [
          taskId,
          task_title || `Следующий контакт: ${player.nickname}`,
          comment || null,
          dueAt,
          player.id,
          nowIso,
          nowIso,
        ]
      );
      createdTask = await db.get('SELECT * FROM organizer_tasks WHERE id = ?', [taskId]);
    }

    res.status(201).json({
      success: true,
      activity,
      task: createdTask,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});


// POST /api/players/:id/historical-awards - Add an award from a tournament absent from the current DB
router.post('/:id/historical-awards', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const player = await db.get('SELECT id FROM players WHERE id = ?', [String(req.params.id)]);
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });

    const parsed = parseHistoricalAwardPayload(req.body);
    if (!parsed.value) return res.status(400).json({ error: parsed.error || 'Некорректные данные награды' });

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const value = parsed.value;
    await db.run(
      `INSERT INTO player_historical_awards
        (id, player_id, award_key, title, tournament_title, tournament_date, comment, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, String(req.params.id), value.awardKey, value.title, value.tournamentTitle, value.tournamentDate, value.comment, now, now]
    );

    const award = await db.get('SELECT * FROM player_historical_awards WHERE id = ?', [id]);
    const checkpoint_warning = await checkpointAfterPlayerMutation(db);
    res.status(201).json({ award, checkpoint_warning });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// PATCH /api/players/:id/historical-awards/:awardId - Edit a historical award
router.patch('/:id/historical-awards/:awardId', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const existing = await db.get(
      'SELECT id FROM player_historical_awards WHERE id = ? AND player_id = ?',
      [String(req.params.awardId), String(req.params.id)]
    );
    if (!existing) return res.status(404).json({ error: 'Историческая награда не найдена' });

    const parsed = parseHistoricalAwardPayload(req.body);
    if (!parsed.value) return res.status(400).json({ error: parsed.error || 'Некорректные данные награды' });

    const value = parsed.value;
    const now = new Date().toISOString();
    await db.run(
      `UPDATE player_historical_awards
          SET award_key = ?, title = ?, tournament_title = ?, tournament_date = ?, comment = ?, updated_at = ?
        WHERE id = ? AND player_id = ?`,
      [value.awardKey, value.title, value.tournamentTitle, value.tournamentDate, value.comment, now, String(req.params.awardId), String(req.params.id)]
    );

    const award = await db.get('SELECT * FROM player_historical_awards WHERE id = ?', [String(req.params.awardId)]);
    const checkpoint_warning = await checkpointAfterPlayerMutation(db);
    res.json({ award, checkpoint_warning });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// DELETE /api/players/:id/historical-awards/:awardId - Remove a historical award
router.delete('/:id/historical-awards/:awardId', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const result = await db.run(
      'DELETE FROM player_historical_awards WHERE id = ? AND player_id = ?',
      [String(req.params.awardId), String(req.params.id)]
    );
    if (!result.changes) return res.status(404).json({ error: 'Историческая награда не найдена' });

    const checkpoint_warning = await checkpointAfterPlayerMutation(db);
    res.json({ success: true, checkpoint_warning });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// PATCH /api/players/:id - Update player (Auth required)
router.patch('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const data = updatePlayerSchema.parse(req.body);
    const db = req.db || (await getDb());

    const player = await db.get('SELECT * FROM players WHERE id = ?', [String(req.params.id)]);
    if (!player) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    const fields: string[] = [];
    const values: any[] = [];

    const patchObj: Record<string, any> = { ...data };

    if (patchObj.telegram_username !== undefined) {
      if (typeof patchObj.telegram_username === 'string') {
        const cleaned = patchObj.telegram_username.replace('@', '').trim();
        patchObj.telegram_username = cleaned === '' ? null : cleaned;
      }
    }

    // Convert empty string optional fields to null
    ['full_name', 'phone', 'source', 'preferred_format', 'referred_by', 'do_not_invite_until', 'pause_reason', 'notes'].forEach((key) => {
      if (patchObj[key] === '') {
        patchObj[key] = null;
      }
    });

    if (patchObj.contact_status !== undefined) {
      patchObj.lifecycle_status = patchObj.contact_status;
    } else if (patchObj.lifecycle_status !== undefined && ['normal', 'paused', 'blocked'].includes(patchObj.lifecycle_status)) {
      patchObj.contact_status = patchObj.lifecycle_status;
    }

    // A player marked «Перестал ходить» keeps that pause when another pause is lifted: the bot still does not write.
    if (patchObj.contact_status === 'normal' && Number(player.stopped_attending || 0) === 1) {
      patchObj.contact_status = 'paused';
      patchObj.lifecycle_status = 'paused';
      patchObj.pause_reason = STOPPED_REASON;
    }

    // Blocking (archiving) a player or lifting a block is the owner's call, same as DELETE /api/players/:id.
    const wasBlocked = String(player.contact_status || player.lifecycle_status || '') === 'blocked';
    const willBeBlocked = patchObj.contact_status === undefined ? wasBlocked : patchObj.contact_status === 'blocked';
    if (wasBlocked !== willBeBlocked && !isClubOwner(req as AuthenticatedRequest)) {
      return res.status(403).json({ error: 'Заблокировать игрока или снять блокировку может только владелец клуба', code: 'club_owner_required' });
    }

    Object.entries(patchObj).forEach(([key, val]) => {
      if (val !== undefined) {
        fields.push(`${key} = ?`);
        values.push(val);
      }
    });

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(String(req.params.id));

      await db.run(`UPDATE players SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    const updated = await db.get('SELECT * FROM players WHERE id = ?', [String(req.params.id)]);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: 'Validation error', details: err.errors || err.message });
  }
});

// DELETE /api/players/:id - Soft archive player (Auth required)
router.delete('/:id', requireOrganizerAuth, requireClubOwner, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    await db.run('UPDATE players SET contact_status = ?, lifecycle_status = ?, updated_at = ? WHERE id = ?', ['blocked', 'blocked', new Date().toISOString(), String(req.params.id)]);
    res.json({ success: true, message: 'Игрок переведен в архив/заблокирован' });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// GET /api/players/:id/avatar - Retrieve player avatar
router.get('/:id/avatar', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const avatar = await db.get('SELECT * FROM player_avatars WHERE player_id = ?', [String(req.params.id)]) as any;
    if (avatar) {
      return res.json({
        data_url: `data:${avatar.mime_type};base64,${avatar.image_data.toString('base64')}`,
        mime_type: avatar.mime_type,
        byte_size: avatar.byte_size,
        width: avatar.width,
        height: avatar.height,
        updated_at: avatar.updated_at,
      });
    }

    const suppressed = await db.get('SELECT 1 FROM player_avatar_repository_suppression WHERE player_id = ?', [String(req.params.id)]);
    const asset = suppressed ? null : getRepositoryPlayerAvatarAsset(String(req.params.id));
    const assetPath = asset ? resolveRepositoryPlayerAvatarPath(String(req.params.id)) : null;
    if (!asset || !assetPath) {
      return res.status(404).json({ error: 'Аватар не найден' });
    }

    const image = fs.readFileSync(assetPath);
    return res.json({
      data_url: `data:image/jpeg;base64,${image.toString('base64')}`,
      mime_type: 'image/jpeg',
      byte_size: image.length,
      width: asset.width,
      height: asset.height,
      updated_at: `repository:${asset.sha256.slice(0, 16)}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// PUT /api/players/:id/avatar - Upload/Update player avatar
router.put('/:id/avatar', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    
    // First verify if the player actually exists
    const playerExists = await db.get('SELECT 1 FROM players WHERE id = ?', [String(req.params.id)]);
    if (!playerExists) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    const { data_url, width, height } = req.body;

    if (typeof data_url !== 'string') {
      return res.status(400).json({ error: 'Неверный формат данных' });
    }

    // 1. Prefix validation: only data:image/jpeg;base64,
    if (!data_url.startsWith('data:image/jpeg;base64,')) {
      return res.status(400).json({ error: 'Разрешен только формат JPEG (Base64)' });
    }

    // Extract base64 part
    const base64Data = data_url.substring('data:image/jpeg;base64,'.length);

    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      const cleanBase64 = base64Data.replace(/\s/g, '');
      if (!base64Regex.test(cleanBase64) || buffer.length === 0) {
        return res.status(400).json({ error: 'Некорректный Base64' });
      }
    } catch (err) {
      return res.status(400).json({ error: 'Некорректный Base64' });
    }

    // 2. Maximum decoded size 700 KB
    const MAX_BYTES = 700 * 1024;
    if (buffer.length > MAX_BYTES) {
      return res.status(400).json({ error: 'Размер изображения превышает 700 КБ' });
    }

    // 3. Width and height from 1 to 1024
    const w = Number(width);
    const h = Number(height);
    if (isNaN(w) || isNaN(h) || w < 1 || w > 1024 || h < 1 || h > 1024) {
      return res.status(400).json({ error: 'Неверные размеры изображения (должны быть от 1 до 1024)' });
    }

    // 4. JPEG starts with FF D8 FF and ends with FF D9
    if (buffer.length < 4) {
      return res.status(400).json({ error: 'Некорректные данные JPEG (слишком короткие)' });
    }
    const startsWithFFD8FF = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    const endsWithFFD9 = buffer[buffer.length - 2] === 0xFF && buffer[buffer.length - 1] === 0xD9;

    if (!startsWithFFD8FF || !endsWithFFD9) {
      return res.status(400).json({ error: 'Изображение не является валидным JPEG' });
    }

    const nowIso = new Date().toISOString();

    // Upsert by player_id
    await db.run(
      `INSERT OR REPLACE INTO player_avatars (player_id, mime_type, image_data, byte_size, width, height, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [String(req.params.id), 'image/jpeg', buffer, buffer.length, w, h, nowIso]
    );
    await db.run('DELETE FROM player_avatar_repository_suppression WHERE player_id = ?', [String(req.params.id)]);

    // Call checkpoint only for runtime DB
    const dbName = path.basename(db.dbPath);
    if (dbName === 'mafia_crm.runtime.sqlite') {
      await createPreviewCheckpoint(db);
    }

    res.json({ success: true, updated_at: nowIso });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// DELETE /api/players/:id/avatar - Delete player avatar
router.delete('/:id/avatar', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    
    // Idempotent deletion also suppresses the repository default for this player.
    await db.run('DELETE FROM player_avatars WHERE player_id = ?', [String(req.params.id)]);
    await db.run(
      'INSERT OR IGNORE INTO player_avatar_repository_suppression (player_id, created_at) VALUES (?, ?)',
      [String(req.params.id), new Date().toISOString()],
    );

    // Call checkpoint only for runtime DB
    const dbName = path.basename(db.dbPath);
    if (dbName === 'mafia_crm.runtime.sqlite') {
      await createPreviewCheckpoint(db);
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

export default router;
