import { Router, type Response } from 'express';
import crypto from 'crypto';
import { getDb, type DatabaseWrapper } from '../../db/index.ts';
import { ensureEveningSlotsSchema } from '../../db/ensureEveningSlotsSchema.ts';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import {
  addSingleParticipantSchema,
  bulkAddParticipantsSchema,
  createEveningSchema,
  updateEveningSchema,
} from '../validation.ts';
import { runCrmAutomations } from '../services/crmAutomationService.ts';
import { assignParticipantToTable } from '../services/tableAssignmentService.ts';
import { loadAnnouncementOverview } from '../services/eveningAnnouncementTrackingService.ts';
import {
  legacyAttendancePatchToFact, parseAttendanceFact, parseResponseStatus,
  serializeEveningParticipant, setParticipantAttendance, setParticipantResponse,
} from '../services/eveningParticipantState.ts';
import {
  createGuestPlaceholder, listGuestPlaceholdersForEvening,
  updateGuestPlaceholder,
} from '../services/guestPlayerService.ts';
import { settleEveningFromCloseout } from '../services/eveningCloseoutService.ts';
import baseRouter from './eveningsRoutesBase.ts';

const router = Router();
const expectedSql = "response_status IN ('going','late')";
const REGULAR_PRICE = 100;
const participantSelect = `SELECT ep.* FROM (
  SELECT raw.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo
    FROM evening_participants raw
    JOIN players p ON raw.player_id = p.id
   WHERE NOT EXISTS (
     SELECT 1 FROM guest_player_placeholders gp WHERE gp.legacy_participant_id = raw.id
   )
) ep`;
const withCanonicalFormat = <T extends { format?: unknown }>(evening: T): T & { format: ReturnType<typeof normalizeEveningFormat> } => ({
  ...evening,
  format: normalizeEveningFormat(evening.format),
});
const isRegularEvening = (format: unknown) => normalizeEveningFormat(format) === 'CASUAL';

const ensureEditable = async (db: DatabaseWrapper, id: string) => {
  const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ?', [id]);
  if (!evening) { const error: any = new Error('Игровой вечер не найден'); error.status = 404; throw error; }
  if (evening.status === 'completed' || evening.settled_at) { const error: any = new Error('Завершённый вечер доступен только для чтения'); error.status = 400; throw error; }
  return evening;
};

const insertRegularSlotSettings = async (db: DatabaseWrapper, eveningId: string, now: string) => {
  await db.run(
    `INSERT INTO evening_slot_settings
      (evening_id, planned_slots, slot_duration_minutes, price_per_game, ready_slots_required, ready_players_per_slot, created_at, updated_at)
     VALUES (?, 6, 60, ?, 4, 11, ?, ?)
     ON CONFLICT(evening_id) DO UPDATE SET price_per_game = excluded.price_per_game, updated_at = excluded.updated_at`,
    [eveningId, REGULAR_PRICE, now, now],
  );
};

const loadEveningPricePerGame = async (db: DatabaseWrapper, eveningId: string) => {
  const row = await db.get<any>('SELECT price_per_game FROM evening_slot_settings WHERE evening_id = ? LIMIT 1', [eveningId]);
  return row ? Number(row.price_per_game) : undefined;
};

