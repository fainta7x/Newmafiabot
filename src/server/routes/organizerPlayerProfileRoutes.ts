import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db/index.ts';
import { getAuthenticatedOrganizerActorId, isClubOwner, requireClubOwner, requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { HOST_FORMATS, legacyJudgeLevelFor, normalizeHostFormats } from '../../lib/hostFormats.ts';
import { ORGANIZE_FORMATS, normalizeOrganizeFormats } from '../../lib/organizeFormats.ts';
import {
  hasOrganizerPlayerAccess,
  LastOrganizerAccessError,
  PrimaryOrganizerAccessError,
  setOrganizerPlayerAccess,
} from '../services/organizerPlayerAccessService.ts';

const router = Router();
const MIGRATED_GUEST_SOURCE = 'legacy_guest_migrated';

const classificationSchema = z.object({
  game_level: z.enum(['novice', 'club', 'tournament']).optional(), // «unrated» is retired
  club_role: z.enum(['guest', 'member', 'team', 'organizer']).optional(),
  // «Ходит иногда» apart from the role, so a helper or an organizer keeps it too.
  attends_sometimes: z.boolean().optional(),
  judge_level: z.enum(['none', 'trainee', 'host', 'judge']).optional(),
  // «Может вести» marks; they also write the judge_level compatibility summary.
  host_formats: z.array(z.enum(HOST_FORMATS)).optional(),
  // «Может проводить вечера»: only the owner gives these marks.
  organize_formats: z.array(z.enum(ORGANIZE_FORMATS)).optional(),
}).strict().refine(
  (value) => Object.values(value).some((item) => item !== undefined),
  'Не передано ни одного изменяемого поля',
);

const organizerAccessSchema = z.object({ enabled: z.boolean() }).strict();
const classificationKeys = ['game_level', 'club_role', 'attends_sometimes', 'judge_level', 'host_formats', 'organize_formats'] as const;

const isExactPlayerGet = (method: string, path: string) =>
  method === 'GET' && /^\/[^/]+\/?$/.test(path);

// Add the real organizer authorization state to the existing canonical CRM player detail
// without duplicating the large player-detail query owned by playersRoutes.
router.use(async (req, res, next) => {
  if (!isExactPlayerGet(req.method, req.path)) return next();

  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    if (!body || typeof body !== 'object' || Array.isArray(body) || body.error) return originalJson(body);
    const playerId = String(body.id || '').trim();
    if (!playerId) return originalJson(body);

    void (async () => {
      try {
        const db = req.db || (await getDb());
        const organizerAccess = await hasOrganizerPlayerAccess(db, playerId);
        originalJson({ ...body, organizer_player_access: organizerAccess });
      } catch (error: any) {
        originalJson({ ...body, organizer_player_access: false, organizer_player_access_error: error?.message || 'Не удалось проверить доступ к кабинету организатора' });
      }
    })();
    return res;
  }) as typeof res.json;
  return next();
});

