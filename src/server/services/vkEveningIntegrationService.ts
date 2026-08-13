import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';
import {
  getEveningResponse,
  isAttendingResponse,
  type EveningResponseStatus,
} from '../../lib/eveningResponse.ts';
import { setParticipantResponse } from './eveningParticipantState.ts';
import {
  createVkPoll,
  createVkWallPost,
  editVkWallPost,
  getVkDestinations,
  getVkIntegrationStatus,
  getVkPollVoters,
  type VkDestination,
  type VkPoll,
  type VkVoter,
} from './vkPublishingService.ts';

type VkResponseStatus = Exclude<EveningResponseStatus, 'unanswered'>;

type EveningRow = {
  id: string;
  title: string;
  starts_at: string;
  timezone: string | null;
  venue: string | null;
  format: string;
  status: string;
  default_price: number;
  settled_at: string | null;
};

type PublicationRow = {
  evening_id: string;
  destination_key: string;
  group_id: string;
  poll_owner_id: number | null;
  poll_id: number | null;
  post_owner_id: number | null;
  post_id: number | null;
  answer_map_json: string;
  status: string;
  external_url: string | null;
  published_at: string | null;
  updated_at: string;
  last_error: string | null;
};

type VoteRow = {
  evening_id: string;
  destination_key: string;
  vk_user_id: string;
  answer_id: number | null;
  response_status: VkResponseStatus | null;
  applied_response_status: VkResponseStatus | null;
  player_id: string | null;
  display_name: string | null;
  screen_name: string | null;
  sync_status: string;
  observed_at: string;
  updated_at: string;
};

export const VK_POLL_OPTIONS: ReadonlyArray<{ status: VkResponseStatus; text: string }> = [
  { status: 'going', text: 'Иду' },
  { status: 'late', text: 'Приду позже' },
  { status: 'thinking', text: 'Пока думаю' },
  { status: 'declined', text: 'Не иду' },
] as const;

const VALID_VK_RESPONSES = new Set<VkResponseStatus>(VK_POLL_OPTIONS.map((item) => item.status));

const nowIso = () => new Date().toISOString();

const parseAnswerMap = (raw: string | null | undefined): Record<string, VkResponseStatus> => {
  try {
    const parsed = JSON.parse(String(raw || '{}')) as Record<string, unknown>;
    const result: Record<string, VkResponseStatus> = {};
    for (const [answerId, status] of Object.entries(parsed || {})) {
      if (VALID_VK_RESPONSES.has(status as VkResponseStatus)) result[String(answerId)] = status as VkResponseStatus;
    }
    return result;
  } catch {
    return {};
  }
};

export const mapVkPollAnswer = (answerMap: Record<string, VkResponseStatus>, answerId: number | string | null | undefined): VkResponseStatus | null => {
  if (answerId === null || answerId === undefined) return null;
  return answerMap[String(answerId)] || null;
};

export const buildVkPollAnswerMap = (poll: VkPoll): Record<string, VkResponseStatus> => {
  const byText = new Map(VK_POLL_OPTIONS.map((item) => [item.text.trim().toLocaleLowerCase('ru-RU'), item.status]));
  const result: Record<string, VkResponseStatus> = {};
  for (const answer of Array.isArray(poll.answers) ? poll.answers : []) {
    const status = byText.get(String(answer.text || '').trim().toLocaleLowerCase('ru-RU'));
    if (status) result[String(answer.id)] = status;
  }
  if (Object.keys(result).length !== VK_POLL_OPTIONS.length) {
    throw new Error('VK создал опрос с неожиданным набором вариантов ответа');
  }
  return result;
};

export const canVkVoteOverride = (currentStatus: EveningResponseStatus, previouslyAppliedStatuses: Array<VkResponseStatus | null | undefined>): boolean => {
  if (currentStatus === 'unanswered') return true;
  return previouslyAppliedStatuses.some((status) => Boolean(status) && status === currentStatus);
};

