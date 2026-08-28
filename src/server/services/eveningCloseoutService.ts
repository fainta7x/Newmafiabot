import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getEveningResponse } from '../../lib/eveningResponse.ts';
import { setParticipantAttendance } from './eveningParticipantState.ts';
import { runCrmAutomations } from './crmAutomationService.ts';

const CLOSEOUT_TASK_PREFIX = 'evening-close:';
const HOUR_MS = 60 * 60 * 1000;

const safeJsonParse = <T = any>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

export const isUnfinishedEveningGame = (game: any): boolean => {
  const payload = safeJsonParse<any>(game?.protocol_text, null);
  if (payload?.kind === 'club_evening_protocol' && payload?.version === 1) {
    return payload.protocol?.status !== 'completed';
  }
  const winner = String(game?.winner_team || '').trim().toLowerCase();
  return !winner || winner === 'draft';
};

export const closeoutTaskDueAt = (startsAt: string): string | null => {
  const startMs = new Date(String(startsAt || '')).getTime();
  if (!Number.isFinite(startMs)) return null;
  // Regular Friday starts 20:00 Moscow. Saturday 19:00 Moscow = +23 hours.
  return new Date(startMs + 23 * HOUR_MS).toISOString();
};

export async function ensureEveningCloseoutTask(db: DatabaseWrapper, eveningId: string) {
  const evening = await db.get<any>(
    `SELECT id, title, starts_at, status, settled_at
       FROM game_evenings
      WHERE id = ? LIMIT 1`,
    [eveningId],
  );
  if (!evening || evening.status === 'cancelled') return null;

  const key = `${CLOSEOUT_TASK_PREFIX}${evening.id}`;
  const now = new Date().toISOString();
  const dueAt = closeoutTaskDueAt(String(evening.starts_at));
  if (!dueAt) return null;

  await db.run(
    `INSERT INTO organizer_tasks (
       id, title, description, type, status, priority, due_at, completed_at,
       automation_key, player_id, evening_id, created_at, updated_at
     ) VALUES (?, ?, ?, 'reminder', ?, 'high', ?, ?, ?, NULL, ?, ?, ?)
     ON CONFLICT(automation_key) DO UPDATE SET
       title=excluded.title,
       description=excluded.description,
       due_at=excluded.due_at,
       evening_id=excluded.evening_id,
       status=CASE WHEN organizer_tasks.status='done' THEN organizer_tasks.status ELSE excluded.status END,
       completed_at=CASE WHEN organizer_tasks.status='done' THEN organizer_tasks.completed_at ELSE excluded.completed_at END,
       updated_at=excluded.updated_at`,
    [
      randomUUID(),
      `Закрыть вечер · ${evening.title}`,
      'Сверить фактическую явку, незаписанных гостей, оплату/долги и игры. Если игровые протоколы не внесены — вечер можно закрыть без статистики с подтверждением.',
      evening.status === 'completed' || evening.settled_at ? 'done' : 'todo',
      dueAt,
      evening.status === 'completed' || evening.settled_at ? now : null,
      key,
      evening.id,
      now,
      now,
    ],
  );

  return db.get<any>('SELECT * FROM organizer_tasks WHERE automation_key = ? LIMIT 1', [key]);
}

