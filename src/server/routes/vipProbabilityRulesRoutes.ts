import { Router } from 'express';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import {
  listVipProbabilityRules,saveVipProbabilityRule,deleteVipProbabilityRule,
} from '../services/vipProbabilityRulesService.ts';

import { readVipTiers,saveVipTier,assignVipTier,deleteVipTier } from '../services/vipTierService.ts';

import { getVipGameQuotas,saveVipGameQuota,deleteVipGameQuota } from '../services/vipGameQuotaService.ts';

const router = Router();
router.use(requireOrganizerAuth);
router.use((req: AuthenticatedRequest,res,next) => {
  if (req.userRole !== 'ORGANIZER' || req.delegatedOrganizerAccess)
    return res.status(403).json({ error: 'Настройки доступны только организатору клуба' });
  next();
});
const onError = (res: any, error: any) =>
  res.status(error?.statusCode || 400).json({ error: error?.message || 'Ошибка настройки' });

router.get('/',async(req,res)=>{
  try {
    res.setHeader('Cache-Control','private, no-store');
    return res.json({ rules: await listVipProbabilityRules(req.db) });
  } catch (error) { return onError(res,error); }
});
router.post('/',async(req,res)=>{
  try { return res.status(201).json(await saveVipProbabilityRule(req.db,req.body)); }
  catch (error) { return onError(res,error); }
});
router.put('/:id',async(req,res)=>{
  try { return res.json(await saveVipProbabilityRule(req.db,req.body,String(req.params.id))); }
  catch (error) { return onError(res,error); }
});
router.delete('/:id',async(req,res)=>{
  try { return res.json(await deleteVipProbabilityRule(req.db,String(req.params.id))); }
  catch (error) { return onError(res,error); }
});
router.get('/tiers',async(req,res)=>{
  try {res.setHeader('Cache-Control','private, no-store'); return res.json(await readVipTiers(req.db));}
  catch(error){return onError(res,error);}
});
router.post('/tiers',async(req,res)=>{
  try{return res.status(201).json(await saveVipTier(req.db,req.body));}
  catch(error){return onError(res,error);}
});
router.put('/tiers/:id',async(req,res)=>{
  try{return res.json(await saveVipTier(req.db,req.body,String(req.params.id)));}
  catch(error){return onError(res,error);}
});
router.delete('/tiers/:id',async(req,res)=>{
  try{return res.json(await deleteVipTier(req.db,String(req.params.id)));}
  catch(error){return onError(res,error);}
});
router.put('/assignments/:playerId',async(req,res)=>{
  try {
    const tierId = req.body?.tierId;
    if(tierId!==null && (typeof tierId!=='string'||!tierId.trim()))
      return res.status(400).json({error:'Выберите VIP-уровень или отсутствие уровня'});
    return res.json(await assignVipTier(req.db,String(req.params.playerId),tierId));
  }catch(error){return onError(res,error);}
});
router.get('/game-quotas',async(req,res)=>{
  try {
    res.setHeader('Cache-Control','private, no-store');
    return res.json({ quotas: await getVipGameQuotas(req.db) });
  } catch(error) { return onError(res,error); }
});
router.put('/game-quotas/:playerId',async(req,res)=>{
  try {
    return res.json(await saveVipGameQuota(req.db,String(req.params.playerId),req.body));
  } catch(error) { return onError(res,error); }
});
router.delete('/game-quotas/:playerId',async(req,res)=>{
  try {
    return res.json(await deleteVipGameQuota(req.db,String(req.params.playerId)));
  } catch(error) { return onError(res,error); }
});

export default router;
