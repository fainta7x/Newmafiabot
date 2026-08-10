import { Router, type Response } from 'express';
import crypto from 'crypto';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';

const router = Router();
router.use(requireOrganizerAuth);

type PeriodType = 'NOVICE' | 'RATING';
type PeriodStatus = 'draft' | 'active' | 'completed' | 'archived';

const parseType = (value: unknown): PeriodType | null => {
  const normalized = String(value || '').toUpperCase();
  return normalized === 'NOVICE' || normalized === 'RATING' ? normalized : null;
};

const parseStatus = (value: unknown): PeriodStatus | null => {
  const normalized = String(value || '').toLowerCase();
  return ['draft', 'active', 'completed', 'archived'].includes(normalized)
    ? normalized as PeriodStatus
    : null;
};

const parseDate = (value: unknown): string | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const autoIncludesEvening = (period: any, evening: any): boolean => {
  if (!Number(period.auto_include)) return false;
  const type = parseType(period.type);
  if (!type) return false;
  const format = normalizeEveningFormat(evening.format);
  if (format !== type) return false;
  const eveningTime = new Date(String(evening.starts_at || '')).getTime();
  const start = new Date(String(period.starts_at || '')).getTime();
  const end = new Date(String(period.ends_at || '')).getTime();
  return Number.isFinite(eveningTime) && eveningTime >= start && eveningTime <= end;
};

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = (req as any).db;
    const rows = await db.all<any>(`
      SELECT rp.*,
        (SELECT COUNT(*) FROM rating_period_evening_overrides reo WHERE reo.period_id = rp.id) AS evening_overrides_count,
        (SELECT COUNT(*) FROM rating_period_game_overrides rgo WHERE rgo.period_id = rp.id) AS game_overrides_count
      FROM rating_periods rp
      ORDER BY rp.starts_at DESC, rp.created_at DESC
    `);
    res.json(rows.map((row: any) => ({ ...row, auto_include: Boolean(row.auto_include) })));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Не удалось загрузить рейтинговые периоды' });
  }
});

router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = (req as any).db;
    const title = String(req.body?.title || '').trim();
    const type = parseType(req.body?.type);
    const startsAt = parseDate(req.body?.starts_at);
    const endsAt = parseDate(req.body?.ends_at);
    const status = req.body?.status === undefined ? 'active' : parseStatus(req.body?.status);
    if (!title) return res.status(400).json({ error: 'Укажи название периода' });
    if (!type) return res.status(400).json({ error: 'Тип периода должен быть NOVICE или RATING' });
    if (!startsAt || !endsAt) return res.status(400).json({ error: 'Укажи корректные даты начала и окончания' });
    if (new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
      return res.status(400).json({ error: 'Дата окончания не может быть раньше даты начала' });
    }
    if (!status) return res.status(400).json({ error: 'Некорректный статус периода' });

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO rating_periods (id, title, type, starts_at, ends_at, status, auto_include, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, type, startsAt, endsAt, status, req.body?.auto_include === false ? 0 : 1, req.body?.notes ? String(req.body.notes) : null, now, now],
    );
    const created = await db.get<any>('SELECT * FROM rating_periods WHERE id = ?', [id]);
    res.status(201).json({ ...created, auto_include: Boolean(created.auto_include) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Не удалось создать рейтинговый период' });
  }
});

router.patch('/:periodId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = (req as any).db;
    const current = await db.get<any>('SELECT * FROM rating_periods WHERE id = ?', [req.params.periodId]);
    if (!current) return res.status(404).json({ error: 'Рейтинговый период не найден' });

    const title = req.body?.title === undefined ? current.title : String(req.body.title || '').trim();
    const type = req.body?.type === undefined ? parseType(current.type) : parseType(req.body.type);
    const startsAt = req.body?.starts_at === undefined ? current.starts_at : parseDate(req.body.starts_at);
    const endsAt = req.body?.ends_at === undefined ? current.ends_at : parseDate(req.body.ends_at);
    const status = req.body?.status === undefined ? parseStatus(current.status) : parseStatus(req.body.status);
    if (!title || !type || !startsAt || !endsAt || !status) return res.status(400).json({ error: 'Некорректные параметры периода' });
    if (new Date(endsAt).getTime() < new Date(startsAt).getTime()) return res.status(400).json({ error: 'Дата окончания не может быть раньше даты начала' });
    const autoInclude = req.body?.auto_include === undefined ? Number(current.auto_include) : (req.body.auto_include ? 1 : 0);
    const notes = req.body?.notes === undefined ? current.notes : (req.body.notes ? String(req.body.notes) : null);

    await db.run(
      `UPDATE rating_periods SET title = ?, type = ?, starts_at = ?, ends_at = ?, status = ?, auto_include = ?, notes = ?, updated_at = ? WHERE id = ?`,
      [title, type, startsAt, endsAt, status, autoInclude, notes, new Date().toISOString(), req.params.periodId],
    );
    const updated = await db.get<any>('SELECT * FROM rating_periods WHERE id = ?', [req.params.periodId]);
    res.json({ ...updated, auto_include: Boolean(updated.auto_include) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Не удалось обновить рейтинговый период' });
  }
});

router.delete('/:periodId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = (req as any).db;
    const current = await db.get<any>('SELECT id FROM rating_periods WHERE id = ?', [req.params.periodId]);
    if (!current) return res.status(404).json({ error: 'Рейтинговый период не найден' });
    await db.run('DELETE FROM rating_periods WHERE id = ?', [req.params.periodId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Не удалось удалить рейтинговый период' });
  }
});