export async function loadEveningCloseout(db: DatabaseWrapper, eveningId: string) {
  const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });

  await ensureEveningCloseoutTask(db, eveningId);

  const participants = await db.all<any>(`
    SELECT ep.*, p.nickname, p.full_name
      FROM evening_participants ep
      JOIN players p ON p.id = ep.player_id
     WHERE ep.evening_id = ?
     ORDER BY p.nickname COLLATE NOCASE
  `, [eveningId]);
  const games = await db.all<any>(
    `SELECT id, global_game_number, winner_team, protocol_text, archived_at
       FROM games
      WHERE evening_id = ? AND archived_at IS NULL
      ORDER BY global_game_number ASC`,
    [eveningId],
  );

  const pendingExpected = participants.filter((item) =>
    ['going', 'late'].includes(getEveningResponse(item))
    && String(item.attendance_status) === 'pending');
  const attended = participants.filter((item) => String(item.attendance_status) === 'attended');
  const noShow = participants.filter((item) => String(item.attendance_status) === 'no_show');
  const unplannedAttended = attended.filter((item) =>
    !['going', 'late'].includes(getEveningResponse(item)));
  const outstanding = attended
    .map((item) => ({
      ...item,
      balance: Math.max(0, Number(item.amount_due || 0) - Number(item.amount_paid || 0)),
    }))
    .filter((item) => item.balance > 0 && item.payment_status !== 'waived');
  const unfinishedGames = games.filter(isUnfinishedEveningGame);
  const completedGames = games.filter((game) => !isUnfinishedEveningGame(game));
  const gamesNeedOverride = games.length === 0 || unfinishedGames.length > 0;

  return {
    evening,
    participants,
    pending_expected: pendingExpected,
    attended,
    no_show: noShow,
    unplanned_attended: unplannedAttended,
    outstanding,
    games: {
      total: games.length,
      completed: completedGames.length,
      unfinished: unfinishedGames.map((game) => ({ id: game.id, game_number: game.global_game_number })),
      needs_override: gamesNeedOverride,
    },
    can_close_without_override: pendingExpected.length === 0 && !gamesNeedOverride,
    can_close_with_override: pendingExpected.length === 0,
  };
}

