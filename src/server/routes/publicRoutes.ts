import { Router, type Request, type Response } from 'express';
import { getDb } from '../../db/index.ts';
import { getFlexibleTournamentStandings } from '../services/flexibleTournamentStandingsService.ts';
import { internalGetNominations } from './tournamentsRoutesBase.ts';
import avatarRouter from './publicAvatarRoutes.ts';

const router=Router();
const expected="response_status IN ('going','late')";

router.get('/evenings/:id',async(req:Request,res:Response)=>{try{const db=req.db||(await getDb());const evening=await db.get<any>('SELECT id,title,starts_at,ends_at,venue,format,status,capacity,default_price,notes FROM game_evenings WHERE id=?',[req.params.id]);if(!evening)return res.status(404).json({error:'Игровой вечер не найден'});if(evening.status==='cancelled')return res.status(400).json({error:'Этот игровой вечер отменён'});let tables=await db.all<any>(`SELECT t.id,t.name,t.format,t.capacity,t.starts_at,t.default_price,(SELECT COUNT(*) FROM evening_participants p WHERE p.table_id=t.id AND ${expected}) AS registered_count FROM evening_tables t WHERE t.evening_id=? ORDER BY t.sort_order ASC,t.created_at ASC`,[req.params.id]);if(!tables.length){const row=await db.get<any>(`SELECT COUNT(*) AS cnt FROM evening_participants WHERE evening_id=? AND ${expected}`,[req.params.id]);const registered=Number(row?.cnt||0);tables=[{id:'default',name:'Основной стол',format:evening.format||'CASUAL',capacity:evening.capacity||10,registered_count:registered,free_spots:Math.max(0,(evening.capacity||10)-registered)}];}else tables=tables.map((t:any)=>({...t,free_spots:Math.max(0,Number(t.capacity)-Number(t.registered_count))}));return res.json({...evening,venue:evening.venue||'Суп с Котом',tables});}catch(err:any){return res.status(500).json({error:'Database error',message:err.message});}});
router.get('/join/:id',(req,res)=>res.redirect(`/join/${encodeURIComponent(req.params.id)}`));

// Legacy public signup is intentionally retired. Player identity and RSVP now go through
// the Telegram-authenticated player cabinet so a free-form nickname cannot create duplicates.
router.post('/evenings/:id/join', async (req:Request,res:Response) => {
  try {
    const db=req.db||(await getDb());
    const evening=await db.get<any>('SELECT id,status FROM game_evenings WHERE id=?',[req.params.id]);
    if(!evening)return res.status(404).json({error:'Игровой вечер не найден'});
    if(evening.status==='cancelled'||evening.status==='completed')return res.status(410).json({error:'Запись на этот вечер недоступна',code:'evening_closed'});
    return res.status(410).json({
      error:'Запись перенесена в кабинет игрока',
      code:'canonical_registration_required',
      player_path:'/player',
      message:'Откройте MafiaBot в Telegram и выберите «Записаться на игру» или откройте кабинет игрока.',
    });
  }catch(err:any){return res.status(500).json({error:'Database error',message:err.message});}
});

router.get('/tournaments/results/:token',async(req:Request,res:Response)=>{try{const db=req.db||(await getDb());const tournament=await db.get<any>(`SELECT id,title,date,venue,stage,chief_judge_name,status,results_published_at FROM tournaments WHERE public_token=?`,[req.params.token]);if(!tournament)return res.status(404).json({error:'Результаты турнира не найдены'});if(tournament.status!=='completed'||!tournament.results_published_at)return res.status(404).json({error:'Результаты турнира ещё не опубликованы'});const [standingsData,nominationsData]=await Promise.all([getFlexibleTournamentStandings(db,tournament.id),internalGetNominations(db,tournament.id)]);return res.json({tournament:{id:tournament.id,title:tournament.title,date:tournament.date,venue:tournament.venue,stage:tournament.stage,chief_judge_name:tournament.chief_judge_name,results_published_at:tournament.results_published_at},standings:standingsData.standings,nominations:nominationsData.nominations});}catch(err:any){return res.status(500).json({error:'Database error',message:err.message});}});

router.use(avatarRouter);
export default router;