export const resolveVkResponseStatuses = (statuses: Array<VkResponseStatus | null | undefined>): { status: VkResponseStatus | null; conflict: boolean } => {
  const unique = Array.from(new Set(statuses.filter((item): item is VkResponseStatus => Boolean(item))));
  return { status: unique.length === 1 ? unique[0] : null, conflict: unique.length > 1 };
};

export type VkPollVoteCallback = {
  ownerId: number;
  pollId: number;
  answerId: number;
  userId: string;
};

export const parseVkPollVoteCallback = (payload: any): VkPollVoteCallback | null => {
  const value = payload?.object?.object || payload?.object || payload;
  const ownerId = Number(value?.owner_id);
  const pollId = Number(value?.poll_id);
  const answerId = Number(value?.option_id);
  const userId = String(value?.user_id || '').trim();
  if (!Number.isFinite(ownerId) || !Number.isFinite(pollId) || !Number.isFinite(answerId) || !/^\d+$/.test(userId)) return null;
  return { ownerId, pollId, answerId, userId };
};

const loadEvening = async (db: DatabaseWrapper, eveningId: string): Promise<EveningRow> => {
  const evening = await db.get<EveningRow>(`
    SELECT id, title, starts_at, timezone, venue, format, status, default_price, settled_at
      FROM game_evenings
     WHERE id = ?
     LIMIT 1
  `, [eveningId]);
  if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
  return evening;
};

const formatDate = (evening: EveningRow) => {
  const date = new Date(evening.starts_at);
  if (Number.isNaN(date.getTime())) return evening.starts_at;
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: evening.timezone || 'Europe/Moscow',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toLocaleString('ru-RU');
  }
};

export const buildVkEveningAnnouncement = (evening: EveningRow) => {
  const lines = [
    `🕵️ ${evening.title}`,
    '',
    `📅 ${formatDate(evening)}`,
  ];
  if (evening.venue) lines.push(`📍 ${evening.venue}`);
  if (Number(evening.default_price || 0) > 0) lines.push(`💳 ${Number(evening.default_price).toLocaleString('ru-RU')} ₽`);
  lines.push('', 'Отметься в опросе — ответ попадёт в общую запись 2LA Noire.');
  return lines.join('\n');
};

const pollQuestion = (evening: EveningRow) => `Идёшь на «${evening.title}»?`;

const getPublication = (db: DatabaseWrapper, eveningId: string, destinationKey: string) => db.get<PublicationRow>(`
  SELECT * FROM vk_evening_publications WHERE evening_id = ? AND destination_key = ? LIMIT 1
`, [eveningId, destinationKey]);

const savePublicationError = async (db: DatabaseWrapper, eveningId: string, destination: VkDestination, error: unknown) => {
  if (!destination.groupId) return;
  const now = nowIso();
  await db.run(`
    INSERT INTO vk_evening_publications (evening_id, destination_key, group_id, status, updated_at, last_error)
    VALUES (?, ?, ?, 'error', ?, ?)
    ON CONFLICT(evening_id, destination_key) DO UPDATE SET
      group_id=excluded.group_id, status='error', updated_at=excluded.updated_at, last_error=excluded.last_error
  `, [eveningId, destination.key, destination.groupId, now, error instanceof Error ? error.message : String(error)]);
};

