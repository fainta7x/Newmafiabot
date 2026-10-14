import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import { PostTemplateError, isPostTemplateKey, listPostTemplates, resetPostTemplate, savePostTemplate } from '../services/postTemplateService.ts';

/** CRM «Публикации и каналы → Текст постов»: the organizer rewrites the texts of posts himself. */
const router = Router();
router.use(requireOrganizerAuth);

const fail = (res: any, error: unknown, fallback: string) => {
  if (error instanceof PostTemplateError) return res.status(error.status).json({ error: error.message });
  console.error('[POST TEMPLATES]', error);
  return res.status(500).json({ error: fallback });
};

router.get('/', async (req, res) => {
  try { res.json({ templates: await listPostTemplates(req.db) }); } catch (error) { fail(res, error, 'Не удалось загрузить тексты постов'); }
});

router.put('/:key', async (req, res) => {
  try {
    if (!isPostTemplateKey(req.params.key)) return res.status(404).json({ error: 'Такого текста нет' });
    await savePostTemplate(req.db, req.params.key, req.body?.body);
    res.json({ templates: await listPostTemplates(req.db) });
  } catch (error) { fail(res, error, 'Не удалось сохранить текст'); }
});

router.delete('/:key', async (req, res) => {
  try {
    if (!isPostTemplateKey(req.params.key)) return res.status(404).json({ error: 'Такого текста нет' });
    await resetPostTemplate(req.db, req.params.key);
    res.json({ templates: await listPostTemplates(req.db) });
  } catch (error) { fail(res, error, 'Не удалось вернуть стандартный текст'); }
});

export default router;
