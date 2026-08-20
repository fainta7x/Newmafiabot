import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import {
  addEveningWalkIn,
  closeoutTaskDueAt,
  ensureEveningCloseoutTask,
  loadEveningCloseout,
  settleEveningFromCloseout,
} from '../server/services/eveningCloseoutService.ts';
import { setParticipantAttendance } from '../server/services/eveningParticipantState.ts';

const openDatabases: DatabaseWrapper[] = [];
const createDb = () => {
  const db = createDatabaseConnection(':memory:');
  openDatabases.push(db);
  return db;
};

afterEach(() => {
  while (openDatabases.length) {
    try { openDatabases.pop()?.sqlite.close(); } catch { /* already closed */ }
  }
});

const seedEvening = async (db: DatabaseWrapper, id = 'eve-closeout') => {
  const now = '2026-08-20T10:00:00.000Z';
  await db.run(
    `INSERT INTO game_evenings (
      id,title,starts_at,ends_at,timezone,venue,format,status,capacity,default_price,created_at,updated_at
    ) VALUES (?, 'Пятничная мафия', '2026-08-21T20:00:00+03:00', '2026-08-22T02:00:00+03:00',
      'Europe/Moscow', 'Суп с Котом', 'CASUAL', 'active', 20, 400, ?, ?)`,
    [id, now, now],
  );
  return id;
};

const seedPlayer = async (db: DatabaseWrapper, id: string, nickname: string) => {
  const now = '2026-08-20T10:00:00.000Z';
  await db.run(
    `INSERT INTO players (id,nickname,contact_status,lifecycle_status,elo,tokens,created_at,updated_at)
     VALUES (?,?,'normal','normal',1000,0,?,?)`,
    [id, nickname, now, now],
  );
};

const seedParticipant = async (
  db: DatabaseWrapper,
  eveningId: string,
  id: string,
  playerId: string,
  response = 'going',
  due = 400,
  paid = 0,
) => {
  const now = '2026-08-20T10:00:00.000Z';
  await db.run(
    `INSERT INTO evening_participants (
      id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,
      payment_status,amount_due,amount_paid,registered_at,created_at,updated_at
    ) VALUES (?,?,?,?,?,'pending','unknown',?,?,?, ?,?,?)`,
    [id, eveningId, playerId, response, response, paid >= due ? 'paid' : 'unpaid', due, paid, now, now, now],
  );
};

describe('evening closeout workflow', () => {
  it('schedules the organizer close task for Saturday 19:00 Moscow', async () => {
    const db = createDb();
    const eveningId = await seedEvening(db);

    expect(closeoutTaskDueAt('2026-08-21T20:00:00+03:00')).toBe('2026-08-22T16:00:00.000Z');
    const task = await ensureEveningCloseoutTask(db, eveningId);
    expect(task?.automation_key).toBe(`evening-close:${eveningId}`);
    expect(task?.due_at).toBe('2026-08-22T16:00:00.000Z');
    expect(task?.priority).toBe('high');
    expect(task?.status).toBe('todo');
  });

  it('requires attendance truth but allows closing without game stats and keeps unpaid balance as debt', async () => {
    const db = createDb();
    const eveningId = await seedEvening(db);
    await seedPlayer(db, 'p1', 'Альфа');
    await seedParticipant(db, eveningId, 'ep1', 'p1', 'going', 400, 100);
    await ensureEveningCloseoutTask(db, eveningId);

    await expect(settleEveningFromCloseout(db, eveningId, { allow_missing_game_stats: true }))
      .rejects.toMatchObject({ code: 'attendance_required' });

    await setParticipantAttendance(db, 'ep1', 'attended_on_time');
    const before = await loadEveningCloseout(db, eveningId);
    expect(before.outstanding).toHaveLength(1);
    expect(before.outstanding[0].balance).toBe(300);
    expect(before.games.needs_override).toBe(true);

    await expect(settleEveningFromCloseout(db, eveningId))
      .rejects.toMatchObject({ code: 'game_stats_confirmation_required' });

    const settled = await settleEveningFromCloseout(db, eveningId, { allow_missing_game_stats: true });
    expect(settled.success).toBe(true);
    expect(settled.evening.status).toBe('completed');

    const debt = await db.get<any>(
      `SELECT amount FROM financial_transactions
       WHERE evening_id=? AND player_id='p1' AND type='debt_created'`,
      [eveningId],
    );
    expect(Number(debt?.amount)).toBe(300);
    const income = await db.get<any>(
      `SELECT amount FROM financial_transactions
       WHERE evening_id=? AND player_id='p1' AND type='income'`,
      [eveningId],
    );
    expect(Number(income?.amount)).toBe(100);

    const task = await db.get<any>('SELECT status FROM organizer_tasks WHERE automation_key=?', [`evening-close:${eveningId}`]);
    expect(task?.status).toBe('done');
  });

  it('adds an unregistered player as a walk-in with a quick custom charge', async () => {
    const db = createDb();
    const eveningId = await seedEvening(db);
    await seedPlayer(db, 'walk1', 'Гость');

    const participant = await addEveningWalkIn(db, eveningId, { player_id: 'walk1', amount_due: 200 });
    expect(participant?.response_status).toBe('unanswered');
    expect(participant?.attendance_status).toBe('attended');
    expect(participant?.arrival_status).toBe('on_time');
    expect(Number(participant?.amount_due)).toBe(200);

    const state = await loadEveningCloseout(db, eveningId);
    expect(state.unplanned_attended.map((item: any) => item.nickname)).toContain('Гость');
  });

  it('lets someone who previously said thinking still be marked as unexpectedly present', async () => {
    const db = createDb();
    const eveningId = await seedEvening(db);
    await seedPlayer(db, 'p-thinking', 'Вид');
    await seedParticipant(db, eveningId, 'ep-thinking', 'p-thinking', 'thinking', 400, 0);

    const participant = await addEveningWalkIn(db, eveningId, { player_id: 'p-thinking' });
    expect(participant?.attendance_status).toBe('attended');
    expect(participant?.response_status).toBe('thinking');

    const state = await loadEveningCloseout(db, eveningId);
    expect(state.pending_expected).toHaveLength(0);
    expect(state.unplanned_attended.map((item: any) => item.nickname)).toContain('Вид');
  });

  it('archives unfinished game drafts only after explicit missing-stats confirmation', async () => {
    const db = createDb();
    const eveningId = await seedEvening(db);
    const protocol = JSON.stringify({ version: 1, kind: 'club_evening_protocol', protocol: { status: 'draft' }, player_results: [] });
    const inserted = await db.run(
      `INSERT INTO games (
        evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at
      ) VALUES (?,1,'2026-08-21T20:00:00+03:00','draft','Черновик',?,'[]','2026-08-21T20:00:00.000Z')`,
      [eveningId, protocol],
    );

    await expect(settleEveningFromCloseout(db, eveningId))
      .rejects.toMatchObject({ code: 'game_stats_confirmation_required' });

    const result = await settleEveningFromCloseout(db, eveningId, { allow_missing_game_stats: true });
    expect(result.archived_unfinished_games).toBe(1);
    const game = await db.get<any>('SELECT archived_at FROM games WHERE id=?', [Number(inserted.lastID)]);
    expect(game?.archived_at).toBeTruthy();
  });
});