const syncDestination = async (db: DatabaseWrapper, evening: EveningRow, destination: VkDestination) => {
  if (!destination.groupId || !destination.supported) return null;
  const existing = await getPublication(db, evening.id, destination.key);
  let pollOwnerId = Number(existing?.poll_owner_id || 0);
  let pollId = Number(existing?.poll_id || 0);
  let answerMap = parseAnswerMap(existing?.answer_map_json);

  if (!pollOwnerId || !pollId || Object.keys(answerMap).length !== VK_POLL_OPTIONS.length) {
    const poll = await createVkPoll(destination.groupId, pollQuestion(evening), VK_POLL_OPTIONS.map((item) => item.text));
    pollOwnerId = Number(poll.owner_id);
    pollId = Number(poll.id);
    answerMap = buildVkPollAnswerMap(poll);
  }

  const attachment = `poll${pollOwnerId}_${pollId}`;
  const message = buildVkEveningAnnouncement(evening);
  let postOwnerId = Number(existing?.post_owner_id || 0);
  let postId = Number(existing?.post_id || 0);
  let externalUrl = existing?.external_url || null;

  if (postOwnerId && postId) {
    await editVkWallPost({ groupId: destination.groupId, postId, message, attachments: [attachment] });
    postOwnerId = -Math.abs(Number(destination.groupId));
    externalUrl = `https://vk.com/wall${postOwnerId}_${postId}`;
  } else {
    const published = await createVkWallPost({ groupId: destination.groupId, message, attachments: [attachment] });
    postOwnerId = published.ownerId;
    postId = published.postId;
    externalUrl = published.externalUrl;
  }

  const now = nowIso();
  await db.run(`
    INSERT INTO vk_evening_publications (
      evening_id, destination_key, group_id, poll_owner_id, poll_id, post_owner_id, post_id,
      answer_map_json, status, external_url, published_at, updated_at, last_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, NULL)
    ON CONFLICT(evening_id, destination_key) DO UPDATE SET
      group_id=excluded.group_id,
      poll_owner_id=excluded.poll_owner_id,
      poll_id=excluded.poll_id,
      post_owner_id=excluded.post_owner_id,
      post_id=excluded.post_id,
      answer_map_json=excluded.answer_map_json,
      status='published',
      external_url=excluded.external_url,
      published_at=COALESCE(vk_evening_publications.published_at, excluded.published_at),
      updated_at=excluded.updated_at,
      last_error=NULL
  `, [
    evening.id,
    destination.key,
    destination.groupId,
    pollOwnerId,
    pollId,
    postOwnerId,
    postId,
    JSON.stringify(answerMap),
    externalUrl,
    existing?.published_at || now,
    now,
  ]);

  return getPublication(db, evening.id, destination.key);
};

