from pathlib import Path
import re

ROOT = Path('.')

def write(path, content):
    p=ROOT/path; p.parent.mkdir(parents=True,exist_ok=True); p.write_text(content,encoding='utf-8')

def rep(path, old, new, n=1):
    p=ROOT/path; s=p.read_text(encoding='utf-8'); c=s.count(old)
    if c < n: raise RuntimeError(f'{path}: expected >= {n} matches, got {c}: {old[:100]!r}')
    p.write_text(s.replace(old,new,n),encoding='utf-8')

def sub(path, pattern, repl, count=1, flags=0):
    p=ROOT/path; s=p.read_text(encoding='utf-8'); out,c=re.subn(pattern,repl,s,count=count,flags=flags)
    if c != count: raise RuntimeError(f'{path}: regex expected {count}, got {c}: {pattern[:100]!r}')
    p.write_text(out,encoding='utf-8')

write('src/lib/eveningResponse.ts', r'''export type EveningResponseStatus = 'unanswered' | 'going' | 'late' | 'thinking' | 'declined';
export type ActualAttendanceFact = 'pending' | 'on_time' | 'late' | 'no_show' | 'attended_unknown';
export type WritableAttendanceFact = Exclude<ActualAttendanceFact, 'attended_unknown'>;

export const EVENING_RESPONSE_STATUSES: EveningResponseStatus[] = ['unanswered', 'going', 'late', 'thinking', 'declined'];
export const WRITABLE_ATTENDANCE_FACTS: WritableAttendanceFact[] = ['pending', 'on_time', 'late', 'no_show'];

export const EVENING_RESPONSE_LABELS: Record<EveningResponseStatus, string> = {
  unanswered: 'Не ответил', going: 'Иду', late: 'Приду позже', thinking: 'Пока думаю', declined: 'Не иду',
};
export const ATTENDANCE_FACT_LABELS: Record<ActualAttendanceFact, string> = {
  pending: 'Не отмечено', on_time: 'Пришёл вовремя', late: 'Пришёл позже', no_show: 'Не пришёл', attended_unknown: 'Пришёл, время не указано',
};

export const isCanonicalEveningResponse = (value: unknown): value is EveningResponseStatus =>
  typeof value === 'string' && EVENING_RESPONSE_STATUSES.includes(value as EveningResponseStatus);

// Compatibility boundary only. New business code reads response_status.
export const normalizeLegacyEveningResponseInput = (value: unknown): EveningResponseStatus => {
  if (isCanonicalEveningResponse(value)) return value;
  switch (String(value || '').trim()) {
    case 'registered': case 'confirmed': case 'waitlist': return 'going';
    case 'cancelled': return 'declined';
    case 'invited': default: return 'unanswered';
  }
};

export const normalizeEveningResponse = (responseStatus?: string | null, legacyRegistrationStatus?: string | null): EveningResponseStatus => {
  if (isCanonicalEveningResponse(responseStatus)) return responseStatus;
  return normalizeLegacyEveningResponseInput(responseStatus || legacyRegistrationStatus);
};

export const isExpectedEveningResponse = (value: unknown) => {
  const status = normalizeEveningResponse(String(value ?? ''));
  return status === 'going' || status === 'late';
};
export const isAttendingResponse = isExpectedEveningResponse;

export const getActualAttendanceFact = (
  attendanceStatus?: string | null,
  arrivalStatus?: string | null,
): ActualAttendanceFact | null => {
  if (attendanceStatus === 'pending' && arrivalStatus === 'unknown') return 'pending';
  if (attendanceStatus === 'attended' && arrivalStatus === 'on_time') return 'on_time';
  if (attendanceStatus === 'attended' && arrivalStatus === 'late') return 'late';
  if (attendanceStatus === 'attended' && arrivalStatus === 'unknown') return 'attended_unknown';
  if (attendanceStatus === 'no_show' && arrivalStatus === 'unknown') return 'no_show';
  return null;
};

export const isActualAttendee = (fact: ActualAttendanceFact | null) =>
  fact === 'on_time' || fact === 'late' || fact === 'attended_unknown';

export interface AttendancePhysicalState {
  attendance_status: 'pending' | 'attended' | 'no_show';
  arrival_status: 'unknown' | 'on_time' | 'late';
  checked_in_at?: string | null;
}
export interface AttendanceWriteInput {
  attendance_fact?: string | null;
  attendance_status?: string | null;
  arrival_status?: string | null;
}

export const physicalStateForAttendanceFact = (
  fact: WritableAttendanceFact,
  currentCheckedInAt?: string | null,
  now: string = new Date().toISOString(),
): AttendancePhysicalState => {
  if (fact === 'pending') return { attendance_status: 'pending', arrival_status: 'unknown', checked_in_at: null };
  if (fact === 'no_show') return { attendance_status: 'no_show', arrival_status: 'unknown', checked_in_at: null };
  return { attendance_status: 'attended', arrival_status: fact === 'late' ? 'late' : 'on_time', checked_in_at: currentCheckedInAt || now };
};

export const resolveAttendanceWrite = (
  current: AttendancePhysicalState,
  input: AttendanceWriteInput,
  now: string = new Date().toISOString(),
): AttendancePhysicalState | null => {
  const hasCanonical = input.attendance_fact !== undefined;
  const hasLegacy = input.attendance_status !== undefined || input.arrival_status !== undefined;
  if (!hasCanonical && !hasLegacy) return null;

  let canonicalFact: WritableAttendanceFact | null = null;
  if (hasCanonical) {
    if (!WRITABLE_ATTENDANCE_FACTS.includes(input.attendance_fact as WritableAttendanceFact)) {
      throw new Error('Недопустимое значение attendance_fact');
    }
    canonicalFact = input.attendance_fact as WritableAttendanceFact;
  }

  let legacyFact: ActualAttendanceFact | null = null;
  if (hasLegacy) {
    const attendance = input.attendance_status ?? current.attendance_status;
    const arrival = input.arrival_status ?? current.arrival_status;
    legacyFact = getActualAttendanceFact(attendance, arrival);
    if (!legacyFact) throw new Error('Противоречивые attendance_status и arrival_status');
    if (legacyFact === 'attended_unknown') throw new Error('Новая запись attended_unknown запрещена: укажите вовремя или позже');
  }
  if (canonicalFact && legacyFact && canonicalFact !== legacyFact) {
    throw new Error('attendance_fact конфликтует с legacy-полями явки');
  }
  return physicalStateForAttendanceFact(canonicalFact || legacyFact as WritableAttendanceFact, current.checked_in_at, now);
};

export const countEveningResponses = (participants: Array<{ response_status?: string | null; registration_status?: string | null }>) => {
  const counts = { going: 0, late: 0, thinking: 0, declined: 0, unanswered: 0, responded: 0, audience: participants.length };
  for (const participant of participants) {
    const response = normalizeEveningResponse(participant.response_status, participant.registration_status);
    counts[response] += 1;
    if (response !== 'unanswered') counts.responded += 1;
  }
  return counts;
};

export const getEveningResponseLabel = (responseStatus?: string | null, legacyRegistrationStatus?: string | null) =>
  EVENING_RESPONSE_LABELS[normalizeEveningResponse(responseStatus, legacyRegistrationStatus)];

export const isEveningParticipantEligibleForGame = (participant: {
  response_status?: string | null;
  registration_status?: string | null;
  attendance_status?: string | null;
  arrival_status?: string | null;
}) => {
  const fact = getActualAttendanceFact(participant.attendance_status, participant.arrival_status);
  if (fact === 'no_show' || fact === null) return false;
  if (isActualAttendee(fact)) return true;
  const response = normalizeEveningResponse(participant.response_status, participant.registration_status);
  return fact === 'pending' && (response === 'going' || response === 'late');
};
''')