export async function addEveningWalkIn(
  db: DatabaseWrapper,
  eveningId: string,
  input: { player_id?: unknown; nickname?: unknown; amount_due?: unknown },
) {
  const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
  if (evening.status === 'completed' || evening.settled_at) throw Object.assign(new Error('Вечер уже закрыт'), { statusCode: 409 });

  let playerId = String(input.player_id || '').trim();
  const nickname = String(input.nickname || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const now = new Date().toISOString();

  if (!playerId && nickname) {
    const existingPlayer = await db.get<any>('SELECT id FROM players WHERE lower(nickname)=lower(?) LIMIT 1', [nickname]);
    if (existingPlayer) playerId = String(existingPlayer.id);
    else {
      playerId = randomUUID();
      await db.run(
        `INSERT INTO players (id, nickname, lifecycle_status, contact_status, source, created_at, updated_at)
         VALUES (?, ?, 'normal', 'normal', 'walk_in', ?, ?)`,
        [playerId, nickname, now, now],
      );
    }
  }
  if (!playerId) throw Object.assign(new Error('Выбери игрока или введи ник гостя'), { statusCode: 400 });

  const player = await db.get<any>('SELECT id, nickname FROM players WHERE id = ? LIMIT 1', [playerId]);
  if (!player) throw Object.assign(new Error('Игрок не найден'), { statusCode: 404 });

  let participant = await db.get<any>(
    'SELECT * FROM evening_participants WHERE evening_id = ? AND player_id = ? LIMIT 1',
    [eveningId, playerId],
  );
  const dueRaw = Number(input.amount_due);
  const amountDue = Number.isFinite(dueRaw) && dueRaw >= 0 ? Math.round(dueRaw) : Math.max(0, Number(evening.default_price || 0));

  if (!participant) {
    const id = randomUUID();
    await db.run(
      `INSERT INTO evening_participants (
         id, evening_id, player_id, response_status, registration_status,
         attendance_status, arrival_status, payment_status, amount_due, amount_paid,
         registered_at, created_at, updated_at
       ) VALUES (?, ?, ?, 'unanswered', 'unanswered', 'pending', 'unknown', ?, ?, 0, ?, ?, ?)`,
      [id, eveningId, playerId, amountDue === 0 ? 'waived' : 'unpaid', amountDue, now, now, now],
    );
    participant = await db.get<any>('SELECT * FROM evening_participants WHERE id = ?', [id]);
  }

  await setParticipantAttendance(db, String(participant.id), 'attended_on_time');
  return db.get<any>(`
    SELECT ep.*, p.nickname, p.full_name
      FROM evening_participants ep JOIN players p ON p.id=ep.player_id
     WHERE ep.id=?`, [participant.id]);
}

export async function settleEveningFromCloseout(
  db: DatabaseWrapper,
  eveningId: string,
  options: { allow_missing_game_stats?: boolean } = {},
) {
  const state = await loadEveningCloseout(db, eveningId);
  const evening = state.evening;
  if (evening.status === 'completed' || evening.settled_at) {
    return { success: true, alreadySettled: true, evening, archived_unfinished_games: 0 };
  }
  if (state.pending_expected.length) {
    throw Object.assign(new Error('Сначала отметь: кто из ожидаемых игроков был, а кто не пришёл'), {
      statusCode: 409,
      code: 'attendance_required',
      details: state.pending_expected.map((item: any) => ({ id: item.id, nickname: item.nickname })),
    });
  }
  if (state.games.needs_override && !options.allow_missing_game_stats) {
    throw Object.assign(new Error(
      state.games.total === 0
        ? 'Игровая статистика не внесена. Подтверди закрытие без неё.'
        : 'Есть незавершённые игровые черновики. Подтверди закрытие без этой статистики.',
    ), { statusCode: 409, code: 'game_stats_confirmation_required', details: state.games });
  }

  const now = new Date().toISOString();
  const unfinishedIds = state.games.unfinished.map((item: any) => Number(item.id)).filter(Number.isFinite);
  const participants = state.participants;

  await db.transaction(async (tx) => {
    if (unfinishedIds.length && options.allow_missing_game_stats) {
      const placeholders = unfinishedIds.map(() => '?').join(',');
      await tx.run(`UPDATE games SET archived_at=? WHERE id IN (${placeholders})`, [now, ...unfinishedIds]);
    }

    await tx.run(
      `UPDATE game_evenings
          SET status='completed', settled_at=?, updated_at=?
        WHERE id=? AND status!='completed'`,
      [now, now, eveningId],
    );

    for (const participant of participants) {
      if (participant.attendance_status !== 'attended' || participant.payment_status === 'waived') continue;
      const due = Math.max(0, Number(participant.amount_due || 0));
      const paid = Math.max(0, Number(participant.amount_paid || 0));
      const debt = Math.max(0, due - paid);
      if (paid > 0) {
        await tx.run(
          `INSERT OR IGNORE INTO financial_transactions (
             id, type, amount, category, description, player_id, evening_id,
             source_type, source_id, created_at
           ) VALUES (?, 'income', ?, 'Взнос за вечер', ?, ?, ?, 'evening_settle', ?, ?)`,
          [randomUUID(), paid, `Оплата за вечер ${evening.title}`, participant.player_id, eveningId, participant.id, now],
        );
      }
      if (debt > 0) {
        await tx.run(
          `INSERT OR IGNORE INTO financial_transactions (
             id, type, amount, category, description, player_id, evening_id,
             source_type, source_id, created_at
           ) VALUES (?, 'debt_created', ?, 'Неоплата за вечер', ?, ?, ?, 'evening_settle', ?, ?)`,
          [randomUUID(), debt, `Долг за вечер ${evening.title}`, participant.player_id, eveningId, participant.id, now],
        );
      }
    }

    await tx.run(
      `UPDATE organizer_tasks
          SET status='done', completed_at=?, updated_at=?
        WHERE automation_key=?`,
      [now, now, `${CLOSEOUT_TASK_PREFIX}${eveningId}`],
    );
  });

  await runCrmAutomations(db);
  return {
    success: true,
    alreadySettled: false,
    archived_unfinished_games: unfinishedIds.length,
    evening: await db.get<any>('SELECT * FROM game_evenings WHERE id=?', [eveningId]),
  };
}
