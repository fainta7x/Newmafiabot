import crypto from 'crypto';
import { Router } from 'express';
import { canOrganizeCustomEvents } from '../../lib/organizeFormats.ts';
import { getPlayerSessionId, type AuthenticatedRequest } from '../auth.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../../db/ensureOrganizerPlayerAccessSchema.ts';
import { publishCustomEvent } from '../services/customEventPublishingService.ts';

const router = Router();
const bool = (value: unknown) => value === true || value === 1 || value === '1';
const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
const iso = (value: unknown, required = true) => {
  const text = clean(value, 64);
  if (!text && !required) return null;
  const date = new Date(text);
  if (!text || Number.isNaN(date.getTime())) throw Object.assign(new Error('Проверьте дату и время'), { statusCode: 400 });
  return date.toISOString();
};

async function manager(req: AuthenticatedRequest) {
  if (req.userRole === 'ORGANIZER' && !req.delegatedOrganizerAccess) {
    return { root: true, playerId: req.organizerPlayerId || null };
  }
  const playerId = getPlayerSessionId(req);
  if (!playerId) return null;
  const player = await req.db.get<any>('SELECT id, organize_formats, contact_status FROM players WHERE id=? LIMIT 1', [playerId]);
  if (!player || player.contact_status === 'blocked' || !canOrganizeCustomEvents(player)) return null;
  return { root: false, playerId };
}

async function eventWithCounts(db: any, id: string) {
  return db.get(`SELECT e.*,
    COALESCE(SUM(CASE WHEN r.status='registered' THEN 1+r.guest_count ELSE 0 END),0) AS participant_count,
    COALESCE(SUM(CASE WHEN r.status='registered' THEN 1 ELSE 0 END),0) AS registration_count
    FROM custom_events e LEFT JOIN custom_event_registrations r ON r.event_id=e.id
    WHERE e.id=? GROUP BY e.id`, [id]);
}

function canSee(event: any, player: any, invited: boolean, playerId: string) {
  if (String(event.organizer_player_id) === playerId) return true;
  if (event.visibility === 'everyone') return true;
  if (event.visibility === 'club') return player?.club_stage === 'CLUB_PLAYER';
  return invited;
}

function normalizedInput(body: any, current?: any) {
  const startsAt = iso(body.starts_at ?? current?.starts_at);
  const endsAt = iso(body.ends_at ?? current?.ends_at);
  const deadline = iso(body.signup_deadline ?? current?.signup_deadline, false);
  if (new Date(endsAt!).getTime() <= new Date(startsAt!).getTime()) throw Object.assign(new Error('Окончание должно быть позже начала'), { statusCode: 400 });
  if (deadline && new Date(deadline).getTime() > new Date(startsAt!).getTime()) throw Object.assign(new Error('Запись должна закрываться не позже начала'), { statusCode: 400 });
  const title = clean(body.title ?? current?.title, 120);
  if (!title) throw Object.assign(new Error('Укажите название'), { statusCode: 400 });
  const limit = Math.round(Number(body.participant_limit ?? current?.participant_limit ?? 20));
  const price = Math.round(Number(body.price_rub ?? current?.price_rub ?? 0));
  if (!Number.isFinite(limit) || limit < 1 || limit > 1000) throw Object.assign(new Error('Лимит участников должен быть от 1 до 1000'), { statusCode: 400 });
  if (!Number.isFinite(price) || price < 0 || price > 10_000_000) throw Object.assign(new Error('Проверьте цену'), { statusCode: 400 });
  const visibility = ['everyone', 'club', 'invite'].includes(String(body.visibility ?? current?.visibility)) ? String(body.visibility ?? current?.visibility) : 'everyone';
  const cover = body.cover_image_data_url === undefined ? current?.cover_image_data_url ?? null : clean(body.cover_image_data_url, 1_500_000) || null;
  if (cover && !/^data:image\/(?:jpeg|png|webp);base64,/i.test(cover)) throw Object.assign(new Error('Обложка должна быть JPG, PNG или WebP'), { statusCode: 400 });
  return { title, description: clean(body.description ?? current?.description, 4000), cover, startsAt, endsAt, deadline,
    venue: clean(body.venue ?? current?.venue, 300), limit, price, visibility,
    registrationOpen: body.registration_open === undefined ? Number(current?.registration_open ?? 1) : Number(bool(body.registration_open)),
    allowGuest: body.allow_guest === undefined ? Number(current?.allow_guest ?? 0) : Number(bool(body.allow_guest)),
    tgChannel: body.announce_telegram_channel === undefined ? Number(current?.announce_telegram_channel ?? 0) : Number(bool(body.announce_telegram_channel)),
    clubGroup: body.announce_club_group === undefined ? Number(current?.announce_club_group ?? 0) : Number(bool(body.announce_club_group)),
    vk: body.announce_vk === undefined ? Number(current?.announce_vk ?? 0) : Number(bool(body.announce_vk)),
    botDm: body.announce_bot_dm === undefined ? Number(current?.announce_bot_dm ?? 0) : Number(bool(body.announce_bot_dm)) };
}