write('src/lib/eveningRoster.ts', r'''import type { EveningParticipant } from './api.ts';
import { getActualAttendanceFact, isEveningParticipantEligibleForGame, normalizeEveningResponse } from './eveningResponse.ts';

export const isEveningGameEligible = (participant: EveningParticipant): boolean => isEveningParticipantEligibleForGame(participant);

const attendanceRank = (participant: EveningParticipant) => {
  const fact = getActualAttendanceFact(participant.attendance_status, participant.arrival_status);
  if (fact === 'on_time' || fact === 'late' || fact === 'attended_unknown') return 0;
  const response = normalizeEveningResponse(participant.response_status, participant.registration_status);
  if (response === 'going' || response === 'late') return 1;
  return 2;
};

export const sortEveningRoster = (participants: EveningParticipant[]) => participants.slice().sort((a, b) => {
  const rank = attendanceRank(a) - attendanceRank(b);
  return rank || a.nickname.localeCompare(b.nickname, 'ru');
});

export const toggleParticipantInSeats = (seats: string[], participantId: string): string[] => {
  const existingIndex = seats.indexOf(participantId);
  if (existingIndex >= 0) return seats.map((value, index) => index === existingIndex ? '' : value);
  const freeIndex = seats.findIndex((value) => !value);
  if (freeIndex < 0) return seats;
  return seats.map((value, index) => index === freeIndex ? participantId : value);
};
''')

write('src/server/services/tableAssignmentService.ts', r'''import { DatabaseWrapper } from '../../db/index.ts';

export class TableAssignmentError extends Error {
  status: number;
  constructor(message: string, status: number = 400) { super(message); this.status = status; this.name = 'TableAssignmentError'; }
}

// Table assignment is intentionally isolated from response, attendance and payment state.
export async function assignParticipantToTable(db: DatabaseWrapper, participantId: string, targetTableId?: string | null, eveningIdParam?: string) {
  const participant = await db.get('SELECT * FROM evening_participants WHERE id = ?', [participantId]);
  if (!participant) throw new TableAssignmentError('Участник не найден', 404);
  const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [participant.evening_id]);
  if (!evening) throw new TableAssignmentError('Игровой вечер не найден', 404);
  if (eveningIdParam && participant.evening_id !== eveningIdParam) throw new TableAssignmentError('Участник не принадлежит этому вечеру', 400);
  if (evening.status === 'completed' || evening.settled_at) throw new TableAssignmentError('Запрещено изменять участника на завершённом вечере', 400);
  let finalTableId = participant.table_id;
  if (targetTableId !== undefined) finalTableId = targetTableId === null || targetTableId === '' ? null : targetTableId;
  if (finalTableId) {
    const table = await db.get('SELECT * FROM evening_tables WHERE id = ?', [finalTableId]);
    if (!table) throw new TableAssignmentError('Стол не найден', 404);
    if (table.evening_id !== participant.evening_id) throw new TableAssignmentError('Стол принадлежит другому вечеру', 400);
  }
  await db.run('UPDATE evening_participants SET table_id = ?, updated_at = ? WHERE id = ?', [finalTableId, new Date().toISOString(), participantId]);
  return await db.get('SELECT * FROM evening_participants WHERE id = ?', [participantId]);
}
''')