const loadEveningParticipants = async (db: DatabaseWrapper, eveningId: string) => {
  const [registered, guests] = await Promise.all([
    db.all<any>(`${participantSelect} WHERE ep.evening_id = ? ORDER BY ep.created_at ASC`, [eveningId]),
    listGuestPlaceholdersForEvening(db, eveningId),
  ]);
  return [...registered.map(serializeEveningParticipant), ...guests]
    .sort((a: any, b: any) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
};

// Canonical quick action. This shadows the pre-cutover STANDARD implementation in baseRouter.
router.post('/create-next-friday', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    await ensureEveningSlotsSchema(db);
    const now = new Date();
    let dayOffset = (5 - now.getDay() + 7) % 7;
    if (dayOffset === 0 && now.getHours() >= 20) dayOffset = 7;
    const nextFriday = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const day = nextFriday.getDate();
    const monthsRu = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const yearStr = nextFriday.getFullYear();
    const monthStr = String(nextFriday.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const startsAtIso = `${yearStr}-${monthStr}-${dayStr}T20:00:00+03:00`;
    const title = `Игровой вечер — ${day} ${monthsRu[nextFriday.getMonth()]}`;
    const eveningId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    await db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO game_evenings (id, title, starts_at, timezone, venue, format, status, capacity, default_price, created_at, updated_at)
         VALUES (?, ?, ?, 'Europe/Moscow', 'Суп с Котом', 'CASUAL', 'draft', 20, ?, ?, ?)`,
        [eveningId, title, startsAtIso, REGULAR_PRICE, nowIso, nowIso],
      );
      await insertRegularSlotSettings(tx, eveningId, nowIso);
    });
    const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ?', [eveningId]);
    return res.status(201).json({ ...withCanonicalFormat(evening), price_per_game: REGULAR_PRICE, tables: [] });
  } catch (err: any) {
    return res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// Canonical create path. Regular CASUAL/legacy STANDARD pricing is normalized before either write.
router.post('/', requireOrganizerAuth, async (req, res) => {
  try {
    const data = createEveningSchema.parse(req.body);
    const db = req.db || (await getDb());
    const regular = isRegularEvening(data.format);
    if (regular) await ensureEveningSlotsSchema(db);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const defaultPrice = regular ? REGULAR_PRICE : data.default_price;

    await db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO game_evenings (id, title, starts_at, ends_at, timezone, venue, format, status, capacity, default_price, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.title, data.starts_at, data.ends_at || null, data.timezone, data.venue || null, data.format, data.status, data.capacity, defaultPrice, data.notes || null, now, now],
      );
      if (regular) await insertRegularSlotSettings(tx, id, now);
    });

    const created = await db.get<any>('SELECT * FROM game_evenings WHERE id = ?', [id]);
    return res.status(201).json({
      ...withCanonicalFormat(created),
      ...(regular ? { price_per_game: REGULAR_PRICE } : {}),
    });
  } catch (err: any) {
    return res.status(400).json({ error: 'Validation error', details: err.errors || err.message });
  }
});

// Canonical duplicate path. A regular evening may never inherit a historical/non-regular price.
router.post('/duplicate-last', requireOrganizerAuth, async (req, res) => {
  try {
    const db = req.db || (await getDb());
    const lastEvening = await db.get<any>('SELECT * FROM game_evenings ORDER BY starts_at DESC LIMIT 1');
    if (!lastEvening) return res.status(404).json({ error: 'Предыдущий вечер не найден' });
    const lastTables = await db.all<any>('SELECT * FROM evening_tables WHERE evening_id = ? ORDER BY sort_order ASC', [lastEvening.id]);
    const regular = isRegularEvening(lastEvening.format);
    if (regular) await ensureEveningSlotsSchema(db);
    const newEveningId = crypto.randomUUID();
    const now = new Date().toISOString();
    const newTables: any[] = [];

    await db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO game_evenings (id, title, starts_at, timezone, venue, format, status, capacity, default_price, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
        [
          newEveningId,
          `${lastEvening.title} (копия)`,
          lastEvening.starts_at,
          lastEvening.timezone || 'Europe/Moscow',
          lastEvening.venue || 'Суп с Котом',
          lastEvening.format || 'STANDARD',
          lastEvening.capacity || 20,
          regular ? REGULAR_PRICE : (lastEvening.default_price || 500),
          lastEvening.notes || null,
          now,
          now,
        ],
      );
      if (regular) await insertRegularSlotSettings(tx, newEveningId, now);
      for (const table of lastTables) {
        const tableId = `tbl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await tx.run(
          `INSERT INTO evening_tables (id, evening_id, name, format, capacity, host_name, default_price, notes, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [tableId, newEveningId, table.name, table.format, table.capacity, table.host_name, regular ? REGULAR_PRICE : table.default_price, table.notes, table.sort_order, now, now],
        );
        newTables.push({ ...table, id: tableId, evening_id: newEveningId, default_price: regular ? REGULAR_PRICE : table.default_price, created_at: now, updated_at: now });
      }
    });

    const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ?', [newEveningId]);
    return res.status(201).json({
      ...withCanonicalFormat(evening),
      ...(regular ? { price_per_game: REGULAR_PRICE } : {}),
      tables: newTables,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// Canonical update path. The target format determines pricing before the UPDATE is issued.
router.patch('/:id', requireOrganizerAuth, async (req, res) => {
  try {
    const data = updateEveningSchema.parse(req.body);
    const db = req.db || (await getDb());
    const eveningId = String(req.params.id);
    const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ?', [eveningId]);
    if (!evening) return res.status(404).json({ error: 'Игровой вечер не найден' });
    if (evening.status === 'completed' || evening.settled_at) return res.status(400).json({ error: 'Завершённый вечер доступен только для чтения' });

    const nextFormat = data.format ?? evening.format;
    const regular = isRegularEvening(nextFormat);
    if (regular) await ensureEveningSlotsSchema(db);
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || key === 'default_price') continue;
      fields.push(`${key} = ?`);
      values.push(value);
    }
    if (data.default_price !== undefined || regular) {
      fields.push('default_price = ?');
      values.push(regular ? REGULAR_PRICE : data.default_price);
    }
    const now = new Date().toISOString();

    await db.transaction(async (tx) => {
      if (fields.length) {
        fields.push('updated_at = ?');
        values.push(now, eveningId);
        await tx.run(`UPDATE game_evenings SET ${fields.join(', ')} WHERE id = ?`, values);
      }
      if (regular) await insertRegularSlotSettings(tx, eveningId, now);
    });

    const updated = await db.get<any>('SELECT * FROM game_evenings WHERE id = ?', [eveningId]);
    const pricePerGame = regular ? REGULAR_PRICE : await loadEveningPricePerGame(db, eveningId);
    return res.json({
      ...withCanonicalFormat(updated),
      ...(pricePerGame !== undefined ? { price_per_game: pricePerGame } : {}),
    });
  } catch (err: any) {
    return res.status(400).json({ error: 'Validation error', details: err.errors || err.message });
  }
});

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = req.db || (await getDb());
    const guestCount = `(SELECT COUNT(*) FROM guest_player_placeholders gp WHERE gp.evening_id=e.id AND gp.replaced_at IS NULL AND gp.${expectedSql})`;
    const regularCount = `(SELECT COUNT(*) FROM evening_participants p WHERE p.evening_id=e.id AND ${expectedSql} AND NOT EXISTS (SELECT 1 FROM guest_player_placeholders gp WHERE gp.legacy_participant_id=p.id))`;
    const pricePerGame = `(SELECT price_per_game FROM evening_slot_settings s WHERE s.evening_id=e.id LIMIT 1)`;
    if (req.userRole !== 'ORGANIZER') {
      const rows = await db.all<any>(`SELECT e.*, ${pricePerGame} AS price_per_game, (${regularCount} + ${guestCount}) AS registered_count FROM game_evenings e WHERE e.status IN ('published','active') ORDER BY e.starts_at ASC`);
      return res.json(rows.map((e) => ({ id:e.id,title:e.title,starts_at:e.starts_at,ends_at:e.ends_at,venue:e.venue,format:normalizeEveningFormat(e.format),status:e.status,capacity:e.capacity,default_price:e.default_price,price_per_game:e.price_per_game,registered_count:e.registered_count,available_spots:Math.max(0,Number(e.capacity||0)-Number(e.registered_count||0)) })));
    }
    const rows = await db.all<any>(`SELECT e.*,
      ${pricePerGame} AS price_per_game,
      (${regularCount} + ${guestCount}) AS registered_count,
      ((SELECT COUNT(*) FROM evening_participants p WHERE p.evening_id=e.id AND p.response_status='going' AND NOT EXISTS (SELECT 1 FROM guest_player_placeholders gp WHERE gp.legacy_participant_id=p.id)) + (SELECT COUNT(*) FROM guest_player_placeholders gp WHERE gp.evening_id=e.id AND gp.response_status='going' AND gp.replaced_at IS NULL)) AS confirmed_count,
      ((SELECT COUNT(*) FROM evening_participants p WHERE p.evening_id=e.id AND p.attendance_status='attended' AND NOT EXISTS (SELECT 1 FROM guest_player_placeholders gp WHERE gp.legacy_participant_id=p.id)) + (SELECT COUNT(*) FROM guest_player_placeholders gp WHERE gp.evening_id=e.id AND gp.attendance_status='attended' AND gp.replaced_at IS NULL)) AS attended_count,
      ((SELECT COUNT(*) FROM evening_participants p WHERE p.evening_id=e.id AND p.attendance_status='no_show' AND NOT EXISTS (SELECT 1 FROM guest_player_placeholders gp WHERE gp.legacy_participant_id=p.id)) + (SELECT COUNT(*) FROM guest_player_placeholders gp WHERE gp.evening_id=e.id AND gp.attendance_status='no_show' AND gp.replaced_at IS NULL)) AS no_show_count,
      ((SELECT COALESCE(SUM(amount_paid),0) FROM evening_participants p WHERE p.evening_id=e.id AND NOT EXISTS (SELECT 1 FROM guest_player_placeholders gp WHERE gp.legacy_participant_id=p.id)) + (SELECT COALESCE(SUM(amount_paid),0) FROM guest_player_placeholders gp WHERE gp.evening_id=e.id AND gp.replaced_at IS NULL)) AS total_revenue
      FROM game_evenings e ORDER BY e.starts_at DESC`);
    return res.json(rows.map(withCanonicalFormat));
  } catch (err:any) { return res.status(500).json({error:'Database error',message:err.message}); }
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db=req.db || (await getDb());
    const evening=await db.get<any>('SELECT e.*, (SELECT price_per_game FROM evening_slot_settings s WHERE s.evening_id=e.id LIMIT 1) AS price_per_game FROM game_evenings e WHERE e.id=?',[String(req.params.id)]);
    if(!evening) return res.status(404).json({error:'Игровой вечер не найден'});
    const participants = req.userRole === 'ORGANIZER' ? await loadEveningParticipants(db, String(req.params.id)) : [];
    const registered_count = req.userRole === 'ORGANIZER'
      ? participants.filter((p:any) => ['going','late'].includes(String(p.response_status))).length
      : Number((await db.get<any>(`
          SELECT (
            (SELECT COUNT(*) FROM evening_participants p
              WHERE p.evening_id=? AND p.response_status IN ('going','late')
                AND NOT EXISTS (SELECT 1 FROM guest_player_placeholders gp WHERE gp.legacy_participant_id=p.id))
            +
            (SELECT COUNT(*) FROM guest_player_placeholders gp
              WHERE gp.evening_id=? AND gp.response_status IN ('going','late') AND gp.replaced_at IS NULL)
          ) AS cnt
        `,[String(req.params.id),String(req.params.id)]))?.cnt||0);
    if(req.userRole!=='ORGANIZER') return res.json({id:evening.id,title:evening.title,starts_at:evening.starts_at,ends_at:evening.ends_at,venue:evening.venue,format:normalizeEveningFormat(evening.format),status:evening.status,capacity:evening.capacity,default_price:evening.default_price,price_per_game:evening.price_per_game,registered_count,available_spots:Math.max(0,Number(evening.capacity||0)-registered_count)});
    const [tables, games, announcement] = await Promise.all([
      db.all<any>('SELECT * FROM evening_tables WHERE evening_id=? ORDER BY sort_order ASC,created_at ASC',[String(req.params.id)]),
      db.all<any>('SELECT * FROM games WHERE evening_id=? ORDER BY global_game_number ASC',[String(req.params.id)]),
      loadAnnouncementOverview(db, String(req.params.id)).catch((error) => {
        console.warn('[CRM] Could not load announcement state for evening:', String(req.params.id), error);
        return null;
      }),
    ]);
    return res.json({...withCanonicalFormat(evening),registered_count,available_spots:Math.max(0,Number(evening.capacity||0)-registered_count),tables,participants,games,announcement});
  } catch(err:any){return res.status(500).json({error:'Database error',message:err.message});}
});

router.get('/:id/participants', requireOrganizerAuth, async (req,res)=>{
  try { const db=req.db||(await getDb()); return res.json(await loadEveningParticipants(db,String(req.params.id))); }
  catch(err:any){return res.status(500).json({error:'Database error',message:err.message});}
});

router.post('/:id/participants/bulk', requireOrganizerAuth, async (req,res)=>{
  try {
    const data=bulkAddParticipantsSchema.parse(req.body); const db=req.db||(await getDb()); const evening=await ensureEditable(db,String(req.params.id));
    if(data.table_id&&!await db.get<any>('SELECT id FROM evening_tables WHERE id=? AND evening_id=?',[data.table_id,String(req.params.id)]))return res.status(404).json({error:'Игровой стол не найден на этом вечере'});
    const response=data.response_status ? parseResponseStatus(data.response_status) : 'unanswered'; const now=new Date().toISOString(); let addedCount=0,skippedCount=0;
    await db.transaction(async(tx)=>{for(const playerId of data.player_ids){const exists=await tx.get<any>('SELECT id FROM evening_participants WHERE evening_id=? AND player_id=?',[String(req.params.id),playerId]); if(exists){skippedCount++;continue;} addedCount++; await tx.run(`INSERT INTO evening_participants (id,evening_id,player_id,table_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,registered_at,confirmed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,'pending','unknown',?,?,0,?,?,?,?)`,[crypto.randomUUID(),String(req.params.id),playerId,data.table_id||null,response,response,(data.amount_due??evening.default_price)===0?'waived':'unpaid',data.amount_due??evening.default_price,now,response==='going'||response==='late'?now:null,now,now]);}});
    await runCrmAutomations(db); return res.json({success:true,addedCount,waitlistCount:0,skippedCount,participants:await loadEveningParticipants(db,String(req.params.id))});
  }catch(err:any){return res.status(err.status||400).json({error:err.message||'Validation or DB error'});}
});

router.post('/:id/participants', requireOrganizerAuth, async (req,res)=>{
  try {
    const data=addSingleParticipantSchema.parse(req.body); const db=req.db||(await getDb()); const evening=await ensureEditable(db,String(req.params.id));
    if(!data.player_id && data.nickname) {
      const guest = await createGuestPlaceholder(db, { eveningId:String(req.params.id), displayName:data.nickname, tableId:data.table_id||null, responseStatus:data.response_status, amountDue:data.amount_due??evening.default_price, amountPaid:data.amount_paid, notes:data.notes });
      await runCrmAutomations(db); return res.status(201).json(guest);
    }
    const playerId=data.player_id;
    if(!playerId)return res.status(400).json({error:'Укажите зарегистрированного игрока или имя гостя'});
    if(!await db.get<any>("SELECT id FROM players WHERE id=? AND COALESCE(source,'') NOT IN ('quick_guest','legacy_guest_migrated') AND COALESCE(lifecycle_status,'normal')!='archived'",[playerId]))return res.status(400).json({error:'Зарегистрированный игрок не найден'});
    if(await db.get('SELECT id FROM evening_participants WHERE evening_id=? AND player_id=?',[String(req.params.id),playerId]))return res.status(400).json({error:'Игрок уже добавлен на этот вечер'});
    if(data.table_id&&!await db.get('SELECT id FROM evening_tables WHERE id=? AND evening_id=?',[data.table_id,String(req.params.id)]))return res.status(404).json({error:'Игровой стол не найден на этом вечере'});
    const response=data.response_status?parseResponseStatus(data.response_status):'unanswered'; const due=data.amount_due??evening.default_price; const paid=data.amount_paid??0; const payment=due===0?'waived':paid>=due&&due>0?'paid':paid>0?'partial':'unpaid'; const id=crypto.randomUUID(); const now=new Date().toISOString();
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,table_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,notes,registered_at,confirmed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,'pending','unknown',?,?,?,?,?,?,?,?)`,[id,String(req.params.id),playerId,data.table_id||null,response,response,payment,due,paid,data.notes||null,now,response==='going'||response==='late'?now:null,now,now]);
    await runCrmAutomations(db); const row=await db.get<any>(`${participantSelect} WHERE ep.id=?`,[id]); return res.status(201).json(serializeEveningParticipant(row));
  }catch(err:any){return res.status(err.status||400).json({error:err.message||'Validation error'});}
});

