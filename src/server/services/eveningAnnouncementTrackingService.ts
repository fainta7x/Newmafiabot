import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';

type Db = any;

const RESPONSE_STATUSES = new Set(['going', 'late', 'thinking', 'declined']);

const contactStatus = (player: any) => String(
  player.contact_status
  || (player.lifecycle_status === 'blocked' ? 'blocked' : player.lifecycle_status === 'paused' ? 'paused' : 'normal'),
);

const isCurrentlyEligible = (player: any, evening: any, nowMs = Date.now()) => {
  if (!String(player.telegram_user_id || '').trim()) return false;
  if (contactStatus(player) !== 'normal') return false;
  if (player.do_not_invite_until) {
    const until = new Date(String(player.do_not_invite_until)).getTime();
    if (Number.isFinite(until) && until > nowMs) return false;
  }
  return playerLevelAllowsEveningFormat(player.game_level, evening.format);
};

const responseStatus = (row: any) => {
  const status = String(row.response_status || row.registration_status || '').trim();
  return RESPONSE_STATUSES.has(status) ? status : 'unanswered';
};

export async function ensureEveningAnnouncementTrackingSchema(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS evening_announcement_dm_delivery (
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      telegram_user_id TEXT NOT NULL,
      telegram_message_id INTEGER,
      sent_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (evening_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS evening_announcement_dm_tracking (
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      telegram_user_id TEXT NOT NULL,
      first_message_id INTEGER,
      first_sent_at TEXT,
      delivery_status TEXT NOT NULL DEFAULT 'pending',
      last_attempt_at TEXT,
      last_error TEXT,
      reminder_count INTEGER NOT NULL DEFAULT 0,
      last_reminder_attempt_at TEXT,
      last_reminded_at TEXT,
      last_reminder_message_id INTEGER,
      last_reminder_error TEXT,
      last_reminder_campaign INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (evening_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS evening_reminder_campaign_state (
      evening_id TEXT PRIMARY KEY REFERENCES game_evenings(id) ON DELETE CASCADE,
      generation INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_evening_announcement_tracking_evening
      ON evening_announcement_dm_tracking(evening_id, delivery_status);
  `);

  const columns = await db.all<any>('PRAGMA table_info(evening_announcement_dm_tracking)');
  if (!columns.some((column: any) => String(column.name) === 'last_reminder_campaign')) {
    await db.run('ALTER TABLE evening_announcement_dm_tracking ADD COLUMN last_reminder_campaign INTEGER NOT NULL DEFAULT 0');
  }

  const now = new Date().toISOString();
  await db.run(
    `INSERT OR IGNORE INTO evening_announcement_dm_tracking (
       evening_id, player_id, telegram_user_id,
       first_message_id, first_sent_at, delivery_status,
       last_attempt_at, last_error, reminder_count,
       created_at, updated_at
     )
     SELECT evening_id, player_id, telegram_user_id,
            telegram_message_id, sent_at, 'sent',
            sent_at, NULL, 0,
            sent_at, ?
       FROM evening_announcement_dm_delivery`,
    [now],
  );
}

export async function getReminderCampaignGeneration(db: Db, eveningId: string): Promise<number> {
  await ensureEveningAnnouncementTrackingSchema(db);
  const row = await db.get(
    'SELECT generation FROM evening_reminder_campaign_state WHERE evening_id = ?',
    [eveningId],
  );
  return Number(row?.generation || 0);
}

export async function beginReminderCampaign(db: Db, eveningId: string): Promise<number> {
  await ensureEveningAnnouncementTrackingSchema(db);
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO evening_reminder_campaign_state (evening_id, generation, updated_at)
     VALUES (?, 1, ?)
     ON CONFLICT(evening_id) DO UPDATE SET
       generation = evening_reminder_campaign_state.generation + 1,
       updated_at = excluded.updated_at`,
    [eveningId, now],
  );
  const row = await db.get(
    'SELECT generation FROM evening_reminder_campaign_state WHERE evening_id = ?',
    [eveningId],
  );
  return Number(row?.generation || 1);
}

const loadEvening = async (db: Db, eveningId: string) => db.get(
  `SELECT id, title, starts_at, venue, format, status, settled_at
     FROM game_evenings WHERE id = ?`,
  [eveningId],
);

const loadAudienceRows = async (db: Db, eveningId: string) => db.all(
  `SELECT
      p.id, p.nickname, p.telegram_user_id, p.telegram_username, p.phone,
      p.contact_status, p.lifecycle_status, p.do_not_invite_until, p.game_level,
      ep.response_status, ep.registration_status,
      t.first_message_id, t.first_sent_at, t.delivery_status,
      t.last_attempt_at, t.last_error, t.reminder_count,
      t.last_reminder_attempt_at, t.last_reminded_at,
      t.last_reminder_message_id, t.last_reminder_error, t.last_reminder_campaign,
      CASE WHEN t.player_id IS NULL THEN 0 ELSE 1 END AS tracked
    FROM players p
    LEFT JOIN evening_participants ep
      ON ep.evening_id = ? AND ep.player_id = p.id
    LEFT JOIN evening_announcement_dm_tracking t
      ON t.evening_id = ? AND t.player_id = p.id
    WHERE p.telegram_user_id IS NOT NULL AND TRIM(p.telegram_user_id) <> ''
    ORDER BY p.nickname COLLATE NOCASE ASC`,
  [eveningId, eveningId],
);

const audience = async (db: Db, eveningId: string) => {
  await ensureEveningAnnouncementTrackingSchema(db);
  const evening = await loadEvening(db, eveningId);
  if (!evening) return { evening: null, players: [] as any[] };
  const rows = await loadAudienceRows(db, eveningId);
  const players = rows
    .filter((row: any) => Boolean(row.tracked) || isCurrentlyEligible(row, evening))
    .map((row: any) => ({
      id: String(row.id),
      nickname: String(row.nickname || 'Игрок'),
      telegram_user_id: String(row.telegram_user_id || ''),
      telegram_username: row.telegram_username ? String(row.telegram_username).replace(/^@/, '') : null,
      phone: row.phone ? String(row.phone) : null,
      game_level: String(row.game_level || 'club'),
      response_status: responseStatus(row),
      first_message_id: row.first_message_id == null ? null : Number(row.first_message_id),
      first_sent_at: row.first_sent_at || null,
      delivery_status: row.first_sent_at ? 'sent' : String(row.delivery_status || 'pending'),
      last_attempt_at: row.last_attempt_at || null,
      last_error: row.last_error || null,
      reminder_count: Number(row.reminder_count || 0),
      last_reminder_attempt_at: row.last_reminder_attempt_at || null,
      last_reminded_at: row.last_reminded_at || null,
      last_reminder_message_id: row.last_reminder_message_id == null ? null : Number(row.last_reminder_message_id),
      last_reminder_error: row.last_reminder_error || null,
      last_reminder_campaign: Number(row.last_reminder_campaign || 0),
      eligible_now: isCurrentlyEligible(row, evening),
    }));
  return { evening, players };
};

export async function loadInitialAnnouncementRecipients(db: Db, eveningId: string) {
  const { evening, players } = await audience(db, eveningId);
  if (!evening) return null;
  return {
    evening,
    recipients: players
      .filter((player: any) => player.eligible_now && !player.first_sent_at && player.response_status === 'unanswered')
      .map((player: any) => ({
        id: player.id,
        nickname: player.nickname,
        telegram_user_id: player.telegram_user_id,
        telegram_username: player.telegram_username,
        game_level: player.game_level,
        previous_error: player.last_error,
      })),
  };
}

export async function loadReminderRecipients(db: Db, eveningId: string) {
  const { evening, players } = await audience(db, eveningId);
  if (!evening) return null;
  const campaignGeneration = await getReminderCampaignGeneration(db, eveningId);
  return {
    evening,
    campaign_generation: campaignGeneration,
    recipients: players
      .filter((player: any) => (
        player.eligible_now
        && player.first_sent_at
        && player.response_status === 'unanswered'
        && (campaignGeneration <= 0 || player.last_reminder_campaign !== campaignGeneration)
      ))
      .map((player: any) => ({
        id: player.id,
        nickname: player.nickname,
        telegram_user_id: player.telegram_user_id,
        telegram_username: player.telegram_username,
        first_message_id: player.first_message_id,
        reminder_count: player.reminder_count,
        last_reminded_at: player.last_reminded_at,
        campaign_generation: campaignGeneration,
      })),
  };
}

export async function loadAnnouncementOverview(db: Db, eveningId: string) {
  const { evening, players } = await audience(db, eveningId);
  if (!evening) return null;

  const sent = players.filter((player: any) => Boolean(player.first_sent_at));
  const answered = players.filter((player: any) => player.eligible_now && player.response_status !== 'unanswered');
  const unanswered = sent.filter((player: any) => player.eligible_now && player.response_status === 'unanswered');
  const failed = players.filter((player: any) => (
    player.eligible_now
    && player.response_status === 'unanswered'
    && !player.first_sent_at
    && player.delivery_status === 'failed'
  ));
  const notSent = players.filter((player: any) => (
    player.response_status === 'unanswered'
    && player.eligible_now
    && !player.first_sent_at
    && player.delivery_status !== 'failed'
  ));

  return {
    evening,
    summary: {
      audience: players.filter((player: any) => player.eligible_now).length,
      sent: sent.length,
      answered: answered.length,
      unanswered: unanswered.length,
      failed: failed.length,
      not_sent: notSent.length,
      reminded: unanswered.filter((player: any) => player.reminder_count > 0).length,
    },
    players: players.map((player: any) => ({
      ...player,
      attention_status: player.response_status !== 'unanswered'
        ? 'answered'
        : player.first_sent_at
          ? 'unanswered'
          : player.delivery_status === 'failed'
            ? 'failed'
            : 'not_sent',
    })),
  };
}

export async function recordInitialAnnouncementAttempt(
  db: Db,
  input: {
    eveningId: string;
    playerId: string;
    telegramUserId: string;
    success: boolean;
    telegramMessageId?: number | null;
    error?: string | null;
  },
) {
  await ensureEveningAnnouncementTrackingSchema(db);
  const now = new Date().toISOString();
  const messageId = input.success && input.telegramMessageId ? Number(input.telegramMessageId) : null;
  const error = input.success ? null : String(input.error || 'Telegram delivery failed').slice(0, 1000);

  await db.run(
    `INSERT INTO evening_announcement_dm_tracking (
       evening_id, player_id, telegram_user_id,
       first_message_id, first_sent_at, delivery_status,
       last_attempt_at, last_error, reminder_count,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(evening_id, player_id) DO UPDATE SET
       telegram_user_id = excluded.telegram_user_id,
       first_message_id = CASE WHEN excluded.first_sent_at IS NOT NULL THEN excluded.first_message_id ELSE evening_announcement_dm_tracking.first_message_id END,
       first_sent_at = COALESCE(evening_announcement_dm_tracking.first_sent_at, excluded.first_sent_at),
       delivery_status = CASE WHEN evening_announcement_dm_tracking.first_sent_at IS NOT NULL THEN 'sent' ELSE excluded.delivery_status END,
       last_attempt_at = excluded.last_attempt_at,
       last_error = CASE WHEN evening_announcement_dm_tracking.first_sent_at IS NOT NULL THEN NULL ELSE excluded.last_error END,
       updated_at = excluded.updated_at`,
    [
      input.eveningId,
      input.playerId,
      input.telegramUserId,
      messageId,
      input.success ? now : null,
      input.success ? 'sent' : 'failed',
      now,
      error,
      now,
      now,
    ],
  );

  if (input.success && messageId) {
    await db.run(
      `INSERT OR REPLACE INTO evening_announcement_dm_delivery
         (evening_id, player_id, telegram_user_id, telegram_message_id, sent_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [input.eveningId, input.playerId, input.telegramUserId, messageId, now, now],
    );
  }

  return { success: true, attempted_at: now };
}

export async function recordReminderAttempt(
  db: Db,
  input: {
    eveningId: string;
    playerId: string;
    telegramUserId: string;
    success: boolean;
    telegramMessageId?: number | null;
    error?: string | null;
  },
) {
  await ensureEveningAnnouncementTrackingSchema(db);
  const now = new Date().toISOString();
  const error = input.success ? null : String(input.error || 'Telegram reminder failed').slice(0, 1000);
  const current = await db.get(
    `SELECT player_id FROM evening_announcement_dm_tracking
      WHERE evening_id = ? AND player_id = ?`,
    [input.eveningId, input.playerId],
  );
  if (!current) throw new Error('Первичная доставка анонса не найдена');
  const campaignGeneration = await getReminderCampaignGeneration(db, input.eveningId);

  await db.run(
    `UPDATE evening_announcement_dm_tracking
        SET telegram_user_id = ?,
            reminder_count = reminder_count + ?,
            last_reminder_attempt_at = ?,
            last_reminded_at = CASE WHEN ? = 1 THEN ? ELSE last_reminded_at END,
            last_reminder_message_id = CASE WHEN ? = 1 THEN ? ELSE last_reminder_message_id END,
            last_reminder_error = ?,
            last_reminder_campaign = CASE WHEN ? = 1 AND ? > 0 THEN ? ELSE last_reminder_campaign END,
            updated_at = ?
      WHERE evening_id = ? AND player_id = ?`,
    [
      input.telegramUserId,
      input.success ? 1 : 0,
      now,
      input.success ? 1 : 0,
      now,
      input.success ? 1 : 0,
      input.success && input.telegramMessageId ? Number(input.telegramMessageId) : null,
      error,
      input.success ? 1 : 0,
      campaignGeneration,
      campaignGeneration,
      now,
      input.eveningId,
      input.playerId,
    ],
  );
  return { success: true, attempted_at: now, campaign_generation: campaignGeneration };
}