router.get('/manage', async (req: AuthenticatedRequest, res) => {
  const access = await manager(req);
  if (!access) return res.status(403).json({ error: 'Нет права проводить свои ивенты' });
  const where = access.root ? '' : 'WHERE e.organizer_player_id = ?';
  const rows = await req.db.all<any>(`SELECT e.*,p.nickname AS organizer_nickname,
    COALESCE(SUM(CASE WHEN r.status='registered' THEN 1+r.guest_count ELSE 0 END),0) AS participant_count
    FROM custom_events e JOIN players p ON p.id=e.organizer_player_id
    LEFT JOIN custom_event_registrations r ON r.event_id=e.id ${where}
    GROUP BY e.id ORDER BY e.starts_at`, access.root ? [] : [access.playerId]);
  return res.json(rows);
});

router.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    const access = await manager(req);
    if (!access) return res.status(403).json({ error: 'Нет права проводить свои ивенты' });
    const organizerId = access.playerId || clean(req.body?.organizer_player_id, 100) || PRIMARY_ORGANIZER_PLAYER_ID;
    if (!organizerId || !(await req.db.get('SELECT id FROM players WHERE id=?', [organizerId]))) return res.status(400).json({ error: 'Выберите организатора с профилем игрока' });
    const x = normalizedInput(req.body || {});
    const id = crypto.randomUUID(), now = new Date().toISOString();
    await req.db.run(`INSERT INTO custom_events (id,organizer_player_id,title,description,cover_image_data_url,starts_at,ends_at,signup_deadline,venue,participant_limit,price_rub,registration_open,visibility,allow_guest,announce_telegram_channel,announce_club_group,announce_vk,announce_bot_dm,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, organizerId, x.title, x.description, x.cover, x.startsAt, x.endsAt, x.deadline, x.venue, x.limit, x.price, x.registrationOpen, x.visibility, x.allowGuest, x.tgChannel, x.clubGroup, x.vk, x.botDm, now, now]);
    return res.status(201).json(await eventWithCounts(req.db, id));
  } catch (error: any) { return res.status(Number(error.statusCode || 500)).json({ error: error.message || 'Не удалось создать событие' }); }
});

router.patch('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const access = await manager(req), current = await eventWithCounts(req.db, String(req.params.id));
    if (!access || !current || (!access.root && current.organizer_player_id !== access.playerId)) return res.status(403).json({ error: 'Можно менять только свои ивенты' });
    const x = normalizedInput(req.body || {}, current);
    await req.db.run(`UPDATE custom_events SET title=?,description=?,cover_image_data_url=?,starts_at=?,ends_at=?,signup_deadline=?,venue=?,participant_limit=?,price_rub=?,registration_open=?,visibility=?,allow_guest=?,announce_telegram_channel=?,announce_club_group=?,announce_vk=?,announce_bot_dm=?,updated_at=? WHERE id=?`,
      [x.title,x.description,x.cover,x.startsAt,x.endsAt,x.deadline,x.venue,x.limit,x.price,x.registrationOpen,x.visibility,x.allowGuest,x.tgChannel,x.clubGroup,x.vk,x.botDm,new Date().toISOString(),current.id]);
    return res.json(await eventWithCounts(req.db, current.id));
  } catch (error: any) { return res.status(Number(error.statusCode || 500)).json({ error: error.message || 'Не удалось сохранить событие' }); }
});

router.post('/:id/status', async (req: AuthenticatedRequest, res) => {
  const access = await manager(req), current = await eventWithCounts(req.db, String(req.params.id));
  if (!access || !current || (!access.root && current.organizer_player_id !== access.playerId)) return res.status(403).json({ error: 'Можно менять только свои ивенты' });
  const status = String(req.body?.status || '');
  if (!['draft','published','cancelled','completed'].includes(status)) return res.status(400).json({ error: 'Неизвестный статус' });
  const now = new Date().toISOString();
  await req.db.run('UPDATE custom_events SET status=?, published_at=CASE WHEN ?=\'published\' THEN COALESCE(published_at,?) ELSE published_at END, updated_at=? WHERE id=?', [status,status,now,now,current.id]);
  return res.json(await eventWithCounts(req.db, current.id));
});

// A draft that was never published has no players or posts yet, so it may be removed outright
// (owner, 2026-09-29: an event made by mistake could not be removed). Published events are cancelled instead.
router.delete('/:id', async (req: AuthenticatedRequest, res) => {
  const access = await manager(req), current = await eventWithCounts(req.db, String(req.params.id));
  if (!access || !current || (!access.root && current.organizer_player_id !== access.playerId)) return res.status(403).json({ error: 'Можно удалять только свои ивенты' });
  if (current.status !== 'draft' || current.published_at || Number(current.registration_count || 0) > 0) {
    return res.status(409).json({ error: 'Опубликованный ивент нельзя удалить — его можно отменить' });
  }
  for (const table of ['custom_event_invitations', 'custom_event_registrations', 'custom_event_publications']) {
    await req.db.run(`DELETE FROM ${table} WHERE event_id = ?`, [current.id]);
  }
  await req.db.run('DELETE FROM custom_events WHERE id = ?', [current.id]);
  return res.json({ ok: true });
});

router.put('/:id/invitations', async (req: AuthenticatedRequest, res) => {
  const access = await manager(req), current = await eventWithCounts(req.db, String(req.params.id));
  if (!access || !current || (!access.root && current.organizer_player_id !== access.playerId)) return res.status(403).json({ error: 'Можно менять только свои ивенты' });
  const ids = [...new Set((Array.isArray(req.body?.player_ids) ? req.body.player_ids : []).map((id: unknown) => clean(id, 100)).filter(Boolean))];
  const now = new Date().toISOString();
  await req.db.transaction(async (tx) => {
    await tx.run('DELETE FROM custom_event_invitations WHERE event_id=?', [current.id]);
    for (const playerId of ids) await tx.run('INSERT OR IGNORE INTO custom_event_invitations(event_id,player_id,created_at) SELECT ?,id,? FROM players WHERE id=?', [current.id,now,playerId]);
  });
  return res.json({ success: true, player_ids: ids });
});

router.post('/:id/announce', async (req: AuthenticatedRequest, res) => {
  try {
    const access = await manager(req), current = await eventWithCounts(req.db, String(req.params.id));
    if (!access || !current || (!access.root && current.organizer_player_id !== access.playerId)) return res.status(403).json({ error: 'Можно анонсировать только свои ивенты' });
    return res.json(await publishCustomEvent(req.db, current.id));
  } catch (error: any) { return res.status(Number(error.statusCode || 500)).json({ error: error.message || 'Не удалось отправить анонс' }); }
});

router.get('/:id/announcement-status', async (req: AuthenticatedRequest, res) => {
  const access = await manager(req), current = await eventWithCounts(req.db, String(req.params.id));
  if (!access || !current || (!access.root && current.organizer_player_id !== access.playerId)) return res.status(403).json({ error: 'Можно смотреть только свои ивенты' });
  return res.json(await req.db.all('SELECT channel,target_key,status,external_id,last_error,attempted_at,sent_at FROM custom_event_publications WHERE event_id=? ORDER BY channel,target_key',[current.id]));
});

router.get('/:id', async (req: AuthenticatedRequest, res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return res.status(401).json({ error: 'Нужно войти как игрок' });
  const event = await eventWithCounts(req.db, String(req.params.id));
  if (!event || !['published','completed'].includes(event.status)) return res.status(404).json({ error: 'Событие не найдено' });
  const player = await req.db.get<any>('SELECT club_stage FROM players WHERE id=?', [playerId]);
  const invited = Boolean(await req.db.get('SELECT 1 FROM custom_event_invitations WHERE event_id=? AND player_id=?', [event.id,playerId]));
  if (!canSee(event, player, invited, playerId)) return res.status(404).json({ error: 'Событие не найдено' });
  const mine = await req.db.get<any>('SELECT status,guest_count FROM custom_event_registrations WHERE event_id=? AND player_id=?', [event.id,playerId]);
  return res.json({ ...event, registration_status: mine?.status === 'registered' ? 'registered' : null, guest_count: mine?.status === 'registered' ? Number(mine.guest_count || 0) : 0 });
});

router.post('/:id/register', async (req: AuthenticatedRequest, res) => {
  try {
    const playerId = getPlayerSessionId(req);
    if (!playerId) return res.status(401).json({ error: 'Нужно войти как игрок' });
    const event = await eventWithCounts(req.db, String(req.params.id));
    if (!event || event.status !== 'published') return res.status(404).json({ error: 'Событие не найдено' });
    const player = await req.db.get<any>('SELECT club_stage FROM players WHERE id=?', [playerId]);
    const invited = Boolean(await req.db.get('SELECT 1 FROM custom_event_invitations WHERE event_id=? AND player_id=?', [event.id,playerId]));
    if (!canSee(event, player, invited, playerId)) return res.status(403).json({ error: 'Событие доступно только приглашённым' });
    if (!Number(event.registration_open)) return res.status(409).json({ error: 'Запись закрыта' });
    if (event.signup_deadline && new Date(event.signup_deadline).getTime() < Date.now()) return res.status(409).json({ error: 'Срок записи закончился' });
    const guests = bool(req.body?.with_guest) ? 1 : 0;
    if (guests && !Number(event.allow_guest)) return res.status(400).json({ error: 'На это событие нельзя взять гостя' });
    const previous = await req.db.get<any>('SELECT status,guest_count FROM custom_event_registrations WHERE event_id=? AND player_id=?', [event.id,playerId]);
    const occupiedWithoutMine = Number(event.participant_count || 0) - (previous?.status === 'registered' ? 1 + Number(previous.guest_count || 0) : 0);
    if (occupiedWithoutMine + 1 + guests > Number(event.participant_limit)) return res.status(409).json({ error: 'Свободных мест уже нет' });
    const now = new Date().toISOString();
    await req.db.run(`INSERT INTO custom_event_registrations(event_id,player_id,guest_count,status,created_at,updated_at) VALUES (?,?,?,'registered',?,?)
      ON CONFLICT(event_id,player_id) DO UPDATE SET guest_count=excluded.guest_count,status='registered',updated_at=excluded.updated_at`, [event.id,playerId,guests,now,now]);
    return res.json({ success: true, event: await eventWithCounts(req.db,event.id) });
  } catch (error: any) { return res.status(500).json({ error: error.message || 'Не удалось записаться' }); }
});

router.delete('/:id/register', async (req: AuthenticatedRequest, res) => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) return res.status(401).json({ error: 'Нужно войти как игрок' });
  await req.db.run("UPDATE custom_event_registrations SET status='cancelled',updated_at=? WHERE event_id=? AND player_id=?", [new Date().toISOString(),String(req.params.id),playerId]);
  return res.json({ success: true });
});

export { canSee as canSeeCustomEvent };
export default router;
