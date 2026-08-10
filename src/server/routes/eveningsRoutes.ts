import { Router, type Response } from 'express';
import crypto from 'crypto';
import { getDb, type DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { addSingleParticipantSchema, bulkAddParticipantsSchema } from '../validation.ts';
import { runCrmAutomations } from '../services/crmAutomationService.ts';
import { assignParticipantToTable } from '../services/tableAssignmentService.ts';
import {
  legacyAttendancePatchToFact, parseAttendanceFact, parseResponseStatus,
  serializeEveningParticipant, setParticipantAttendance, setParticipantResponse,
} from '../services/eveningParticipantState.ts';
import baseRouter from './eveningsRoutesBase.ts';

const router = Router();
const expectedSql = "response_status IN ('going','late')";
const participantSelect = `SELECT ep.*, p.nickname, p.phone, p.telegram_username, p.lifecycle_status, p.elo FROM evening_participants ep JOIN players p ON ep.player_id = p.id`;

const ensureEditable = async (db: DatabaseWrapper, id: string) => {
  const evening = await db.get<any>('SELECT * FROM game_evenings WHERE id = ?', [id]);
  if (!evening) { const error: any = new Error('Игровой вечер не найден'); error.status = 404; throw error; }
  if (evening.status === 'completed' || evening.settled_at) { const error: any = new Error('Завершённый вечер доступен только для чтения'); error.status = 400; throw error; }
  return evening;
};

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = (req as any).db || (await getDb());
    const isOrganizer = req.userRole === 'ORGANIZER';
    if (!isOrganizer) {
      const rows = await db.all<any>(`SELECT e.*, (SELECT COUNT(*) FROM evening_participants p WHERE p.evening_id=e.id AND ${expectedSql}) AS registered_count FROM game_evenings e WHERE e.status IN ('published','active') ORDER BY e.starts_at ASC`);
      return res.json(rows.map((e) => ({ id:e.id,title:e.title,starts_at:e.starts_at,ends_at:e.ends_at,venue:e.venue,format:e.format,status:e.status,capacity:e.capacity,default_price:e.default_price,registered_count:e.registered_count,available_spots:Math.max(0,Number(e.capacity||0)-Number(e.registered_count||0)) })));
    }
    const rows = await db.all<any>(`SELECT e.*,
      (SELECT COUNT(*) FROM evening_participants p WHERE p.evening_id=e.id AND ${expectedSql}) AS registered_count,
      (SELECT COUNT(*) FROM evening_participants p WHERE p.evening_id=e.id AND p.response_status='going') AS confirmed_count,
      (SELECT COUNT(*) FROM evening_participants p WHERE p.evening_id=e.id AND p.attendance_status='attended') AS attended_count,
      (SELECT COUNT(*) FROM evening_participants p WHERE p.evening_id=e.id AND p.attendance_status='no_show') AS no_show_count,
      (SELECT COALESCE(SUM(amount_paid),0) FROM evening_participants p WHERE p.evening_id=e.id) AS total_revenue
      FROM game_evenings e ORDER BY e.starts_at DESC`);
    return res.json(rows);
  } catch (err:any) { return res.status(500).json({error:'Database error',message:err.message}); }
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db=(req as any).db || (await getDb());
    const evening=await db.get<any>('SELECT * FROM game_evenings WHERE id=?',[req.params.id]);
    if(!evening) return res.status(404).json({error:'Игровой вечер не найден'});
    const countRow=await db.get<any>(`SELECT COUNT(*) AS cnt FROM evening_participants WHERE evening_id=? AND ${expectedSql}`,[req.params.id]);
    const registered_count=Number(countRow?.cnt||0);
    if(req.userRole!=='ORGANIZER') return res.json({id:evening.id,title:evening.title,starts_at:evening.starts_at,ends_at:evening.ends_at,venue:evening.venue,format:evening.format,status:evening.status,capacity:evening.capacity,default_price:evening.default_price,registered_count,available_spots:Math.max(0,Number(evening.capacity||0)-registered_count)});
    const tables=await db.all<any>('SELECT * FROM evening_tables WHERE evening_id=? ORDER BY sort_order ASC,created_at ASC',[req.params.id]);
    const participants=(await db.all<any>(`${participantSelect} WHERE ep.evening_id=? ORDER BY ep.created_at ASC`,[req.params.id])).map(serializeEveningParticipant);
    const games=await db.all<any>('SELECT * FROM games WHERE evening_id=? ORDER BY global_game_number ASC',[req.params.id]);
    return res.json({...evening,registered_count,available_spots:Math.max(0,Number(evening.capacity||0)-registered_count),tables,participants,games});
  } catch(err:any){return res.status(500).json({error:'Database error',message:err.message});}
});

