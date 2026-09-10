import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db/index.ts';
import { getAuthenticatedOrganizerActorId, requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import {
  hasOrganizerPlayerAccess,
  LastOrganizerAccessError,
  setOrganizerPlayerAccess,
} from '../services/organizerPlayerAccessService.ts';

const router = Router();
const MIGRATED_GUEST_SOURCE = 'legacy_guest_migrated';

const classificationSchema = z.object({
  game_level: z.enum(['unrated', 'novice', 'club', 'tournament']).optional(),
  club_role: z.enum(['guest', 'member', 'team', 'organizer']).optional(),
  judge_level: z.enum(['none', 'trainee', 'host', 'judge']).optional(),
}).strict().refine(
  (value) => Object.values(value).some((item) => item !== undefined),
  'Не передано ни одного изменяемого поля',
);

const organizerAccessSchema = z.object({ enabled: z.boolean() }).strict();
const classificationKeys = ['game_level', 'club_role', 'judge_level'] as const;

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
        originalJson({ ...body, organizer_player_access: false, organizer_player_access_error: error?.message || 'Не удалось проверить доступ к CRM' });
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
    const current = await db.get<any>('SELECT id, source FROM players WHERE id = ? LIMIT 1', [playerId]);
    if (!current || String(current.source || '') === MIGRATED_GUEST_SOURCE) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    const supplied = classificationKeys.filter((key) => parsed[key] !== undefined);
    const fields = supplied.map((key) => `${key} = ?`);
    const values: any[] = supplied.map((key) => parsed[key]);
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(playerId);

    await db.run(`UPDATE players SET ${fields.join(', ')} WHERE id = ?`, values);

    const updated = await db.get<any>('SELECT * FROM players WHERE id = ? LIMIT 1', [playerId]);
    if (!updated) return res.status(404).json({ error: 'Игрок не найден после сохранения' });

    const mismatch = supplied.find((key) => updated[key] !== parsed[key]);
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
    return res.status(500).json({ error: 'Не удалось сохранить игровой статус', message: error?.message || String(error) });
  }
});

router.patch('/:id/organizer-access', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
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
      error: error?.message || 'Не удалось изменить доступ к CRM организатора',
      code: error?.code || 'organizer_access_change_failed',
    });
  }
});

export default router;