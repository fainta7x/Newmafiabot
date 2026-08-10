from pathlib import Path
import re


def replace_once(path: str, old: str, new: str):
    p=Path(path); s=p.read_text(encoding='utf-8')
    if s.count(old) != 1: raise RuntimeError(f'{path}: expected one match, got {s.count(old)}: {old[:100]!r}')
    p.write_text(s.replace(old,new,1),encoding='utf-8')


def replace_block(path: str, start: str, end: str, replacement: str):
    p=Path(path); s=p.read_text(encoding='utf-8')
    a=s.find(start)
    if a < 0: raise RuntimeError(f'{path}: start block not found: {start}')
    b=s.find(end,a)
    if b < 0: raise RuntimeError(f'{path}: end block not found: {end}')
    p.write_text(s[:a]+replacement+s[b:],encoding='utf-8')

# Shared canonical response write conflict resolver.
p=Path('src/lib/eveningResponse.ts'); s=p.read_text(encoding='utf-8')
anchor="export const isExpectedEveningResponse = (value: unknown) => {"
insert=r'''export const resolveEveningResponseWrite = (input: {
  response_status?: unknown;
  registration_status?: unknown;
}, defaultStatus: EveningResponseStatus | null = null): EveningResponseStatus | null => {
  const hasCanonical = input.response_status !== undefined;
  const hasCompat = input.registration_status !== undefined;
  if (!hasCanonical && !hasCompat) return defaultStatus;
  const canonical = hasCanonical ? normalizeEveningResponse(String(input.response_status ?? '')) : null;
  const compat = hasCompat ? normalizeLegacyEveningResponseInput(input.registration_status) : null;
  if (canonical && compat && canonical !== compat) throw new Error('response_status конфликтует с registration_status');
  return canonical || compat || defaultStatus;
};

'''
if anchor not in s: raise RuntimeError('response helper anchor missing')
s=s.replace(anchor,insert+anchor,1); p.write_text(s,encoding='utf-8')

# Evenings route import.
replace_once('src/server/routes/eveningsRoutes.ts',
"import { normalizeEveningResponse, normalizeLegacyEveningResponseInput, resolveAttendanceWrite } from '../../lib/eveningResponse.ts';",
"import { resolveAttendanceWrite, resolveEveningResponseWrite } from '../../lib/eveningResponse.ts';")

# All active evening list/detail expected counts use response only.
p=Path('src/server/routes/eveningsRoutes.ts'); s=p.read_text(encoding='utf-8')
s=s.replace("p.registration_status NOT IN ('cancelled', 'waitlist')", "p.response_status IN ('going','late')")
s=s.replace("p.registration_status != 'cancelled'", "p.response_status IN ('going','late')")
s=s.replace("p.registration_status = 'confirmed'", "p.response_status IN ('going','late')")
s=s.replace("registration_status NOT IN ('cancelled', 'waitlist')", "response_status IN ('going','late')")
p.write_text(s,encoding='utf-8')

# Bulk organizer add: default going; canonical/compat conflict rejected; no reserve semantics.
start="// POST /api/evenings/:id/participants/bulk - Bulk add players (Auth required)"
end="// PATCH /api/evenings/:id/participants/bulk - Bulk update participant statuses in single transaction (Auth required)"
bulk=r'''// POST /api/evenings/:id/participants/bulk - Bulk add players (Auth required)
router.post('/:id/participants/bulk', requireOrganizerAuth, async (req, res) => {
  try {
    const parsed = bulkAddParticipantsSchema.parse(req.body);
    const { player_ids, table_id, amount_due } = parsed;
    const responseStatus = resolveEveningResponseWrite(parsed, 'going');
    const db = (req as any).db || (await getDb());
    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    if (!evening) return res.status(404).json({ error: 'Игровой вечер не найден' });
    if (evening.status === 'completed' || evening.settled_at) return res.status(400).json({ error: 'Запрещено добавлять игроков в завершённые вечера' });
    if (table_id) {
      const table = await db.get('SELECT id FROM evening_tables WHERE id = ? AND evening_id = ?', [table_id, req.params.id]);
      if (!table) return res.status(404).json({ error: 'Игровой стол не найден на этом вечере' });
    }
    const due = amount_due ?? evening.default_price;
    const now = new Date().toISOString();
    let addedCount = 0, skippedCount = 0;
    await db.exec('BEGIN TRANSACTION');
    try {
      for (const playerId of player_ids) {
        const existing = await db.get('SELECT id FROM evening_participants WHERE evening_id = ? AND player_id = ?', [req.params.id, playerId]);
        if (existing) { skippedCount++; continue; }
        await db.run(
          `INSERT INTO evening_participants (
            id, evening_id, player_id, table_id, response_status, registration_status,
            attendance_status, arrival_status, payment_status, amount_due, amount_paid,
            registered_at, confirmed_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'unknown', ?, ?, 0, ?, NULL, ?, ?)`,
          [crypto.randomUUID(), req.params.id, playerId, table_id || null, responseStatus, responseStatus,
           due === 0 ? 'waived' : 'unpaid', due, now, now, now]
        );
        addedCount++;
      }
      await db.exec('COMMIT');
    } catch (error) { try { await db.exec('ROLLBACK'); } catch (_) {} throw error; }
    await runCrmAutomations(db);
    const participants = await db.all(`SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo
      FROM evening_participants ep JOIN players p ON p.id = ep.player_id WHERE ep.evening_id = ? ORDER BY ep.created_at`, [req.params.id]);
    res.json({ success: true, addedCount, waitlistCount: 0, skippedCount, participants });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Validation or DB error', details: err.errors });
  }
});

'''
replace_block('src/server/routes/eveningsRoutes.ts',start,end,bulk)