write('drizzle/0011_canonical_evening_response_attendance.sql', r'''BEGIN IMMEDIATE;

UPDATE evening_participants
SET response_status = CASE
  WHEN response_status IN ('going','late','thinking','declined') THEN response_status
  WHEN registration_status IN ('going','late','thinking','declined') THEN registration_status
  WHEN registration_status = 'cancelled' THEN 'declined'
  WHEN registration_status IN ('registered','confirmed','waitlist')
       AND attendance_status = 'pending' AND arrival_status = 'late' THEN 'late'
  WHEN registration_status IN ('registered','confirmed','waitlist') THEN 'going'
  ELSE 'unanswered'
END
WHERE NOT EXISTS (
  SELECT 1 FROM migration_history WHERE migration_name = '0011_canonical_evening_response_attendance'
);

UPDATE evening_participants
SET arrival_status = 'unknown'
WHERE NOT EXISTS (
  SELECT 1 FROM migration_history WHERE migration_name = '0011_canonical_evening_response_attendance'
)
  AND registration_status IN ('registered','confirmed','waitlist')
  AND attendance_status = 'pending'
  AND arrival_status = 'late';

UPDATE evening_participants
SET registration_status = response_status
WHERE NOT EXISTS (
  SELECT 1 FROM migration_history WHERE migration_name = '0011_canonical_evening_response_attendance'
);

CREATE INDEX IF NOT EXISTS idx_evening_participants_response ON evening_participants(evening_id, response_status);

INSERT OR IGNORE INTO migration_history (id, migration_name, status, details_json, executed_at)
VALUES (
  '0011_canonical_evening_response_attendance',
  '0011_canonical_evening_response_attendance',
  'success',
  '{"scope":"response_status_backfill_only","tokens":false,"settlements":false,"transactions":false}',
  CURRENT_TIMESTAMP
);

COMMIT;
''')

# Fresh DB and schema.
rep('drizzle/0000_initial.sql', "  registration_status TEXT NOT NULL DEFAULT 'registered',\n  attendance_status", "  response_status TEXT NOT NULL DEFAULT 'unanswered',\n  registration_status TEXT NOT NULL DEFAULT 'unanswered',\n  attendance_status")
rep('src/db/schema.ts', "  registration_status: text('registration_status').notNull().default('registered'), // invited, registered, confirmed, waitlist, cancelled\n  attendance_status", "  response_status: text('response_status').notNull().default('unanswered'), // unanswered, going, late, thinking, declined\n  registration_status: text('registration_status').notNull().default('unanswered'), // compatibility mirror of response_status\n  attendance_status")
rep('src/db/index.ts', "  addColumnIfNotExists('evening_participants', 'table_id', 'TEXT REFERENCES evening_tables(id) ON DELETE SET NULL');", "  addColumnIfNotExists('evening_participants', 'table_id', 'TEXT REFERENCES evening_tables(id) ON DELETE SET NULL');\n  addColumnIfNotExists('evening_participants', 'response_status', \"TEXT NOT NULL DEFAULT 'unanswered'\");")
rep('src/db/index.ts', "    '0010_club_game_token_settlements.sql',\n  ];", "    '0010_club_game_token_settlements.sql',\n    '0011_canonical_evening_response_attendance.sql',\n  ];")

# API types and compatibility boundary.
rep('src/lib/api.ts', "export type EveningRegistrationStatus = 'going' | 'late' | 'thinking' | 'declined' | 'invited' | 'registered' | 'confirmed' | 'waitlist' | 'cancelled';", "export type EveningResponseStatus = 'unanswered' | 'going' | 'late' | 'thinking' | 'declined';\nexport type EveningRegistrationStatus = EveningResponseStatus; // compatibility mirror only\nexport type EveningAttendanceFact = 'pending' | 'on_time' | 'late' | 'no_show' | 'attended_unknown';")
rep('src/lib/api.ts', "  registration_status: EveningRegistrationStatus;\n  attendance_status", "  response_status: EveningResponseStatus;\n  registration_status: EveningRegistrationStatus;\n  attendance_fact?: EveningAttendanceFact;\n  attendance_status")
rep('src/lib/api.ts', "bulkAddParticipants: (eveningId: string, playerIds: string[], tableId?: string | null, registrationStatus: string = 'registered', amountDue?: number)", "bulkAddParticipants: (eveningId: string, playerIds: string[], tableId?: string | null, responseStatus: EveningResponseStatus = 'going', amountDue?: number)")
rep('src/lib/api.ts', "JSON.stringify({ player_ids: playerIds, table_id: tableId, registration_status: registrationStatus, amount_due: amountDue })", "JSON.stringify({ player_ids: playerIds, table_id: tableId, response_status: responseStatus, amount_due: amountDue })")
sub('src/lib/api.ts', r"data: \{ player_id\?: string; nickname\?: string; phone\?: string; table_id\?: string \| null; registration_status\?: '[^;]+; amount_due", "data: { player_id?: string; nickname?: string; phone?: string; table_id?: string | null; response_status?: EveningResponseStatus; registration_status?: string; amount_due")
rep('src/lib/api.ts', "request<{ success: boolean; registration_status: string; tableName: string; message: string; alreadyRegistered?: boolean }>", "request<{ success: boolean; response_status: EveningResponseStatus; registration_status: EveningResponseStatus; tableName: string; message: string; alreadyRegistered?: boolean }>")

# Validation accepts canonical fields; legacy registration is only an alias.
p=ROOT/'src/server/validation.ts'; s=p.read_text(encoding='utf-8')
s=s.replace("const eveningRegistrationStatusSchema = z.enum(['going', 'late', 'thinking', 'declined', 'invited', 'registered', 'confirmed', 'waitlist', 'cancelled']);", "const eveningResponseStatusSchema = z.enum(['unanswered', 'going', 'late', 'thinking', 'declined']);\nconst eveningRegistrationStatusSchema = z.enum(['unanswered','going','late','thinking','declined','invited','registered','confirmed','waitlist','cancelled']); // compatibility input only\nconst eveningAttendanceFactSchema = z.enum(['pending','on_time','late','no_show']);")
s=s.replace("registration_status: eveningRegistrationStatusSchema.default('going'),", "response_status: eveningResponseStatusSchema.optional(),\n  registration_status: eveningRegistrationStatusSchema.optional(),")
s=s.replace("registration_status: eveningRegistrationStatusSchema.optional(),\n  attendance_status", "response_status: eveningResponseStatusSchema.optional(),\n  registration_status: eveningRegistrationStatusSchema.optional(),\n  attendance_fact: eveningAttendanceFactSchema.optional(),\n  attendance_status")
p.write_text(s,encoding='utf-8')

