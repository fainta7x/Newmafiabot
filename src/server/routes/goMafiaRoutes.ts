import { Router } from 'express';
import { getPlayerSessionId, requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { ensureGoMafiaSchema } from '../../db/ensureGoMafiaSchema.ts';
import { parseGoMafiaPlayerReference } from '../../lib/gomafiaExternalProfile.ts';
import { fetchPublicGoMafiaStats } from '../services/goMafiaPublicStatsService.ts';
import { normalizeFederationGame } from '../../lib/gomafiaExternalGames.ts';

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
  const existing = await load(db, playerId);
  if (actor === 'player' && existing?.status === 'verified' && existing.external_player_id !== ref.externalPlayerId) {
    return { error: 'Подтверждённую привязку может изменить только организатор.', status: 403 };
  }
  const claimed = await db.get(
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
    actor === 'organizer' || existing?.status === 'verified' ? 'verified' : 'pending', actor, now,
    actor === 'organizer' || existing?.status === 'verified' ? (existing?.verified_at || now) : null, now,
  ]);
  return { value: await load(db, playerId), status: 200 };
};

// Public profile link metadata requires an authenticated player/organizer session,
// and respects the existing profile statistics visibility in the main profile UI.
router.get('/gomafia/players/:playerId', async (req, res) => {
  if (!getPlayerSessionId(req) && (req as AuthenticatedRequest).userRole !== 'ORGANIZER') return res.status(401).json({ error: 'Требуется вход' });
  try {
    if (!await profileExists(req.db, String(req.params.playerId))) return res.status(404).json({ error: 'Игрок не найден' });
    return res.json({ link: await load(req.db, String(req.params.playerId)) });
  } catch { return res.status(500).json({ error: 'Не удалось загрузить привязку GoMafia' }); }
});

// Read-only, cached external career: never alters club games, Elo or awards.
router.get('/gomafia/players/:playerId/career', async (req, res) => {
  const viewerId = getPlayerSessionId(req);
  if (!viewerId && (req as AuthenticatedRequest).userRole !== 'ORGANIZER') return res.status(401).json({ error: 'Требуется вход' });
  try {
    const playerId = String(req.params.playerId);
    if (!await profileExists(req.db, playerId)) return res.status(404).json({ error: 'Игрок не найден' });
    const link = await load(req.db, playerId);
    if (!link) return res.json({ status: 'unlinked', snapshot: null });
    if (link.status !== 'verified' && viewerId !== playerId && (req as AuthenticatedRequest).userRole !== 'ORGANIZER')
      return res.json({ status: 'pending', snapshot: null });
    const cached = await req.db.get<{ snapshot_json: string; retrieved_at: string }>(
      'SELECT snapshot_json, retrieved_at FROM gomafia_player_snapshots WHERE external_player_id=? AND scope=?',
      [link.external_player_id, 'all'],
    );
    let snapshot = cached ? JSON.parse(cached.snapshot_json) : null;
    let lastError: string | null = null;
    const age = cached ? Date.now() - Date.parse(cached.retrieved_at) : Number.POSITIVE_INFINITY;
    // Cache for 24 hours, with no mass/bulk crawl; externally sourced info can lag.
    if (link.status === 'verified' && (!snapshot || age > 24 * 60 * 60 * 1000)) {
      try {
        const ref = parseGoMafiaPlayerReference(link.profile_url);
        if (!ref) throw new Error('Некорректная ссылка GoMafia');
        snapshot = await fetchPublicGoMafiaStats(ref);
        await req.db.run(`INSERT INTO gomafia_player_snapshots
          (external_player_id, scope, snapshot_json, retrieved_at, source_url) VALUES (?, 'all', ?, ?, ?)
          ON CONFLICT(external_player_id, scope) DO UPDATE SET
          snapshot_json=excluded.snapshot_json, retrieved_at=excluded.retrieved_at, source_url=excluded.source_url`,
          [link.external_player_id, JSON.stringify(snapshot), snapshot.retrievedAt, link.profile_url]);
      } catch {
        lastError = 'Сейчас не удалось обновить GoMafia. Показываем последние доступные данные.';
      }
    }
    // Only attributed federation records from a verified import/authorized export.
    // Existing club games are NEVER queried, merged or rewritten here.
    const sourceRows = link.status === 'verified'
      ? await req.db.all(`SELECT external_game_id, external_player_id, game_payload_json, source_url
          FROM gomafia_external_games WHERE external_player_id=?
          ORDER BY played_at DESC, external_game_id DESC LIMIT 100`, [link.external_player_id])
      : [];
    const games = sourceRows.map(normalizeFederationGame).filter(Boolean);
    return res.json({ status: link.status, snapshot, error: lastError,
      source: 'gomafia', profile_url: link.profile_url, external_games: games,
      history_status: games.length ? 'available' : 'not_imported' });
  } catch {
    return res.status(500).json({ error: 'Не удалось загрузить спортивную карьеру' });
  }
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