router.get('/:id/participants', requireOrganizerAuth, async (req,res)=>{
  try{const db=(req as any).db||(await getDb()); const rows=await db.all<any>(`${participantSelect} WHERE ep.evening_id=? ORDER BY ep.created_at ASC`,[req.params.id]); return res.json(rows.map(serializeEveningParticipant));}
  catch(err:any){return res.status(500).json({error:'Database error',message:err.message});}
});

router.post('/:id/participants/bulk', requireOrganizerAuth, async (req,res)=>{
  try{
    const data=bulkAddParticipantsSchema.parse(req.body); const db=(req as any).db||(await getDb()); const evening=await ensureEditable(db,req.params.id);
    if(data.table_id){const table=await db.get<any>('SELECT id FROM evening_tables WHERE id=? AND evening_id=?',[data.table_id,req.params.id]); if(!table)return res.status(404).json({error:'Игровой стол не найден на этом вечере'});}
    const response=data.response_status ? parseResponseStatus(data.response_status) : 'unanswered'; const now=new Date().toISOString(); let addedCount=0,skippedCount=0;
    await db.transaction(async(tx)=>{for(const playerId of data.player_ids){const exists=await tx.get<any>('SELECT id FROM evening_participants WHERE evening_id=? AND player_id=?',[req.params.id,playerId]); if(exists){skippedCount++;continue;} addedCount++; await tx.run(`INSERT INTO evening_participants (id,evening_id,player_id,table_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,registered_at,confirmed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,'pending','unknown',?,?,0,?,?,?,?,?)`,[crypto.randomUUID(),req.params.id,playerId,data.table_id||null,response,response,(data.amount_due??evening.default_price)===0?'waived':'unpaid',data.amount_due??evening.default_price,now,response==='going'||response==='late'?now:null,now,now]);}});
    await runCrmAutomations(db); const rows=(await db.all<any>(`${participantSelect} WHERE ep.evening_id=?`,[req.params.id])).map(serializeEveningParticipant); return res.json({success:true,addedCount,waitlistCount:0,skippedCount,participants:rows});
  }catch(err:any){return res.status(err.status||400).json({error:err.message||'Validation or DB error'});}
});