# Table moves cannot mutate response.
rep('src/server/routes/eveningsRoutes.ts', "const { table_id, registration_status } = req.body;\n    const updated = await assignParticipantToTable(db, req.params.participantId, table_id, registration_status, participant.evening_id);", "const { table_id } = req.body;\n    const updated = await assignParticipantToTable(db, req.params.participantId, table_id, participant.evening_id);")

# Canonical imports in active routes.
rep('src/server/routes/eveningsRoutes.ts', "import { assignParticipantToTable, TableAssignmentError } from '../services/tableAssignmentService.ts';", "import { assignParticipantToTable, TableAssignmentError } from '../services/tableAssignmentService.ts';\nimport { getActualAttendanceFact, normalizeEveningResponse, normalizeLegacyEveningResponseInput, resolveAttendanceWrite } from '../../lib/eveningResponse.ts';")
rep('src/server/routes/participantRoutes.ts', "import { assignParticipantToTable, TableAssignmentError } from '../services/tableAssignmentService.ts';", "import { assignParticipantToTable, TableAssignmentError } from '../services/tableAssignmentService.ts';\nimport { normalizeEveningResponse, normalizeLegacyEveningResponseInput, resolveAttendanceWrite } from '../../lib/eveningResponse.ts';")

# Evening list/public counts now canonical expected count.
for old in [
"COUNT(CASE WHEN ep.registration_status NOT IN ('cancelled', 'waitlist') THEN 1 END)",
"COUNT(CASE WHEN ep.registration_status != 'cancelled' THEN 1 END)"]:
    if old in (ROOT/'src/server/routes/eveningsRoutes.ts').read_text(encoding='utf-8'):
        rep('src/server/routes/eveningsRoutes.ts', old, "COUNT(CASE WHEN ep.response_status IN ('going','late') THEN 1 END)", n=(ROOT/'src/server/routes/eveningsRoutes.ts').read_text(encoding='utf-8').count(old))
# confirmed is compatibility response only and no longer a semantic count.
s=(ROOT/'src/server/routes/eveningsRoutes.ts').read_text(encoding='utf-8').replace("COUNT(CASE WHEN ep.registration_status = 'confirmed' THEN 1 END)", "0")
(ROOT/'src/server/routes/eveningsRoutes.ts').write_text(s,encoding='utf-8')

# Bulk/single organizer add: canonical response and mirrored registration, no capacity semantics.
s=(ROOT/'src/server/routes/eveningsRoutes.ts').read_text(encoding='utf-8')
s=s.replace("const { player_ids, table_id, registration_status, amount_due } = parsed.data;", "const { player_ids, table_id, response_status, registration_status, amount_due } = parsed.data;\n    const canonicalResponse = response_status !== undefined ? normalizeEveningResponse(response_status) : registration_status !== undefined ? normalizeLegacyEveningResponseInput(registration_status) : 'going';")
s=s.replace("registration_status, attendance_status, arrival_status, payment_status", "response_status, registration_status, attendance_status, arrival_status, payment_status")
s=s.replace("VALUES (?, ?, ?, ?, ?, 'pending', 'unknown', ?, ?, 0, ?, ?, ?)", "VALUES (?, ?, ?, ?, ?, ?, 'pending', 'unknown', ?, ?, 0, ?, ?, ?)")
s=s.replace("[participantId, eveningId, playerId, table_id || null, registration_status,", "[participantId, eveningId, playerId, table_id || null, canonicalResponse, canonicalResponse,")
# Single add final status block.
s=s.replace("const finalRegStatus = data.registration_status;", "const finalResponse = data.response_status !== undefined ? normalizeEveningResponse(data.response_status) : data.registration_status !== undefined ? normalizeLegacyEveningResponseInput(data.registration_status) : 'going';")
s=s.replace("[id, req.params.id, playerId, data.table_id || null, finalRegStatus,", "[id, req.params.id, playerId, data.table_id || null, finalResponse, finalResponse,")
# confirmed_at compatibility is no longer response decision.
s=s.replace("finalRegStatus === 'confirmed' ? now : null", "null")
(ROOT/'src/server/routes/eveningsRoutes.ts').write_text(s,encoding='utf-8')