# Bulk update uses canonical response/attendance, and table assignment stays isolated.
start=end
end2="// POST /api/evenings/:id/participants - Add single player with capacity check (Auth required)"
bulk_update=r'''// PATCH /api/evenings/:id/participants/bulk - Bulk canonical updates in one transaction (Auth required)
router.patch('/:id/participants/bulk', requireOrganizerAuth, async (req, res) => {
  const db = (req as any).db || (await getDb());
  try {
    const updates = req.body?.updates;
    if (!Array.isArray(updates) || !updates.length) return res.status(400).json({ error: 'Список обновлений участников пуст или некорректен' });
    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    if (!evening) return res.status(404).json({ error: 'Игровой вечер не найден' });
    if (evening.status === 'completed' || evening.settled_at) return res.status(400).json({ error: 'Запрещено изменять участников завершённого вечера' });
    await db.exec('BEGIN TRANSACTION');
    try {
      for (const item of updates) {
        if (!item?.id) continue;
        const current = await db.get('SELECT * FROM evening_participants WHERE id = ? AND evening_id = ?', [item.id, req.params.id]);
        if (!current) throw Object.assign(new Error('Участник не найден'), { status: 404 });
        if (Object.prototype.hasOwnProperty.call(item, 'table_id')) await assignParticipantToTable(db, item.id, item.table_id, req.params.id);
        const response = resolveEveningResponseWrite(item, null);
        const attendance = resolveAttendanceWrite(current, item, new Date().toISOString());
        const fields: string[] = []; const values: any[] = [];
        if (response) { fields.push('response_status = ?', 'registration_status = ?'); values.push(response, response); }
        if (attendance) { fields.push('attendance_status = ?', 'arrival_status = ?', 'checked_in_at = ?'); values.push(attendance.attendance_status, attendance.arrival_status, attendance.checked_in_at ?? null); }
        for (const key of ['payment_status','amount_due','amount_paid','notes']) if (item[key] !== undefined) { fields.push(`${key} = ?`); values.push(item[key]); }
        if (fields.length) {
          fields.push('updated_at = ?'); values.push(new Date().toISOString(), item.id, req.params.id);
          await db.run(`UPDATE evening_participants SET ${fields.join(', ')} WHERE id = ? AND evening_id = ?`, values);
        }
      }
      await db.exec('COMMIT');
    } catch (error) { try { await db.exec('ROLLBACK'); } catch (_) {} throw error; }
    await runCrmAutomations(db);
    const participants = await db.all(`SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo
      FROM evening_participants ep JOIN players p ON p.id = ep.player_id WHERE ep.evening_id = ? ORDER BY ep.created_at`, [req.params.id]);
    res.json({ success: true, participants });
  } catch (err: any) {
    res.status(err.status || 400).json({ error: err.message || 'Database transaction error' });
  }
});

'''
replace_block('src/server/routes/eveningsRoutes.ts',start,end2,bulk_update)