router.post('/:id/participants', requireOrganizerAuth, async (req,res)=>{
  try{
    const data=addSingleParticipantSchema.parse(req.body); const db=(req as any).db||(await getDb()); const evening=await ensureEditable(db,req.params.id); let playerId=data.player_id; const now=new Date().toISOString();
    if(!playerId&&data.nickname){const existing=await db.get<any>('SELECT id FROM players WHERE nickname=?',[data.nickname]); if(existing)playerId=existing.id; else{playerId=crypto.randomUUID(); await db.run(`INSERT INTO players (id,nickname,phone,lifecycle_status,source,created_at,updated_at) VALUES (?,?,?,'normal','quick_guest',?,?)`,[playerId,data.nickname,data.phone||null,now,now]);}}
    if(!playerId)return res.status(400).json({error:'Укажите player_id или nickname игрока'}); if(await db.get('SELECT id FROM evening_participants WHERE evening_id=? AND player_id=?',[req.params.id,playerId]))return res.status(400).json({error:'Игрок уже добавлен на этот вечер'});
    if(data.table_id&&!await db.get('SELECT id FROM evening_tables WHERE id=? AND evening_id=?',[data.table_id,req.params.id]))return res.status(404).json({error:'Игровой стол не найден на этом вечере'});
    const response=data.response_status?parseResponseStatus(data.response_status):'unanswered'; const due=data.amount_due??evening.default_price; const paid=data.amount_paid??0; const payment=due===0?'waived':paid>=due&&due>0?'paid':paid>0?'partial':'unpaid'; const id=crypto.randomUUID();
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,table_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,notes,registered_at,confirmed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,'pending','unknown',?,?,?,?,?,?,?,?)`,[id,req.params.id,playerId,data.table_id||null,response,response,payment,due,paid,data.notes||null,now,response==='going'||response==='late'?now:null,now,now]);
    await runCrmAutomations(db); const row=await db.get<any>(`${participantSelect} WHERE ep.id=?`,[id]); return res.status(201).json(serializeEveningParticipant(row));
  }catch(err:any){return res.status(err.status||400).json({error:err.message||'Validation error'});}
});

router.patch('/:id/participants/bulk', requireOrganizerAuth, async(req,res)=>{
  try{const updates=req.body?.updates;if(!Array.isArray(updates)||!updates.length)return res.status(400).json({error:'Список обновлений участников пуст или некорректен'});const db=(req as any).db||(await getDb());await ensureEditable(db,req.params.id);
    await db.transaction(async(tx)=>{for(const item of updates){if(!item?.id)continue;const current=await tx.get<any>('SELECT * FROM evening_participants WHERE id=? AND evening_id=?',[item.id,req.params.id]);if(!current)continue;if('table_id' in item)await assignParticipantToTable(tx,item.id,item.table_id,undefined,req.params.id);const explicit=item.response_status??(['going','late','thinking','declined','unanswered'].includes(String(item.registration_status))?item.registration_status:undefined);if(explicit!==undefined)await setParticipantResponse(tx,item.id,parseResponseStatus(explicit));const fact=item.attendance_fact!==undefined?parseAttendanceFact(item.attendance_fact):legacyAttendancePatchToFact(current,item.attendance_status,item.arrival_status);if(fact)await setParticipantAttendance(tx,item.id,fact);const fields:string[]=[];const values:any[]=[];for(const key of ['payment_status','amount_due','amount_paid','notes'])if(item[key]!==undefined){fields.push(`${key}=?`);values.push(item[key]);}if(fields.length){fields.push('updated_at=?');values.push(new Date().toISOString(),item.id);await tx.run(`UPDATE evening_participants SET ${fields.join(',')} WHERE id=?`,values);}}});
    await runCrmAutomations(db);const rows=(await db.all<any>(`${participantSelect} WHERE ep.evening_id=?`,[req.params.id])).map(serializeEveningParticipant);return res.json({success:true,participants:rows});
  }catch(err:any){return res.status(err.status||400).json({error:err.message||'Database transaction error'});}
});

router.post('/:id/settle', requireOrganizerAuth, async(req,res)=>{
  try{const db=(req as any).db||(await getDb());const evening=await db.get<any>('SELECT * FROM game_evenings WHERE id=?',[req.params.id]);if(!evening)return res.status(404).json({error:'Игровой вечер не найден'});if(evening.status==='completed'||evening.settled_at)return res.json({success:true,alreadySettled:true,evening});
    const pending=await db.all<any>(`${participantSelect} WHERE ep.evening_id=? AND ep.response_status IN ('going','late') AND ep.attendance_status='pending'`,[req.params.id]);if(pending.length)return res.status(409).json({error:'Не отмечена фактическая явка ожидаемых игроков',pendingParticipants:pending.map(p=>({id:p.id,nickname:p.nickname,player_id:p.player_id})),message:'Перед закрытием отметьте фактическую явку игроков, которые ответили «Иду» или «Приду позже».'});
    const participants=await db.all<any>('SELECT * FROM evening_participants WHERE evening_id=?',[req.params.id]);const now=new Date().toISOString();await db.transaction(async(tx)=>{await tx.run(`UPDATE game_evenings SET status='completed',settled_at=?,updated_at=? WHERE id=? AND status!='completed'`,[now,now,req.params.id]);for(const p of participants){if(p.attendance_status!=='attended'||p.payment_status==='waived')continue;const due=Number(p.amount_due||0),paid=Number(p.amount_paid||0),debt=Math.max(0,due-paid);if(paid>0)await tx.run(`INSERT OR IGNORE INTO financial_transactions (id,type,amount,category,description,player_id,evening_id,source_type,source_id,created_at) VALUES (?,'income',?,'Взнос за вечер',?,?,?,'evening_settle',?,?)`,[crypto.randomUUID(),paid,`Оплата за вечер ${evening.title}`,p.player_id,evening.id,p.id,now]);if(debt>0)await tx.run(`INSERT OR IGNORE INTO financial_transactions (id,type,amount,category,description,player_id,evening_id,source_type,source_id,created_at) VALUES (?,'debt_created',?,'Неоплата за вечер',?,?,?,'evening_settle',?,?)`,[crypto.randomUUID(),debt,`Долг за вечер ${evening.title}`,p.player_id,evening.id,p.id,now]);}});await runCrmAutomations(db);return res.json({success:true,alreadySettled:false,message:'Игровой вечер успешно закрыт и рассчитан',evening:await db.get('SELECT * FROM game_evenings WHERE id=?',[req.params.id])});
  }catch(err:any){return res.status(err.status||500).json({error:err.message||'Database transaction error'});}
});

router.patch('/participants/:participantId/move-table', requireOrganizerAuth, async(req,res)=>{
  try{const db=(req as any).db||(await getDb());await assignParticipantToTable(db,req.params.participantId,req.body?.table_id);await runCrmAutomations(db);const row=await db.get<any>(`${participantSelect} WHERE ep.id=?`,[req.params.participantId]);return res.json(serializeEveningParticipant(row));}catch(err:any){return res.status(err.status||500).json({error:err.message||'Database error'});}
});

router.use(baseRouter);
export default router;