# Rebuild participant PATCH route around canonical response/attendance mutations.
sub('src/server/routes/participantRoutes.ts', r"router\.patch\('/:id', requireOrganizerAuth, async \(req, res\) => \{.*?\n\}\);", r'''router.patch('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const data = updateParticipantSchema.parse(req.body);
    const db = (req as any).db || (await getDb());
    const participant = await db.get('SELECT * FROM evening_participants WHERE id = ?', [req.params.id]);
    if (!participant) return res.status(404).json({ error: 'Участник не найден' });
    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [participant.evening_id]);
    if (evening?.status === 'completed' || evening?.settled_at) return res.status(400).json({ error: 'Завершённый вечер нельзя редактировать' });

    if (data.response_status !== undefined && data.registration_status !== undefined) {
      const canonical = normalizeEveningResponse(data.response_status);
      const compat = normalizeLegacyEveningResponseInput(data.registration_status);
      if (canonical !== compat) return res.status(400).json({ error: 'response_status конфликтует с registration_status' });
    }
    const response = data.response_status !== undefined
      ? normalizeEveningResponse(data.response_status)
      : data.registration_status !== undefined ? normalizeLegacyEveningResponseInput(data.registration_status) : null;
    let attendance = null;
    try {
      attendance = resolveAttendanceWrite(participant, data, new Date().toISOString());
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }

    await db.transaction(async (tx) => {
      if (data.table_id !== undefined) await assignParticipantToTable(tx, req.params.id, data.table_id, participant.evening_id);
      const fields: string[] = []; const values: any[] = [];
      if (response) { fields.push('response_status = ?', 'registration_status = ?'); values.push(response, response); }
      if (attendance) {
        fields.push('attendance_status = ?', 'arrival_status = ?', 'checked_in_at = ?');
        values.push(attendance.attendance_status, attendance.arrival_status, attendance.checked_in_at ?? null);
      }
      for (const key of ['payment_status','amount_due','amount_paid','notes'] as const) {
        if ((data as any)[key] !== undefined) { fields.push(`${key} = ?`); values.push((data as any)[key]); }
      }
      if (fields.length) {
        fields.push('updated_at = ?'); values.push(new Date().toISOString(), req.params.id);
        await tx.run(`UPDATE evening_participants SET ${fields.join(', ')} WHERE id = ?`, values);
      }
    });
    res.json(await db.get(`SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo,
      (SELECT updated_at FROM player_avatars pa WHERE pa.player_id = p.id) AS avatar_updated_at
      FROM evening_participants ep JOIN players p ON p.id = ep.player_id WHERE ep.id = ?`, [req.params.id]));
  } catch (err: any) {
    const status = err instanceof TableAssignmentError ? err.status : 400;
    res.status(status).json({ error: err.message || 'Validation error', details: err.errors });
  }
});''', count=1, flags=re.S)

# Bulk update: remove response from table move and canonicalize status/attendance before one UPDATE.
s=(ROOT/'src/server/routes/eveningsRoutes.ts').read_text(encoding='utf-8')
s=s.replace("await assignParticipantToTable(db, update.id, update.table_id, update.registration_status, req.params.id);", "await assignParticipantToTable(db, update.id, update.table_id, req.params.id);")
# Replace generic allowed-key loop with canonical handling if recognizable.
s=s.replace("const allowedKeys = ['registration_status', 'attendance_status', 'arrival_status', 'payment_status', 'amount_due', 'amount_paid', 'notes'];", "const allowedKeys = ['payment_status', 'amount_due', 'amount_paid', 'notes'];")
# Insert canonical handling before allowed keys.
needle="      const allowedKeys = ['payment_status', 'amount_due', 'amount_paid', 'notes'];"
insert="""      if (update.response_status !== undefined && update.registration_status !== undefined && normalizeEveningResponse(update.response_status) !== normalizeLegacyEveningResponseInput(update.registration_status)) {\n        return res.status(400).json({ error: 'response_status конфликтует с registration_status' });\n      }\n      const response = update.response_status !== undefined ? normalizeEveningResponse(update.response_status) : update.registration_status !== undefined ? normalizeLegacyEveningResponseInput(update.registration_status) : null;\n      if (response) { fields.push('response_status = ?', 'registration_status = ?'); values.push(response, response); }\n      let attendance = null;\n      try { attendance = resolveAttendanceWrite(existing, update, new Date().toISOString()); } catch (error: any) { return res.status(400).json({ error: error.message }); }\n      if (attendance) { fields.push('attendance_status = ?', 'arrival_status = ?', 'checked_in_at = ?'); values.push(attendance.attendance_status, attendance.arrival_status, attendance.checked_in_at ?? null); }\n\n"""+needle
if needle in s: s=s.replace(needle,insert,1)
(ROOT/'src/server/routes/eveningsRoutes.ts').write_text(s,encoding='utf-8')

# Completion blocks only unresolved expected + attended_unknown; finances only actual attendees.
s=(ROOT/'src/server/routes/eveningsRoutes.ts').read_text(encoding='utf-8')
s=re.sub(r"const pendingParticipants = await db\.all\(`.*?`, \[req\.params\.id\]\);", """const pendingParticipants = await db.all(`\n      SELECT ep.id, p.nickname, ep.response_status, ep.attendance_status, ep.arrival_status\n      FROM evening_participants ep JOIN players p ON p.id = ep.player_id\n      WHERE ep.evening_id = ? AND (\n        (ep.response_status IN ('going','late') AND ep.attendance_status = 'pending' AND ep.arrival_status = 'unknown')\n        OR (ep.attendance_status = 'attended' AND ep.arrival_status = 'unknown')\n      )\n    `, [req.params.id]);""", s, count=1, flags=re.S)
# Remove response skip in settlement loop.
s=re.sub(r"\s*if \(\['cancelled'.*?\]\.includes\(participant\.registration_status\)\) continue;", "\n        if (participant.attendance_status !== 'attended') continue;", s, count=1, flags=re.S)
(ROOT/'src/server/routes/eveningsRoutes.ts').write_text(s,encoding='utf-8')

# Game backend eligibility in ACTIVE wrapper route.
rep('src/server/routes/gamesRoutes.ts', "import { JudgeAssignmentError, resolveJudgeAssignment } from '../services/judgeAssignmentService.ts';", "import { JudgeAssignmentError, resolveJudgeAssignment } from '../services/judgeAssignmentService.ts';\nimport { isEveningParticipantEligibleForGame } from '../../lib/eveningResponse.ts';")
rep('src/server/routes/gamesRoutes.ts', "`SELECT ep.id AS participant_id, ep.player_id, ep.evening_id, p.nickname, p.full_name", "`SELECT ep.id AS participant_id, ep.player_id, ep.evening_id, ep.response_status, ep.registration_status, ep.attendance_status, ep.arrival_status, p.nickname, p.full_name")
rep('src/server/routes/gamesRoutes.ts', "  if (rows.length !== 10 || rows.some((row: any) => row.evening_id !== eveningId)) {\n    throw new Error('Все выбранные игроки должны быть участниками этого вечера');\n  }", "  if (rows.length !== 10 || rows.some((row: any) => row.evening_id !== eveningId)) {\n    throw new Error('Все выбранные игроки должны быть участниками этого вечера');\n  }\n  const ineligible = rows.filter((row: any) => !isEveningParticipantEligibleForGame(row));\n  if (ineligible.length) throw new Error('В игру можно добавить только ожидаемых или фактически пришедших игроков');")

