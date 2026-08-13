import type { DatabaseWrapper } from '../../db/index.ts';
import {
  createVkWallPost,
  editVkWallPost,
  getVkDestinations,
  type VkDestination,
} from './vkPublishingService.ts';

type EveningRow = {
  id: string;
  title: string;
  starts_at: string;
  timezone: string | null;
  venue: string | null;
  status: string;
  default_price: number;
  settled_at: string | null;
};

type PublicationRow = {
  evening_id: string;
  destination_key: string;
  group_id: string;
  post_owner_id: number | null;
  post_id: number | null;
  external_url: string | null;
  published_at: string | null;
};

const nowIso = () => new Date().toISOString();

const normalizeBaseUrl = (value: string) => String(value || '').trim().replace(/\/$/, '');

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

const loadCounts = async (db: DatabaseWrapper, eveningId: string) => {
  const row = await db.get<any>(`
    SELECT
      SUM(CASE WHEN response_status IN ('going','late') THEN 1 ELSE 0 END) AS going_count,
      SUM(CASE WHEN response_status = 'thinking' THEN 1 ELSE 0 END) AS thinking_count
      FROM evening_participants
     WHERE evening_id = ?
  `, [eveningId]);
  return {
    going: Number(row?.going_count || 0),
    thinking: Number(row?.thinking_count || 0),
  };
};

export const buildDirectVkEveningAnnouncement = async (
  db: DatabaseWrapper,
  evening: EveningRow,
  baseUrl: string,
) => {
  const counts = await loadCounts(db, evening.id);
  const lines = [
    `🕵️ ${evening.title}`,
    '',
    `📅 ${formatDate(evening)}`,
  ];
  if (evening.venue) lines.push(`📍 ${evening.venue}`);
  if (Number(evening.default_price || 0) > 0) {
    lines.push(`💳 ${Number(evening.default_price).toLocaleString('ru-RU')} ₽`);
  }
  lines.push(
    '',
    `👥 Уже идут: ${counts.going} · думают: ${counts.thinking}`,
    '',
    'Записаться или изменить ответ:',
    `${normalizeBaseUrl(baseUrl)}/join/${encodeURIComponent(evening.id)}?source=vk`,
  );
  return lines.join('\n');
};

const getPublication = (db: DatabaseWrapper, eveningId: string, destinationKey: string) => db.get<PublicationRow>(`
  SELECT evening_id, destination_key, group_id, post_owner_id, post_id, external_url, published_at
    FROM vk_evening_publications
   WHERE evening_id = ? AND destination_key = ?
   LIMIT 1
`, [eveningId, destinationKey]);

const savePublicationError = async (
  db: DatabaseWrapper,
  eveningId: string,
  destination: VkDestination,
  error: unknown,
) => {
  if (!destination.groupId) return;
  const now = nowIso();
  await db.run(`
    INSERT INTO vk_evening_publications (
      evening_id, destination_key, group_id, answer_map_json, status, updated_at, last_error
    ) VALUES (?, ?, ?, '{}', 'error', ?, ?)
    ON CONFLICT(evening_id, destination_key) DO UPDATE SET
      group_id=excluded.group_id,
      poll_owner_id=NULL,
      poll_id=NULL,
      answer_map_json='{}',
      status='error',
      updated_at=excluded.updated_at,
      last_error=excluded.last_error
  `, [eveningId, destination.key, destination.groupId, now, error instanceof Error ? error.message : String(error)]);
};

const syncDestination = async (
  db: DatabaseWrapper,
  evening: EveningRow,
  destination: VkDestination,
  message: string,
  onlyExisting: boolean,
) => {
  if (!destination.groupId || !destination.supported) return null;
  const existing = await getPublication(db, evening.id, destination.key);
  if (onlyExisting && !existing?.post_id) return null;

  let postOwnerId = Number(existing?.post_owner_id || 0);
  let postId = Number(existing?.post_id || 0);
  let externalUrl = existing?.external_url || destination.configuredUrl || null;

  if (postId > 0) {
    await editVkWallPost({ groupId: destination.groupId, postId, message });
    if (destination.key === 'public') {
      postOwnerId = -Math.abs(Number(destination.groupId));
      externalUrl = `https://vk.com/wall${postOwnerId}_${postId}`;
    }
  } else {
    const published = await createVkWallPost({ groupId: destination.groupId, message });
    postOwnerId = published.ownerId;
    postId = published.postId;
    externalUrl = published.externalUrl;
  }

  const now = nowIso();
  await db.run(`
    INSERT INTO vk_evening_publications (
      evening_id, destination_key, group_id, poll_owner_id, poll_id, post_owner_id, post_id,
      answer_map_json, status, external_url, published_at, updated_at, last_error
    ) VALUES (?, ?, ?, NULL, NULL, ?, ?, '{}', 'published', ?, ?, ?, NULL)
    ON CONFLICT(evening_id, destination_key) DO UPDATE SET
      group_id=excluded.group_id,
      poll_owner_id=NULL,
      poll_id=NULL,
      post_owner_id=excluded.post_owner_id,
      post_id=excluded.post_id,
      answer_map_json='{}',
      status='published',
      external_url=excluded.external_url,
      published_at=COALESCE(vk_evening_publications.published_at, excluded.published_at),
      updated_at=excluded.updated_at,
      last_error=NULL
  `, [
    evening.id,
    destination.key,
    destination.groupId,
    postOwnerId,
    postId,
    externalUrl,
    existing?.published_at || now,
    now,
  ]);

  return getPublication(db, evening.id, destination.key);
};

export async function syncDirectVkEveningPublications(
  db: DatabaseWrapper,
  eveningId: string,
  baseUrl: string,
  options: { onlyExisting?: boolean } = {},
) {
  const evening = await db.get<EveningRow>(`
    SELECT id, title, starts_at, timezone, venue, status, default_price, settled_at
      FROM game_evenings
     WHERE id = ?
     LIMIT 1
  `, [eveningId]);
  if (!evening) throw Object.assign(new Error('Вечер не найден'), { statusCode: 404 });
  if (!['published', 'active'].includes(String(evening.status)) || evening.settled_at) {
    throw Object.assign(new Error('VK-анонс можно публиковать только для открытого вечера'), { statusCode: 409 });
  }

  const message = await buildDirectVkEveningAnnouncement(db, evening, baseUrl);
  const onlyExisting = Boolean(options.onlyExisting);
  const results: Array<{ destination: string; success: boolean; skipped?: boolean; error?: string }> = [];

  for (const destination of getVkDestinations()) {
    if (!destination.active || !destination.supported || !destination.groupId) continue;
    try {
      const publication = await syncDestination(db, evening, destination, message, onlyExisting);
      if (!publication) {
        results.push({ destination: destination.key, success: true, skipped: true });
      } else {
        results.push({ destination: destination.key, success: true });
      }
    } catch (error) {
      await savePublicationError(db, evening.id, destination, error);
      results.push({
        destination: destination.key,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const attempted = results.filter((item) => !item.skipped);
  if (!results.length && !onlyExisting) {
    throw Object.assign(new Error('Не настроено ни одного VK-направления'), { statusCode: 409 });
  }
  if (!onlyExisting && attempted.length > 0 && attempted.every((item) => !item.success)) {
    throw Object.assign(
      new Error(attempted.map((item) => item.error).filter(Boolean).join('; ') || 'VK-публикация не удалась'),
      { statusCode: 502 },
    );
  }

  return { evening_id: eveningId, results };
}
