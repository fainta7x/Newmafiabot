import { Router } from 'express';
import { requireOrganizerAuth, requireClubOwner } from '../auth.ts';
import {
  listVipProbabilityRules,saveVipProbabilityRule,deleteVipProbabilityRule,migrateLegacyChaginRedGuarantee,
} from '../services/vipProbabilityRulesService.ts';

import { getVipGameQuotas,saveVipGameQuota,deleteVipGameQuota } from '../services/vipGameQuotaService.ts';

const router = Router();
router.use(requireOrganizerAuth);
router.use(requireClubOwner);
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
router.get('/game-quotas',async(req,res)=>{
  try {
    await migrateLegacyChaginRedGuarantee(req.db);
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
