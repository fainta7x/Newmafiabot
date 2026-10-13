import { Router } from 'express';
import { getDb, type DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { BotFaqError, createBotFaq, deleteBotFaq, listBotFaq, moveBotFaq, updateBotFaq } from '../services/botFaqService.ts';

const router = Router();
const dbOf = async (req: AuthenticatedRequest): Promise<DatabaseWrapper> => req.db || (await getDb());
const fail = (res: any, error: unknown, fallback: string) => {
  if (error instanceof BotFaqError) return res.status(error.status).json({ error: error.message });
  console.error('[BOT FAQ]', error);
  return res.status(500).json({ error: fallback });
};

// The organizer edits the bot's «Частые вопросы» here; the bot itself reads them from /api/bot/faq.
router.get('/', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try { res.json({ entries: await listBotFaq(await dbOf(req), false) }); } catch (error) { fail(res, error, 'Не удалось загрузить вопросы'); }
});
router.post('/', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try { res.status(201).json({ entry: await createBotFaq(await dbOf(req), req.body || {}) }); } catch (error) { fail(res, error, 'Не удалось сохранить'); }
});
router.patch('/:id', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try { res.json({ entry: await updateBotFaq(await dbOf(req), String(req.params.id), req.body || {}) }); } catch (error) { fail(res, error, 'Не удалось сохранить'); }
});
router.post('/:id/move', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try { res.json({ entries: await moveBotFaq(await dbOf(req), String(req.params.id), req.body?.direction === 'up' ? 'up' : 'down') }); } catch (error) { fail(res, error, 'Не удалось переставить'); }
});
router.delete('/:id', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try { await deleteBotFaq(await dbOf(req), String(req.params.id)); res.status(204).end(); } catch (error) { fail(res, error, 'Не удалось удалить'); }
});

export default router;
