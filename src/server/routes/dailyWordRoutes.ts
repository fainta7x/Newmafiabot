import { Router, type Request, type Response, type NextFunction } from 'express';
import { getPlayerSessionId, isClubOwner, requireClubOwner, type AuthenticatedRequest } from '../auth.ts';
import { DailyWordError, guessDailyWord, loadDailyWord, revealDailyWord, scheduleDailyWord } from '../services/dailyWordService.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../../db/ensureOrganizerPlayerAccessSchema.ts';
import { ensureDailyWordSchema } from '../../db/ensureDailyWordSchema.ts';
const router=Router();
const handle=(work:(req:AuthenticatedRequest,id:string)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  res.set('Cache-Control','no-store');
  try {
    const id=getPlayerSessionId(req as AuthenticatedRequest);
    if(!id)return res.status(401).json({error:'Нужен профиль игрока'});
    return res.json(await work(req as AuthenticatedRequest,String(id)));
  } catch(error){if(error instanceof DailyWordError)return res.status(error.status).json({error:error.message});next(error);}
};
router.get('/daily-word',handle(async(req,id)=>({...await loadDailyWord(req.db!,id),can_manage:isClubOwner(req)})));
router.post('/daily-word/guess',handle((req,id)=>guessDailyWord(req.db!,id,req.body || {})));
router.post('/daily-word/reveal',handle((req,id)=>revealDailyWord(req.db!,id,String(req.body?.day || ''))));
router.get('/daily-word/schedule',requireClubOwner,async(req,res,next)=>{
  res.set('Cache-Control','no-store');
  try{await ensureDailyWordSchema(req.db!);res.json({items:await req.db!.all('SELECT day,answer FROM daily_word_puzzles WHERE day > ? ORDER BY day LIMIT 100',[new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date())])});}catch(error){next(error);}
});
router.put('/daily-word/schedule',requireClubOwner,async(req,res,next)=>{
  try{await scheduleDailyWord(req.db!,String((req as AuthenticatedRequest).organizerPlayerId || getPlayerSessionId(req) || PRIMARY_ORGANIZER_PLAYER_ID),String(req.body?.day || ''),String(req.body?.word || ''));res.json({success:true});}catch(error){if(error instanceof DailyWordError)return res.status(error.status).json({error:error.message});next(error);}
});
export default router;