router.get('/:periodId/evenings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = (req as any).db;
    const period = await db.get<any>('SELECT * FROM rating_periods WHERE id = ?', [req.params.periodId]);
    if (!period) return res.status(404).json({ error: 'Рейтинговый период не найден' });
    const evenings = await db.all<any>(`
      SELECT e.id, e.title, e.starts_at, e.format, e.status,
             reo.included AS override_included,
             (SELECT COUNT(*) FROM games g WHERE g.evening_id = e.id AND g.archived_at IS NULL) AS games_count
        FROM game_evenings e
        LEFT JOIN rating_period_evening_overrides reo
          ON reo.period_id = ? AND reo.evening_id = e.id
       ORDER BY e.starts_at DESC
    `, [req.params.periodId]);

    res.json({
      period: { ...period, auto_include: Boolean(period.auto_include) },
      evenings: evenings.map((evening: any) => {
        const automatic = autoIncludesEvening(period, evening);
        const override = evening.override_included === null || evening.override_included === undefined
          ? null
          : Boolean(evening.override_included);
        return {
          ...evening,
          format: normalizeEveningFormat(evening.format),
          auto_included: automatic,
          override_included: override,
          effective_included: override ?? automatic,
        };
      }),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Не удалось загрузить вечера периода' });
  }
});

router.put('/:periodId/evenings/:eveningId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = (req as any).db;
    if (!await db.get('SELECT id FROM rating_periods WHERE id = ?', [req.params.periodId])) return res.status(404).json({ error: 'Рейтинговый период не найден' });
    if (!await db.get('SELECT id FROM game_evenings WHERE id = ?', [req.params.eveningId])) return res.status(404).json({ error: 'Игровой вечер не найден' });
    if (req.body?.included === null || req.body?.included === undefined) {
      await db.run('DELETE FROM rating_period_evening_overrides WHERE period_id = ? AND evening_id = ?', [req.params.periodId, req.params.eveningId]);
      return res.json({ success: true, override_included: null });
    }
    const included = req.body.included ? 1 : 0;
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO rating_period_evening_overrides (period_id, evening_id, included, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(period_id, evening_id) DO UPDATE SET included = excluded.included, updated_at = excluded.updated_at`,
      [req.params.periodId, req.params.eveningId, included, now, now],
    );
    res.json({ success: true, override_included: Boolean(included) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Не удалось изменить участие вечера' });
  }
});

router.get('/:periodId/games', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = (req as any).db;
    const period = await db.get<any>('SELECT * FROM rating_periods WHERE id = ?', [req.params.periodId]);
    if (!period) return res.status(404).json({ error: 'Рейтинговый период не найден' });
    const games = await db.all<any>(`
      SELECT g.id, g.global_game_number, g.game_date, g.winner_team, g.archived_at,
             e.id AS evening_id, e.title AS evening_title, e.starts_at, e.format,
             reo.included AS evening_override_included,
             rgo.included AS game_override_included
        FROM games g
        JOIN game_evenings e ON e.id = g.evening_id
        LEFT JOIN rating_period_evening_overrides reo
          ON reo.period_id = ? AND reo.evening_id = e.id
        LEFT JOIN rating_period_game_overrides rgo
          ON rgo.period_id = ? AND rgo.game_id = g.id
       WHERE g.archived_at IS NULL
       ORDER BY e.starts_at DESC, g.global_game_number DESC, g.id DESC
    `, [req.params.periodId, req.params.periodId]);

    res.json({
      period: { ...period, auto_include: Boolean(period.auto_include) },
      games: games.map((game: any) => {
        const automatic = autoIncludesEvening(period, game);
        const eveningOverride = game.evening_override_included === null || game.evening_override_included === undefined ? null : Boolean(game.evening_override_included);
        const gameOverride = game.game_override_included === null || game.game_override_included === undefined ? null : Boolean(game.game_override_included);
        return {
          ...game,
          format: normalizeEveningFormat(game.format),
          auto_included: automatic,
          evening_override_included: eveningOverride,
          game_override_included: gameOverride,
          effective_included: gameOverride ?? eveningOverride ?? automatic,
        };
      }),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Не удалось загрузить игры периода' });
  }
});

router.put('/:periodId/games/:gameId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = (req as any).db;
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'Некорректный ID игры' });
    if (!await db.get('SELECT id FROM rating_periods WHERE id = ?', [req.params.periodId])) return res.status(404).json({ error: 'Рейтинговый период не найден' });
    if (!await db.get('SELECT id FROM games WHERE id = ?', [gameId])) return res.status(404).json({ error: 'Игра не найдена' });
    if (req.body?.included === null || req.body?.included === undefined) {
      await db.run('DELETE FROM rating_period_game_overrides WHERE period_id = ? AND game_id = ?', [req.params.periodId, gameId]);
      return res.json({ success: true, override_included: null });
    }
    const included = req.body.included ? 1 : 0;
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO rating_period_game_overrides (period_id, game_id, included, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(period_id, game_id) DO UPDATE SET included = excluded.included, updated_at = excluded.updated_at`,
      [req.params.periodId, gameId, included, now, now],
    );
    res.json({ success: true, override_included: Boolean(included) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Не удалось изменить участие игры' });
  }
});

export default router;
