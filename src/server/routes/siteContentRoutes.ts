import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import { SiteContentError, isSiteBlockKey, listSiteBlocks, resetSiteBlock, saveSiteBlock } from '../services/siteContentService.ts';

/** CRM «Ещё → Сайт»: the organizer edits the texts of the club's site himself. */
const router = Router();
router.use(requireOrganizerAuth);

const fail = (res: any, error: unknown, fallback: string) => {
  if (error instanceof SiteContentError) return res.status(error.status).json({ error: error.message });
  console.error('[SITE CONTENT]', error);
  return res.status(500).json({ error: fallback });
};

router.get('/', async (req, res) => { try { res.json({ blocks: await listSiteBlocks(req.db) }); } catch (error) { fail(res, error, 'Не удалось загрузить тексты сайта'); } });
router.put('/:key', async (req, res) => {
  try {
    if (!isSiteBlockKey(req.params.key)) return res.status(404).json({ error: 'Такого текста нет' });
    await saveSiteBlock(req.db, req.params.key, req.body?.body);
    res.json({ blocks: await listSiteBlocks(req.db) });
  } catch (error) { fail(res, error, 'Не удалось сохранить текст'); }
});
router.delete('/:key', async (req, res) => {
  try {
    if (!isSiteBlockKey(req.params.key)) return res.status(404).json({ error: 'Такого текста нет' });
    await resetSiteBlock(req.db, req.params.key);
    res.json({ blocks: await listSiteBlocks(req.db) });
  } catch (error) { fail(res, error, 'Не удалось вернуть стандартный текст'); }
});
export default router;
