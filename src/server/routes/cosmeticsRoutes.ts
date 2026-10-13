import { Router } from 'express';
import { z } from 'zod';
import { getAuthenticatedOrganizerActorId, getPlayerSessionId, isClubOwner, requireClubOwner, requireOrganizerAuth } from '../auth.ts';
import { activateCompendium, CosmeticsError, createCosmeticItem, createCosmeticSeason, dismantleCosmeticDuplicate, equipCosmetic, getCosmetics, grantCosmetic, operationInput } from '../services/cosmeticsService.ts';
import { approvePortrait, readPortraitBytes, readRoleLooks, saveRoleLook } from '../services/roleLooksService.ts';
import { createDraftCosmeticSet, listCosmeticSets, listDraftWearableAssets, listDraftWearableItems, replaceDraftCosmeticSetItems } from '../services/cosmeticSetsService.ts';

const router = Router();
const id = z.string().min(1).max(120).regex(/^[a-zA-Z0-9:_-]+$/);
const handle = (fn: (req: any) => Promise<unknown>) => async (req: any, res: any) => {
  try { return res.json(await fn(req)); }
  catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Некорректные параметры косметики', code: 'validation_error' });
    if (error instanceof CosmeticsError) return res.status(error.status).json({ error: error.code, code: error.code });
    console.error('[COSMETICS]', error);
    return res.status(500).json({ error: 'Не удалось выполнить операцию с косметикой' });
  }
};
const self = (req: any): string => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) throw new CosmeticsError('authentication_required', 401);
  return playerId;
};
const owner = (req: any): string => {
  const actorId = getAuthenticatedOrganizerActorId(req);
  if (!actorId) throw new CosmeticsError('owner_identity_required', 403);
  return actorId;
};
router.get('/cosmetics', handle(req => getCosmetics(req.db, self(req))));
router.get('/cosmetics/role-looks', handle(async req => ({ ...await readRoleLooks(req.db, self(req)), canApprovePortrait: isClubOwner(req) })));
router.put('/cosmetics/role-looks/:role', handle(req => saveRoleLook(req.db, self(req), req.params.role, req.body)));
router.get('/cosmetics/portrait/:version', async (req: any, res: any) => {
  try {
    const bytes = await readPortraitBytes(req.db, self(req), id.parse(req.params.version));
    if (!bytes) return res.status(404).end();
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.type('image/png').send(bytes);
  } catch (e) { return res.status(e instanceof CosmeticsError ? e.status : 400).end(); }
});
router.put('/cosmetics/equipment/:slot', handle(req => {
  const input = z.object({ itemId: id.nullable() }).strict().parse(req.body);
  return equipCosmetic(req.db, self(req), String(req.params.slot), input.itemId);
}));
router.post('/cosmetics/duplicates/:itemId/dismantle', handle(req => {
  const input = operationInput.extend({ seasonId: id }).parse(req.body);
  return dismantleCosmeticDuplicate(req.db, self(req), String(req.params.itemId), input.seasonId, input.requestId);
}));
router.use('/cosmetics/admin', requireOrganizerAuth, requireClubOwner);
router.post('/cosmetics/admin/players/:playerId/portrait', handle(req => approvePortrait(req.db, id.parse(req.params.playerId), req.body, owner(req))));
router.post('/cosmetics/admin/seasons', handle(req => { owner(req); return createCosmeticSeason(req.db, req.body); }));
router.post('/cosmetics/admin/items', handle(req => { owner(req); return createCosmeticItem(req.db, req.body); }));
router.get('/cosmetics/admin/wardrobe-assets', handle(req => { owner(req); return listDraftWearableAssets(); }));
router.get('/cosmetics/admin/wardrobe-items', handle(req => { owner(req); return listDraftWearableItems(req.db); }));
router.get('/cosmetics/admin/sets', handle(req => { owner(req); return listCosmeticSets(req.db); }));
router.post('/cosmetics/admin/sets', handle(req => { owner(req); return createDraftCosmeticSet(req.db, req.body); }));
router.put('/cosmetics/admin/sets/:setId/items', handle(req => { owner(req); return replaceDraftCosmeticSetItems(req.db, String(req.params.setId), req.body); }));
router.post('/cosmetics/admin/players/:playerId/grants', handle(req => {
  const input = operationInput.extend({ itemId: id }).parse(req.body);
  return grantCosmetic(req.db, String(req.params.playerId), input.itemId, input.requestId, owner(req));
}));
router.post('/cosmetics/admin/players/:playerId/compendiums', handle(req => {
  const input = operationInput.extend({ seasonId: id, paymentReference: z.string().trim().min(1).max(120) }).parse(req.body);
  return activateCompendium(req.db, String(req.params.playerId), input.seasonId, input.paymentReference, input.requestId, owner(req));
}));
export default router;
