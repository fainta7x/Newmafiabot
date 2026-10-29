import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureJudgeAuthoritySchema } from '../../db/ensureJudgeAuthoritySchema.ts';
import { ensureGiftCollectionSchema } from '../../db/ensureGiftCollectionSchema.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../../db/ensureOrganizerPlayerAccessSchema.ts';
import { mutateTokenBalance } from './tokenLedgerService.ts';
import { nextBirthdayOccurrence } from './playerProfileIntegrityService.ts';
import { enqueueOrganizerNotification } from './organizerNotificationService.ts';
import { queuePersonalNotification, resolvePersonalNotificationRouting } from './personalNotificationRouterService.ts';

export const GIFT_AMOUNT_BUTTONS = [100, 200, 300, 400, 500] as const;
export const GIFT_MIN_AMOUNT = 100;
export const GIFT_MAX_AMOUNT = 100_000;

export class GiftCollectionError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'bad_request') { super(message); }
}

const nowIso = () => new Date().toISOString();
const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;

export const normalizeGiftAmount = (value: unknown): number => {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < GIFT_MIN_AMOUNT || amount > GIFT_MAX_AMOUNT) {
    throw new GiftCollectionError(`Сумма — целое число от ${GIFT_MIN_AMOUNT} ₽`, 400, 'bad_amount');
  }
  return amount;
};

type Recipient = { id: string; nickname: string; telegram_user_id: string | null; attendance_count: number | null; last_visit: string | null; channel: 'telegram' | 'vk_manual' | 'none' };

/** Owner rule 2026-10-29: everyone except the birthday person, «Из другого города» and «перестал ходить». Guests are not club players. */
export async function listGiftRecipients(db: DatabaseWrapper, honoreeId: string): Promise<Recipient[]> {
  await ensureJudgeAuthoritySchema(db);
  const rows = await db.all<any>(
    `SELECT p.id, p.nickname, p.telegram_user_id,
            (SELECT COUNT(*) FROM evening_participants ep WHERE ep.player_id = p.id AND ep.attendance_status = 'attended') AS attendance_count,
            (SELECT MAX(e.starts_at) FROM evening_participants ep JOIN game_evenings e ON e.id = ep.evening_id WHERE ep.player_id = p.id AND ep.attendance_status = 'attended') AS last_visit
       FROM players p
      WHERE p.id <> ? AND COALESCE(p.from_other_city, 0) = 0 AND COALESCE(p.stopped_attending, 0) = 0
        AND COALESCE(p.source, '') <> 'legacy_guest_migrated'
      ORDER BY p.nickname COLLATE NOCASE`, [honoreeId]);
  const out: Recipient[] = [];
  for (const row of rows) {
    const routing = await resolvePersonalNotificationRouting(db, String(row.id));
    const channel = routing.selected_channel === 'telegram' ? 'telegram' : routing.available_channels.includes('vk') ? 'vk_manual' : 'none';
    out.push({ id: String(row.id), nickname: String(row.nickname || 'Игрок'), telegram_user_id: row.telegram_user_id ? String(row.telegram_user_id) : null,
      attendance_count: row.attendance_count ?? null, last_visit: row.last_visit ?? null, channel });
  }
  return out;
}

export async function previewGiftCollection(db: DatabaseWrapper, honoreeId: string) {
  await ensureGiftCollectionSchema(db);
  const honoree = await db.get<any>('SELECT id, nickname FROM players WHERE id = ?', [honoreeId]);
  if (!honoree) throw new GiftCollectionError('Игрок не найден', 404, 'not_found');
  return { honoree: { id: String(honoree.id), nickname: String(honoree.nickname) }, recipients: await listGiftRecipients(db, honoreeId) };
}

async function payeeLine(db: DatabaseWrapper) {
  const owner = await db.get<any>('SELECT phone, nickname FROM players WHERE id = ?', [PRIMARY_ORGANIZER_PLAYER_ID]);
  return owner?.phone ? `${owner.phone} (Сбер)` : null;
}

export const giftInviteText = (honoreeNickname: string) =>
  `🎁 У ${honoreeNickname} день рождения! Скидываемся на подарок — выбери, сколько готов(а) внести (от ${GIFT_MIN_AMOUNT} ₽). Жетоны клуба в подарок: 1 ₽ = 1 жетон после получения перевода. Можно отказаться, пока не перевёл(а).`;