# Invitations are explicitly unanswered, not legacy invited.
rep('src/server/routes/playersRoutes.ts', "(id, evening_id, player_id, table_id, registration_status, attendance_status, arrival_status, payment_status", "(id, evening_id, player_id, table_id, response_status, registration_status, attendance_status, arrival_status, payment_status")
rep('src/server/routes/playersRoutes.ts', "VALUES (?, ?, ?, ?, 'invited', 'pending', 'unknown', ?, ?, 0, ?, ?, ?)", "VALUES (?, ?, ?, ?, 'unanswered', 'unanswered', 'pending', 'unknown', ?, ?, 0, ?, ?, ?)")
rep('src/server/routes/playersRoutes.ts', "registration_status: participant.registration_status,", "response_status: participant.response_status,\n        registration_status: participant.response_status,")

# CRM debt must depend on actual attendance, not response.
rep('src/server/routes/crmRoutes.ts', "         AND ep.registration_status NOT IN ('cancelled', 'declined', 'invited', 'thinking', 'waitlist')\n", "")
# Analytics expected count/decline semantics.
rep('src/server/routes/analyticsRoutes.ts', "COUNT(*) as total_registrations,\n        SUM(CASE WHEN ep.registration_status = 'cancelled' THEN 1 ELSE 0 END) as total_cancelled,", "SUM(CASE WHEN ep.response_status IN ('going','late') THEN 1 ELSE 0 END) as total_registrations,\n        SUM(CASE WHEN ep.response_status = 'declined' THEN 1 ELSE 0 END) as total_cancelled,")

# Public route: canonical counts + unconditional going response; no capacity/waitlist business rule.
s=(ROOT/'src/server/routes/publicRoutes.ts').read_text(encoding='utf-8')
s=s.replace("registration_status NOT IN ('cancelled', 'waitlist')", "response_status IN ('going','late')")
s=s.replace("registration_status IN ('registered', 'confirmed')", "response_status IN ('going','late')")
# Replace capacity/waitlist assignment lines broadly.
s=re.sub(r"\s*const eveningCountRow = await db\.get\(.*?const registrationStatus = .*?;", "\n    const registrationStatus = 'going';", s, count=1, flags=re.S)
s=s.replace("if (existingParticipation && existingParticipation.registration_status !== 'cancelled')", "if (existingParticipation)")
s=s.replace("SET registration_status = ?, table_id = ?, updated_at = ?", "SET response_status = ?, registration_status = ?, table_id = ?, updated_at = ?")
s=s.replace("[registrationStatus, selectedTableId, now, existingParticipation.id]", "[registrationStatus, registrationStatus, selectedTableId, now, existingParticipation.id]")
s=s.replace("(id, evening_id, player_id, table_id, registration_status, attendance_status, arrival_status, payment_status", "(id, evening_id, player_id, table_id, response_status, registration_status, attendance_status, arrival_status, payment_status")
s=s.replace("VALUES (?, ?, ?, ?, ?, 'pending', 'unknown', ?, ?, 0, ?, ?, ?)", "VALUES (?, ?, ?, ?, ?, ?, 'pending', 'unknown', ?, ?, 0, ?, ?, ?)")
s=s.replace("[participantId, eveningId, playerId, selectedTableId, registrationStatus,", "[participantId, eveningId, playerId, selectedTableId, registrationStatus, registrationStatus,")
s=s.replace("registration_status: registrationStatus,", "response_status: registrationStatus,\n      registration_status: registrationStatus,")
s=s.replace("registrationStatus === 'waitlist' ? 'Вы добавлены в резервный список' : 'Вы записаны на вечер'", "'Вы записаны на вечер'")
(ROOT/'src/server/routes/publicRoutes.ts').write_text(s,encoding='utf-8')