// Canonical classification mutation. This intentionally handles only the three
// classification fields; all unrelated profile edits continue to the generic PATCH.
router.patch('/:id', requireOrganizerAuth, async (req, res, next) => {
  const hasClassificationField = classificationKeys.some((key) => Object.prototype.hasOwnProperty.call(req.body || {}, key));
  if (!hasClassificationField) return next();

  try {
    const parsed = classificationSchema.parse(req.body);
    const db = req.db || (await getDb());
    const playerId = String(req.params.id);
    const current = await db.get<any>('SELECT id, source, club_role FROM players WHERE id = ? LIMIT 1', [playerId]);
    if (!current || String(current.source || '') === MIGRATED_GUEST_SOURCE) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    // «Организатор клуба» opens the cabinet, so only the owner gives or takes this role.
    const wasOrganizer = String(current.club_role || '') === 'organizer';
    const willBeOrganizer = parsed.club_role === undefined ? wasOrganizer : parsed.club_role === 'organizer';
    if (wasOrganizer !== willBeOrganizer) {
      if (!isClubOwner(req as AuthenticatedRequest)) {
        return res.status(403).json({ error: 'Назначить или снять организатора клуба может только владелец', code: 'club_owner_required' });
      }
      const actorId = getAuthenticatedOrganizerActorId(req as AuthenticatedRequest) || 'organizer:unknown-session';
      await setOrganizerPlayerAccess(db, { playerId, enabled: willBeOrganizer, actorId });
    }

    if (parsed.organize_formats !== undefined && !isClubOwner(req as AuthenticatedRequest)) {
      return res.status(403).json({ error: 'Дать право проводить вечера может только владелец клуба', code: 'club_owner_required' });
    }
    const stored: Record<string, string | number | null> = {};
    if (parsed.organize_formats !== undefined) {
      const formats = normalizeOrganizeFormats(parsed.organize_formats);
      stored.organize_formats = formats.length ? formats.join(',') : null;
    }
    if (parsed.game_level !== undefined) stored.game_level = parsed.game_level;
    if (parsed.club_role !== undefined) stored.club_role = parsed.club_role;
    if (parsed.attends_sometimes !== undefined) stored.attends_sometimes = parsed.attends_sometimes ? 1 : 0;
    else if (parsed.club_role === 'guest' || parsed.club_role === 'member') stored.attends_sometimes = parsed.club_role === 'guest' ? 1 : 0;
    if (parsed.host_formats !== undefined) {
      const formats = normalizeHostFormats(parsed.host_formats);
      stored.host_formats = formats.join(',');
      stored.judge_level = legacyJudgeLevelFor(formats);
    } else if (parsed.judge_level !== undefined) {
      // An old client sets the ladder level: the marks are derived from it again.
      stored.judge_level = parsed.judge_level;
      stored.host_formats = null;
    }
    const supplied = Object.keys(stored);
    const fields = supplied.map((key) => `${key} = ?`);
    const values: any[] = supplied.map((key) => stored[key]);
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(playerId);

    await db.run(`UPDATE players SET ${fields.join(', ')} WHERE id = ?`, values);

    const updated = await db.get<any>('SELECT * FROM players WHERE id = ? LIMIT 1', [playerId]);
    if (!updated) return res.status(404).json({ error: 'Игрок не найден после сохранения' });

    const mismatch = supplied.find((key) => (updated[key] ?? null) !== stored[key]);
    if (mismatch) {
      return res.status(409).json({
        error: 'Сохранение не подтверждено',
        code: 'player_access_readback_mismatch',
        field: mismatch,
      });
    }

    const organizerAccess = await hasOrganizerPlayerAccess(db, playerId);
    return res.json({ ...updated, organizer_player_access: organizerAccess });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors || error.message });
    }
    if (error instanceof LastOrganizerAccessError || error instanceof PrimaryOrganizerAccessError) {
      return res.status(409).json({ error: error.message, code: error.code });
    }
    return res.status(500).json({ error: 'Не удалось сохранить игровой статус', message: error?.message || String(error) });
  }
});

router.patch('/:id/organizer-access', requireOrganizerAuth, requireClubOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const { enabled } = organizerAccessSchema.parse(req.body);
    const db = req.db || (await getDb());
    const playerId = String(req.params.id);
    const player = await db.get<any>('SELECT id, source FROM players WHERE id = ? LIMIT 1', [playerId]);
    if (!player || String(player.source || '') === MIGRATED_GUEST_SOURCE) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    const actorId = getAuthenticatedOrganizerActorId(req) || 'organizer:unknown-session';
    const result = await setOrganizerPlayerAccess(db, { playerId, enabled, actorId });
    const readback = await hasOrganizerPlayerAccess(db, playerId);
    if (readback !== enabled) {
      return res.status(409).json({ error: 'Изменение доступа не подтверждено', code: 'organizer_access_readback_mismatch' });
    }

    return res.json({ organizer_player_access: readback, changed: result.changed });
  } catch (error: any) {
    if (error instanceof LastOrganizerAccessError) {
      return res.status(409).json({ error: error.message, code: error.code });
    }
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors || error.message });
    }
    return res.status(Number(error?.statusCode || 500)).json({
      error: error?.message || 'Не удалось изменить доступ к кабинету организатора',
      code: error?.code || 'organizer_access_change_failed',
    });
  }
});

export default router;