export function giftInviteMarkup(collectionId: string, webAppUrl: string | null) {
  const rows: Array<Array<Record<string, unknown>>> = [
    GIFT_AMOUNT_BUTTONS.slice(0, 3).map((a) => ({ text: `${a} ₽`, callback_data: `gc:${collectionId}:${a}` })),
    [...GIFT_AMOUNT_BUTTONS.slice(3).map((a) => ({ text: `${a} ₽`, callback_data: `gc:${collectionId}:${a}` })),
      ...(webAppUrl ? [{ text: 'Своя сумма', web_app: { url: webAppUrl } }] : [])],
    [{ text: 'Не участвую', callback_data: `gc:${collectionId}:no` }],
  ];
  return { inline_keyboard: rows };
}

/**
 * Opens a collection and invites the chosen players. Idempotent per (collection, player): Telegram players get the
 * button message through the personal queue; VK-only players, players with notifications off and players without any
 * channel get an organizer task instead (owner rule: VK-only -> a manual task; no channel -> an explicit mark).
 */
export async function openGiftCollection(db: DatabaseWrapper, input: { honoreeId: string; organizerId: string; excludePlayerIds?: string[]; appBaseUrl?: string | null }) {
  await ensureGiftCollectionSchema(db);
  const honoree = await db.get<any>('SELECT id, nickname FROM players WHERE id = ?', [input.honoreeId]);
  if (!honoree) throw new GiftCollectionError('Игрок не найден', 404, 'not_found');
  const existing = await db.get<any>("SELECT id FROM gift_collections WHERE honoree_player_id = ? AND status = 'open'", [input.honoreeId]);
  if (existing) throw new GiftCollectionError('Сбор для этого игрока уже открыт', 409, 'already_open');
  const id = randomUUID();
  const now = nowIso();
  const exclude = new Set((input.excludePlayerIds || []).map(String));
  const recipients = (await listGiftRecipients(db, input.honoreeId)).filter((r) => !exclude.has(r.id));
  await db.run('INSERT INTO gift_collections (id, honoree_player_id, status, created_by, created_at) VALUES (?, ?, ?, ?, ?)', [id, input.honoreeId, 'open', input.organizerId, now]);
  const counts = { telegram: 0, vk_manual: 0, none: 0 };
  for (const r of recipients) {
    let channel = r.channel;
    let taskId: string | null = null;
    if (channel === 'telegram') {
      const { delivery } = await queuePersonalNotification(db, {
        notificationKey: `gift-collection:${id}:${r.id}`, playerId: r.id, eventType: 'gift_collection_invite', entityId: id,
        text: giftInviteText(String(honoree.nickname)), actionPath: '/player/wallet',
        telegramReplyMarkup: giftInviteMarkup(id, input.appBaseUrl ? `${input.appBaseUrl.replace(/\/$/, '')}/player/wallet?gift=${id}` : null),
      });
      if (delivery.status !== 'queued') channel = delivery.selected_channel === 'vk' ? 'vk_manual' : 'none';
    }
    if (channel !== 'telegram') {
      taskId = randomUUID();
      const title = channel === 'vk_manual' ? `Написать ${r.nickname} в ВК: сбор на подарок ${honoree.nickname}` : `Нет канала связи: ${r.nickname} — сбор на подарок ${honoree.nickname}`;
      await db.run(
        `INSERT INTO organizer_tasks (id, title, description, type, status, priority, player_id, automation_key, created_at, updated_at)
         VALUES (?, ?, ?, 'payment', 'todo', 'medium', ?, ?, ?, ?)`,
        [taskId, title, channel === 'vk_manual' ? 'Предложить сумму (от 100 ₽) и записать её в карточке сбора.' : 'У игрока нет Telegram/ВК или уведомления выключены — опрос не отправлен.', r.id, `gift-collection:${id}:${r.id}`, now, now]);
    }
    counts[channel] += 1;
    await db.run(
      `INSERT INTO gift_contributions (collection_id, player_id, status, channel, task_id, created_at, updated_at) VALUES (?, ?, 'invited', ?, ?, ?, ?)`,
      [id, r.id, channel, taskId, now, now]);
  }
  return { id, honoree_id: input.honoreeId, invited: recipients.length, ...counts };
}

