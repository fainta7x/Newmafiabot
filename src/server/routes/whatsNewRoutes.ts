import { Router } from 'express';
import { getDb, type DatabaseWrapper } from '../../db/index.ts';
import { getPlayerSessionId, requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { WhatsNewError, createWhatsNew, deleteWhatsNew, listAllWhatsNew, listPublishedWhatsNew, updateWhatsNew } from '../services/whatsNewService.ts';

const router = Router();
const dbOf = async (req: AuthenticatedRequest): Promise<DatabaseWrapper> => req.db || (await getDb());
const fail = (res: any, error: unknown, fallback: string) => {
  if (error instanceof WhatsNewError) return res.status(error.status).json({ error: error.message });
  console.error('[WHATS NEW]', error);
  return res.status(500).json({ error: fallback });
};

// Players read the published notices «Что нового»; the organizer writes them in the CRM.
router.get('/', async (req: AuthenticatedRequest, res) => {
  if (req.userRole !== 'ORGANIZER' && !getPlayerSessionId(req)) return res.status(401).json({ error: 'Нужен вход' });
  try { res.json({ entries: await listPublishedWhatsNew(await dbOf(req)) }); } catch (error) { fail(res, error, 'Не удалось загрузить «Что нового»'); }
});

router.get('/all', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try { res.json({ entries: await listAllWhatsNew(await dbOf(req)) }); } catch (error) { fail(res, error, 'Не удалось загрузить записи'); }
});

router.post('/', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try { res.status(201).json({ entry: await createWhatsNew(await dbOf(req), req.body || {}) }); } catch (error) { fail(res, error, 'Не удалось сохранить запись'); }
});

router.patch('/:id', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try { res.json({ entry: await updateWhatsNew(await dbOf(req), String(req.params.id), req.body || {}) }); } catch (error) { fail(res, error, 'Не удалось сохранить запись'); }
});

router.delete('/:id', requireOrganizerAuth, async (req: AuthenticatedRequest, res) => {
  try { await deleteWhatsNew(await dbOf(req), String(req.params.id)); res.status(204).end(); } catch (error) { fail(res, error, 'Не удалось удалить запись'); }
});

export default router;
