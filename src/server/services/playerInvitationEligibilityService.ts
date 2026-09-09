import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';
import { normalizeCanonicalEveningResponse } from '../../lib/eveningDomain.ts';
import { ensurePremiumPlayerConnectionsSchema } from './premiumPlayerConnectionsService.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';

export type InvitationEveningState = 'eligible' | 'registered' | 'reserve' | 'already_invited' | 'registration_closed' | 'sender_limit' | 'unavailable_format';
export type InvitationContext = {
  can_invite: boolean;
  reason: string | null;
  recipient_state: string;
  evenings: Array<{ id: string; title: string; starts_at: string | null; venue: string | null; format: string; state: InvitationEveningState; existing_invitation: any | null }>;
};
const unavailableStatuses = new Set(['blocked', 'archived', 'inactive', 'disabled', 'deleted']);
const unavailableRecipient = (status: unknown) => unavailableStatuses.has(String(status || '').trim().toLowerCase());
const placeholders = (items: string[]) => items.map(() => '?').join(',');

export async function loadInvitationContextsForRecipients(db: DatabaseWrapper, inviterPlayerId: string, recipientPlayerIds: string[]): Promise<Map<string, InvitationContext>> {
  await ensurePremiumPlayerConnectionsSchema(db);
  const ids = [...new Set(recipientPlayerIds.map(String).filter(Boolean))].slice(0, 32);
  const result = new Map<string, InvitationContext>();
  if (!ids.length) return result;
  const inviter = await db.get<any>(`SELECT id, nickname, game_level, COALESCE(contact_status,lifecycle_status,'normal') AS status FROM players WHERE id=? LIMIT 1`, [inviterPlayerId]);
  const recipients = await db.all<any>(`SELECT id,nickname,game_level,COALESCE(contact_status,lifecycle_status,'normal') AS status FROM players WHERE id IN (${placeholders(ids)})`, ids);
  const recipientMap = new Map(recipients.map((row:any) => [String(row.id), row]));
  const evenings = inviter ? await db.all<any>(`
    SELECT e.id,e.title,e.starts_at,e.venue,e.format,e.status,e.settled_at,
           iep.response_status AS inviter_response, iep.registration_status AS inviter_registration, iep.arrival_status AS inviter_arrival
      FROM game_evenings e JOIN evening_participants iep ON iep.evening_id=e.id AND iep.player_id=?
     WHERE e.settled_at IS NULL AND datetime(e.starts_at)>=datetime('now','-6 hours') AND e.status IN ('published','active')
     ORDER BY datetime(e.starts_at) ASC LIMIT 12
  `,[inviterPlayerId]) : [];
  const eveningIds = evenings.map((row:any) => String(row.id));
  const participantRows = eveningIds.length ? await db.all<any>(`SELECT evening_id,player_id,response_status,registration_status,arrival_status FROM evening_participants WHERE evening_id IN (${placeholders(eveningIds)}) AND player_id IN (${placeholders(ids)})`,[...eveningIds,...ids]) : [];
  const participantMap = new Map(participantRows.map((row:any) => [`${row.evening_id}:${row.player_id}`,row]));
  const invitationRows = eveningIds.length ? await db.all<any>(`SELECT id,evening_id,recipient_player_id,status,created_at FROM player_evening_invitations WHERE inviter_player_id=? AND evening_id IN (${placeholders(eveningIds)}) AND recipient_player_id IN (${placeholders(ids)})`,[inviterPlayerId,...eveningIds,...ids]) : [];
  const invitationMap = new Map(invitationRows.map((row:any) => [`${row.evening_id}:${row.recipient_player_id}`,row]));
  const senderCounts = eveningIds.length ? await db.all<any>(`SELECT evening_id,COUNT(DISTINCT recipient_player_id) AS total FROM player_evening_invitations WHERE inviter_player_id=? AND evening_id IN (${placeholders(eveningIds)}) GROUP BY evening_id`,[inviterPlayerId,...eveningIds]) : [];
  const countMap = new Map(senderCounts.map((row:any) => [String(row.evening_id),Number(row.total||0)]));
  for (const id of ids) {
    if (id === inviterPlayerId) { result.set(id,{can_invite:false,reason:'self',recipient_state:'self',evenings:[]}); continue; }
    const recipient = recipientMap.get(id);
    if (!inviter || !recipient) { result.set(id,{can_invite:false,reason:'player_not_found',recipient_state:'unavailable',evenings:[]}); continue; }
    if (unavailableRecipient(recipient.status)) { result.set(id,{can_invite:false,reason:`recipient_${String(recipient.status).toLowerCase()}`,recipient_state:'unavailable',evenings:[]}); continue; }
    const payload = evenings.filter((row:any) => {
      const inviterResponse = normalizeCanonicalEveningResponse(row.inviter_response || row.inviter_registration, row.inviter_arrival);
      return ['going','late'].includes(inviterResponse) && playerLevelAllowsEveningFormat(inviter.game_level,row.format);
    }).map((row:any) => {
      const ep = participantMap.get(`${row.id}:${id}`), existing = invitationMap.get(`${row.id}:${id}`) || null;
      const registration = String(ep?.registration_status || '').trim().toLowerCase(), rawResponse = String(ep?.response_status || '').trim();
      const response = normalizeCanonicalEveningResponse(rawResponse || registration, ep?.arrival_status);
      let state: InvitationEveningState = 'eligible';
      if (String(row.status) !== 'published') state='registration_closed'; else if (response === 'going' || response === 'late') state='registered'; else if (registration === 'reserve' || registration === 'waiting' || rawResponse.toLowerCase() === 'reserve') state='reserve'; else if (existing) state='already_invited'; else if (!playerLevelAllowsEveningFormat(recipient.game_level,row.format)) state='unavailable_format'; else if (Number(countMap.get(String(row.id))||0)>=5) state='sender_limit';
      return { id:String(row.id),title:String(row.title||'Игровой вечер'),starts_at:row.starts_at||null,venue:row.venue||null,format:String(row.format||'CASUAL'),state,existing_invitation:existing };
    });
    const eligible = payload.some((item) => item.state==='eligible'), reason = eligible ? null : payload.length ? payload[0].state : 'no_active_evening';
    result.set(id,{can_invite:eligible,reason,recipient_state:unavailableRecipient(recipient.status)?'unavailable':reason==='registered'?'registered':reason==='reserve'?'reserve':'available',evenings:payload});
  }
  return result;
}
export async function getHardenedEveningInvitationContext(db: DatabaseWrapper, inviterPlayerId: string, recipientPlayerId: string) {
  const contexts = await loadInvitationContextsForRecipients(db,inviterPlayerId,[recipientPlayerId]);
  return contexts.get(recipientPlayerId) || {can_invite:false,reason:'player_not_found',recipient_state:'unavailable',evenings:[]};
}
export async function createHardenedEveningInvitation(db: DatabaseWrapper, inviterPlayerId: string, recipientPlayerId: string, eveningId: string) {
  await ensurePremiumPlayerConnectionsSchema(db);
  const contexts = await loadInvitationContextsForRecipients(db,inviterPlayerId,[recipientPlayerId]), context = contexts.get(recipientPlayerId);
  if (!context) throw new Error('Игрок не найден');
  const candidate = context.evenings.find((item) => item.id===eveningId);
  if (candidate?.existing_invitation) return {invitation:candidate.existing_invitation,created:false};
  if (!candidate || candidate.state!=='eligible') {
    const messages:Record<string,string>={registered:'Игрок уже зарегистрирован на этот вечер',reserve:'Игрок уже находится в резерве',registration_closed:'Регистрация на вечер закрыта',sender_limit:'На один вечер можно отправить не больше 5 приглашений',unavailable_format:'Формат вечера недоступен этому игроку'};
    throw new Error(messages[candidate?.state||''] || (context.recipient_state === 'unavailable' || context.reason?.startsWith('recipient_') ? 'Игрок недоступен для приглашений' : 'Этот вечер недоступен для приглашения'));
  }
  const inviter = await db.get<any>('SELECT nickname FROM players WHERE id=? LIMIT 1',[inviterPlayerId]);
  const id=`evening_invite_${crypto.randomUUID()}`, now=new Date().toISOString();
  await db.run(`INSERT INTO player_evening_invitations (id,evening_id,inviter_player_id,recipient_player_id,status,created_at,updated_at) VALUES (?,?,?,?,'sent',?,?)`,[id,eveningId,inviterPlayerId,recipientPlayerId,now,now]);
  const starts=candidate.starts_at?new Date(String(candidate.starts_at)).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'скоро';
  await queuePersonalNotification(db, {
    notificationKey:`evening-invite:${id}`,
    playerId:recipientPlayerId,
    eventType:'evening_invite',
    entityId:id,
    text:`🎲 ${String(inviter?.nickname||'Игрок')} зовёт тебя на «${candidate.title}» · ${starts}.\n\nОткрой личный кабинет, чтобы посмотреть приглашение. Запись на вечер подтверждается отдельно.`,
    actionPath:`/player/events/${encodeURIComponent(eveningId)}`,
  });
  const invitation=await db.get<any>('SELECT * FROM player_evening_invitations WHERE id=?',[id]);
  return {invitation,created:true};
}
