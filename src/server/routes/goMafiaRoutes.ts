import { Router } from 'express';
import { getPlayerSessionId, requireOrganizerAuth, type AuthenticatedRequest } from '../auth.ts';
import { ensureGoMafiaSchema } from '../../db/ensureGoMafiaSchema.ts';
import { parseGoMafiaPlayerReference } from '../../lib/gomafiaExternalProfile.ts';
import { fetchPublicGoMafiaStats } from '../services/goMafiaPublicStatsService.ts';
import { normalizeFederationGame } from '../../lib/gomafiaExternalGames.ts';
import { loadPublicGoMafiaTournament } from '../services/goMafiaTournamentService.ts';
import { normalizeStoredTournamentAppearance } from '../../lib/goMafiaTournaments.ts';

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

// Organizer previews public standings; no database changes and no nickname autolinking.
router.post('/gomafia/organizer/tournaments/preview', requireOrganizerAuth, async (req, res) => {
  try {
    const tournament = await loadPublicGoMafiaTournament(req.body?.url);
    return res.json(tournament);
  } catch (error: any) {
    return res.status(422).json({ error: String(error?.message || 'Не удалось прочитать турнир') });
  }
});

// Explicitly confirmed association of a published standings row to this one player.
// A tournament placement is not an individual game and does not modify club rankings.
router.post('/gomafia/organizer/:playerId/tournaments', requireOrganizerAuth, async (req, res) => {
  const playerId = String(req.params.playerId);
  try {
    if (!await profileExists(req.db, playerId)) return res.status(404).json({ error: 'Игрок не найден' });
    const link = await load(req.db, playerId);
    if (!link || link.status !== 'verified') return res.status(409).json({ error: 'Сначала подтверди профиль GoMafia игрока' });
    const { url, place, nickname } = req.body || {};
    if (!Number.isInteger(place) || typeof nickname !== 'string' || !nickname.trim())
      return res.status(400).json({ error: 'Выбери точную строку из опубликованной таблицы турнира' });
    const tournament = await loadPublicGoMafiaTournament(url);
    const matching = tournament.standings.filter(x => x.place === place && x.nickname === nickname);
    if (matching.length !== 1) return res.status(409).json({ error: 'Строка отсутствует в актуальных результатах турнира' });
    const entry = matching[0];
    await req.db.run(`INSERT INTO gomafia_tournament_appearances
      (player_id, tournament_id, tournament_name, date_range, place, total_score, external_nickname, source_url, confirmed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(player_id, tournament_id) DO UPDATE SET
      tournament_name=excluded.tournament_name, date_range=excluded.date_range,
      place=excluded.place, total_score=excluded.total_score,
      external_nickname=excluded.external_nickname, source_url=excluded.source_url,
      confirmed_at=excluded.confirmed_at`,
      [playerId, tournament.tournamentId, tournament.tournamentName, tournament.dateRange,
        entry.place, entry.totalScore, entry.nickname, tournament.sourceUrl, new Date().toISOString()]);
    return res.json({ ok: true, tournamentId: tournament.tournamentId });
  } catch (error: any) {
    return res.status(422).json({ error: String(error?.message || 'Не удалось привязать турнир') });
  }
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
      [link.external_player_id, 'default-period'],
    );
    let snapshot = cached ? JSON.parse(cached.snapshot_json) : null;
    let lastError: string | null = null;
    const age = cached ? Date.now() - Date.parse(cached.retrieved_at) : Number.POSITIVE_INFINITY;
    // Cache for 24 hours. Back off failed/simultaneous page requests for six hours.
    const previousAttempt = await req.db.get<{ last_attempt_at: string }>(
      'SELECT last_attempt_at FROM gomafia_refresh_attempts WHERE external_player_id=?',
      [link.external_player_id],
    );
    const retryAllowed = !previousAttempt ||
      Date.now() - Date.parse(previousAttempt.last_attempt_at) >= 6 * 60 * 60 * 1000;
    if (link.status === 'verified' && retryAllowed && (!snapshot || age > 24 * 60 * 60 * 1000)) {
      await req.db.run(
        'INSERT INTO gomafia_refresh_attempts (external_player_id, last_attempt_at, last_error) ' +
        'VALUES (?, ?, NULL) ON CONFLICT(external_player_id) DO UPDATE SET ' +
        'last_attempt_at=excluded.last_attempt_at, last_error=NULL',
        [link.external_player_id, new Date().toISOString()],
      );
      try {
        const ref = parseGoMafiaPlayerReference(link.profile_url);
        if (!ref) throw new Error('Некорректная ссылка GoMafia');
        snapshot = await fetchPublicGoMafiaStats(ref);
        await req.db.run(`INSERT INTO gomafia_player_snapshots
          (external_player_id, scope, snapshot_json, retrieved_at, source_url) VALUES (?, 'default-period', ?, ?, ?)
          ON CONFLICT(external_player_id, scope) DO UPDATE SET
          snapshot_json=excluded.snapshot_json, retrieved_at=excluded.retrieved_at, source_url=excluded.source_url`,
          [link.external_player_id, JSON.stringify(snapshot), snapshot.retrievedAt, link.profile_url]);
      } catch {
        lastError = 'Сейчас не удалось обновить GoMafia. Показываем последние доступные данные.';
        await req.db.run(
          'UPDATE gomafia_refresh_attempts SET last_error=? WHERE external_player_id=?',
          ['Не удалось обновить публичную статистику', link.external_player_id],
        );
      }
    } else if (!snapshot && link.status === 'verified' && !retryAllowed) {
      lastError = 'GoMafia временно недоступна. Повторим попытку автоматически позже.';
    }
    // Only attributed federation records from a verified import/authorized export.
    // Existing club games are NEVER queried, merged or rewritten here.
    const sourceRows = link.status === 'verified'
      ? await req.db.all(`SELECT external_game_id, external_player_id, game_payload_json, source_url
          FROM gomafia_external_games WHERE external_player_id=?
          ORDER BY played_at DESC, external_game_id DESC LIMIT 100`, [link.external_player_id])
      : [];
    const games = sourceRows.map(normalizeFederationGame).filter(Boolean);
    const appearanceRows = link.status === 'verified'
      ? await req.db.all(`SELECT * FROM gomafia_tournament_appearances
          WHERE player_id=? ORDER BY confirmed_at DESC LIMIT 100`, [playerId]) : [];
    const tournaments = appearanceRows.map(normalizeStoredTournamentAppearance).filter(Boolean);
    return res.json({ status: link.status, snapshot, error: lastError,
      source: 'gomafia', profile_url: link.profile_url, external_games: games,
      tournaments,
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
