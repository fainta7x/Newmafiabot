import crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';

const router = Router();

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireDeveloperReadAccess(req: Request, res: Response, next: NextFunction) {
  const dedicatedSecret = String(process.env.DEVELOPER_READ_KEY || '').trim();
  const botSecret = String(process.env.BOT_API_SECRET || '').trim();
  const supplied = String(req.header('X-Developer-Read-Key') || req.header('X-Bot-Token') || '').trim();

  if (!dedicatedSecret && !botSecret) {
    return res.status(503).json({ error: 'Developer read access is not configured' });
  }
  if (!supplied) {
    return res.status(401).json({ error: 'Missing developer read credential' });
  }

  const accepted = (dedicatedSecret && safeEqual(dedicatedSecret, supplied))
    || (botSecret && safeEqual(botSecret, supplied));
  if (!accepted) {
    return res.status(401).json({ error: 'Invalid developer read credential' });
  }
  return next();
}

router.use(requireDeveloperReadAccess);

router.get('/evenings', async (req, res) => {
  try {
    const rows = await req.db.all<any>(
      `SELECT id, title, starts_at, ends_at, venue, status, default_price, settled_at
         FROM game_evenings
        ORDER BY starts_at DESC`,
    );
    return res.json({ evenings: rows });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to load evenings' });
  }
});

router.get('/evenings/:id', async (req, res) => {
  try {
    const eveningId = String(req.params.id);
    const evening = await req.db.get<any>(
      `SELECT id, title, starts_at, ends_at, venue, status, default_price, settled_at
         FROM game_evenings
        WHERE id = ?`,
      [eveningId],
    );
    if (!evening) return res.status(404).json({ error: 'Evening not found' });

    const participants = await req.db.all<any>(
      `SELECT
         ep.id,
         ep.player_id,
         p.nickname,
         ep.response_status,
         ep.registration_status,
         ep.attendance_status,
         ep.arrival_status,
         ep.payment_status,
         ep.amount_due,
         ep.amount_paid,
         ep.registered_at,
         ep.confirmed_at,
         ep.checked_in_at
       FROM evening_participants ep
       JOIN players p ON p.id = ep.player_id
       WHERE ep.evening_id = ?
       ORDER BY ep.created_at ASC, p.nickname COLLATE NOCASE ASC`,
      [eveningId],
    );

    return res.json({ evening, participants });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to load evening' });
  }
});

router.get('/evenings/by-date/:date', async (req, res) => {
  try {
    const date = String(req.params.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
    }

    const evenings = await req.db.all<any>(
      `SELECT id, title, starts_at, ends_at, venue, status, default_price, settled_at
         FROM game_evenings
        WHERE substr(starts_at, 1, 10) = ?
        ORDER BY starts_at ASC`,
      [date],
    );

    const result = [];
    for (const evening of evenings) {
      const participants = await req.db.all<any>(
        `SELECT
           ep.id,
           ep.player_id,
           p.nickname,
           ep.response_status,
           ep.registration_status,
           ep.attendance_status,
           ep.arrival_status,
           ep.payment_status,
           ep.amount_due,
           ep.amount_paid,
           ep.registered_at,
           ep.confirmed_at,
           ep.checked_in_at
         FROM evening_participants ep
         JOIN players p ON p.id = ep.player_id
         WHERE ep.evening_id = ?
         ORDER BY ep.created_at ASC, p.nickname COLLATE NOCASE ASC`,
        [evening.id],
      );
      result.push({ evening, participants });
    }

    return res.json({ date, evenings: result });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to load evening by date' });
  }
});

export default router;
