import crypto from 'crypto';
import { Router, type NextFunction, type Response } from 'express';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getAuthenticatedOrganizerActorId, requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { normalizeRole } from '../utils/ciHelper.ts';
import {
  cancelTournamentRegistration,
  loadTournamentEvening,
  notifyTournamentAudience,
  organizerAddTournamentPlayer,
  prepareTournamentEveningSeating,
  promoteTournamentReserve,
  reorderTournamentReserve,
  validatePrizeConfiguration,
} from '../services/tournamentEveningService.ts';
import { serializeTournamentRosterMutation } from '../services/tournamentRosterMutationSerializer.ts';

const router = Router();
const actorId = (req: AuthenticatedRequest) => getAuthenticatedOrganizerActorId(req);
const statusFor = (code: string) => ({
  TOURNAMENT_NOT_FOUND: 404, NOT_TOURNAMENT_EVENING: 409, NOT_ELIGIBLE: 403, JUDGE_CANNOT_REGISTER: 409,
  ROSTER_LOCKED: 409, ROSTER_ALREADY_SEATED: 409, ROSTER_NOT_READY: 409, ROSTER_MISMATCH: 409,
  REASON_REQUIRED: 400, ACTOR_REQUIRED: 400, INVALID_RESERVE_ORDER: 400, NOT_IN_RESERVE: 409, TOURNAMENT_FULL: 409,
}[code] || 400);
const isManagedTournamentEvening = async (db: DatabaseWrapper, tournamentId: string) => {
  const row = await db.get<any>('SELECT tournament_evening_flow FROM tournaments WHERE id=? LIMIT 1', [tournamentId]);
  return Number(row?.tournament_evening_flow || 0) === 1;
};

const publishTournament = async (req: AuthenticatedRequest, res: Response) => {
  const db=req.db as DatabaseWrapper,tournamentId=String(req.params.id),t=await db.get<any>('SELECT * FROM tournaments WHERE id=? LIMIT 1',[tournamentId]);
  if(!t||Number(t.tournament_evening_flow||0)!==1)return res.status(404).json({error:'Турнир не найден'}); if(t.status!=='draft')return res.status(409).json({error:'Публикация доступна только до запуска'});
  const prize=validatePrizeConfiguration(t.prize_fund_rub,JSON.parse(t.prize_allocations_json||'[]'));if(!prize.ok||prize.mismatch)return res.status(409).json({error:'Сумма распределения призов не совпадает с общим призовым фондом'});if(!t.judge_player_id||!t.venue)return res.status(409).json({error:'Перед публикацией укажите судью и место'});
  const actor=actorId(req);if(!actor)return res.status(401).json({error:'ACTOR_REQUIRED'});
  const first=!t.published_at,now=new Date().toISOString();
  if(first)await db.run('UPDATE tournaments SET published_at=?,registration_closed_at=NULL,updated_at=? WHERE id=?',[now,now,tournamentId]);
  else await db.run('UPDATE tournaments SET updated_at=? WHERE id=?',[now,tournamentId]);
  if(first)await db.run(`INSERT INTO tournament_evening_audit (id,tournament_id,action,actor_type,actor_id,created_at) VALUES (?,?,'publish','organizer',?,?)`,[crypto.randomUUID(),tournamentId,actor,now]);
  // Always retry the audience. Stable per-player notification keys make this duplicate-safe and heal partial failures.
  // A retry must not reopen registration after an organizer intentionally closed it.
  const audience=await notifyTournamentAudience(db,tournamentId);return res.json({...await loadTournamentEvening(db,tournamentId),audience});
};
router.post('/evenings/:id/publish',requireOrganizerAuth,publishTournament);
router.post('/evenings/:id/publish-and-notify',requireOrganizerAuth,publishTournament);

router.post('/evenings/:id/players',requireOrganizerAuth,async(req:AuthenticatedRequest,res:Response)=>{const actor=actorId(req);if(!actor)return res.status(401).json({error:'ACTOR_REQUIRED'});try{return res.json(await organizerAddTournamentPlayer(req.db as DatabaseWrapper,String(req.params.id),String(req.body?.player_id||''),String(req.body?.reason||''),actor));}catch(e:any){return res.status(statusFor(e?.message)).json({error:e?.message});}});
const removePlayer=async(req:AuthenticatedRequest,res:Response)=>{const reason=String(req.body?.reason||'').trim(),actor=actorId(req);if(!reason)return res.status(400).json({error:'Для ручного удаления укажите причину'});if(!actor)return res.status(401).json({error:'ACTOR_REQUIRED'});try{return res.json(await cancelTournamentRegistration(req.db as DatabaseWrapper,String(req.params.id),String(req.params.playerId),'organizer',actor,reason));}catch(e:any){return res.status(statusFor(e?.message)).json({error:e?.message});}};
router.post('/evenings/:id/players/:playerId/remove',requireOrganizerAuth,removePlayer);
router.post('/evenings/:id/players/:playerId/remove-audited',requireOrganizerAuth,removePlayer);
router.post('/evenings/:id/reserve/reorder',requireOrganizerAuth,async(req:AuthenticatedRequest,res:Response)=>{const actor=actorId(req);if(!actor)return res.status(401).json({error:'ACTOR_REQUIRED'});try{const ids=Array.isArray(req.body?.registration_ids)?req.body.registration_ids.map(String):[];return res.json(await reorderTournamentReserve(req.db as DatabaseWrapper,String(req.params.id),ids,String(req.body?.reason||''),actor));}catch(e:any){return res.status(statusFor(e?.message)).json({error:e?.message});}});
router.post('/evenings/:id/reserve/:playerId/promote',requireOrganizerAuth,async(req:AuthenticatedRequest,res:Response)=>{const actor=actorId(req);if(!actor)return res.status(401).json({error:'ACTOR_REQUIRED'});try{return res.json(await promoteTournamentReserve(req.db as DatabaseWrapper,String(req.params.id),String(req.params.playerId),String(req.body?.reason||''),actor));}catch(e:any){return res.status(statusFor(e?.message)).json({error:e?.message});}});

