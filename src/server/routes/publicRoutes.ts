import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { getDb } from '../../db/index.ts';
import { internalGetStandings, internalGetNominations } from './tournamentsRoutes.ts';

const router = Router();

// GET /api/public/evenings/:id - Public details of evening & tables (no participant list!)
router.get('/evenings/:id', async (req: Request, res: Response) => {
  try {
    const db = (req as any).db || (await getDb());
    const evening = await db.get(
      `SELECT id, title, starts_at, ends_at, venue, format, status, capacity, default_price, notes
       FROM game_evenings WHERE id = ?`,
      [req.params.id]
    );

    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }

    if (evening.status === 'cancelled') {
      return res.status(400).json({ error: 'Этот игровой вечер отменён' });
    }

    // Get tables
    let tables = await db.all(
      `SELECT t.id, t.name, t.format, t.capacity, t.starts_at, t.default_price,
        (SELECT COUNT(*) FROM evening_participants p WHERE p.table_id = t.id AND p.response_status IN ('going','late')) as registered_count
       FROM evening_tables t
       WHERE t.evening_id = ?
       ORDER BY t.sort_order ASC, t.created_at ASC`,
      [req.params.id]
    );

    if (tables.length === 0) {
      // Return synthetic default table
      const registeredCountRow = await db.get(
        `SELECT COUNT(*) as cnt FROM evening_participants WHERE evening_id = ? AND response_status IN ('going','late')`,
        [req.params.id]
      );
      const registered = registeredCountRow?.cnt || 0;
      tables = [
        {
          id: 'default',
          name: 'Основной стол',
          format: evening.format || 'STANDARD',
          capacity: evening.capacity || 10,
          registered_count: registered,
          free_spots: Math.max(0, (evening.capacity || 10) - registered),
        },
      ];
    } else {
      tables = tables.map((t: any) => ({
        ...t,
        free_spots: Math.max(0, t.capacity - t.registered_count),
      }));
    }

    res.json({
      id: evening.id,
      title: evening.title,
      starts_at: evening.starts_at,
      ends_at: evening.ends_at,
      venue: evening.venue || 'Суп с Котом',
      format: evening.format,
      status: evening.status,
      capacity: evening.capacity,
      default_price: evening.default_price,
      notes: evening.notes,
      tables,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// POST /api/public/evenings/:id/join - Public player signup
router.get('/join/:id', (req, res) => res.redirect(`/api/public/evenings/${req.params.id}`));

router.post('/evenings/:id/join', async (req: Request, res: Response) => {
  try {
    const db = (req as any).db || (await getDb());
    const eveningId = req.params.id;
    const { name, nickname, telegram_username, phone, table_id, source } = req.body;

    const rawName = (nickname || name || '').trim();
    if (!rawName) {
      return res.status(400).json({ error: 'Укажите имя или никнейм' });
    }

    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [eveningId]);
    if (!evening) {
      return res.status(404).json({ error: 'Игровой вечер не найден' });
    }

    if (evening.status === 'cancelled' || evening.status === 'completed') {
      return res.status(400).json({ error: 'Запись на этот вечер недоступна' });
    }

    // Normalize telegram & phone
    const normalizedTg = telegram_username ? telegram_username.replace(/^@/, '').trim().toLowerCase() : null;
    const normalizedPhone = phone ? phone.replace(/\D/g, '') : null;

    // Search existing player
    let player: any = null;
    if (normalizedTg) {
      player = await db.get('SELECT * FROM players WHERE LOWER(telegram_username) = ?', [normalizedTg]);
    }
    if (!player && normalizedPhone && normalizedPhone.length >= 10) {
      player = await db.get('SELECT * FROM players WHERE phone LIKE ?', [`%${normalizedPhone.slice(-10)}%`]);
    }
    if (!player) {
      player = await db.get('SELECT * FROM players WHERE LOWER(nickname) = ?', [rawName.toLowerCase()]);
    }

    const nowIso = new Date().toISOString();

    if (!player) {
      const playerId = `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      await db.run(
        `INSERT INTO players (id, nickname, telegram_username, phone, lifecycle_status, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          playerId,
          rawName,
          normalizedTg || null,
          phone || null,
          'normal',
          source || 'Публичная запись',
          nowIso,
          nowIso,
        ]
      );
      player = { id: playerId, nickname: rawName };
    } else {
      // Update missing contact info if provided
      if ((!player.telegram_username && normalizedTg) || (!player.phone && phone)) {
        await db.run(
          `UPDATE players SET telegram_username = COALESCE(telegram_username, ?), phone = COALESCE(phone, ?), updated_at = ? WHERE id = ?`,
          [normalizedTg || null, phone || null, nowIso, player.id]
        );
      }
    }

    // Check existing participation
    const existingParticipation = await db.get(
      'SELECT * FROM evening_participants WHERE evening_id = ? AND player_id = ?',
      [eveningId, player.id]
    );

    if (existingParticipation) {
      return res.json({
        success: true,
        alreadyRegistered: true,
        message: 'Вы уже записаны на этот вечер!',
        participant: existingParticipation,
      });
    }

    // Check table & capacity
    let targetTableId = table_id && table_id !== 'default' ? table_id : null;
    let isFull = false;
    let selectedTableName = 'Основной стол';

    if (targetTableId) {
      const tbl = await db.get('SELECT * FROM evening_tables WHERE id = ?', [targetTableId]);
      if (tbl) {
        selectedTableName = tbl.name;
        const countRow = await db.get(
          `SELECT COUNT(*) as cnt FROM evening_participants WHERE table_id = ? AND response_status IN ('going','late')`,
          [targetTableId]
        );
        if ((countRow?.cnt || 0) >= tbl.capacity) {
          isFull = true;
        }
      }
    } else {
      // Check total evening capacity
      const countRow = await db.get(
        `SELECT COUNT(*) as cnt FROM evening_participants WHERE evening_id = ? AND response_status IN ('going','late')`,
        [eveningId]
      );
      if ((countRow?.cnt || 0) >= (evening.capacity || 20)) {
        isFull = true;
      }
    }

    const regStatus = isFull ? 'waitlist' : 'registered';
    const amountDue = evening.default_price || 0;
    const paymentStatus = amountDue === 0 ? 'waived' : 'unpaid';
    const participantId = existingParticipation
      ? existingParticipation.id
      : `part_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    if (existingParticipation) {
      await db.run(
        `UPDATE evening_participants
         SET registration_status = ?, table_id = ?, amount_due = ?, registered_at = ?, updated_at = ?
         WHERE id = ?`,
        [regStatus, targetTableId, amountDue, nowIso, nowIso, participantId]
      );
    } else {
      await db.run(
        `INSERT INTO evening_participants (id, evening_id, player_id, table_id, response_status, registration_status, attendance_status, arrival_status, payment_status, amount_due, amount_paid, registered_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', 'unknown', ?, ?, 0, ?, ?, ?)`,
        [participantId, eveningId, player.id, targetTableId, regStatus, paymentStatus, amountDue, nowIso, nowIso, nowIso]
      );
    }

    // Log activity
    const activityId = `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    await db.run(
      `INSERT INTO player_activities (id, player_id, evening_id, type, outcome, description, occurred_at, created_at)
       VALUES (?, ?, ?, 'response', 'confirmed', ?, ?, ?)`,
      [activityId, player.id, eveningId, `Самостоятельная запись на вечер: ${selectedTableName}`, nowIso, nowIso]
    );

    res.json({
      success: true,
      registration_status: regStatus,
      tableName: selectedTableName,
      message: isFull
        ? `Вы добавлены в резерв на «${selectedTableName}». Организатор свяжется с вами при освобождении места.`
        : `Вы успешно записаны на «${selectedTableName}»!`,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// GET /api/public/tournaments/results/:token - Public tournament results (no authorization required)
router.get('/tournaments/results/:token', async (req: Request, res: Response) => {
  try {
    const db = (req as any).db || (await getDb());
    const { token } = req.params;

    const tournament = await db.get(
      `SELECT id, title, date, venue, stage, chief_judge_name, status, results_published_at
       FROM tournaments WHERE public_token = ?`,
      [token]
    );

    if (!tournament) {
      return res.status(404).json({ error: 'Результаты турнира не найдены' });
    }

    if (tournament.status !== 'completed' || !tournament.results_published_at) {
      return res.status(404).json({ error: 'Результаты турнира ещё не опубликованы' });
    }

    const standingsData = await internalGetStandings(db, tournament.id);
    const nominationsData = await internalGetNominations(db, tournament.id);

    res.json({
      tournament: {
        id: tournament.id,
        title: tournament.title,
        date: tournament.date,
        venue: tournament.venue,
        stage: tournament.stage,
        chief_judge_name: tournament.chief_judge_name,
        results_published_at: tournament.results_published_at,
      },
      standings: standingsData.standings,
      nominations: nominationsData.nominations,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// GET /api/public/player-avatar-data/:filename - Public player avatar data URL
router.get('/player-avatar-data/:filename', (req: Request, res: Response) => {
  try {
    const filename = path.basename(req.params.filename);
    const avatarsDir =
      process.env.NODE_ENV === 'production'
        ? path.join(process.cwd(), 'dist', 'player-avatars')
        : path.join(process.cwd(), 'public', 'player-avatars');

    const filePath = path.join(avatarsDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Avatar file not found' });
    }

    let fileBuffer = fs.readFileSync(filePath);

    // Auto-repair header/trailer if JPEG non-ASCII bytes were stored with UTF-8 replacement characters
    const ufffd4 = Buffer.from([0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd]);
    if (fileBuffer.subarray(0, 12).equals(ufffd4)) {
      const head = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      let body = fileBuffer.subarray(12);
      const ufffd2 = Buffer.from([0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd]);
      if (body.subarray(body.length - 6).equals(ufffd2)) {
        body = body.subarray(0, body.length - 6);
      }
      const tail = Buffer.from([0xff, 0xd9]);
      fileBuffer = Buffer.concat([head, body, tail]);
    }

    const base64 = fileBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64}`;

    res.json({ dataUrl });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to read avatar file', message: err.message });
  }
});

export default router;
