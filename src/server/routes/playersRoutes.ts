import { Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import { getDb } from '../../db/index.ts';
import { requireOrganizerAuth } from '../auth.ts';
import { createPlayerSchema, updatePlayerSchema } from '../validation.ts';
import { runCrmAutomations } from '../services/crmAutomationService.ts';
import { calculateEngagementStage } from '../../lib/playerUtils.ts';
import { createPreviewCheckpoint } from '../../db/previewDatabaseCheckpoint.ts';

const router = Router();

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

    const db = (req as any).db || (await getDb());

    // Query base player data with aggregated evening stats
    const players = await db.all(`
      SELECT p.*,
        (SELECT updated_at FROM player_avatars pa WHERE pa.player_id = p.id) as avatar_updated_at,
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

// GET /api/players/:id - Detailed Player Card with complete history & tasks (Auth required)
router.get('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const player = await db.get(`
      SELECT p.*,
        (SELECT updated_at FROM player_avatars pa WHERE pa.player_id = p.id) as avatar_updated_at
      FROM players p WHERE p.id = ?
    `, [req.params.id]);
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

    const contact_status = player.contact_status || (player.lifecycle_status === 'blocked' ? 'blocked' : player.lifecycle_status === 'paused' ? 'paused' : 'normal');
    const engagement_stage = calculateEngagementStage(attendanceCount, lastVisit);

    const nextTask = tasks.find((t: any) => t.status === 'todo' || t.status === 'in_progress') || null;

    res.json({
      ...player,
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
      [evening_id, req.params.id]
    );

    const tgUsername = player.telegram_username ? player.telegram_username.replace('@', '') : null;
    const telegramLink = tgUsername ? `https://t.me/${tgUsername}` : null;

    if (participant) {
      return res.json({
        success: true,
        alreadyParticipant: true,
        participant,
        registration_status: participant.registration_status,
        telegramLink,
        message: 'Игрок уже добавлен на этот вечер',
      });
    }

    const partId = crypto.randomUUID();
    await db.run(
      `INSERT INTO evening_participants (id, evening_id, player_id, table_id, registration_status, attendance_status, arrival_status, payment_status, amount_due, amount_paid, registered_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'invited', 'pending', 'unknown', ?, ?, 0, ?, ?, ?)`,
      [partId, evening_id, req.params.id, selectedTable ? selectedTable.id : null, paymentStatus, price, nowIso, nowIso, nowIso]
    );
    participant = await db.get('SELECT * FROM evening_participants WHERE id = ?', [partId]);

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

    const normalizedTg = data.telegram_username ? data.telegram_username.replace('@', '').trim() || null : null;
    const contactStatus = data.contact_status || (data.lifecycle_status === 'blocked' ? 'blocked' : data.lifecycle_status === 'paused' ? 'paused' : 'normal');

    await db.run(
      `INSERT INTO players (id, telegram_user_id, nickname, full_name, telegram_username, phone, contact_status, lifecycle_status, source, notes, elo, tokens, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.telegram_user_id || null,
        data.nickname,
        data.full_name || null,
        normalizedTg,
        data.phone || null,
        contactStatus,
        contactStatus,
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

// POST /api/players/:id/communication-log - Record communication outcome (Auth required)
router.post('/:id/communication-log', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const player = await db.get('SELECT * FROM players WHERE id = ?', [req.params.id]);
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
      [actId, req.params.id, outcome, desc, nowIso, nowIso]
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

    Object.entries(patchObj).forEach(([key, val]) => {
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
    await db.run('UPDATE players SET contact_status = ?, lifecycle_status = ?, updated_at = ? WHERE id = ?', ['blocked', 'blocked', new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Игрок переведен в архив/заблокирован' });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// GET /api/players/:id/avatar - Retrieve player avatar
router.get('/:id/avatar', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    const avatar = await db.get('SELECT * FROM player_avatars WHERE player_id = ?', [req.params.id]);
    if (!avatar) {
      return res.status(404).json({ error: 'Аватар не найден' });
    }

    res.json({
      data_url: `data:${avatar.mime_type};base64,${avatar.image_data.toString('base64')}`,
      mime_type: avatar.mime_type,
      byte_size: avatar.byte_size,
      width: avatar.width,
      height: avatar.height,
      updated_at: avatar.updated_at
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// PUT /api/players/:id/avatar - Upload/Update player avatar
router.put('/:id/avatar', requireOrganizerAuth, async (req, res) => {
  try {
    const db = (req as any).db || (await getDb());
    
    // First verify if the player actually exists
    const playerExists = await db.get('SELECT 1 FROM players WHERE id = ?', [req.params.id]);
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
      [req.params.id, 'image/jpeg', buffer, buffer.length, w, h, nowIso]
    );

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
    const db = (req as any).db || (await getDb());
    
    // Idempotent deletion
    await db.run('DELETE FROM player_avatars WHERE player_id = ?', [req.params.id]);

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