router.put('/:id/participants',requireOrganizerAuth,async(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{if(!(await isManagedTournamentEvening(req.db as DatabaseWrapper,String(req.params.id))))return next();return res.status(409).json({error:'Состав этого турнира управляется регистрацией. Используйте блок «Участники · 10 мест».'});});
router.patch('/:id/participants/:participantId/correct-player',requireOrganizerAuth,async(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{if(!(await isManagedTournamentEvening(req.db as DatabaseWrapper,String(req.params.id))))return next();return res.status(409).json({error:'Участника турнира можно поменять только через запись на турнир.'});});
const prepareSeating=async(req:AuthenticatedRequest,res:Response,regenerate=false)=>{const actor=actorId(req);if(!actor)return res.status(401).json({error:'ACTOR_REQUIRED'});try{const result=await prepareTournamentEveningSeating(req.db as DatabaseWrapper,String(req.params.id),actor,{regenerate});return res.json({...result,tournament:await loadTournamentEvening(req.db as DatabaseWrapper,String(req.params.id))});}catch(e:any){return res.status(statusFor(e?.message)).json({error:e?.message});}};
router.post('/evenings/:id/prepare-seating',requireOrganizerAuth,(req:AuthenticatedRequest,res:Response)=>prepareSeating(req,res));
router.post('/:id/generate-seating',requireOrganizerAuth,async(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{if(!(await isManagedTournamentEvening(req.db as DatabaseWrapper,String(req.params.id))))return next();return prepareSeating(req,res,true);});

// Managed tournament evenings shadow the legacy game-start route so the transition is serialized
// with roster replacement. Reads, role validation and the planned -> active write happen inside the
// same DB transaction; a replacement therefore either finishes first or observes an already-started game.
router.post('/:id/games/:gameId/start',requireOrganizerAuth,async(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{
  const db=req.db as DatabaseWrapper,tournamentId=String(req.params.id),gameId=String(req.params.gameId);
  if(!(await isManagedTournamentEvening(db,tournamentId)))return next();
  try{
    const result=await serializeTournamentRosterMutation(db,()=>db.transaction(async(tx)=>{
      const tournament=await tx.get<any>('SELECT * FROM tournaments WHERE id=? LIMIT 1',[tournamentId]);
      if(!tournament)return{status:404,body:{error:'Турнир не найден'}};
      if(tournament.status!=='active')return{status:400,body:{error:'Запуск игры разрешён только в активном турнире'}};
      const game=await tx.get<any>('SELECT * FROM tournament_games WHERE id=? AND tournament_id=? LIMIT 1',[gameId,tournamentId]);
      if(!game)return{status:404,body:{error:'Игра не найдена'}};
      if(game.status!=='planned')return{status:400,body:{error:'Игра уже была запущена или завершена'}};
      const active=await tx.get<any>("SELECT COUNT(*) AS cnt FROM tournament_games WHERE tournament_id=? AND status='active' AND id<>?",[tournamentId,gameId]);
      if(Number(active?.cnt||0)>0)return{status:400,body:{error:'В турнире уже идет другая игра'}};
      const seats=await tx.all<any>('SELECT * FROM tournament_game_seats WHERE game_id=?',[gameId]);
      if(seats.length!==10)return{status:400,body:{error:'В игре должно быть ровно 10 мест'}};
      const roleCounts:Record<string,number>={citizen:0,sheriff:0,mafia:0,don:0};
      for(const seat of seats){const role=normalizeRole(seat.role);if(role&&roleCounts[role]!==undefined)roleCounts[role]+=1;}
      if(roleCounts.citizen!==6||roleCounts.sheriff!==1||roleCounts.mafia!==2||roleCounts.don!==1){
        return{status:400,body:{error:'Нельзя запустить игру с неправильным набором ролей. Требуется ровно: 6 мирных, 1 Шериф, 2 мафии и 1 Дон.',current_roles:roleCounts}};
      }
      const now=new Date().toISOString();
      await tx.run("UPDATE tournament_games SET status='active',started_at=? WHERE id=? AND status='planned'",[now,gameId]);
      return{status:200,body:{success:true,game:await tx.get<any>('SELECT * FROM tournament_games WHERE id=?',[gameId])}};
    }));
    return res.status(result.status).json(result.body);
  }catch(error:any){return res.status(500).json({error:error?.message||'Ошибка запуска игры'});}
});

export default router;