# Single organizer add defaults going and mirrors response; no capacity-derived state.
start=end2
end3="// POST /api/evenings/:id/settle - Safe & Idempotent Evening Settlement (Auth required)"
single=r'''// POST /api/evenings/:id/participants - Add single participant (Auth required)
router.post('/:id/participants', requireOrganizerAuth, async (req, res) => {
  try {
    const data = addSingleParticipantSchema.parse(req.body);
    const responseStatus = resolveEveningResponseWrite(data, 'going');
    const db = (req as any).db || (await getDb());
    const evening = await db.get('SELECT * FROM game_evenings WHERE id = ?', [req.params.id]);
    if (!evening) return res.status(404).json({ error: 'Игровой вечер не найден' });
    if (evening.status === 'completed' || evening.settled_at) return res.status(400).json({ error: 'Запрещено записывать игроков на завершённые вечера' });
    let playerId = data.player_id;
    if (!playerId && data.nickname) {
      const existingPlayer = await db.get('SELECT id FROM players WHERE nickname = ?', [data.nickname]);
      if (existingPlayer) playerId = existingPlayer.id;
      else {
        playerId = crypto.randomUUID(); const now = new Date().toISOString();
        await db.run(`INSERT INTO players (id,nickname,phone,lifecycle_status,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
          [playerId,data.nickname,data.phone || null,'normal','quick_guest',now,now]);
      }
    }
    if (!playerId) return res.status(400).json({ error: 'Укажите player_id или nickname игрока' });
    if (await db.get('SELECT id FROM evening_participants WHERE evening_id = ? AND player_id = ?', [req.params.id,playerId])) return res.status(400).json({ error: 'Игрок уже записан на этот вечер' });
    if (data.table_id && !(await db.get('SELECT id FROM evening_tables WHERE id = ? AND evening_id = ?', [data.table_id,req.params.id]))) return res.status(404).json({ error: 'Игровой стол не найден на этом вечере' });
    const due = data.amount_due ?? evening.default_price, paid = data.amount_paid ?? 0;
    const paymentStatus = (data as any).payment_status ?? (due === 0 ? 'waived' : paid >= due && due > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid');
    const id=crypto.randomUUID(), now=new Date().toISOString();
    await db.run(`INSERT INTO evening_participants (
      id,evening_id,player_id,table_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,notes,registered_at,confirmed_at,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,'pending','unknown',?,?,?,?,?,NULL,?,?)`,
      [id,req.params.id,playerId,data.table_id || null,responseStatus,responseStatus,paymentStatus,due,paid,data.notes || null,now,now,now]);
    await runCrmAutomations(db);
    const participant = await db.get(`SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo
      FROM evening_participants ep JOIN players p ON p.id=ep.player_id WHERE ep.id=?`, [id]);
    res.status(201).json(participant);
  } catch (err: any) { res.status(400).json({ error: err.message || 'Validation error', details: err.errors }); }
});

'''
replace_block('src/server/routes/eveningsRoutes.ts',start,end3,single)

# Completion: expected pending and active attended_unknown block; finances only actual attendees.
p=Path('src/server/routes/eveningsRoutes.ts'); s=p.read_text(encoding='utf-8')
old="""    const pendingParticipants = await db.all(
      `SELECT ep.*, p.nickname FROM evening_participants ep
       JOIN players p ON ep.player_id = p.id
       WHERE ep.evening_id = ? AND ep.attendance_status = 'pending'
         AND ep.registration_status IN ('going', 'late', 'registered', 'confirmed')`,
      [req.params.id]
    );"""
new="""    const pendingParticipants = await db.all(
      `SELECT ep.*, p.nickname FROM evening_participants ep
       JOIN players p ON ep.player_id = p.id
       WHERE ep.evening_id = ? AND (
         (ep.response_status IN ('going','late') AND ep.attendance_status = 'pending' AND ep.arrival_status = 'unknown')
         OR (ep.attendance_status = 'attended' AND ep.arrival_status = 'unknown')
       )`, [req.params.id]);"""
if old not in s: raise RuntimeError('settle pending query not found')
s=s.replace(old,new,1)
old2="""        // Exclude cancelled and waitlist from financial debt calculation
        if (['cancelled', 'declined', 'invited', 'thinking', 'waitlist'].includes(p.registration_status) || p.payment_status === 'waived') {
          continue;
        }"""
new2="""        // Financial settlement is based only on actual attendance, independently of the planned response.
        if (p.attendance_status !== 'attended' || p.payment_status === 'waived') continue;"""
if old2 not in s: raise RuntimeError('settle finance legacy condition not found')
s=s.replace(old2,new2,1); p.write_text(s,encoding='utf-8')

# Participant PATCH: use shared response resolver; transaction already protects conflicts.
p=Path('src/server/routes/participantRoutes.ts'); s=p.read_text(encoding='utf-8')
s=s.replace("import { normalizeEveningResponse, normalizeLegacyEveningResponseInput, resolveAttendanceWrite } from '../../lib/eveningResponse.ts';",
            "import { resolveAttendanceWrite, resolveEveningResponseWrite } from '../../lib/eveningResponse.ts';")
s=re.sub(r"\n    if \(data\.response_status !== undefined && data\.registration_status !== undefined\) \{.*?const response = data\.response_status !== undefined\n      \? normalizeEveningResponse\(data\.response_status\)\n      : data\.registration_status !== undefined \? normalizeLegacyEveningResponseInput\(data\.registration_status\) : null;",
         "\n    const response = resolveEveningResponseWrite(data, null);",s,count=1,flags=re.S)
p.write_text(s,encoding='utf-8')