/** Invite additional eligible players without touching existing contributions or resending their notifications. */
export async function addGiftCollectionRecipients(db: DatabaseWrapper, collectionId: string, playerIds: string[], organizerId: string, appBaseUrl?: string | null) {
  await ensureGiftCollectionSchema(db);
  const collection = await db.get<any>(
    'SELECT g.id, g.status, g.honoree_player_id, p.nickname AS honoree_nickname FROM gift_collections g JOIN players p ON p.id=g.honoree_player_id WHERE g.id=?',
    [collectionId]);
  if (!collection) throw new GiftCollectionError('Сбор не найден', 404, 'not_found');
  if (collection.status !== 'open') throw new GiftCollectionError('Нельзя добавлять участников в закрытый сбор', 409, 'closed');
  if (!Array.isArray(playerIds) || !playerIds.length || playerIds.length > 100 || playerIds.some(id => typeof id !== 'string')) {
    throw new GiftCollectionError('Выберите игроков для приглашения', 400, 'bad_players');
  }
  const requested = [...new Set(playerIds.map(String))];
  const eligible = new Map((await listGiftRecipients(db, String(collection.honoree_player_id))).map(player => [player.id, player]));
  const existing = new Set((await db.all<{ player_id: string }>(
    'SELECT player_id FROM gift_contributions WHERE collection_id=?', [collectionId])).map(row => String(row.player_id)));
  if (requested.some(id => !eligible.has(id) || existing.has(id))) {
    throw new GiftCollectionError('Некоторые игроки уже приглашены или не подходят для сбора. Обновите список.', 409, 'ineligible');
  }
  const now = nowIso();
  const counts = { invited: 0, telegram: 0, vk_manual: 0, none: 0 };
  for (const playerId of requested) {
    const recipient = eligible.get(playerId)!;
    // Claim the row before queueing any message, so concurrent requests cannot
    // send two invitations to the same person.
    const inserted = await db.run(
      `INSERT OR IGNORE INTO gift_contributions
        (collection_id, player_id, status, channel, created_at, updated_at)
        VALUES (?, ?, 'invited', ?, ?, ?)`,
      [collectionId, playerId, recipient.channel, now, now]);
    if (!inserted.changes) continue;
    let channel = recipient.channel;
    let taskId: string | null = null;
    if (channel === 'telegram') {
      const { delivery } = await queuePersonalNotification(db, {
        notificationKey: `gift-collection:${collectionId}:${playerId}`, playerId,
        eventType: 'gift_collection_invite', entityId: collectionId,
        text: giftInviteText(String(collection.honoree_nickname)), actionPath: '/player/wallet',
        telegramReplyMarkup: giftInviteMarkup(collectionId, appBaseUrl ? `${appBaseUrl.replace(/\/$/, '')}/player/wallet?gift=${collectionId}` : null),
      });
      if (delivery.status !== 'queued') channel = delivery.selected_channel === 'vk' ? 'vk_manual' : 'none';
    }
    if (channel !== 'telegram') {
      taskId = randomUUID();
      await db.run(`INSERT OR IGNORE INTO organizer_tasks
        (id, title, description, type, status, priority, player_id, automation_key, created_at, updated_at)
        VALUES (?, ?, ?, 'payment', 'todo', 'medium', ?, ?, ?, ?)`,
        [taskId, channel === 'vk_manual'
          ? `Написать ${recipient.nickname} в ВК: сбор на подарок ${collection.honoree_nickname}`
          : `Нет канала связи: ${recipient.nickname} — сбор на подарок ${collection.honoree_nickname}`,
          channel === 'vk_manual' ? 'Предложить сумму (от 100 ₽) и записать её в карточке сбора.' : 'Опрос не доставлен: нужен ручной контакт.',
          playerId, `gift-collection:${collectionId}:${playerId}`, now, now]);
    }
    await db.run('UPDATE gift_contributions SET channel=?, task_id=?, updated_at=? WHERE collection_id=? AND player_id=?',
      [channel, taskId, now, collectionId, playerId]);
    counts.invited += 1;
    counts[channel] += 1;
  }
  return counts;
}

