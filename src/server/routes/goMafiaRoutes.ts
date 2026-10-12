import { Router } from 'express';
import { getPlayerSessionId, requireOrganizerAuth } from '../auth.ts';
import { ensureGoMafiaSchema } from '../../db/ensureGoMafiaSchema.ts';
import { parseGoMafiaPlayerReference } from '../../lib/gomafiaExternalProfile.ts';

const router = Router();

const load = async (db: any, playerId: string) => {
  await ensureGoMafiaSchema(db);
  return db.get(`SELECT external_player_id, profile_url, status, linked_by, linked_at, verified_at, updated_at
    FROM gomafia_player_links WHERE player_id=?`, [playerId]);
};
const profileExists = async (db: any, playerId: string) => {
  return Boolean(await db.get('SELECT id FROM players WHERE id=? AND COALESCE(source, \'\') != \'legacy_guest_migrated\' LIMIT 1', [playerId]));
};

const bind = async (db: any, playerId: string, supplied: unknown, actor: 'player' | 'organizer') => {
  const ref = typeof supplied === 'string' ? parseGoMafiaPlayerReference(supplied) : null;
  if (!ref) return { error: 'Укажи ссылку GoMafia вида https://gomafia.pro/stats/123 или ID игрока.', status: 400 };
  if (!await profileExists(db, playerId)) return { error: 'Игрок не найден', status: 404 };
  await ensureGoMafiaSchema(db);
  const claimed = await db.get<{ player_id: string }>(
    'SELECT player_id FROM gomafia_player_links WHERE external_player_id=?', [ref.externalPlayerId],
  );
  if (claimed && claimed.player_id !== playerId) return {
    error: 'Профиль GoMafia уже привязан к другому игроку. Разреши конфликт в CRM.', status: 409,
  };
  const now = new Date().toISOString();
  await db.run(`INSERT INTO gomafia_player_links
    (player_id, external_player_id, profile_url, status, linked_by, linked_at, verified_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id) DO UPDATE SET
      external_player_id=excluded.external_player_id,
      profile_url=excluded.profile_url,
      status=excluded.status,
      linked_by=excluded.linked_by,
      verified_at=excluded.verified_at,
      updated_at=excluded.updated_at`, [
    playerId, ref.externalPlayerId, ref.profileUrl,
    actor === 'organizer' ? 'verified' : 'pending', actor, now,
    actor === 'organizer' ? now : null, now,
  ]);
  return { value: await load(db, playerId), status: 200 };
};

// Public profile link metadata requires an authenticated player/organizer session,
// and respects the existing profile statistics visibility in the main profile UI.
router.get('/gomafia/players/:playerId', async (req, res) => {
  if (!getPlayerSessionId(req) && req.userRole !== 'ORGANIZER') return res.status(401).json({ error: 'Требуется вход' });
  try {
    if (!await profileExists(req.db, String(req.params.playerId))) return res.status(404).json({ error: 'Игрок не найден' });
    return res.json({ link: await load(req.db, String(req.params.playerId)) });
  } catch { return res.status(500).json({ error: 'Не удалось загрузить привязку GoMafia' }); }
});

router.put('/gomafia/me', async (req, res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return res.status(401).json({ error: 'Требуется вход игрока' });
  try {
    const result = await bind(req.db, playerId, req.body?.profile, 'player');
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.json({ link: result.value });
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE constraint')) return res.status(409).json({ error: 'Этот профиль уже привязан' });
    return res.status(500).json({ error: 'Не удалось сохранить ссылку GoMafia' });
  }
});

router.put('/gomafia/organizer/:playerId', requireOrganizerAuth, async (req, res) => {
  try {
    const result = await bind(req.db, String(req.params.playerId), req.body?.profile, 'organizer');
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.json({ link: result.value });
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE constraint')) return res.status(409).json({ error: 'Этот профиль уже привязан' });
    return res.status(500).json({ error: 'Не удалось сохранить ссылку GoMafia' });
  }
});

export default router;
