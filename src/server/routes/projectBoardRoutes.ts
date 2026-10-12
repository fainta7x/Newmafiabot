import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import { loadBoardPullRequests, loadProjectBoard } from '../services/projectBoardService.ts';

const router = Router();
router.use(requireOrganizerAuth);

/** Read-only «Проект» screen of the CRM: the cards of docs/PROJECT_STATE.md and the pull requests. */
router.get('/', async (_req, res) => {
  try { return res.json(await loadProjectBoard()); }
  catch (error: any) { return res.status(500).json({ error: error?.message || 'Не удалось прочитать docs/PROJECT_STATE.md' }); }
});

router.get('/pulls', async (_req, res) => {
  try { return res.json({ pulls: await loadBoardPullRequests() }); }
  catch (error: any) { return res.status(502).json({ error: 'GitHub сейчас недоступен. Попробуйте позже.', detail: error?.message || null }); }
});

export default router;