async function loadContribution(db: DatabaseWrapper, collectionId: string, playerId: string) {
  const row = await db.get<any>(
    `SELECT c.*, g.status AS collection_status, g.honoree_player_id FROM gift_contributions c JOIN gift_collections g ON g.id = c.collection_id
      WHERE c.collection_id = ? AND c.player_id = ?`, [collectionId, playerId]);
  if (!row) throw new GiftCollectionError('Приглашения на этот сбор нет', 404, 'not_found');
  return row;
}

async function touchTask(db: DatabaseWrapper, row: any, done: boolean) {
  if (!row.task_id) return;
  const now = nowIso();
  await db.run('UPDATE organizer_tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND status <> ?', [done ? 'done' : 'todo', done ? now : null, now, row.task_id, done ? 'done' : 'cancelled']);
}

/** A player picks (or changes) the amount, or declines. Allowed until the transfer is confirmed; afterwards only the organizer edits. */
export async function setPlayerGiftChoice(db: DatabaseWrapper, collectionId: string, playerId: string, choice: { amount?: unknown; decline?: boolean }) {
  await ensureGiftCollectionSchema(db);
  const row = await loadContribution(db, collectionId, playerId);
  if (row.collection_status !== 'open') throw new GiftCollectionError('Сбор закрыт', 409, 'closed');
  if (row.status === 'paid') throw new GiftCollectionError('Перевод уже подтверждён — изменить сумму может только организатор', 409, 'already_paid');
  const now = nowIso();
  if (choice.decline) {
    await db.run("UPDATE gift_contributions SET status = 'declined', pledged_amount = 0, updated_at = ? WHERE collection_id = ? AND player_id = ?", [now, collectionId, playerId]);
    await touchTask(db, row, true);
    return { status: 'declined' as const, amount: 0, payee: null };
  }
  const amount = normalizeGiftAmount(choice.amount);
  await db.run("UPDATE gift_contributions SET status = 'pledged', pledged_amount = ?, updated_at = ? WHERE collection_id = ? AND player_id = ?", [amount, now, collectionId, playerId]);
  return { status: 'pledged' as const, amount, payee: await payeeLine(db) };
}

/** Organizer: record a pledge taken by hand (VK), or confirm / withdraw a received transfer. Tokens follow the confirmed amount 1:1, never back to rubles. */
export async function organizerSetContribution(db: DatabaseWrapper, collectionId: string, playerId: string, organizerId: string, change: { pledged_amount?: unknown; paid_amount?: unknown; status?: unknown }) {
  await ensureGiftCollectionSchema(db);
  const row = await loadContribution(db, collectionId, playerId);
  const now = nowIso();
  let status = String(row.status);
  let pledged = Number(row.pledged_amount) || 0;
  let paid = Number(row.paid_amount) || 0;
  if (change.pledged_amount !== undefined) { pledged = normalizeGiftAmount(change.pledged_amount); if (status !== 'paid') status = 'pledged'; }
  if (change.status === 'paid') {
    paid = change.paid_amount !== undefined ? normalizeGiftAmount(change.paid_amount) : pledged;
    if (!paid) throw new GiftCollectionError('Сначала укажите сумму', 400, 'bad_amount');
    status = 'paid';
  } else if (change.status === 'unpaid') {
    paid = 0; status = pledged ? 'pledged' : 'invited';
  } else if (change.status === 'declined') {
    if (paid) throw new GiftCollectionError('Сначала снимите отметку о переводе', 409, 'already_paid');
    pledged = 0; status = 'declined';
  }
  const credited = Number(row.tokens_credited) || 0;
  const delta = paid - credited;
  if (delta !== 0) {
    await mutateTokenBalance(db, {
      playerId, delta, reasonType: 'gift_collection', description: delta > 0 ? 'Подарочные жетоны от клуба за взнос в сбор' : 'Корректировка подарочных жетонов за сбор',
      sourceType: 'gift_collection', sourceId: collectionId, idempotencyKey: `gift-collection:${collectionId}:${playerId}:${credited}->${paid}`,
      debitPolicy: 'allow_negative', actorType: 'organizer', actorId: organizerId });
  }
  await db.run(
    `UPDATE gift_contributions SET status = ?, pledged_amount = ?, paid_amount = ?, tokens_credited = ?, paid_at = ?, updated_at = ? WHERE collection_id = ? AND player_id = ?`,
    [status, pledged, paid, paid, paid ? (row.paid_at || now) : null, now, collectionId, playerId]);
  await touchTask(db, row, status === 'paid' || status === 'declined' || (status === 'pledged' && row.channel === 'vk_manual'));
  return { status, pledged_amount: pledged, paid_amount: paid };
}

