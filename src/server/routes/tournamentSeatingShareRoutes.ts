import { Router, type Request, type Response } from 'express';
import { requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { createSeatingImageLink, readSeatingImageLink } from '../services/seatingImageLinkService.ts';
import { decodeSeatingImage, sendSeatingImage, SeatingShareError, type SeatingShareTarget } from '../services/tournamentSeatingShareService.ts';

const router = Router();
const publicRouter = Router();

const publicOrigin = (req: Request): string => {
  const configured = String(process.env.PLAYER_APP_URL || process.env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  return configured || `${req.protocol}://${req.get('host')}`;
};

const safeFileName = (value: unknown) => {
  const base = String(value || '').replace(/\.png$/i, '').replace(/[^\p{L}\p{N}._ -]+/gu, '').trim().slice(0, 80);
  return `${base || 'rassadka'}.png`;
};

// POST /api/tournaments/:id/seating-image/link { image: <PNG base64>, file_name? } -> { url }
router.post('/:id/seating-image/link', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournament = await req.db.get('SELECT id FROM tournaments WHERE id = ? LIMIT 1', [String(req.params.id)]);
    if (!tournament) throw new SeatingShareError('Турнир не найден', 404);
    const fileName = safeFileName(req.body?.file_name);
    const token = createSeatingImageLink(decodeSeatingImage(req.body?.image), fileName);
    return res.json({ success: true, url: `${publicOrigin(req)}/api/public/seating-image/${token}/${encodeURIComponent(fileName)}`, file_name: fileName });
  } catch (error: any) {
    const status = error instanceof SeatingShareError ? error.status : 500;
    return res.status(status).json({ error: error?.message || 'Не удалось подготовить ссылку на картинку' });
  }
});

// GET /api/public/seating-image/:token/:name  (the token is the secret; links live 24 h)
publicRouter.get('/seating-image/:token/:name', (req: Request, res: Response) => {
  const link = readSeatingImageLink(String(req.params.token || ''));
  if (!link) return res.status(404).json({ error: 'Ссылка устарела. Откройте рассадку в приложении ещё раз.' });
  res.setHeader('Content-Type', 'image/png');
  // `?inline=1` shows the picture (links shared to VK/Telegram); without it the browser saves the file.
  const disposition = req.query.inline === '1' ? 'inline' : 'attachment';
  res.setHeader('Content-Disposition', `${disposition}; filename="rassadka.png"; filename*=UTF-8''${encodeURIComponent(link.fileName)}`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.send(link.image);
});

// POST /api/tournaments/:id/seating-image { image: <PNG base64>, target: 'group' | 'me' }
router.post('/:id/seating-image', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const target: SeatingShareTarget = req.body?.target === 'group' ? 'group' : req.body?.target === 'me' ? 'me' : (() => { throw new SeatingShareError('Укажите, куда отправить'); })();
    const actorPlayerId = req.delegatedPlayerId || req.organizerPlayerId || null;
    const result = await sendSeatingImage(req.db, {
      tournamentId: String(req.params.id),
      target,
      image: decodeSeatingImage(req.body?.image),
      actorPlayerId,
    });
    return res.json({ success: true, ...result });
  } catch (error: any) {
    const status = error instanceof SeatingShareError ? error.status : 500;
    return res.status(status).json({ error: error?.message || 'Не удалось отправить рассадку' });
  }
});

export { publicRouter as tournamentSeatingPublicRoutes };
export default router;