export async function syncVkEveningPublications(db: DatabaseWrapper, eveningId: string) {
  const evening = await loadEvening(db, eveningId);
  if (!['published', 'active'].includes(String(evening.status))) {
    throw Object.assign(new Error('VK-анонс можно публиковать после публикации вечера'), { statusCode: 409 });
  }
  const integration = getVkIntegrationStatus();
  if (!integration.token_configured) throw Object.assign(new Error('VK_ACCESS_TOKEN не настроен'), { statusCode: 409 });

  const results: Array<{ destination: string; success: boolean; error?: string }> = [];
  for (const destination of getVkDestinations()) {
    if (!destination.active || !destination.supported || !destination.groupId) continue;
    try {
      await syncDestination(db, evening, destination);
      results.push({ destination: destination.key, success: true });
    } catch (error) {
      await savePublicationError(db, evening.id, destination, error);
      results.push({ destination: destination.key, success: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (!results.length) throw Object.assign(new Error('Не настроено ни одного поддерживаемого VK-направления'), { statusCode: 409 });
  if (results.every((item) => !item.success)) {
    throw Object.assign(new Error(results.map((item) => item.error).filter(Boolean).join('; ') || 'VK-публикация не удалась'), { statusCode: 502 });
  }
  return { evening_id: eveningId, results };
}

const normalizeVoter = (item: number | VkVoter) => {
  if (typeof item === 'number') return { id: String(item), displayName: null as string | null, screenName: null as string | null };
  const id = String(item?.id || '').trim();
  const displayName = [item?.first_name, item?.last_name].filter(Boolean).join(' ').trim() || null;
  return { id, displayName, screenName: String(item?.screen_name || '').trim() || null };
};

const upsertObservedVote = async (db: DatabaseWrapper, input: {
  eveningId: string;
  destinationKey: string;
  vkUserId: string;
  answerId: number;
  responseStatus: VkResponseStatus;
  displayName?: string | null;
  screenName?: string | null;
}) => {
  const now = nowIso();
  await db.run(`
    INSERT INTO vk_poll_votes (
      evening_id, destination_key, vk_user_id, answer_id, response_status,
      display_name, screen_name, sync_status, observed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'unmatched', ?, ?)
    ON CONFLICT(evening_id, destination_key, vk_user_id) DO UPDATE SET
      answer_id=excluded.answer_id,
      response_status=excluded.response_status,
      display_name=COALESCE(excluded.display_name, vk_poll_votes.display_name),
      screen_name=COALESCE(excluded.screen_name, vk_poll_votes.screen_name),
      sync_status=CASE WHEN vk_poll_votes.player_id IS NULL THEN 'unmatched' ELSE 'pending' END,
      observed_at=excluded.observed_at,
      updated_at=excluded.updated_at
  `, [
    input.eveningId,
    input.destinationKey,
    input.vkUserId,
    input.answerId,
    input.responseStatus,
    input.displayName || null,
    input.screenName || null,
    now,
    now,
  ]);
};

const resolveIdentity = (db: DatabaseWrapper, vkUserId: string) => db.get<{ player_id: string }>(`
  SELECT player_id FROM player_external_identities WHERE platform='vk' AND external_user_id=? LIMIT 1
`, [vkUserId]);

const ensureParticipantForVk = async (db: DatabaseWrapper, evening: EveningRow, playerId: string, responseStatus: VkResponseStatus) => {
  const player = await db.get<any>('SELECT id, game_level FROM players WHERE id = ? LIMIT 1', [playerId]);
  if (!player) return { participant: null, blocked: 'Игрок не найден' };
  if (!playerLevelAllowsEveningFormat(player.game_level, evening.format)) {
    return { participant: null, blocked: 'Формат вечера недоступен этому игроку' };
  }
  if (['completed', 'settled', 'cancelled'].includes(String(evening.status)) || evening.settled_at) {
    return { participant: null, blocked: 'Вечер уже закрыт' };
  }

  let participant = await db.get<any>(`
    SELECT * FROM evening_participants WHERE evening_id = ? AND player_id = ? LIMIT 1
  `, [evening.id, playerId]);
  if (!participant) {
    const id = crypto.randomUUID();
    const now = nowIso();
    await db.run(`
      INSERT INTO evening_participants (
        id, evening_id, player_id, registration_status, response_status,
        attendance_status, arrival_status, payment_status, amount_due, amount_paid,
        registered_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', 'unknown', 'unpaid', ?, 0, ?, ?, ?)
    `, [
      id,
      evening.id,
      playerId,
      responseStatus,
      responseStatus,
      isAttendingResponse(responseStatus) ? Math.max(0, Number(evening.default_price || 0)) : 0,
      now,
      now,
      now,
    ]);
    participant = await db.get<any>('SELECT * FROM evening_participants WHERE id = ?', [id]);
  }
  return { participant, blocked: null };
};

export async function resolveVkUserEveningResponse(db: DatabaseWrapper, eveningId: string, vkUserId: string) {
  const votes = await db.all<VoteRow>(`
    SELECT * FROM vk_poll_votes
     WHERE evening_id = ? AND vk_user_id = ? AND sync_status <> 'removed' AND response_status IS NOT NULL
     ORDER BY updated_at DESC
  `, [eveningId, vkUserId]);
  if (!votes.length) return { status: 'no_vote' };

  const resolution = resolveVkResponseStatuses(votes.map((row) => row.response_status));
  if (resolution.conflict) {
    await db.run(`UPDATE vk_poll_votes SET sync_status='conflict', updated_at=? WHERE evening_id=? AND vk_user_id=? AND sync_status <> 'removed'`, [nowIso(), eveningId, vkUserId]);
    return { status: 'conflict' };
  }
  if (!resolution.status) return { status: 'no_vote' };

  const identity = await resolveIdentity(db, vkUserId);
  if (!identity?.player_id) {
    await db.run(`UPDATE vk_poll_votes SET player_id=NULL, sync_status='unmatched', updated_at=? WHERE evening_id=? AND vk_user_id=? AND sync_status <> 'removed'`, [nowIso(), eveningId, vkUserId]);
    return { status: 'unmatched' };
  }

  const evening = await loadEvening(db, eveningId);
  const ensured = await ensureParticipantForVk(db, evening, identity.player_id, resolution.status);
  if (!ensured.participant) {
    await db.run(`UPDATE vk_poll_votes SET player_id=?, sync_status='ineligible', updated_at=? WHERE evening_id=? AND vk_user_id=? AND sync_status <> 'removed'`, [identity.player_id, nowIso(), eveningId, vkUserId]);
    return { status: 'ineligible', reason: ensured.blocked };
  }

  const currentStatus = getEveningResponse(ensured.participant);
  const previousApplied = votes.map((row) => row.applied_response_status);
  if (currentStatus !== resolution.status && !canVkVoteOverride(currentStatus, previousApplied)) {
    await db.run(`UPDATE vk_poll_votes SET player_id=?, sync_status='superseded', updated_at=? WHERE evening_id=? AND vk_user_id=? AND sync_status <> 'removed'`, [identity.player_id, nowIso(), eveningId, vkUserId]);
    return { status: 'superseded', current_status: currentStatus };
  }

  if (currentStatus !== resolution.status) await setParticipantResponse(db, String(ensured.participant.id), resolution.status);
  await db.run(`
    UPDATE vk_poll_votes
       SET player_id=?, applied_response_status=?, sync_status='applied', updated_at=?
     WHERE evening_id=? AND vk_user_id=? AND sync_status <> 'removed'
  `, [identity.player_id, resolution.status, nowIso(), eveningId, vkUserId]);
  return { status: 'applied', response_status: resolution.status, player_id: identity.player_id };
}

export async function reconcileVkEveningVotes(db: DatabaseWrapper, eveningId: string) {
  await loadEvening(db, eveningId);
  const publications = await db.all<PublicationRow>(`
    SELECT * FROM vk_evening_publications
     WHERE evening_id = ? AND status='published' AND poll_owner_id IS NOT NULL AND poll_id IS NOT NULL
  `, [eveningId]);

  const touchedUsers = new Set<string>();
  const errors: Array<{ destination: string; error: string }> = [];

  for (const publication of publications) {
    const answerMap = parseAnswerMap(publication.answer_map_json);
    const answerIds = Object.keys(answerMap).map(Number).filter(Number.isFinite);
    try {
      const response = await getVkPollVoters(Number(publication.poll_owner_id), Number(publication.poll_id), answerIds);
      const observed = new Set<string>();
      for (const group of response || []) {
        const responseStatus = mapVkPollAnswer(answerMap, Number(group.answer_id));
        if (!responseStatus) continue;
        for (const rawUser of group.users?.items || []) {
          const user = normalizeVoter(rawUser);
          if (!/^\d+$/.test(user.id)) continue;
          observed.add(user.id);
          touchedUsers.add(user.id);
          await upsertObservedVote(db, {
            eveningId,
            destinationKey: publication.destination_key,
            vkUserId: user.id,
            answerId: Number(group.answer_id),
            responseStatus,
            displayName: user.displayName,
            screenName: user.screenName,
          });
        }
      }

      const prior = await db.all<{ vk_user_id: string }>(`
        SELECT vk_user_id FROM vk_poll_votes
         WHERE evening_id = ? AND destination_key = ? AND sync_status <> 'removed'
      `, [eveningId, publication.destination_key]);
      const removed = prior.map((row) => String(row.vk_user_id)).filter((id) => !observed.has(id));
      for (const vkUserId of removed) {
        touchedUsers.add(vkUserId);
        await db.run(`
          UPDATE vk_poll_votes SET sync_status='removed', updated_at=?
           WHERE evening_id=? AND destination_key=? AND vk_user_id=?
        `, [nowIso(), eveningId, publication.destination_key, vkUserId]);
      }
    } catch (error) {
      errors.push({ destination: publication.destination_key, error: error instanceof Error ? error.message : String(error) });
    }
  }

  for (const vkUserId of touchedUsers) await resolveVkUserEveningResponse(db, eveningId, vkUserId);
  return { evening_id: eveningId, checked_publications: publications.length, touched_users: touchedUsers.size, errors };
}

export async function processVkPollVoteCallback(db: DatabaseWrapper, input: VkPollVoteCallback) {
  const publication = await db.get<PublicationRow>(`
    SELECT * FROM vk_evening_publications
     WHERE poll_id = ? AND (poll_owner_id = ? OR poll_owner_id = ?)
     ORDER BY updated_at DESC LIMIT 1
  `, [input.pollId, input.ownerId, -Math.abs(input.ownerId)]);
  if (!publication) return { handled: false, reason: 'unknown_poll' };
  const answerMap = parseAnswerMap(publication.answer_map_json);
  const responseStatus = mapVkPollAnswer(answerMap, input.answerId);
  if (!responseStatus) return { handled: false, reason: 'unknown_answer' };

  await upsertObservedVote(db, {
    eveningId: publication.evening_id,
    destinationKey: publication.destination_key,
    vkUserId: input.userId,
    answerId: input.answerId,
    responseStatus,
  });
  const resolved = await resolveVkUserEveningResponse(db, publication.evening_id, input.userId);
  return { handled: true, evening_id: publication.evening_id, resolved };
}

export async function linkVkIdentity(db: DatabaseWrapper, input: { vkUserId: string; playerId: string }) {
  const vkUserId = String(input.vkUserId || '').trim();
  const playerId = String(input.playerId || '').trim();
  if (!/^\d+$/.test(vkUserId) || !playerId) throw Object.assign(new Error('Некорректные данные привязки'), { statusCode: 400 });

  const [player, existingVk, existingPlayerVk, vote] = await Promise.all([
    db.get<any>('SELECT id, nickname FROM players WHERE id = ? LIMIT 1', [playerId]),
    db.get<any>(`SELECT player_id FROM player_external_identities WHERE platform='vk' AND external_user_id=? LIMIT 1`, [vkUserId]),
    db.get<any>(`SELECT external_user_id FROM player_external_identities WHERE platform='vk' AND player_id=? LIMIT 1`, [playerId]),
    db.get<any>(`SELECT display_name, screen_name FROM vk_poll_votes WHERE vk_user_id=? ORDER BY updated_at DESC LIMIT 1`, [vkUserId]),
  ]);
  if (!player) throw Object.assign(new Error('Игрок не найден'), { statusCode: 404 });
  if (existingVk && String(existingVk.player_id) !== playerId) throw Object.assign(new Error('Этот VK-профиль уже связан с другим игроком'), { statusCode: 409 });
  if (existingPlayerVk && String(existingPlayerVk.external_user_id) !== vkUserId) throw Object.assign(new Error('У этого игрока уже связан другой VK-профиль'), { statusCode: 409 });

  const now = nowIso();
  await db.run(`
    INSERT INTO player_external_identities (platform, external_user_id, player_id, screen_name, display_name, linked_at, updated_at)
    VALUES ('vk', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(platform, external_user_id) DO UPDATE SET
      player_id=excluded.player_id,
      screen_name=COALESCE(excluded.screen_name, player_external_identities.screen_name),
      display_name=COALESCE(excluded.display_name, player_external_identities.display_name),
      updated_at=excluded.updated_at
  `, [vkUserId, playerId, vote?.screen_name || null, vote?.display_name || null, now, now]);
  await db.run(`UPDATE vk_poll_votes SET player_id=?, sync_status='pending', updated_at=? WHERE vk_user_id=? AND sync_status <> 'removed'`, [playerId, now, vkUserId]);

  const evenings = await db.all<{ evening_id: string }>(`SELECT DISTINCT evening_id FROM vk_poll_votes WHERE vk_user_id=? AND sync_status <> 'removed'`, [vkUserId]);
  for (const row of evenings) await resolveVkUserEveningResponse(db, String(row.evening_id), vkUserId);
  return { success: true, vk_user_id: vkUserId, player_id: playerId, nickname: player.nickname };
}

export async function unlinkVkIdentity(db: DatabaseWrapper, vkUserId: string) {
  const id = String(vkUserId || '').trim();
  await db.run(`DELETE FROM player_external_identities WHERE platform='vk' AND external_user_id=?`, [id]);
  await db.run(`UPDATE vk_poll_votes SET player_id=NULL, sync_status=CASE WHEN sync_status='removed' THEN 'removed' ELSE 'unmatched' END, updated_at=? WHERE vk_user_id=?`, [nowIso(), id]);
  return { success: true };
}

export async function getVkEveningIntegrationState(db: DatabaseWrapper, eveningId: string) {
  const evening = await loadEvening(db, eveningId);
  const integration = getVkIntegrationStatus();
  const publications = await db.all<PublicationRow>(`
    SELECT * FROM vk_evening_publications WHERE evening_id=? ORDER BY destination_key
  `, [eveningId]);
  const publicationMap = new Map(publications.map((row) => [row.destination_key, row]));
  const destinations = getVkDestinations().map((destination) => {
    const publication = publicationMap.get(destination.key);
    return {
      key: destination.key,
      name: destination.name,
      active: destination.active,
      supported: destination.supported,
      reason: destination.reason,
      configured_url: destination.configuredUrl,
      published: publication?.status === 'published',
      status: publication?.status || (destination.active ? 'ready' : 'not_configured'),
      external_url: publication?.external_url || destination.configuredUrl,
      post_id: publication?.post_id || null,
      poll_id: publication?.poll_id || null,
      last_error: publication?.last_error || null,
      updated_at: publication?.updated_at || null,
    };
  });

  const votes = await db.all<VoteRow>(`SELECT * FROM vk_poll_votes WHERE evening_id=? ORDER BY updated_at DESC`, [eveningId]);
  const activeVotes = votes.filter((row) => row.sync_status !== 'removed');
  const uniqueUsers = new Map<string, VoteRow>();
  for (const row of activeVotes) if (!uniqueUsers.has(row.vk_user_id)) uniqueUsers.set(row.vk_user_id, row);
  const userRows = Array.from(uniqueUsers.values());

  const attention = userRows.filter((row) => ['unmatched', 'conflict', 'superseded', 'ineligible'].includes(row.sync_status));
  const players = attention.length
    ? await db.all<{ id: string; nickname: string }>(`
        SELECT id, nickname FROM players
         WHERE COALESCE(contact_status, 'normal') <> 'blocked'
         ORDER BY nickname COLLATE NOCASE ASC
         LIMIT 300
      `)
    : [];

  return {
    evening: { id: evening.id, title: evening.title, status: evening.status },
    integration,
    destinations,
    votes: {
      total: userRows.length,
      applied: userRows.filter((row) => row.sync_status === 'applied').length,
      unmatched: userRows.filter((row) => row.sync_status === 'unmatched').length,
      conflict: userRows.filter((row) => row.sync_status === 'conflict').length,
      superseded: userRows.filter((row) => row.sync_status === 'superseded').length,
      ineligible: userRows.filter((row) => row.sync_status === 'ineligible').length,
    },
    attention: attention.map((row) => ({
      vk_user_id: row.vk_user_id,
      display_name: row.display_name,
      screen_name: row.screen_name,
      response_status: row.response_status,
      sync_status: row.sync_status,
      player_id: row.player_id,
    })),
    players,
  };
}