# Public join: no capacity/waitlist semantics; public action always means going.
p=Path('src/server/routes/publicRoutes.ts'); s=p.read_text(encoding='utf-8')
start="router.post('/evenings/:id/join', async (req: Request, res: Response) => {"
end="// GET /api/public/tournaments/results/:token"
a=s.find(start); b=s.find(end,a)
if a<0 or b<0: raise RuntimeError('public join block not found')
join=r'''router.post('/evenings/:id/join', async (req: Request, res: Response) => {
  try {
    const db=(req as any).db || (await getDb()); const eveningId=req.params.id;
    const { name,nickname,telegram_username,phone,table_id,source }=req.body;
    const rawName=(nickname || name || '').trim(); if(!rawName) return res.status(400).json({error:'Укажите имя или никнейм'});
    const evening=await db.get('SELECT * FROM game_evenings WHERE id=?',[eveningId]);
    if(!evening) return res.status(404).json({error:'Игровой вечер не найден'});
    if(evening.status==='cancelled' || evening.status==='completed') return res.status(400).json({error:'Запись на этот вечер недоступна'});
    const normalizedTg=telegram_username ? telegram_username.replace(/^@/,'').trim().toLowerCase() : null;
    const normalizedPhone=phone ? phone.replace(/\D/g,'') : null;
    let player:any=null;
    if(normalizedTg) player=await db.get('SELECT * FROM players WHERE LOWER(telegram_username)=?',[normalizedTg]);
    if(!player && normalizedPhone && normalizedPhone.length>=10) player=await db.get('SELECT * FROM players WHERE phone LIKE ?',[`%${normalizedPhone.slice(-10)}%`]);
    if(!player) player=await db.get('SELECT * FROM players WHERE LOWER(nickname)=?',[rawName.toLowerCase()]);
    const now=new Date().toISOString();
    if(!player){ const id=`usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`; await db.run(`INSERT INTO players (id,nickname,telegram_username,phone,lifecycle_status,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,[id,rawName,normalizedTg,phone || null,'normal',source || 'Публичная запись',now,now]); player={id,nickname:rawName}; }
    else if((!player.telegram_username && normalizedTg) || (!player.phone && phone)) await db.run('UPDATE players SET telegram_username=COALESCE(telegram_username,?), phone=COALESCE(phone,?), updated_at=? WHERE id=?',[normalizedTg,phone || null,now,player.id]);
    let targetTableId=table_id && table_id!=='default' ? table_id : null, tableName='Основной стол';
    if(targetTableId){ const table=await db.get('SELECT id,name FROM evening_tables WHERE id=? AND evening_id=?',[targetTableId,eveningId]); if(!table) return res.status(400).json({error:'Выбранный стол не относится к этому вечеру'}); tableName=table.name; }
    const existing=await db.get('SELECT * FROM evening_participants WHERE evening_id=? AND player_id=?',[eveningId,player.id]);
    if(existing){ await db.run('UPDATE evening_participants SET response_status=\'going\', registration_status=\'going\', table_id=?, updated_at=? WHERE id=?',[targetTableId,now,existing.id]); return res.json({success:true,alreadyRegistered:true,response_status:'going',registration_status:'going',tableName,message:'Запись на вечер подтверждена'}); }
    const id=`part_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`, due=evening.default_price || 0;
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,table_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,registered_at,created_at,updated_at)
      VALUES (?,?,?,?,'going','going','pending','unknown',?,?,0,?,?,?)`,[id,eveningId,player.id,targetTableId,due===0?'waived':'unpaid',due,now,now,now]);
    await db.run(`INSERT INTO player_activities (id,player_id,evening_id,type,outcome,description,occurred_at,created_at) VALUES (?, ?, ?, 'response', 'going', ?, ?, ?)`,[ `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,player.id,eveningId,`Самостоятельная запись на вечер: ${tableName}`,now,now]);
    res.json({success:true,response_status:'going',registration_status:'going',tableName,message:`Вы успешно записаны на «${tableName}»!`});
  } catch(err:any){ res.status(500).json({error:'Database error',message:err.message}); }
});

'''
s=s[:a]+join+s[b:]; p.write_text(s,encoding='utf-8')

# Update integration tests to canonical attendance writes and add core API assertions.
p=Path('src/tests/crm.test.ts'); s=p.read_text(encoding='utf-8')
s=s.replace("registration_status: 'going',", "response_status: 'going',")
s=s.replace(".send({\n          attendance_status: 'attended',\n          amount_paid: 500,\n        });", ".send({\n          attendance_fact: 'on_time',\n          amount_paid: 500,\n        });",1)
s=s.replace("expect(res.body.participants.filter((p: any) => p.registration_status === 'waitlist')).toHaveLength(0);", "expect(res.body.participants.every((p: any) => p.response_status === 'going' && p.registration_status === 'going')).toBe(true);")
p.write_text(s,encoding='utf-8')

print('04B0 active-path corrections applied')
