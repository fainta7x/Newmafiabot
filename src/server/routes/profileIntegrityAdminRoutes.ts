import { Router } from 'express';
import { requireOrganizerAuth } from '../auth.ts';
import {
  calculateProfileCompleteness,
  listUpcomingBirthdays,
  reconcileProfileIntegrityTasks,
  validateBirthday,
  validatePhone,
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

const enrichProfile = (player: any) => {
  player.has_repository_avatar = !Number(player.avatar_suppressed || 0) && Boolean(getRepositoryPlayerAvatarAsset(String(player.id)));
  return { ...player, profile_completeness: calculateProfileCompleteness(player) };
};

router.get('/profile-integrity/summary', requireOrganizerAuth, async (req, res) => {
  try {
    await reconcileProfileIntegrityTasks(req.db);
    const rows = await req.db.all<any>(`
      SELECT p.*,
             (SELECT updated_at FROM player_avatars pa WHERE pa.player_id = p.id LIMIT 1) AS avatar_updated_at,
             EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = p.id) AS has_db_avatar,
             EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = p.id) AS avatar_suppressed
        FROM players p
       ORDER BY p.nickname COLLATE NOCASE ASC
    `);
    return res.json({
      players: rows.map((row: any) => {
        const enriched = enrichProfile(row);
        return {
          id: String(row.id),
          profile_completeness: enriched.profile_completeness,
          birth_day: row.birth_day ?? null,
          birth_month: row.birth_month ?? null,
          birth_year: row.birth_year ?? null,
          birthday_visibility: row.birthday_visibility || 'private',
          profile_checked_at: row.profile_checked_at || null,
          profile_updated_at: row.profile_updated_at || row.updated_at || null,
        };
      }),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить сводку профилей' });
  }
});

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
             (SELECT updated_at FROM player_avatars pa WHERE pa.player_id = p.id LIMIT 1) AS avatar_updated_at,
             EXISTS(SELECT 1 FROM player_avatars pa WHERE pa.player_id = p.id) AS has_db_avatar,
             EXISTS(SELECT 1 FROM player_avatar_repository_suppression s WHERE s.player_id = p.id) AS avatar_suppressed
        FROM players p WHERE p.id = ? LIMIT 1
    `, [playerId]);
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });
    const enriched = enrichProfile(player);
    await syncTrustedTournamentAwards(req.db, playerId);
    return res.json({
      player: {
        birth_day: player.birth_day ?? null,
        birth_month: player.birth_month ?? null,
        birth_year: player.birth_year ?? null,
        birthday_visibility: player.birthday_visibility || 'private',
        profile_checked_at: player.profile_checked_at || null,
        profile_updated_at: player.profile_updated_at || player.updated_at || null,
      },
      completeness: enriched.profile_completeness,
      awards: await listVerifiedAwards(req.db, playerId, true),
      suggestions: await listAwardSuggestions(req.db, playerId),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось загрузить данные профиля' });
  }
});

router.patch('/:id/profile-private', requireOrganizerAuth, async (req, res) => {
  try {
    const playerId = String(req.params.id);
    const existing = await req.db.get<any>('SELECT * FROM players WHERE id = ? LIMIT 1', [playerId]);
    if (!existing) return res.status(404).json({ error: 'Игрок не найден' });
    const has = (key: string) => Object.prototype.hasOwnProperty.call(req.body || {}, key);
    const fields: string[] = [];
    const values: any[] = [];
    if (has('phone')) { fields.push('phone = ?'); values.push(validatePhone(req.body?.phone)); }
    if (has('birth_day') || has('birth_month') || has('birth_year')) {
      const birthday = validateBirthday(
        has('birth_day') ? req.body?.birth_day : existing.birth_day,
        has('birth_month') ? req.body?.birth_month : existing.birth_month,
        has('birth_year') ? req.body?.birth_year : existing.birth_year,
      );
      fields.push('birth_day = ?', 'birth_month = ?', 'birth_year = ?');
      values.push(birthday.day, birthday.month, birthday.year);
    }
    if (has('birthday_visibility')) {
      const visibility = String(req.body?.birthday_visibility || 'private');
      if (!['private', 'day_month', 'full'].includes(visibility)) return res.status(400).json({ error: 'Некорректная видимость дня рождения' });
      fields.push('birthday_visibility = ?'); values.push(visibility);
    }
    if (!fields.length) return res.json({ success: true });
    const now = new Date().toISOString();
    fields.push('profile_updated_at = ?', 'updated_at = ?'); values.push(now, now, playerId);
    await req.db.run(`UPDATE players SET ${fields.join(', ')} WHERE id = ?`, values);
    return res.json({ success: true, player: await req.db.get('SELECT * FROM players WHERE id = ?', [playerId]) });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Не удалось обновить приватные поля' });
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