# UI: participant screen reads response_status and writes attendance_fact.
s=(ROOT/'src/components/crm/EveningParticipantsView.tsx').read_text(encoding='utf-8')
s=s.replace("normalizeEveningResponse, type EveningResponseStatus", "getActualAttendanceFact, ATTENDANCE_FACT_LABELS, normalizeEveningResponse, type EveningResponseStatus, type WritableAttendanceFact")
s=s.replace("const attendanceLabel = (participant: EveningParticipant) => participant.attendance_status === 'attended' ? 'Пришёл' : participant.attendance_status === 'no_show' ? 'Не пришёл' : 'Явка не отмечена';", "const attendanceLabel = (participant: EveningParticipant) => ATTENDANCE_FACT_LABELS[getActualAttendanceFact(participant.attendance_status, participant.arrival_status) || 'pending'];")
s=s.replace("normalizeEveningResponse(participant.registration_status, participant.arrival_status)", "normalizeEveningResponse(participant.response_status, participant.registration_status)")
s=s.replace("const markAttended = (participant: EveningParticipant) => patchParticipant(participant, { attendance_status: 'attended' }, `attended:${participant.id}`);", "const markAttendance = (participant: EveningParticipant, attendance_fact: WritableAttendanceFact) => patchParticipant(participant, { attendance_fact } as Partial<EveningParticipant>, `attendance:${attendance_fact}:${participant.id}`);")
s=s.replace("{canMarkAttendance ? <button type=\"button\" disabled={Boolean(busyAction)} onClick={() => void markAttended(participant)} className=\"min-h-[44px] shrink-0 rounded-[11px] bg-accent px-3 text-[12px] font-bold text-white disabled:opacity-50\">{rowBusy ? '…' : 'Пришёл'}</button>", "{canMarkAttendance ? <div className=\"flex shrink-0 gap-1\"><button type=\"button\" disabled={Boolean(busyAction)} onClick={() => void markAttendance(participant, 'on_time')} className=\"min-h-[44px] rounded-[11px] bg-accent px-2.5 text-[11px] font-bold text-white disabled:opacity-50\">{rowBusy ? '…' : 'Вовремя'}</button><button type=\"button\" disabled={Boolean(busyAction)} onClick={() => void markAttendance(participant, 'late')} className=\"min-h-[44px] rounded-[11px] border border-border-soft bg-surface-2 px-2.5 text-[11px] font-bold text-text-primary disabled:opacity-50\">Позже</button></div>")
s=s.replace("registration_status: 'going'", "response_status: 'going'")
s=s.replace("normalizeEveningResponse(activeParticipant.registration_status, activeParticipant.arrival_status)", "normalizeEveningResponse(activeParticipant.response_status, activeParticipant.registration_status)")
s=s.replace("if (value !== 'unanswered') void patchParticipant(activeParticipant, { registration_status: value },", "void patchParticipant(activeParticipant, { response_status: value },")
s=s.replace("{normalizeEveningResponse(activeParticipant.response_status, activeParticipant.registration_status) === 'unanswered' ? <option value=\"unanswered\">Не ответил</option> : null}<option value=\"going\">Иду</option>", "<option value=\"unanswered\">Не ответил</option><option value=\"going\">Иду</option>")
old="<label className=\"block\"><span className=\"mb-1.5 block text-[11px] font-semibold text-text-secondary\">Фактическая явка</span><select value={activeParticipant.attendance_status} disabled={Boolean(busyAction)} onChange={(event) => void patchParticipant(activeParticipant, { attendance_status: event.target.value as EveningParticipant['attendance_status'] }, `attendance:${activeParticipant.id}`)} className=\"mobile-field\"><option value=\"pending\">Не отмечена</option><option value=\"attended\">Пришёл</option><option value=\"no_show\">Не пришёл</option></select></label>"
new="<label className=\"block\"><span className=\"mb-1.5 block text-[11px] font-semibold text-text-secondary\">Фактическая явка</span><select value={getActualAttendanceFact(activeParticipant.attendance_status, activeParticipant.arrival_status) || 'pending'} disabled={Boolean(busyAction)} onChange={(event) => void patchParticipant(activeParticipant, { attendance_fact: event.target.value as any } as Partial<EveningParticipant>, `attendance:${activeParticipant.id}`)} className=\"mobile-field\"><option value=\"pending\">Не отмечено</option><option value=\"on_time\">Пришёл вовремя</option><option value=\"late\">Пришёл позже</option><option value=\"no_show\">Не пришёл</option>{getActualAttendanceFact(activeParticipant.attendance_status, activeParticipant.arrival_status) === 'attended_unknown' ? <option value=\"attended_unknown\" disabled>Пришёл, время не указано</option> : null}</select></label>"
if old not in s: raise RuntimeError('participant attendance select not found')
s=s.replace(old,new,1)
s=s.replace("getEveningResponseLabel(activeParticipant.registration_status, activeParticipant.arrival_status)", "getEveningResponseLabel(activeParticipant.response_status, activeParticipant.registration_status)")
(ROOT/'src/components/crm/EveningParticipantsView.tsx').write_text(s,encoding='utf-8')

# Game create screen canonical filters/labels.
s=(ROOT/'src/components/crm/EveningGameCreateSheet.tsx').read_text(encoding='utf-8')
s=s.replace("import { isEveningGameEligible, sortEveningRoster, toggleParticipantInSeats } from '../../lib/eveningRoster';", "import { isEveningGameEligible, sortEveningRoster, toggleParticipantInSeats } from '../../lib/eveningRoster';\nimport { getActualAttendanceFact, normalizeEveningResponse } from '../../lib/eveningResponse';")
s=s.replace("type PlayerFilter = 'all' | 'attended' | 'confirmed';", "type PlayerFilter = 'all' | 'arrived' | 'expected';")
s=s.replace("if (filter === 'attended' && participant.attendance_status !== 'attended') return false;\n      if (filter === 'confirmed' && participant.registration_status !== 'confirmed') return false;", "const fact = getActualAttendanceFact(participant.attendance_status, participant.arrival_status);\n      if (filter === 'arrived' && !['on_time','late','attended_unknown'].includes(String(fact))) return false;\n      if (filter === 'expected' && !(fact === 'pending' && ['going','late'].includes(normalizeEveningResponse(participant.response_status, participant.registration_status)))) return false;")
s=s.replace("[['all', `Все ${eligible.length}`], ['attended', 'Пришли'], ['confirmed', 'Подтв.']]", "[['all', `Все ${eligible.length}`], ['arrived', 'Пришли'], ['expected', 'Ожидаются']]")
s=s.replace("{participant.attendance_status === 'attended' ? 'Пришёл' : participant.registration_status === 'confirmed' ? 'Подтверждён' : 'На вечере'}", "{(() => { const fact = getActualAttendanceFact(participant.attendance_status, participant.arrival_status); return fact === 'on_time' ? 'Пришёл вовремя' : fact === 'late' ? 'Пришёл позже' : fact === 'attended_unknown' ? 'Пришёл' : 'Ожидается'; })()}")
(ROOT/'src/components/crm/EveningGameCreateSheet.tsx').write_text(s,encoding='utf-8')

