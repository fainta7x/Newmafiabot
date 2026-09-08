import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import {
  calculateProfileCompleteness,
  listUpcomingBirthdays,
  reconcileProfileIntegrityTasks,
} from '../services/playerProfileIntegrityService.ts';
import {
  createVerifiedAward,
  listAwardSuggestions,
  listVerifiedAwards,
  normalizeVerifiedAwardInput,
  reviewAwardSuggestion,
  syncTrustedTournamentAwards,
  updateVerifiedAward,
} from '../services/playerVerifiedAwardsService.ts';
import { getRepositoryPlayerAvatarAsset } from '../../lib/playerAvatarManifest.ts';

const router = Router();
const actor = () => 'organizer';

router.get('/profile-integrity/birthdays', requireOrganizerAuth, async (req, res) => {
  try {
    const windowDays = Number(req.query.window || 30);
    return res.json({ birthdays: await listUpcomingBirthdays(req.db, windowDays) });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить дни рождения' });
  }
});

router.post('/profile-integrity/reconcile', requireOrganizerAuth, async (req, res) => {
  try {
    return res.json(await reconcileProfileIntegrityTasks(req.db));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось обновить профильные задачи' });
  }
});

router.get('/award-suggestions', requireOrganizerAuth, async (req, res) => {
  try {
    const playerId = typeof req.query.player_id === 'string' && req.query.player_id.trim() ? req.query.player_id.trim() : null;
    return res.json({ suggestions: await listAwardSuggestions(req.db, playerId) });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить предложения наград' });
  }
});

router.post('/award-suggestions/:suggestionId/review', requireOrganizerAuth, async (req, res) => {
  try {
    const action = String(req.body?.action || '');
    if (action !== 'approve' && action !== 'reject') return res.status(400).json({ error: 'action должен быть approve или reject' });
    const result = await reviewAwardSuggestion(req.db, String(req.params.suggestionId), action, actor(), req.body?.award || null);
    return res.json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось обработать предложение' });
  }
});

router.get('/:id/profile-integrity', requireOrganizerAuth, async (req, res) => {
  try {
    const playerId = String(req.params.id);
    const player = await req.db.get<any>(`
      SELECT p.*,
             EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = p.id) AS has_db_avatar,
             EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = p.id) AS avatar_suppressed
        FROM players p WHERE p.id = ? LIMIT 1
    `, [playerId]);
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });
    player.has_repository_avatar = !Number(player.avatar_suppressed || 0) && Boolean(getRepositoryPlayerAvatarAsset(playerId));
    await syncTrustedTournamentAwards(req.db, playerId);
    return res.json({
      completeness: calculateProfileCompleteness(player),
      awards: await listVerifiedAwards(req.db, playerId, true),
      suggestions: await listAwardSuggestions(req.db, playerId),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить данные профиля' });
  }
});

router.patch('/:id/profile-field-status', requireOrganizerAuth, async (req, res) => {
  try {
    const playerId = String(req.params.id);
    const row = await req.db.get<any>('SELECT profile_field_status_json FROM players WHERE id = ? LIMIT 1', [playerId]);
    if (!row) return res.status(404).json({ error: 'Игрок не найден' });
    let current: Record<string, string> = {};
    try { current = JSON.parse(String(row.profile_field_status_json || '{}')); } catch { current = {}; }
    const field = String(req.body?.field || '');
    const status = String(req.body?.status || '');
    const allowedFields = new Set(['avatar', 'full_name', 'telegram', 'phone', 'birthday', 'preferred_format']);
    const allowedStates = new Set(['not_requested', 'missing', 'declined']);
    if (!allowedFields.has(field) || !allowedStates.has(status)) return res.status(400).json({ error: 'Некорректное поле или статус' });
    current[field] = status;
    const now = new Date().toISOString();
    await req.db.run('UPDATE players SET profile_field_status_json = ?, profile_updated_at = ?, updated_at = ? WHERE id = ?', [JSON.stringify(current), now, now, playerId]);
    return res.json({ success: true, field, status });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось обновить статус поля' });
  }
});

router.post('/:id/profile-checked', requireOrganizerAuth, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const result = await req.db.run('UPDATE players SET profile_checked_at = ?, profile_updated_at = COALESCE(profile_updated_at, ?), updated_at = ? WHERE id = ?', [now, now, now, String(req.params.id)]);
    if (!result.changes) return res.status(404).json({ error: 'Игрок не найден' });
    return res.json({ success: true, profile_checked_at: now });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось отметить проверку профиля' });
  }
});

router.get('/:id/verified-awards', requireOrganizerAuth, async (req, res) => {
  try {
    const playerId = String(req.params.id);
    await syncTrustedTournamentAwards(req.db, playerId);
    return res.json({ awards: await listVerifiedAwards(req.db, playerId, true) });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить награды' });
  }
});

router.post('/:id/verified-awards', requireOrganizerAuth, async (req, res) => {
  try {
    const input = normalizeVerifiedAwardInput({ ...req.body, source_type: req.body?.source_type === 'historical' ? 'historical' : 'manual' });
    const award = await createVerifiedAward(req.db, String(req.params.id), input, actor(), 'verified');
    return res.status(201).json({ award });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось создать награду' });
  }
});

router.patch('/:id/verified-awards/:awardId', requireOrganizerAuth, async (req, res) => {
  try {
    const input = normalizeVerifiedAwardInput(req.body || {});
    const award = await updateVerifiedAward(req.db, String(req.params.awardId), String(req.params.id), input, actor());
    return res.json({ award });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось обновить награду' });
  }
});

router.post('/:id/verified-awards/import-historical', requireOrganizerAuth, async (req, res) => {
  try {
    const playerId = String(req.params.id);
    const rows = await req.db.all<any>('SELECT * FROM player_historical_awards WHERE player_id = ? ORDER BY created_at ASC', [playerId]);
    let imported = 0;
    for (const row of rows) {
      const sourceKey = `legacy-historical:${row.id}`;
      const exists = await req.db.get<any>('SELECT id FROM player_verified_awards WHERE source_key = ? LIMIT 1', [sourceKey]);
      if (exists) continue;
      const award = await createVerifiedAward(req.db, playerId, normalizeVerifiedAwardInput({
        kind: String(row.award_key || '').startsWith('place_') ? 'placement' : 'nomination',
        title: row.title,
        tournament_name: row.tournament_title,
        award_date: row.tournament_date,
        award_year: row.tournament_date ? Number(String(row.tournament_date).slice(0, 4)) : null,
        place_result: String(row.award_key || '').startsWith('place_') ? `${String(row.award_key).replace('place_', '')} место` : row.title,
        description: row.comment,
        source: 'Импорт из ранее подтверждённых исторических наград',
        source_type: 'historical',
      }), actor(), 'verified');
      await req.db.run('UPDATE player_verified_awards SET source_key = ? WHERE id = ?', [sourceKey, award.id]);
      imported += 1;
    }
    return res.json({ imported, total: rows.length });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось импортировать исторические награды' });
  }
});

export default router;
