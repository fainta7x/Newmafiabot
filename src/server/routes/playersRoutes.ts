import { Router } from 'express';
import crypto from 'crypto';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { createPlayerSchema, updatePlayerSchema } from '../validation.ts';
import { runCrmAutomations } from '../services/crmAutomationService.ts';

const router = Router();

// GET /api/players - List all players with advanced CRM filters (Auth required)
router.get('/', requireOrganizerAuth, async (req, res) => {
  try {
    const {
      lifecycle_status,
      never_attended,
      first_visit_only,
      inactive_days,
      has_open_tasks,
      search,
    } = req.query;

    const db = (req as any).db || (await getDb());

    // Query base player data with aggregated evening stats
    const players = await db.all(`
      SELECT p.*,
        (SELECT COUNT(*) FROM evening_participants ep JOIN game_evenings e ON ep.evening_id = e.id WHERE ep.player_id = p.id AND ep.attendance_status = 'attended' AND e.status = 'completed') as attendance_count,
        (SELECT COUNT(*) FROM evening_participants ep JOIN game_evenings e ON ep.evening_id = e.id WHERE ep.player_id = p.id AND ep.attendance_status = 'no_show' AND e.status = 'completed') as no_show_count,
        (SELECT MAX(e.starts_at) FROM evening_participants ep JOIN game_evenings e ON ep.evening_id = e.id WHERE ep.player_id = p.id AND ep.attendance_status = 'attended' AND e.status = 'completed') as last_visit,
        (SELECT MIN(e.starts_at) FROM evening_participants ep JOIN game_evenings e ON ep.evening_id = e.id WHERE ep.player_id = p.id AND ep.attendance_status = 'attended' AND e.status = 'completed') as first_visit,
        (SELECT COUNT(*) FROM organizer_tasks t WHERE t.player_id = p.id AND t.status != 'done' AND t.status != 'cancelled') as open_tasks_count,
        (SELECT COALESCE(SUM(amount_due - amount_paid), 0) FROM evening_participants ep WHERE ep.player_id = p.id AND ep.amount_due > ep.amount_paid) as outstanding_debt
      FROM players p
      ORDER BY p.nickname ASC
    `);

    const nowMs = Date.now();

    // Apply post-aggregation filters
    const filtered = players.filter((p: any) => {
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

      // 2. Lifecycle status filter
      if (lifecycle_status && p.lifecycle_status !== lifecycle_status) {
        return false;
      }

      // 3. Never attended filter
      if (never_attended === 'true' || never_attended === '1') {
        if (p.attendance_count > 0) return false;
      }

      // 4. First visit only filter (newcomers who haven't returned)
      if (first_visit_only === 'true' || first_visit_only === '1') {
        if (p.attendance_count !== 1) return false;
      }

      // 5. Inactive days filter (30 / 60 / 90 days since last visit)
      if (inactive_days && !isNaN(Number(inactive_days))) {
        const daysLimit = Number(inactive_days);
        if (!p.last_visit) return false;
        const lastVisitMs = new Date(p.last_visit).getTime();
        const daysSinceLastVisit = (nowMs - lastVisitMs) / (1000 * 60 * 60 * 24);
        if (daysSinceLastVisit < daysLimit) return false;
      }

      // 6. Has open tasks filter
      if (has_open_tasks === 'true' || has_open_tasks === '1') {
        if (p.open_tasks_count === 0) return false;
      }

      return true;
    }).map((p: any) => {
      let days_since_last_visit: number | null = null;
      if (p.last_visit) {
        const lastMs = new Date(p.last_visit).getTime();
        days_since_last_visit = Math.floor((nowMs - lastMs) / (1000 * 60 * 60 * 24));
      }
      return {
        ...p,
        days_since_last_visit,
      };
    });

    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// GET /api/players/:id - Detailed Player Card with complete history & tasks (Auth required)
router.get('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const player = await db.get('SELECT * FROM players WHERE id = ?', [req.params.id]);
    if (!player) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    // Evening Attendance History
    const eveningHistory = await db.all(`
      SELECT ep.*, e.title as evening_title, e.starts_at as evening_date, e.format as evening_format, e.status as evening_status
      FROM evening_participants ep
      JOIN game_evenings e ON ep.evening_id = e.id
      WHERE ep.player_id = ?
      ORDER BY e.starts_at DESC
    `, [req.params.id]);

    // Tasks associated with player
    const tasks = await db.all(`
      SELECT * FROM organizer_tasks
      WHERE player_id = ?
      ORDER BY status ASC, due_at ASC
    `, [req.params.id]);

    // Financial Transactions
    const transactions = await db.all(`
      SELECT * FROM financial_transactions
      WHERE player_id = ?
      ORDER BY created_at DESC
    `, [req.params.id]);

    // Player Activities
    const activities = await db.all(`
      SELECT * FROM player_activities
      WHERE player_id = ?
      ORDER BY occurred_at DESC
    `, [req.params.id]);

    const futureBookings = eveningHistory.filter(
      (h: any) => h.evening_status !== 'completed' && h.registration_status !== 'cancelled'
    );
    const attendedEvenings = eveningHistory.filter(
      (h: any) => h.attendance_status === 'attended' && h.evening_status === 'completed'
    );
    const cancelledEvenings = eveningHistory.filter(
      (h: any) => h.registration_status === 'cancelled'
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

    // Auto calculate lifecycle stage
    let calculated_stage = player.lifecycle_status;
    if (player.lifecycle_status !== 'blocked') {
      if (player.do_not_invite_until && new Date(player.do_not_invite_until).getTime() > Date.now()) {
        calculated_stage = 'inactive';
      } else if (attendanceCount === 0) {
        calculated_stage = 'lead';
      } else if (attendanceCount === 1) {
        calculated_stage = 'newcomer';
      } else if (attendanceCount >= 2 && attendanceCount <= 4) {
        calculated_stage = 'returning';
      } else if (attendanceCount >= 5) {
        if (daysSinceLastVisit !== null && daysSinceLastVisit > 45) {
          calculated_stage = 'inactive';
        } else {
          calculated_stage = 'regular';
        }
      }
    }

    const nextTask = tasks.find((t: any) => t.status === 'todo' || t.status === 'in_progress') || null;

    res.json({
      ...player,
      calculated_stage,
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
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// GET /api/players/:id/activities - Get player activities (Auth required)
router.get('/:id/activities', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const activities = await db.all(
      'SELECT * FROM player_activities WHERE player_id = ? ORDER BY occurred_at DESC',
      [req.params.id]
    );
    res.json(activities);
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// POST /api/players/:id/activities - Record new activity (Auth required)
router.post('/:id/activities', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
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
        req.params.id,
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
    const db = (req as any).db || (await getDb());
    const { evening_id, table_id, create_followup_task, task_due_days } = req.body;

    if (!evening_id) {
      return res.status(400).json({ error: 'Не указан evening_id' });
    }

    const player = await db.get('SELECT * FROM players WHERE id = ?', [req.params.id]);
    if (!player) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    if (player.is_blocked === 1 || player.is_blocked === true || player.lifecycle_status === 'blocked') {
      return res.status(400).json({ error: 'Заблокированного игрока нельзя пригласить' });
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
      [evening_id, req.params.id]
    );

    if (!participant) {
      const partId = crypto.randomUUID();
      await db.run(
        `INSERT INTO evening_participants (id, evening_id, player_id, table_id, registration_status, attendance_status, arrival_status, payment_status, amount_due, amount_paid, registered_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'invited', 'pending', 'unknown', ?, ?, 0, ?, ?, ?)`,
        [partId, evening_id, req.params.id, selectedTable ? selectedTable.id : null, paymentStatus, price, nowIso, nowIso, nowIso]
      );
      participant = await db.get('SELECT * FROM evening_participants WHERE id = ?', [partId]);
    }

    // Create player_activity (type=invite, outcome=sent, evening_id) if not exists
    const existingActivity = await db.get(
      `SELECT * FROM player_activities WHERE player_id = ? AND evening_id = ? AND type = 'invite'`,
      [req.params.id, evening_id]
    );

    if (!existingActivity) {
      const actId = `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const descTable = selectedTable ? ` (стол "${selectedTable.name}")` : '';
      const description = `Приглашение на вечер "${evening.title}"${descTable}`;

      await db.run(
        `INSERT INTO player_activities (id, player_id, evening_id, type, outcome, description, occurred_at, created_at)
         VALUES (?, ?, ?, 'invite', 'sent', ?, ?, ?)`,
        [actId, req.params.id, evening_id, description, nowIso, nowIso]
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

    const tgUsername = player.telegram_username ? player.telegram_username.replace('@', '') : null;
    const telegramLink = tgUsername ? `https://t.me/${tgUsername}` : null;

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

// POST /api/players - Create new player (Auth required)
router.post('/', requireOrganizerAuth, async (req, res) => {
  try {
    const data = createPlayerSchema.parse(req.body);
    const db = (req as any).db || (await getDb());

    // Check unique nickname
    const existingNick = await db.get('SELECT id FROM players WHERE nickname = ?', [data.nickname]);
    if (existingNick) {
      return res.status(400).json({ error: 'Игрок с таким никнеймом уже существует' });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO players (id, telegram_user_id, nickname, full_name, telegram_username, phone, lifecycle_status, source, notes, elo, tokens, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.telegram_user_id || null,
        data.nickname,
        data.full_name || '',
        data.telegram_username || '',
        data.phone || null,
        data.lifecycle_status,
        data.source || 'crm_manual',
        data.notes || null,
        data.elo,
        data.tokens,
        now,
        now,
      ]
    );

    const created = await db.get('SELECT * FROM players WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: 'Validation error', details: err.errors || err.message });
  }
});

// PATCH /api/players/:id - Update player (Auth required)
router.patch('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const data = updatePlayerSchema.parse(req.body);
    const db = (req as any).db || (await getDb());

    const player = await db.get('SELECT * FROM players WHERE id = ?', [req.params.id]);
    if (!player) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(data).forEach(([key, val]) => {
      if (val !== undefined) {
        fields.push(`${key} = ?`);
        values.push(val);
      }
    });

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(req.params.id);

      await db.run(`UPDATE players SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    const updated = await db.get('SELECT * FROM players WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: 'Validation error', details: err.errors || err.message });
  }
});

// DELETE /api/players/:id - Soft archive player (Auth required)
router.delete('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    await db.run('UPDATE players SET lifecycle_status = ?, updated_at = ? WHERE id = ?', ['blocked', new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Игрок переведен в архив/заблокирован' });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

export default router;