# Minimal tests for domain + migration matrix.
write('src/tests/eveningCanonicalStatus.test.ts', r'''import fs from 'node:fs';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { countEveningResponses, getActualAttendanceFact, isEveningParticipantEligibleForGame, normalizeLegacyEveningResponseInput, resolveAttendanceWrite } from '../lib/eveningResponse.ts';

describe('04B0 canonical evening status domain', () => {
  it('maps legacy response aliases without using arrival as a planned response', () => {
    expect(normalizeLegacyEveningResponseInput('invited')).toBe('unanswered');
    expect(normalizeLegacyEveningResponseInput('cancelled')).toBe('declined');
    for (const value of ['registered','confirmed','waitlist']) expect(normalizeLegacyEveningResponseInput(value)).toBe('going');
    for (const value of ['unanswered','going','late','thinking','declined']) expect(normalizeLegacyEveningResponseInput(value)).toBe(value);
  });

  it('counts only going + late as expected', () => {
    const rows = ['going','late','thinking','declined','unanswered'].map(response_status => ({ response_status }));
    const c = countEveningResponses(rows);
    expect(c.going + c.late).toBe(2); expect(c.audience).toBe(5);
  });

  it('converts only valid attendance physical pairs and rejects conflicts', () => {
    expect(getActualAttendanceFact('pending','unknown')).toBe('pending');
    expect(getActualAttendanceFact('attended','on_time')).toBe('on_time');
    expect(getActualAttendanceFact('attended','late')).toBe('late');
    expect(getActualAttendanceFact('attended','unknown')).toBe('attended_unknown');
    expect(getActualAttendanceFact('no_show','unknown')).toBe('no_show');
    expect(getActualAttendanceFact('pending','late')).toBeNull();
    const current = { attendance_status:'pending' as const, arrival_status:'unknown' as const, checked_in_at:null };
    expect(resolveAttendanceWrite(current,{attendance_fact:'on_time'},'2026-08-10T00:00:00Z')).toEqual({attendance_status:'attended',arrival_status:'on_time',checked_in_at:'2026-08-10T00:00:00Z'});
    expect(() => resolveAttendanceWrite(current,{attendance_fact:'on_time',attendance_status:'no_show'})).toThrow();
  });

  it('enforces canonical game eligibility', () => {
    const pending=(response_status:string)=>({response_status,registration_status:response_status,attendance_status:'pending',arrival_status:'unknown'});
    expect(isEveningParticipantEligibleForGame(pending('going'))).toBe(true);
    expect(isEveningParticipantEligibleForGame(pending('late'))).toBe(true);
    for(const value of ['thinking','declined','unanswered']) expect(isEveningParticipantEligibleForGame(pending(value))).toBe(false);
    expect(isEveningParticipantEligibleForGame({response_status:'declined',attendance_status:'attended',arrival_status:'late'})).toBe(true);
    expect(isEveningParticipantEligibleForGame({response_status:'going',attendance_status:'no_show',arrival_status:'unknown'})).toBe(false);
  });
});

describe('0011 migration matrix', () => {
  it('separates legacy planned-late from actual-late and is a rerun no-op', () => {
    const db=new Database(':memory:');
    db.exec(`CREATE TABLE migration_history(id TEXT PRIMARY KEY,migration_name TEXT UNIQUE,status TEXT,details_json TEXT,executed_at TEXT);
      CREATE TABLE evening_participants(id TEXT PRIMARY KEY,response_status TEXT NOT NULL DEFAULT 'unanswered',registration_status TEXT,attendance_status TEXT,arrival_status TEXT);
    `);
    const rows=[
      ['invited','pending','unknown'],['registered','pending','unknown'],['confirmed','pending','unknown'],['waitlist','pending','unknown'],['cancelled','pending','unknown'],
      ['registered','pending','late'],['registered','attended','late'],['registered','attended','on_time'],['registered','attended','unknown'],['registered','no_show','unknown'],
      ['thinking','pending','unknown'],['declined','pending','unknown'],['late','pending','unknown'],['going','pending','unknown'],[null,'pending','unknown'],['mystery','pending','unknown'],
    ];
    const ins=db.prepare('INSERT INTO evening_participants(id,registration_status,attendance_status,arrival_status) VALUES(?,?,?,?)');
    rows.forEach((r,i)=>ins.run(String(i),...r));
    const migration=fs.readFileSync('drizzle/0011_canonical_evening_response_attendance.sql','utf8');
    db.exec(migration);
    const out=db.prepare('SELECT * FROM evening_participants ORDER BY CAST(id AS INTEGER)').all() as any[];
    expect(out.map(r=>r.response_status)).toEqual(['unanswered','going','going','going','declined','late','going','going','going','going','thinking','declined','late','going','unanswered','unanswered']);
    expect(out[5].arrival_status).toBe('unknown'); expect(out[6].arrival_status).toBe('late'); expect(out[8].arrival_status).toBe('unknown');
    expect(out.every(r=>r.registration_status===r.response_status)).toBe(true);
    db.prepare("UPDATE evening_participants SET response_status='unanswered',registration_status='going' WHERE id='1'").run();
    db.exec(migration);
    expect((db.prepare("SELECT response_status FROM evening_participants WHERE id='1'").get() as any).response_status).toBe('unanswered');
    db.close();
  });
});
''')

# Update legacy roster tests to canonical fixtures mechanically.
p=ROOT/'src/tests/eveningRoster.test.ts'; s=p.read_text(encoding='utf-8')
s=s.replace("registration_status:", "response_status:")
s=s.replace("'confirmed'", "'going'").replace("'registered'", "'going'").replace("'cancelled'", "'declined'").replace("'waitlist'", "'thinking'")
p.write_text(s,encoding='utf-8')

print('04B0 patch applied')