export async function closeGiftCollection(db: DatabaseWrapper, collectionId: string) {
  await ensureGiftCollectionSchema(db);
  await db.run("UPDATE gift_collections SET status = 'closed', closed_at = ? WHERE id = ? AND status = 'open'", [nowIso(), collectionId]);
}

export async function loadGiftCollectionForOrganizer(db: DatabaseWrapper, collectionId: string) {
  await ensureGiftCollectionSchema(db);
  const collection = await db.get<any>('SELECT g.*, p.nickname AS honoree_nickname FROM gift_collections g JOIN players p ON p.id = g.honoree_player_id WHERE g.id = ?', [collectionId]);
  if (!collection) throw new GiftCollectionError('Сбор не найден', 404, 'not_found');
  const contributions = await db.all<any>(
    `SELECT c.player_id, p.nickname, p.telegram_username, p.telegram_user_id, c.status, c.channel, c.pledged_amount, c.paid_amount, c.paid_at, c.task_id,
            (SELECT external_user_id FROM player_external_identities x WHERE x.platform = 'vk' AND x.player_id = c.player_id LIMIT 1) AS vk_user_id
       FROM gift_contributions c JOIN players p ON p.id = c.player_id WHERE c.collection_id = ? ORDER BY p.nickname COLLATE NOCASE`, [collectionId]).catch(() => [] as any[]);
  for (const c of contributions) {
    c.contact_url = c.telegram_username ? `https://t.me/${c.telegram_username}` : c.telegram_user_id ? `tg://user?id=${c.telegram_user_id}` : c.vk_user_id ? `https://vk.com/id${c.vk_user_id}` : null;
    delete c.telegram_user_id; delete c.vk_user_id;
  }
  const sum = (key: 'pledged_amount' | 'paid_amount', pred: (c: any) => boolean) => contributions.filter(pred).reduce((s, c) => s + (Number(c[key]) || 0), 0);
  return { collection, contributions, totals: { pledged: sum('pledged_amount', (c) => c.status === 'pledged' || c.status === 'paid'), paid: sum('paid_amount', () => true) } };
}

export async function listOpenGiftCollections(db: DatabaseWrapper) {
  await ensureGiftCollectionSchema(db);
  return db.all<any>("SELECT g.id, g.honoree_player_id, p.nickname AS honoree_nickname, g.created_at, g.status FROM gift_collections g JOIN players p ON p.id = g.honoree_player_id ORDER BY g.created_at DESC LIMIT 20");
}

/** What a player sees: only their own contribution and the resulting debt — never the total, the others or the target. */
export async function loadPlayerGiftContributions(db: DatabaseWrapper, playerId: string) {
  await ensureGiftCollectionSchema(db);
  const rows = await db.all<any>(
    `SELECT c.collection_id, c.status, c.pledged_amount, c.paid_amount, g.status AS collection_status, p.nickname AS honoree_nickname
       FROM gift_contributions c JOIN gift_collections g ON g.id = c.collection_id JOIN players p ON p.id = g.honoree_player_id
      WHERE c.player_id = ? AND (g.status = 'open' OR c.status IN ('pledged', 'paid')) ORDER BY g.created_at DESC LIMIT 10`, [playerId]);
  const payee = rows.some((r) => r.status === 'pledged') ? await payeeLine(db) : null;
  return { items: rows.map((r) => ({ ...r, owed: r.status === 'pledged' ? Number(r.pledged_amount) : 0 })), payee, amounts: GIFT_AMOUNT_BUTTONS, min_amount: GIFT_MIN_AMOUNT };
}

export const giftPledgeConfirmation = (amount: number, payee: string | null) =>
  `✅ Записал: ${rub(amount)}. ${payee ? `Переведи на ${payee}. ` : 'Организатор пришлёт реквизиты. '}Сумму можно поменять или отказаться, пока перевод не подтверждён.`;

const GIFT_PROMPT_DAYS = 2;
const REMINDER_AFTER_MS = 48 * 3_600_000;

/**
 * Owner chain 2026-10-29: two days before a birthday the organizer gets a task and a Telegram message «начните сбор», and
 * opens the collection himself. Nobody is invited automatically. Birthday persons with a private date, «Из другого города»
 * and «перестал ходить» are skipped. Later: ONE reminder to the organizer (not to players) listing who has not answered.
 */
