import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureClubOperationsSchema } from '../../db/ensureClubOperationsSchema.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../../db/ensureOrganizerPlayerAccessSchema.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { canHostEveningFormat, hostFormatForEvening, HOST_FORMAT_OPTIONS } from '../../lib/hostFormats.ts';
import { canOrganizeEveningFormat } from '../../lib/organizeFormats.ts';

/** True when the evening already has its organizer (evening_staff_assignments). */
export async function eveningOrganizerAssigned(db: DatabaseWrapper, eveningId: string) {
  await ensureClubOperationsSchema(db);
  const row = await db.get<any>('SELECT organizer_player_id FROM evening_staff_assignments WHERE evening_id = ? LIMIT 1', [eveningId]);
  return Boolean(row?.organizer_player_id);
}

/** Assigns the signed-in organizer when their profile has the «Организатор» club role. */
export async function autoAssignEveningOrganizer(db: DatabaseWrapper, eveningId: string, playerId: string | null) {
  if (!playerId) return false;
  const organizer = await db.get<any>("SELECT id FROM players WHERE id = ? AND COALESCE(club_role, 'member') = 'organizer' LIMIT 1", [playerId]);
  if (!organizer) return false;
  await ensureClubOperationsSchema(db);
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO evening_staff_assignments (evening_id, organizer_player_id, assigned_at, updated_at)
     VALUES (?, ?, ?, ?) ON CONFLICT(evening_id) DO UPDATE SET organizer_player_id = COALESCE(evening_staff_assignments.organizer_player_id, excluded.organizer_player_id)`,
    [eveningId, playerId, now, now],
  );
  return true;
}

const hostLabel = (format: unknown) =>
  (HOST_FORMAT_OPTIONS.find((item) => item.value === hostFormatForEvening(format))?.label || 'этот вечер').toLowerCase();

/**
 * Owner decision 2026-09-30: novice and club evenings start with the owner as organizer and as
 * «Судья вечера»; both can be changed at any time. Only empty places are filled, so an organizer
 * already chosen (for example the host who created the evening) stays.
 */
// The staff table is prepared at startup (ensureClubOperationsSchema); background jobs only use it when present.
async function staffJudgeColumnReady(db: DatabaseWrapper) {
  const columns = await db.all<{ name: string }>('PRAGMA table_info(evening_staff_assignments)').catch(() => []);
  return columns.some((column) => column.name === 'judge_player_id');
}

export async function assignDefaultEveningStaff(db: DatabaseWrapper, eveningId: string) {
  if (!(await staffJudgeColumnReady(db))) return;
  const evening = await db.get<any>('SELECT format FROM game_evenings WHERE id = ? LIMIT 1', [eveningId]);
  const format = normalizeEveningFormat(evening?.format);
  if (format !== 'NOVICE' && format !== 'CASUAL') return;
  const owner = await db.get<any>(
    "SELECT * FROM players WHERE id = ? AND COALESCE(contact_status, 'normal') != 'blocked' LIMIT 1",
    [PRIMARY_ORGANIZER_PLAYER_ID],
  );
  if (!owner) return;
  const judgeId = canHostEveningFormat(owner, format) ? owner.id : null;
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO evening_staff_assignments (evening_id, organizer_player_id, judge_player_id, assigned_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(evening_id) DO UPDATE SET
       organizer_player_id = COALESCE(evening_staff_assignments.organizer_player_id, excluded.organizer_player_id),
       judge_player_id = COALESCE(evening_staff_assignments.judge_player_id, excluded.judge_player_id)`,
    [eveningId, owner.id, judgeId, now, now],
  );
}

/** The evening judge, or null. */
export async function eveningJudgeId(db: DatabaseWrapper, eveningId: string): Promise<string | null> {
  if (!(await staffJudgeColumnReady(db))) return null;
  const row = await db.get<any>('SELECT judge_player_id FROM evening_staff_assignments WHERE evening_id = ? LIMIT 1', [eveningId]);
  return row?.judge_player_id ? String(row.judge_player_id) : null;
}

/**
 * Why the evening cannot be published yet (owner decision 2026-09-30), or null when it can:
 * a draft may be incomplete, but a published evening has an organizer who may run this kind of
 * evening (a club organizer or a «Может проводить» mark) and a «Судья вечера» who may host it.
 */
export async function eveningPublishProblem(db: DatabaseWrapper, eveningId: string): Promise<string | null> {
  await ensureClubOperationsSchema(db);
  const row = await db.get<any>(`
    SELECT e.format,
           o.id AS organizer_id, o.nickname AS organizer_nickname, o.club_role AS organizer_role, o.organize_formats,
           j.id AS judge_id, j.nickname AS judge_nickname, j.host_formats, j.judge_level
      FROM game_evenings e
      LEFT JOIN evening_staff_assignments s ON s.evening_id = e.id
      LEFT JOIN players o ON o.id = s.organizer_player_id AND COALESCE(o.contact_status, 'normal') != 'blocked'
      LEFT JOIN players j ON j.id = s.judge_player_id AND COALESCE(j.contact_status, 'normal') != 'blocked'
     WHERE e.id = ? LIMIT 1
  `, [eveningId]);
  if (!row) return 'Вечер не найден';
  if (!row.organizer_id) return 'Выберите организатора вечера в «Команде вечера» — без него вечер не опубликовать.';
  const organizerFits = String(row.organizer_id) === PRIMARY_ORGANIZER_PLAYER_ID
    || String(row.organizer_role || '') === 'organizer'
    || canOrganizeEveningFormat({ organize_formats: row.organize_formats }, row.format);
  if (!organizerFits) {
    return `${row.organizer_nickname} не может проводить: ${hostLabel(row.format)}. Выберите организатора клуба или игрока с отметкой «Может проводить».`;
  }
  if (!row.judge_id) return 'Выберите судью вечера в «Команде вечера» — без него вечер не опубликовать.';
  if (!canHostEveningFormat({ host_formats: row.host_formats, judge_level: row.judge_level }, row.format)) {
    return `${row.judge_nickname} не может вести: ${hostLabel(row.format)}. Выберите судью с отметкой «Может вести».`;
  }
  return null;
}
