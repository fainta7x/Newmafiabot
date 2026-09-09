import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';
import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';
import { ensureSlotsForEvening, loadEveningSlotPlan, replacePlayerSlotSelection, TABLE_MIN_PLAYERS, TABLE_MIN_READY_SLOTS } from '../services/eveningSlotPlanningService.ts';

const router = Router();
const requirePlayer = (req:any,res:any) => { const id=getPlayerSessionId(req); if(!id){res.status(401).json({error:'Player authentication required.'});return null;} return id; };
const monthBounds = (value:unknown) => { const m=String(value||'').match(/^(\d{4})-(\d{2})$/), now=new Date(), year=m?Number(m[1]):now.getUTCFullYear(), month=m?Number(m[2])-1:now.getUTCMonth(), start=new Date(Date.UTC(year,month,1)), end=new Date(Date.UTC(year,month+1,1)); return {start:start.toISOString(),end:end.toISOString(),startDay:start.toISOString().slice(0,10),endDay:end.toISOString().slice(0,10),key:`${year}-${String(month+1).padStart(2,'0')}`}; };

router.get('/calendar', async (req,res) => {
  const playerId=requirePlayer(req,res); if(!playerId)return;
  const db=req.db;
  try{
    const player=await db.get('SELECT id, game_level FROM players WHERE id = ? LIMIT 1',[playerId]);
    if(!player)return res.status(404).json({error:'Игрок не найден'});
    const bounds=monthBounds(req.query.month);
    const rows=await db.all("SELECT id, title, starts_at, ends_at, timezone, venue, format, status FROM game_evenings WHERE status IN ('published','active') AND settled_at IS NULL AND starts_at >= ? AND starts_at < ? ORDER BY starts_at",[bounds.start,bounds.end]);
    const events:any[]=[];
    for(const row of rows){
      if(!playerLevelAllowsEveningFormat(player.game_level,row.format))continue;
      const plan=await loadEveningSlotPlan(db,String(row.id),playerId);
      events.push({...plan.event,slots:plan.slots.map((slot:any)=>({id:slot.id,slot_number:slot.slot_number,starts_at:slot.starts_at,ends_at:slot.ends_at,price:slot.price,registered_count:slot.registered_count,selected:slot.selected}))});
    }
    if(playerLevelAllowsEveningFormat(player.game_level,'TOURNAMENT')){
      const tournaments=await db.all(`SELECT t.id,t.title,t.date AS starts_at,t.venue,t.stage,t.status,t.game_count,t.chief_judge_name,
        t.entry_fee_rub,t.prize_fund_rub,t.prize_allocations_json,t.player_capacity,t.registration_closed_at
        FROM tournaments t
        WHERE substr(t.date,1,10) >= ? AND substr(t.date,1,10) < ? AND t.published_at IS NOT NULL AND t.status NOT IN ('completed','cancelled') ORDER BY t.date`,[bounds.startDay,bounds.endDay]);
      for(const item of tournaments){
        const x=await db.get("SELECT COUNT(*) AS count FROM tournament_registrations WHERE tournament_id = ? AND status='confirmed'",[item.id]);
        const mine=await db.get("SELECT status,queue_order FROM tournament_registrations WHERE tournament_id=? AND player_id=? LIMIT 1",[item.id,playerId]);
        events.push({...item,event_type:'tournament',format:'TOURNAMENT',badge:'Турнир',participant_count:Number(x?.count||0),player_capacity:Number(item.player_capacity||10),remaining_places:Math.max(0,10-Number(x?.count||0)),prize_allocations:JSON.parse(item.prize_allocations_json||'[]'),registration_status:mine?.status||null,reserve_position:mine?.status==='reserve'?Number(mine.queue_order||0):null,registration_open:!item.registration_closed_at});
      }
    }
    events.sort((a,b)=>new Date(a.starts_at).getTime()-new Date(b.starts_at).getTime());
    return res.json({month:bounds.key,rules:{price_per_game:100,required_slots:TABLE_MIN_READY_SLOTS,required_players_per_slot:TABLE_MIN_PLAYERS},events});
  }catch(error:any){return res.status(Number(error?.statusCode||500)).json({error:error?.message||'Не удалось загрузить календарь'});}
});

router.get('/evenings/:eveningId/slots', async (req,res)=>{
  const playerId=requirePlayer(req,res);if(!playerId)return;const db=req.db;
  try{const player=await db.get('SELECT game_level FROM players WHERE id = ? LIMIT 1',[playerId]);const {evening}=await ensureSlotsForEvening(db,String(req.params.eveningId));if(!player||!playerLevelAllowsEveningFormat(player.game_level,evening.format))return res.status(403).json({error:'Этот формат события недоступен'});return res.json(await loadEveningSlotPlan(db,String(req.params.eveningId),playerId));}catch(error:any){return res.status(Number(error?.statusCode||500)).json({error:error?.message||'Не удалось загрузить игровые слоты'});}
});

router.post('/evenings/:eveningId/slots', async (req,res)=>{
  const playerId=requirePlayer(req,res);if(!playerId)return;const db=req.db;
  try{const player=await db.get('SELECT game_level FROM players WHERE id = ? LIMIT 1',[playerId]);const {evening}=await ensureSlotsForEvening(db,String(req.params.eveningId));if(!player||!playerLevelAllowsEveningFormat(player.game_level,evening.format))return res.status(403).json({error:'Этот формат события недоступен'});const plan=await replacePlayerSlotSelection(db,String(req.params.eveningId),playerId,req.body?.slot_ids);return res.json({success:true,...plan});}catch(error:any){return res.status(Number(error?.statusCode||500)).json({error:error?.message||'Не удалось сохранить запись на игры'});}
});

export default router;