export async function runGiftCollectionPrompts(db: DatabaseWrapper, now = Date.now()): Promise<number> {
  await ensureGiftCollectionSchema(db);
  let sent = 0;
  const players = await db.all<any>(
    `SELECT id, nickname, birth_day, birth_month FROM players
      WHERE birth_day IS NOT NULL AND birth_month IS NOT NULL AND COALESCE(birthday_visibility, 'private') <> 'private'
        AND COALESCE(contact_status, 'normal') NOT IN ('blocked', 'paused')
        AND COALESCE(from_other_city, 0) = 0 AND COALESCE(stopped_attending, 0) = 0 AND COALESCE(source, '') <> 'legacy_guest_migrated'`).catch(() => [] as any[]);
  for (const player of players) {
    const occurrence = nextBirthdayOccurrence(Number(player.birth_day), Number(player.birth_month), new Date(now));
    if (occurrence.days_until > GIFT_PROMPT_DAYS) continue;
    const key = `gift-start:${player.id}:${occurrence.date}`;
    if (await db.get('SELECT 1 FROM organizer_tasks WHERE automation_key = ? LIMIT 1', [key])) continue;
    if (await db.get("SELECT 1 FROM gift_collections WHERE honoree_player_id = ? AND created_at >= ? LIMIT 1", [player.id, new Date(now - 60 * 86_400_000).toISOString()])) continue;
    const label = `${String(occurrence.effective_day).padStart(2, '0')}.${String(occurrence.effective_month).padStart(2, '0')}`;
    const created = new Date(now).toISOString();
    await db.run(
      `INSERT OR IGNORE INTO organizer_tasks (id, title, description, type, status, priority, due_at, automation_key, player_id, created_at, updated_at)
       VALUES (?, ?, ?, 'payment', 'todo', 'medium', ?, ?, ?, ?, ?)`,
      [randomUUID(), `Начать сбор на подарок — ${player.nickname} (ДР ${label})`, 'Откройте «Ещё → Сбор на подарок»: опрос уйдёт игрокам только после вашего нажатия.', `${occurrence.date}T09:00:00.000Z`, key, player.id, created, created]);
    const text = `🎁 У ${player.nickname} день рождения ${label}. Пора начать сбор на подарок — откройте его в приложении, опрос уйдёт игрокам после вашего нажатия.`;
    const result = await enqueueOrganizerNotification(db, { messageKey: key, eventType: 'gift_collection_start', entityId: String(player.id), text, openPath: `/admin/more/gifts?honoree=${encodeURIComponent(String(player.id))}` });
    if (result.queued > 0) sent += 1;
  }

  const due = await db.all<any>(
    `SELECT g.id, p.nickname FROM gift_collections g JOIN players p ON p.id = g.honoree_player_id
      WHERE g.status = 'open' AND g.reminded_at IS NULL AND g.created_at <= ?`, [new Date(now - REMINDER_AFTER_MS).toISOString()]);
  for (const collection of due) {
    const silent = await db.all<any>(
      `SELECT p.nickname FROM gift_contributions c JOIN players p ON p.id = c.player_id WHERE c.collection_id = ? AND c.status = 'invited' ORDER BY p.nickname COLLATE NOCASE`, [collection.id]);
    await db.run('UPDATE gift_collections SET reminded_at = ? WHERE id = ? AND reminded_at IS NULL', [new Date(now).toISOString(), collection.id]);
    if (!silent.length) continue;
    const names = silent.slice(0, 15).map((row) => row.nickname).join(', ') + (silent.length > 15 ? ` и ещё ${silent.length - 15}` : '');
    const result = await enqueueOrganizerNotification(db, {
      messageKey: `gift-silent:${collection.id}`, eventType: 'gift_collection_reminder', entityId: String(collection.id),
      text: `🎁 Сбор для ${collection.nickname}: не ответили ${silent.length} — ${names}. Игрокам повторно ничего не отправляется; в карточке сбора у каждого есть кнопка «Написать».`,
      openPath: `/admin/more/gifts?collection=${encodeURIComponent(String(collection.id))}` });
    if (result.queued > 0) sent += 1;
  }
  return sent;
}
