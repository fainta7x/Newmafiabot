import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { loadPlayerGameProfile } from './playerProfileService.ts';

export type VerifiedAwardStatus = 'pending' | 'verified' | 'rejected';
export type VerifiedAwardKind = 'trophy' | 'medal' | 'certificate' | 'placement' | 'nomination' | 'team';
export type VerifiedAwardInput = {
  kind: VerifiedAwardKind;
  title: string;
  tournament_id?: string | null;
  tournament_name?: string | null;
  club_organizer?: string | null;
  award_date?: string | null;
  award_year?: number | null;
  place_result?: string | null;
  team_name?: string | null;
  description?: string | null;
  source?: string | null;
  source_type?: 'manual' | 'historical' | 'automatic';
  photo_url?: string | null;
};

const KINDS = new Set<VerifiedAwardKind>(['trophy', 'medal', 'certificate', 'placement', 'nomination', 'team']);

const text = (value: unknown, max = 500) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, max) : null;
};

const validateDate = (value: unknown) => {
  const normalized = text(value, 10);
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(new Date(`${normalized}T00:00:00Z`).getTime())) {
    throw new Error('Некорректная дата награды');
  }
  return normalized;
};

const validatePhoto = (value: unknown) => {
  const normalized = text(value, 1_500_000);
  if (!normalized) return null;
  if (/^https:\/\//i.test(normalized)) return normalized;
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(normalized)) return normalized.replace(/\s/g, '');
  throw new Error('Фото награды должно быть HTTPS-ссылкой или изображением JPEG/PNG/WebP');
};

export function normalizeVerifiedAwardInput(body: any): VerifiedAwardInput {
  const kind = String(body?.kind || '').trim() as VerifiedAwardKind;
  if (!KINDS.has(kind)) throw new Error('Неизвестный тип награды');
  const title = text(body?.title, 160);
  if (!title) throw new Error('Укажи название награды');
  const awardYear = body?.award_year === null || body?.award_year === undefined || body?.award_year === '' ? null : Number(body.award_year);
  if (awardYear !== null && (!Number.isInteger(awardYear) || awardYear < 1900 || awardYear > new Date().getFullYear() + 1)) throw new Error('Некорректный год награды');
  const sourceType = ['manual', 'historical', 'automatic'].includes(String(body?.source_type || 'manual'))
    ? String(body?.source_type || 'manual') as VerifiedAwardInput['source_type']
    : 'manual';
  return {
    kind,
    title,
    tournament_id: text(body?.tournament_id, 120),
    tournament_name: text(body?.tournament_name, 180),
    club_organizer: text(body?.club_organizer, 180),
    award_date: validateDate(body?.award_date),
    award_year: awardYear,
    place_result: text(body?.place_result, 120),
    team_name: text(body?.team_name, 160),
    description: text(body?.description, 1200),
    source: text(body?.source, 500),
    source_type: sourceType,
    photo_url: validatePhoto(body?.photo_url),
  };
}

export async function listVerifiedAwards(db: DatabaseWrapper, playerId: string, includePending = false) {
  return db.all<any>(`
    SELECT * FROM player_verified_awards
     WHERE player_id = ? ${includePending ? '' : "AND verification_status = 'verified'"}
     ORDER BY COALESCE(award_date, printf('%04d-12-31', award_year), created_at) DESC, created_at DESC
  `, [playerId]);
}