router.patch('/:id/participants/bulk', requireOrganizerAuth, async(req,res)=>{
  try {
    const updates=req.body?.updates;if(!Array.isArray(updates)||!updates.length)return res.status(400).json({error:'Список обновлений участников пуст или некорректен'});const db=req.db||(await getDb());await ensureEditable(db,String(req.params.id));
    await db.transaction(async(tx)=>{
      for(const item of updates){
        if(!item?.id)continue;
        const guest=await tx.get<any>('SELECT * FROM guest_player_placeholders WHERE id=? AND evening_id=?',[item.id,String(req.params.id)]);
        if(guest){const explicit=item.response_status??(['going','late','thinking','declined','unanswered'].includes(String(item.registration_status))?item.registration_status:undefined);const fact=item.attendance_fact!==undefined?parseAttendanceFact(item.attendance_fact):legacyAttendancePatchToFact(guest,item.attendance_status,item.arrival_status);await updateGuestPlaceholder(tx,String(item.id),{...item,response_status:explicit,attendance_fact:fact||undefined});continue;}
        const current=await tx.get<any>('SELECT * FROM evening_participants WHERE id=? AND evening_id=?',[item.id,String(req.params.id)]);if(!current)continue;if('table_id' in item)await assignParticipantToTable(tx,item.id,item.table_id,undefined,String(req.params.id));const explicit=item.response_status??(['going','late','thinking','declined','unanswered'].includes(String(item.registration_status))?item.registration_status:undefined);if(explicit!==undefined)await setParticipantResponse(tx,item.id,parseResponseStatus(explicit));const fact=item.attendance_fact!==undefined?parseAttendanceFact(item.attendance_fact):legacyAttendancePatchToFact(current,item.attendance_status,item.arrival_status);if(fact)await setParticipantAttendance(tx,item.id,fact);const fields:string[]=[];const values:any[]=[];for(const key of ['payment_status','amount_due','amount_paid','notes'])if(item[key]!==undefined){fields.push(`${key}=?`);values.push(item[key]);}if(fields.length){fields.push('updated_at=?');values.push(new Date().toISOString(),item.id);await tx.run(`UPDATE evening_participants SET ${fields.join(',')} WHERE id=?`,values);}
      }
    });
    await runCrmAutomations(db);return res.json({success:true,participants:await loadEveningParticipants(db,String(req.params.id))});
  }catch(err:any){return res.status(err.status||400).json({error:err.message||'Database transaction error'});}
});