export async function createVerifiedAward(
  db: DatabaseWrapper,
  playerId: string,
  input: VerifiedAwardInput,
  actorId: string,
  status: VerifiedAwardStatus = 'verified',
) {
  const player = await db.get<any>('SELECT id FROM players WHERE id = ? LIMIT 1', [playerId]);
  if (!player) throw new Error('Игрок не найден');
  const now = new Date().toISOString();
  const id = `award_${crypto.randomUUID()}`;
  const verified = status === 'verified';
  await db.run(
    `INSERT INTO player_verified_awards (
       id, player_id, kind, title, tournament_id, tournament_name, club_organizer, award_date, award_year,
       place_result, team_name, description, source, source_type, photo_url, verification_status,
       created_by, verified_by, verified_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, playerId, input.kind, input.title, input.tournament_id || null, input.tournament_name || null,
      input.club_organizer || null, input.award_date || null, input.award_year || null, input.place_result || null,
      input.team_name || null, input.description || null, input.source || null, input.source_type || 'manual',
      input.photo_url || null, status, actorId, verified ? actorId : null, verified ? now : null, now, now,
    ],
  );
  return db.get<any>('SELECT * FROM player_verified_awards WHERE id = ?', [id]);
}

export async function updateVerifiedAward(db: DatabaseWrapper, awardId: string, playerId: string, input: VerifiedAwardInput, actorId: string) {
  const existing = await db.get<any>('SELECT * FROM player_verified_awards WHERE id = ? AND player_id = ?', [awardId, playerId]);
  if (!existing) throw new Error('Награда не найдена');
  const now = new Date().toISOString();
  await db.run(
    `UPDATE player_verified_awards SET
       kind=?, title=?, tournament_id=?, tournament_name=?, club_organizer=?, award_date=?, award_year=?,
       place_result=?, team_name=?, description=?, source=?, photo_url=?, updated_at=?
     WHERE id=? AND player_id=?`,
    [input.kind, input.title, input.tournament_id || null, input.tournament_name || null, input.club_organizer || null,
      input.award_date || null, input.award_year || null, input.place_result || null, input.team_name || null,
      input.description || null, input.source || null, input.photo_url || null, now, awardId, playerId],
  );
  void actorId;
  return db.get<any>('SELECT * FROM player_verified_awards WHERE id = ?', [awardId]);
}

export async function submitAwardSuggestion(db: DatabaseWrapper, playerId: string, body: any) {
  const suggestionType = String(body?.suggestion_type || 'new') === 'correction' ? 'correction' : 'new';
  const awardId = text(body?.award_id, 120);
  if (suggestionType === 'correction' && !awardId) throw new Error('Укажи награду для исправления');
  if (awardId) {
    const existing = await db.get<any>("SELECT id FROM player_verified_awards WHERE id = ? AND player_id = ? AND verification_status = 'verified'", [awardId, playerId]);
    if (!existing) throw new Error('Проверенная награда не найдена');
  }
  const kind = body?.kind ? String(body.kind) : null;
  if (kind && !KINDS.has(kind as VerifiedAwardKind)) throw new Error('Неизвестный тип награды');
  const photo = validatePhoto(body?.photo_url);
  const now = new Date().toISOString();
  const id = `award_suggestion_${crypto.randomUUID()}`;
  await db.run(
    `INSERT INTO player_award_suggestions (
       id, player_id, award_id, suggestion_type, kind, tournament_name, award_date, award_year,
       place_result, team_name, description, source, photo_url, comment, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [id, playerId, awardId, suggestionType, kind, text(body?.tournament_name, 180), validateDate(body?.award_date),
      body?.award_year ? Number(body.award_year) : null, text(body?.place_result, 120), text(body?.team_name, 160),
      text(body?.description, 1200), text(body?.source, 500), photo, text(body?.comment, 1000), now, now],
  );
  return db.get<any>('SELECT * FROM player_award_suggestions WHERE id = ?', [id]);
}

export async function listAwardSuggestions(db: DatabaseWrapper, playerId?: string | null) {
  return db.all<any>(`
    SELECT s.*, p.nickname AS player_nickname
      FROM player_award_suggestions s JOIN players p ON p.id = s.player_id
     WHERE s.status = 'pending' ${playerId ? 'AND s.player_id = ?' : ''}
     ORDER BY s.created_at ASC
  `, playerId ? [playerId] : []);
}

export async function reviewAwardSuggestion(
  db: DatabaseWrapper,
  suggestionId: string,
  action: 'approve' | 'reject',
  actorId: string,
  editedBody?: any,
) {
  const suggestion = await db.get<any>('SELECT * FROM player_award_suggestions WHERE id = ? LIMIT 1', [suggestionId]);
  if (!suggestion) throw new Error('Запрос на награду не найден');
  if (suggestion.status !== 'pending') return suggestion;
  const now = new Date().toISOString();
  if (action === 'reject') {
    await db.run("UPDATE player_award_suggestions SET status='rejected', reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=? AND status='pending'", [actorId, now, now, suggestionId]);
    return db.get<any>('SELECT * FROM player_award_suggestions WHERE id = ?', [suggestionId]);
  }

  const merged = { ...suggestion, ...(editedBody || {}), source_type: 'manual' };
  const input = normalizeVerifiedAwardInput({
    kind: merged.kind || 'trophy',
    title: merged.title || editedBody?.title || merged.place_result || merged.tournament_name || 'Награда',
    tournament_name: merged.tournament_name,
    award_date: merged.award_date,
    award_year: merged.award_year,
    place_result: merged.place_result,
    team_name: merged.team_name,
    description: merged.description,
    source: merged.source,
    photo_url: merged.photo_url,
    source_type: 'manual',
  });
  let award: any;
  if (suggestion.suggestion_type === 'correction' && suggestion.award_id) {
    award = await updateVerifiedAward(db, String(suggestion.award_id), String(suggestion.player_id), input, actorId);
  } else {
    award = await createVerifiedAward(db, String(suggestion.player_id), input, actorId, 'verified');
  }
  await db.run("UPDATE player_award_suggestions SET status='approved', reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=? AND status='pending'", [actorId, now, now, suggestionId]);
  return { suggestion: await db.get<any>('SELECT * FROM player_award_suggestions WHERE id = ?', [suggestionId]), award };
}

export async function syncTrustedTournamentAwards(db: DatabaseWrapper, playerId: string) {
  const gameProfile = await loadPlayerGameProfile(db, playerId);
  let created = 0;
  const now = new Date().toISOString();
  for (const award of gameProfile.tournamentAwards || []) {
    if (!award.tournament_id || award.source === 'historical') continue;
    const tournament = await db.get<any>('SELECT id, title, date, status FROM tournaments WHERE id = ? LIMIT 1', [award.tournament_id]);
    if (!tournament || String(tournament.status) !== 'completed') continue;
    const sourceKey = `trusted-tournament:${award.id}`;
    const id = `award_${crypto.randomUUID()}`;
    const kind: VerifiedAwardKind = award.kind === 'placement' ? 'placement' : 'nomination';
    const placeResult = award.place ? `${award.place} место` : award.category || null;
    const result = await db.run(
      `INSERT OR IGNORE INTO player_verified_awards (
         id, player_id, kind, title, tournament_id, tournament_name, award_date, award_year,
         place_result, description, source, source_type, source_key, verification_status,
         created_by, verified_by, verified_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'automatic', ?, 'verified', 'system:tournament', 'system:tournament', ?, ?, ?)`,
      [id, playerId, kind, award.title, award.tournament_id, award.tournament_title || tournament.title,
        award.tournament_date || tournament.date || null,
        Number(String(award.tournament_date || tournament.date || '').slice(0, 4)) || null,
        placeResult, award.comment || null, `Trusted completed tournament ${award.tournament_id}`, sourceKey, now, now, now],
    );
    if (result.changes) created += 1;
  }
  return created;
}