router.post('/:id/settle', requireOrganizerAuth, async(req,res)=>{
  try {
    const db=req.db||(await getDb());
    return res.json(await settleEveningFromCloseout(db, String(req.params.id), {
      allow_missing_game_stats: Boolean(req.body?.allow_missing_game_stats),
    }));
  } catch (err:any) {
    // Keep the legacy endpoint's error contract while delegating its writes to
    // the canonical closeout service. Existing mobile CRM clients still use it.
    if (err?.code === 'attendance_required') {
      return res.status(409).json({
        error: 'Не отмечена фактическая явка ожидаемых игроков',
        pendingParticipants: err.details,
        message: 'Перед закрытием отметьте фактическую явку игроков, которые ответили «Иду» или «Приду позже».',
      });
    }
    if (err?.code === 'game_stats_confirmation_required') {
      return res.status(409).json({
        error: 'Сначала завершите все игры вечера',
        unfinishedGames: err.details?.unfinished || [],
        message: err?.message,
      });
    }
    return res.status(Number(err?.statusCode || 500)).json({
      error: err?.message || 'Не удалось закрыть игровой вечер',
      code: err?.code,
      details: err?.details,
    });
  }
});

router.patch('/participants/:participantId/move-table', requireOrganizerAuth, async(req,res)=>{
  try {
    const db=req.db||(await getDb());const guest=await db.get<any>('SELECT * FROM guest_player_placeholders WHERE id=?',[String(req.params.participantId)]);
    if(guest){const updated=await updateGuestPlaceholder(db,String(req.params.participantId),{table_id:req.body?.table_id});await runCrmAutomations(db);return res.json(updated);}
    await assignParticipantToTable(db,String(req.params.participantId),req.body?.table_id);await runCrmAutomations(db);const row=await db.get<any>(`${participantSelect} WHERE ep.id=?`,[String(req.params.participantId)]);return res.json(serializeEveningParticipant(row));
  }catch(err:any){return res.status(err.status||500).json({error:err.message||'Database error'});}
});

router.use(baseRouter);
export default router;
