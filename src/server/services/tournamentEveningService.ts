import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';
import { enqueueOrganizerNotification } from './organizerNotificationService.ts';

export const TOURNAMENT_PLAYER_CAPACITY = 10;
export type TournamentPaymentState = 'unpaid' | 'pending' | 'confirmed' | 'rejected' | 'waived' | 'refunded';

const nowIso = () => new Date().toISOString();
const integerRubles = (value: unknown) => Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const tournamentPlayerPath = (tournamentId: string) => `/player/events/${encodeURIComponent(tournamentId)}`;

/** The promoted reserve player must know which tournament, when, and that the entry fee is now due. */
async function reservePromotionText(db: DatabaseWrapper, tournamentId: string, playerId: string, manual: boolean, at = Date.now()) {
  const tournament = await db.get<any>('SELECT title, date, entry_fee_rub FROM tournaments WHERE id = ? LIMIT 1', [tournamentId]);
  // A player who already paid (or was exempted) before cancelling keeps that claim; never ask them to pay twice.
  const claim = await db.get<any>('SELECT state FROM tournament_payment_claims WHERE tournament_id = ? AND player_id = ? LIMIT 1', [tournamentId, playerId]);
  const alreadySettled = ['confirmed', 'pending', 'waived'].includes(String(claim?.state || ''));
  const when = tournament?.date && Number.isFinite(new Date(tournament.date).getTime())
    ? ` (${new Date(tournament.date).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })})`
    : '';
  const fee = Number(tournament?.entry_fee_rub || 0);
  return [
    `${manual ? 'Организатор дал вам место' : 'Освободилось место — оно ваше'} в составе турнира «${String(tournament?.title || 'Турнир')}»${when}.`,
    fee > 0 && !alreadySettled ? `Оплатите взнос ${fee.toLocaleString('ru-RU')} ₽ ${paymentDeadlineText(tournament?.date, at)} и отметьте оплату в приложении.` : '',
  ].filter(Boolean).join(' ');
}
const tournamentMutationTail = new WeakMap<DatabaseWrapper, Promise<unknown>>();

async function serializeTournamentMutation<T>(db: DatabaseWrapper, operation: () => Promise<T>): Promise<T> {
  const previous = tournamentMutationTail.get(db) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(operation);
  tournamentMutationTail.set(db, run);
  try {
    return await run;
  } finally {
    if (tournamentMutationTail.get(db) === run) tournamentMutationTail.delete(db);
  }
}

function shuffleArray<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

const requireOrganizerActor = (actorId: string | null | undefined) => {
  const actor = String(actorId || '').trim();
  if (!actor) throw new Error('ACTOR_REQUIRED');
  return actor;
};

export function validatePrizeConfiguration(total: unknown, allocations: unknown) {
  const prizeFund = integerRubles(total);
  if (prizeFund == null) return { ok: false as const, error: 'Призовой фонд должен быть неотрицательным целым числом рублей' };
  if (!Array.isArray(allocations)) return { ok: false as const, error: 'Распределение призов должно быть массивом' };
  const normalized = allocations.map((item: any, index: number) => ({
    place: String(item?.place || item?.label || `${index + 1}`).trim(),
    amount_rub: integerRubles(item?.amount_rub ?? item?.amount),
  }));
  if (normalized.some((item) => !item.place || item.amount_rub == null)) return { ok: false as const, error: 'Каждый приз должен иметь позицию и неотрицательную целую сумму в рублях' };
  const allocated = normalized.reduce((sum, item) => sum + Number(item.amount_rub), 0);
  return { ok: true as const, prizeFund, allocations: normalized, allocated, mismatch: allocated !== prizeFund };
}

export async function loadTournamentEvening(db: DatabaseWrapper, tournamentId: string, playerId?: string | null) {
  const tournament = await db.get<any>(`SELECT t.*, p.nickname AS judge_nickname FROM tournaments t LEFT JOIN players p ON p.id=t.judge_player_id WHERE t.id=? LIMIT 1`, [tournamentId]);
  if (!tournament || Number(tournament.tournament_evening_flow || 0) !== 1) return null;
  const registrations = await db.all<any>(`
    SELECT r.*,p.nickname,p.game_level,COALESCE(pc.state,'unpaid') AS payment_state,
      pc.player_note AS payment_note,pc.reported_amount_rub,pc.confirmed_amount_rub,
      pc.reported_at,pc.reviewed_at,pc.reviewed_by,pc.organizer_note
    FROM tournament_registrations r JOIN players p ON p.id=r.player_id
    LEFT JOIN tournament_payment_claims pc ON pc.tournament_id=r.tournament_id AND pc.player_id=r.player_id
    WHERE r.tournament_id=?
    ORDER BY CASE r.status WHEN 'confirmed' THEN 0 WHEN 'reserve' THEN 1 ELSE 2 END,
      CASE WHEN r.status='confirmed' THEN r.slot_number END ASC,
      CASE WHEN r.status='reserve' THEN r.queue_order END ASC,r.registered_at ASC,r.id ASC`, [tournamentId]);
  const confirmed = registrations.filter((row) => row.status === 'confirmed');
  const reserves = registrations.filter((row) => row.status === 'reserve');
  const me = playerId ? registrations.find((row) => row.player_id === playerId) || null : null;
  const entryFee = Number(tournament.entry_fee_rub || 0);
  const canonicalParticipants = await db.all<any>('SELECT id,player_id,participant_number FROM tournament_participants WHERE tournament_id=? ORDER BY participant_number ASC', [tournamentId]);
  const canonicalGames = await db.all<any>('SELECT id FROM tournament_games WHERE tournament_id=?', [tournamentId]);
  let canonicalSeatsCount = 0;
  for (const game of canonicalGames) {
    const count = await db.get<any>('SELECT COUNT(*) AS count FROM tournament_game_seats WHERE game_id=?', [game.id]);
    canonicalSeatsCount += Number(count?.count || 0);
  }
  const registrationIds = confirmed.map((row) => String(row.player_id));
  const canonicalIds = canonicalParticipants.map((row) => String(row.player_id));
  const rosterInSync = registrationIds.length === canonicalIds.length && registrationIds.every((id, index) => id === canonicalIds[index]);
  const startReadiness = {
    ready: confirmed.length === 10 && canonicalParticipants.length === 10 && rosterInSync && canonicalGames.length === 10 && canonicalSeatsCount === 100,
    confirmed_count: confirmed.length,
    participants_count: canonicalParticipants.length,
    games_count: canonicalGames.length,
    seats_count: canonicalSeatsCount,
    roster_in_sync: rosterInSync,
    seating_prepared: canonicalGames.length > 0,
  };
  const reportedRub = confirmed.reduce((sum, row) => sum + (row.payment_state === 'pending' ? Number(row.reported_amount_rub || 0) : 0), 0);
  const confirmedRub = confirmed.reduce((sum, row) => sum + (row.payment_state === 'confirmed' ? Number(row.confirmed_amount_rub || 0) : 0), 0);
  const unpaidCount = confirmed.filter((row) => {
    if (row.payment_state === 'waived') return false;
    return row.payment_state !== 'confirmed' || Number(row.confirmed_amount_rub || 0) < entryFee;
  }).length;
  return {
    ...tournament, format: 'TOURNAMENT',
    lifecycle: tournament.status === 'completed' ? 'completed' : ['active','correction'].includes(tournament.status) ? 'active' : tournament.registration_closed_at ? 'registration_closed' : tournament.published_at ? 'registration_open' : 'draft',
    player_capacity: TOURNAMENT_PLAYER_CAPACITY,
    prize_allocations: JSON.parse(tournament.prize_allocations_json || '[]'),
    confirmed_count: confirmed.length, remaining_places: Math.max(0, TOURNAMENT_PLAYER_CAPACITY-confirmed.length),
    registrations, confirmed, reserves, me, canonical_start_readiness: startReadiness,
    payment_totals: {
      expected_rub: confirmed.length * entryFee,
      reported_rub: reportedRub,
      confirmed_rub: confirmedRub,
      unpaid_count: unpaidCount,
    },
  };
}

async function audit(db: DatabaseWrapper,tournamentId:string,action:string,actorType:string,actorId?:string|null,playerId?:string|null,reason?:string|null,payload?:unknown) {
  if (actorType === 'organizer') requireOrganizerActor(actorId);
  if (actorType === 'system' && String(actorId || '') !== 'system') throw new Error('ACTOR_REQUIRED');
  await db.run(`INSERT INTO tournament_evening_audit (id,tournament_id,player_id,action,actor_type,actor_id,reason,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [crypto.randomUUID(),tournamentId,playerId||null,action,actorType,actorId||null,reason||null,payload==null?null:JSON.stringify(payload),nowIso()]);
}

async function assertManagedTournamentEvening(db: DatabaseWrapper, tournamentId: string) {
  const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id=? LIMIT 1', [tournamentId]);
  if (!tournament) throw new Error('TOURNAMENT_NOT_FOUND');
  if (Number(tournament.tournament_evening_flow || 0) !== 1) throw new Error('NOT_TOURNAMENT_EVENING');
  return tournament;
}

async function syncCanonicalParticipants(db: DatabaseWrapper,tournamentId:string) {
  const tournament=await assertManagedTournamentEvening(db,tournamentId);
  if(tournament.status!=='draft') throw new Error('ROSTER_LOCKED');
  const games=await db.get<any>('SELECT COUNT(*) AS count FROM tournament_games WHERE tournament_id=?',[tournamentId]);
  if(Number(games?.count||0)>0) throw new Error('ROSTER_ALREADY_SEATED');
  const confirmed=await db.all<any>(`SELECT r.player_id,r.slot_number,p.nickname FROM tournament_registrations r JOIN players p ON p.id=r.player_id WHERE r.tournament_id=? AND r.status='confirmed' ORDER BY r.slot_number ASC LIMIT 10`,[tournamentId]);
  const existing=await db.all<any>('SELECT id,player_id,participant_number,display_name FROM tournament_participants WHERE tournament_id=? ORDER BY participant_number ASC',[tournamentId]);
  const same=existing.length===confirmed.length && confirmed.every((row,index)=>String(existing[index]?.player_id||'')===String(row.player_id) && Number(existing[index]?.participant_number)===index+1);
  if(same) return;
  await db.run('DELETE FROM tournament_participants WHERE tournament_id=?',[tournamentId]);
  for(let index=0;index<confirmed.length;index+=1){const row=confirmed[index];await db.run(`INSERT INTO tournament_participants (id,tournament_id,player_id,display_name,participant_number) VALUES (?,?,?,?,?)`,[crypto.randomUUID(),tournamentId,row.player_id,row.nickname||`Игрок ${index+1}`,index+1]);}
}

export async function prepareTournamentEveningSeating(db: DatabaseWrapper, tournamentId: string, actorId?: string | null) {
  const actor = requireOrganizerActor(actorId);
  return serializeTournamentMutation(db, () => db.transaction(async (tx) => {
    const tournament = await assertManagedTournamentEvening(tx, tournamentId);
    if (tournament.status !== 'draft') throw new Error('ROSTER_LOCKED');
    const confirmed = await tx.all<any>("SELECT player_id,slot_number FROM tournament_registrations WHERE tournament_id=? AND status='confirmed' ORDER BY slot_number ASC", [tournamentId]);
    if (confirmed.length !== TOURNAMENT_PLAYER_CAPACITY) throw new Error('ROSTER_NOT_READY');
    const registrationIds = confirmed.map((row) => String(row.player_id));
    const existingGames = await tx.all<any>('SELECT id FROM tournament_games WHERE tournament_id=? ORDER BY game_number ASC', [tournamentId]);
    if (existingGames.length > 0) {
      const participants = await tx.all<any>('SELECT id,player_id,participant_number FROM tournament_participants WHERE tournament_id=? ORDER BY participant_number ASC', [tournamentId]);
      const canonicalIds = participants.map((row) => String(row.player_id));
      if (participants.length !== 10 || !registrationIds.every((id, index) => id === canonicalIds[index])) throw new Error('ROSTER_MISMATCH');
      let seats = 0;
      for (const game of existingGames) {
        const count = await tx.get<any>('SELECT COUNT(*) AS count FROM tournament_game_seats WHERE game_id=?', [game.id]);
        seats += Number(count?.count || 0);
      }
      if (existingGames.length === 10 && seats === 100) return { ready: true, participants_count: 10, games_count: 10, seats_count: 100, already_prepared: true };
      throw new Error('ROSTER_ALREADY_SEATED');
    }
    await syncCanonicalParticipants(tx, tournamentId);
    const participants = await tx.all<any>('SELECT id,player_id,participant_number FROM tournament_participants WHERE tournament_id=? ORDER BY participant_number ASC', [tournamentId]);
    const canonicalIds = participants.map((row) => String(row.player_id));
    if (participants.length !== 10 || !registrationIds.every((id, index) => id === canonicalIds[index])) throw new Error('ROSTER_MISMATCH');
    for (let gameNumber = 1; gameNumber <= 10; gameNumber += 1) {
      const gameId = crypto.randomUUID();
      await tx.run(`INSERT INTO tournament_games (id,tournament_id,game_number,judge_name,status) VALUES (?,?,?,?, 'planned')`, [gameId, tournamentId, gameNumber, tournament.chief_judge_name || null]);
      const shuffled = shuffleArray(participants);
      for (let seatIndex = 0; seatIndex < 10; seatIndex += 1) {
        await tx.run(`INSERT INTO tournament_game_seats (id,game_id,participant_id,seat_number,role) VALUES (?,?,?,?,NULL)`, [crypto.randomUUID(), gameId, shuffled[seatIndex].id, seatIndex + 1]);
      }
    }
    const preparedAt = nowIso();
    await tx.run('UPDATE tournaments SET tournament_evening_seating_prepared_at=?,updated_at=? WHERE id=?', [preparedAt, preparedAt, tournamentId]);
    await audit(tx, tournamentId, 'prepare_seating', 'organizer', actor, null, 'canonical tournament seating generated', { participants_count: 10, games_count: 10, seats_count: 100 });
    return { ready: true, participants_count: 10, games_count: 10, seats_count: 100, already_prepared: false };
  }));
}

async function nextFreeSlot(db: DatabaseWrapper,tournamentId:string) {
  const rows=await db.all<any>("SELECT slot_number FROM tournament_registrations WHERE tournament_id=? AND status='confirmed' AND slot_number IS NOT NULL",[tournamentId]);
  const occupied=new Set(rows.map((row)=>Number(row.slot_number)));
  for(let slot=1;slot<=TOURNAMENT_PLAYER_CAPACITY;slot+=1) if(!occupied.has(slot)) return slot;
  return null;
}

async function renumberReserve(db: DatabaseWrapper,tournamentId:string,preferredIds?:string[]) {
  let rows: any[];
  if(preferredIds){
    const current=await db.all<any>("SELECT id FROM tournament_registrations WHERE tournament_id=? AND status='reserve'",[tournamentId]);
    const currentIds=current.map((row)=>String(row.id));
    if(preferredIds.length!==currentIds.length || new Set(preferredIds).size!==preferredIds.length || currentIds.some((id)=>!preferredIds.includes(id))) throw new Error('INVALID_RESERVE_ORDER');
    rows=preferredIds.map((id)=>({id}));
  }else{
    // Waiting «Играю» answers get a free place before «Готов подменить» (user-approved 2026-09-24).
    rows=await db.all<any>(`SELECT id FROM tournament_registrations WHERE tournament_id=? AND status='reserve' ORDER BY CASE COALESCE(response,'play') WHEN 'play' THEN 0 ELSE 1 END,COALESCE(queue_order,2147483647),registered_at ASC,id ASC`,[tournamentId]);
  }
  const now=nowIso();
  for(let i=0;i<rows.length;i+=1) await db.run('UPDATE tournament_registrations SET queue_order=?,updated_at=? WHERE id=?',[i+1,now,rows[i].id]);
}

async function assertEligiblePlayer(db:DatabaseWrapper,tournament:any,playerId:string){
  if(String(tournament.judge_player_id||'')===playerId) throw new Error('JUDGE_CANNOT_REGISTER');
  const player=await db.get<any>('SELECT id,nickname,game_level FROM players WHERE id=? LIMIT 1',[playerId]);
  if(!player||!playerLevelAllowsEveningFormat(player.game_level,'TOURNAMENT')) throw new Error('NOT_ELIGIBLE');
  return player;
}

async function upsertRegistration(db:DatabaseWrapper,tournamentId:string,playerId:string,actorType:'player'|'organizer',actorId?:string|null,reason?:string|null){
  const tournament=await assertManagedTournamentEvening(db,tournamentId);
  if(tournament.status!=='draft') throw new Error('ROSTER_LOCKED');
  const games=await db.get<any>('SELECT COUNT(*) AS count FROM tournament_games WHERE tournament_id=?',[tournamentId]);
  if(Number(games?.count||0)>0) throw new Error('ROSTER_ALREADY_SEATED');
  if(actorType==='player'&&(!tournament.published_at||tournament.registration_closed_at)) throw new Error('REGISTRATION_CLOSED');
  if(actorType==='organizer') requireOrganizerActor(actorId);
  await assertEligiblePlayer(db,tournament,playerId);
  const existing=await db.get<any>('SELECT * FROM tournament_registrations WHERE tournament_id=? AND player_id=? LIMIT 1',[tournamentId,playerId]);
  if(existing&&['confirmed','reserve'].includes(existing.status)) return existing;
  const slot=await nextFreeSlot(db,tournamentId);
  const status=slot==null?'reserve':'confirmed'; const id=existing?.id||crypto.randomUUID(); const now=nowIso();
  // Registering (or being added by the organizer) is the «Играю» answer.
  if(existing) await db.run(`UPDATE tournament_registrations SET status=?,slot_number=?,registered_at=?,queue_order=NULL,response='play',cancelled_at=NULL,updated_at=?,organizer_reason=? WHERE id=?`,[status,slot,now,now,reason||null,id]);
  else await db.run(`INSERT INTO tournament_registrations (id,tournament_id,player_id,status,slot_number,response,registered_at,updated_at,organizer_reason) VALUES (?,?,?,?,?,'play',?,?,?)`,[id,tournamentId,playerId,status,slot,now,now,reason||null]);
  await renumberReserve(db,tournamentId); await syncCanonicalParticipants(db,tournamentId);
  await audit(db,tournamentId,actorType==='player'?'register':'organizer_add',actorType,actorId||playerId,playerId,reason||null,{status,slot_number:slot});
  return db.get<any>('SELECT * FROM tournament_registrations WHERE id=?',[id]);
}

export async function registerTournamentPlayer(db:DatabaseWrapper,tournamentId:string,playerId:string){return serializeTournamentMutation(db,()=>db.transaction((tx)=>upsertRegistration(tx,tournamentId,playerId,'player',playerId)));}
export async function organizerAddTournamentPlayer(db:DatabaseWrapper,tournamentId:string,playerId:string,reason:string,actorId?:string|null){if(!reason.trim())throw new Error('REASON_REQUIRED');const actor=requireOrganizerActor(actorId);return serializeTournamentMutation(db,()=>db.transaction((tx)=>upsertRegistration(tx,tournamentId,playerId,'organizer',actor,reason.trim())));}

export async function reorderTournamentReserve(db:DatabaseWrapper,tournamentId:string,registrationIds:string[],reason:string,actorId?:string|null){
  if(!reason.trim()) throw new Error('REASON_REQUIRED'); const actor=requireOrganizerActor(actorId);
  return serializeTournamentMutation(db,()=>db.transaction(async(tx)=>{const tournament=await assertManagedTournamentEvening(tx,tournamentId);if(tournament.status!=='draft')throw new Error('ROSTER_LOCKED');const games=await tx.get<any>('SELECT COUNT(*) AS count FROM tournament_games WHERE tournament_id=?',[tournamentId]);if(Number(games?.count||0)>0)throw new Error('ROSTER_ALREADY_SEATED');await renumberReserve(tx,tournamentId,registrationIds);await audit(tx,tournamentId,'reserve_reorder','organizer',actor,null,reason,{registration_ids:registrationIds});return loadTournamentEvening(tx,tournamentId);}));
}

export async function promoteTournamentReserve(db:DatabaseWrapper,tournamentId:string,playerId:string,reason:string,actorId?:string|null){
  if(!reason.trim())throw new Error('REASON_REQUIRED'); const actor=requireOrganizerActor(actorId); let promotedName='';
  const promoted=await serializeTournamentMutation(db,()=>db.transaction(async(tx)=>{const tournament=await assertManagedTournamentEvening(tx,tournamentId);if(tournament.status!=='draft')throw new Error('ROSTER_LOCKED');const games=await tx.get<any>('SELECT COUNT(*) AS count FROM tournament_games WHERE tournament_id=?',[tournamentId]);if(Number(games?.count||0)>0)throw new Error('ROSTER_ALREADY_SEATED');const row=await tx.get<any>("SELECT r.*,p.nickname FROM tournament_registrations r JOIN players p ON p.id=r.player_id WHERE r.tournament_id=? AND r.player_id=? AND r.status='reserve'",[tournamentId,playerId]);if(!row)throw new Error('NOT_IN_RESERVE');promotedName=String(row.nickname||'Игрок');const slot=await nextFreeSlot(tx,tournamentId);if(slot==null)throw new Error('TOURNAMENT_FULL');const now=nowIso();await tx.run("UPDATE tournament_registrations SET status='confirmed',slot_number=?,queue_order=NULL,updated_at=?,organizer_reason=? WHERE id=?",[slot,now,reason,row.id]);await renumberReserve(tx,tournamentId);await syncCanonicalParticipants(tx,tournamentId);await audit(tx,tournamentId,'manual_promote','organizer',actor,playerId,reason,{slot_number:slot});return {playerId,slot};}));
  await queuePersonalNotification(db,{notificationKey:`tournament:${tournamentId}:manual-promotion:${playerId}:${nowIso()}`,playerId,eventType:'tournament_reserve_promoted',entityId:tournamentId,text:await reservePromotionText(db,tournamentId,playerId,true),actionPath:tournamentPlayerPath(tournamentId)});
  await enqueueOrganizerNotification(db,{messageKey:`tournament:${tournamentId}:manual-promotion:${playerId}:${nowIso()}`,eventType:'tournament_reserve_promoted',entityId:tournamentId,text:`♟ ${promotedName} вручную получил(а) место в составе турнира.`});
  return promoted;
}

export async function cancelTournamentRegistration(db:DatabaseWrapper,tournamentId:string,playerId:string,actorType:'player'|'organizer'='player',actorId?:string|null,reason?:string|null){
  const actor = actorType === 'organizer' ? requireOrganizerActor(actorId) : playerId;
  let promotedPlayerId:string|null=null; let promotedName='';
  const result=await serializeTournamentMutation(db,()=>db.transaction(async(tx)=>{const tournament=await assertManagedTournamentEvening(tx,tournamentId);if(tournament.status!=='draft')throw new Error('ROSTER_LOCKED');const games=await tx.get<any>('SELECT COUNT(*) AS count FROM tournament_games WHERE tournament_id=?',[tournamentId]);if(Number(games?.count||0)>0)throw new Error('ROSTER_ALREADY_SEATED');const registration=await tx.get<any>('SELECT * FROM tournament_registrations WHERE tournament_id=? AND player_id=? LIMIT 1',[tournamentId,playerId]);if(!registration||['cancelled','declined'].includes(registration.status))return{cancelled:false,promotedPlayerId:null};const wasConfirmed=registration.status==='confirmed';const freedSlot=registration.slot_number;const now=nowIso();await tx.run("UPDATE tournament_registrations SET status='cancelled',slot_number=NULL,queue_order=NULL,response=CASE WHEN ?='player' THEN 'declined' ELSE response END,cancelled_at=?,updated_at=?,organizer_reason=? WHERE id=?",[actorType,now,now,reason||null,registration.id]);await audit(tx,tournamentId,'cancel',actorType,actor,playerId,reason||null);if(wasConfirmed&&freedSlot!=null){await renumberReserve(tx,tournamentId);const [next]=await fillFreeSlots(tx,tournament,now);if(next){promotedPlayerId=next.player_id;promotedName=next.nickname;}}await renumberReserve(tx,tournamentId);await syncCanonicalParticipants(tx,tournamentId);return{cancelled:true,promotedPlayerId};}));
  if(promotedPlayerId){await queuePersonalNotification(db,{notificationKey:`tournament:${tournamentId}:promotion:${promotedPlayerId}:${nowIso()}`,playerId:promotedPlayerId,eventType:'tournament_reserve_promoted',entityId:tournamentId,text:await reservePromotionText(db,tournamentId,promotedPlayerId,false),actionPath:tournamentPlayerPath(tournamentId)});await enqueueOrganizerNotification(db,{messageKey:`tournament:${tournamentId}:promotion:${promotedPlayerId}:${nowIso()}`,eventType:'tournament_reserve_promoted',entityId:tournamentId,text:`♟ ${promotedName} автоматически получил(а) освободившееся место в турнире.`});}
  return result;
}

export async function notifyTournamentAudience(db:DatabaseWrapper,tournamentId:string){
  const tournament=await assertManagedTournamentEvening(db,tournamentId);
  const players=await db.all<any>("SELECT id FROM players WHERE game_level='tournament' AND id <> COALESCE(?, '')",[tournament.judge_player_id]);
  let queued=0; const failedPlayerIds:string[]=[];
  for(const player of players){
    try {
      const result=await queuePersonalNotification(db,{notificationKey:`tournament:${tournamentId}:published:${player.id}`,playerId:String(player.id),eventType:'tournament_published',entityId:tournamentId,text:`Открыта запись на турнир «${tournament.title}». ${tournament.venue || ''}`.trim(),actionPath:tournamentPlayerPath(tournamentId)});
      if(result?.created)queued+=1;
    } catch (error) {
      failedPlayerIds.push(String(player.id));
      console.warn('[tournament-evening] player notification failed', tournamentId, player.id, error);
    }
  }
  return {eligible_players:players.length,queued,failed_player_ids:failedPlayerIds,complete:failedPlayerIds.length===0};
}

export async function reportTournamentPayment(db:DatabaseWrapper,tournamentId:string,playerId:string,amountRub:unknown,note?:string|null){
  const tournament=await assertManagedTournamentEvening(db,tournamentId);if(!tournament.published_at)throw new Error('TOURNAMENT_NOT_FOUND');
  const amount=integerRubles(amountRub);if(amount==null)throw new Error('INVALID_PAYMENT_AMOUNT');
  const registration=await db.get<any>("SELECT id FROM tournament_registrations WHERE tournament_id=? AND player_id=? AND status IN ('confirmed','reserve') LIMIT 1",[tournamentId,playerId]);if(!registration)throw new Error('NOT_REGISTERED');
  const current=await db.get<any>('SELECT * FROM tournament_payment_claims WHERE tournament_id=? AND player_id=? LIMIT 1',[tournamentId,playerId]);
  const cleanNote=note?.trim().slice(0,250)||null;
  if(current&&['confirmed','waived','refunded'].includes(String(current.state))) throw new Error('PAYMENT_REVIEW_REQUIRED');
  if(current?.state==='pending'&&Number(current.reported_amount_rub)===amount&&String(current.player_note||'')===String(cleanNote||''))return current;
  const now=nowIso();
  await db.run(`INSERT INTO tournament_payment_claims (id,tournament_id,player_id,state,reported_amount_rub,player_note,reported_at,updated_at) VALUES (?,?,?,'pending',?,?,?,?) ON CONFLICT(tournament_id,player_id) DO UPDATE SET state='pending',reported_amount_rub=excluded.reported_amount_rub,player_note=excluded.player_note,reported_at=excluded.reported_at,updated_at=excluded.updated_at`,[crypto.randomUUID(),tournamentId,playerId,amount,cleanNote,now,now]);
  await audit(db,tournamentId,'payment_reported','player',playerId,playerId,cleanNote,{previous_state:current?.state||'unpaid',previous_reported_amount_rub:current?.reported_amount_rub??null,reported_amount_rub:amount});
  return db.get<any>('SELECT * FROM tournament_payment_claims WHERE tournament_id=? AND player_id=?',[tournamentId,playerId]);
}

export async function reviewTournamentPayment(db:DatabaseWrapper,tournamentId:string,playerId:string,state:TournamentPaymentState,actorId:string|null,amountRub?:unknown,note?:string|null){
  await assertManagedTournamentEvening(db,tournamentId);const actor=requireOrganizerActor(actorId);
  if(!['confirmed','rejected','waived','refunded','unpaid'].includes(state))throw new Error('INVALID_PAYMENT_STATE');
  const registration=await db.get<any>('SELECT id FROM tournament_registrations WHERE tournament_id=? AND player_id=? LIMIT 1',[tournamentId,playerId]);if(!registration)throw new Error('NOT_REGISTERED');
  const current=await db.get<any>('SELECT * FROM tournament_payment_claims WHERE tournament_id=? AND player_id=? LIMIT 1',[tournamentId,playerId]);
  const cleanNote=note?.trim().slice(0,250)||null;
  let confirmedAmount:number|null=current?.confirmed_amount_rub==null?null:Number(current.confirmed_amount_rub);
  if(state==='confirmed') { const parsed=integerRubles(amountRub); if(parsed==null)throw new Error('INVALID_PAYMENT_AMOUNT'); confirmedAmount=parsed; }
  if(state==='waived') confirmedAmount=0;
  if(state==='rejected'||state==='unpaid') confirmedAmount=null;
  if(state==='refunded'&&amountRub!==undefined){const parsed=integerRubles(amountRub);if(parsed==null)throw new Error('INVALID_PAYMENT_AMOUNT');confirmedAmount=parsed;}
  if(current?.state===state&&Number(current?.confirmed_amount_rub??-1)===Number(confirmedAmount??-1)&&String(current?.organizer_note||'')===String(cleanNote||''))return current;
  const now=nowIso();
  await db.run(`INSERT INTO tournament_payment_claims (id,tournament_id,player_id,state,confirmed_amount_rub,reviewed_at,reviewed_by,organizer_note,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(tournament_id,player_id) DO UPDATE SET state=excluded.state,confirmed_amount_rub=excluded.confirmed_amount_rub,reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by,organizer_note=excluded.organizer_note,updated_at=excluded.updated_at`,[crypto.randomUUID(),tournamentId,playerId,state,confirmedAmount,now,actor,cleanNote,now]);
  await audit(db,tournamentId,`payment_${state}`,'organizer',actor,playerId,cleanNote,{previous_state:current?.state||'unpaid',previous_confirmed_amount_rub:current?.confirmed_amount_rub??null,confirmed_amount_rub:confirmedAmount,reported_amount_rub:current?.reported_amount_rub??null});
  await queuePersonalNotification(db,{notificationKey:`tournament:${tournamentId}:payment:${playerId}:${state}:${confirmedAmount??'none'}:${now}`,playerId,eventType:'tournament_payment_reviewed',entityId:tournamentId,text:state==='confirmed'?`Организатор подтвердил оплату турнирного взноса: ${confirmedAmount} ₽.`:state==='rejected'?'Организатор не подтвердил оплату. Проверьте комментарий в турнире.':`Статус турнирного взноса изменён: ${state}.`,actionPath:tournamentPlayerPath(tournamentId)});
  return db.get<any>('SELECT * FROM tournament_payment_claims WHERE tournament_id=? AND player_id=?',[tournamentId,playerId]);
}


// ─── Tournament answers and payment deadlines (user-approved 2026-09-24) ───────────────────────
export type TournamentResponse = 'play' | 'substitute' | 'thinking' | 'declined';
export const TOURNAMENT_RESPONSES: TournamentResponse[] = ['play', 'substitute', 'thinking', 'declined'];
const HOUR = 3_600_000;
export const TOURNAMENT_PAY_FIRST_DEADLINE_HOURS = 72;
export const TOURNAMENT_PAY_LAST_DEADLINE_HOURS = 24;
const REMINDER_HOURS = 96;
const SETTLED_PAYMENT = ['confirmed', 'pending', 'waived'];

const moscow = (ms: number) => new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/** «до 12 октября, 19:00» — the deadline that applies to a player given a place now. */
export function paymentDeadlineText(date: unknown, now: number) {
  const start = new Date(String(date || '')).getTime();
  if (!Number.isFinite(start)) return 'до начала турнира';
  const first = start - TOURNAMENT_PAY_FIRST_DEADLINE_HOURS * HOUR;
  const last = start - TOURNAMENT_PAY_LAST_DEADLINE_HOURS * HOUR;
  if (now < first) return `до ${moscow(first)}`;
  if (now < last) return `до ${moscow(last)}`;
  return 'на месте до первой игры';
}

/**
 * Fill free places: waiting «Играю» first (answer order); «Готов подменить» only once the 3-day
 * deadline has passed — before it, the places stay open for players who want to play.
 */
async function fillFreeSlots(db: DatabaseWrapper, tournament: any, now: string) {
  const promoted: Array<{ player_id: string; nickname: string }> = [];
  const substitutesAllowed = Boolean(tournament?.payment_deadline_72_done_at);
  for (;;) {
    const slot = await nextFreeSlot(db, String(tournament.id));
    if (slot == null) break;
    const next = await db.get<any>(
      `SELECT r.*,p.nickname FROM tournament_registrations r JOIN players p ON p.id=r.player_id
        WHERE r.tournament_id=? AND r.status='reserve' ${substitutesAllowed ? '' : "AND COALESCE(r.response,'play')='play'"}
        ORDER BY CASE COALESCE(r.response,'play') WHEN 'play' THEN 0 ELSE 1 END,COALESCE(r.queue_order,2147483647),r.registered_at ASC,r.id ASC LIMIT 1`,
      [tournament.id],
    );
    if (!next) break;
    await db.run("UPDATE tournament_registrations SET status='confirmed',slot_number=?,queue_order=NULL,response='play',called_at=?,updated_at=? WHERE id=?", [slot, now, now, next.id]);
    await audit(db, String(tournament.id), 'promote_from_reserve', 'system', 'system', String(next.player_id), 'vacancy promotion', { slot_number: slot, from: next.response || 'play' });
    promoted.push({ player_id: String(next.player_id), nickname: String(next.nickname || 'Игрок') });
  }
  if (promoted.length) { await renumberReserve(db, String(tournament.id)); await syncCanonicalParticipants(db, String(tournament.id)); }
  return promoted;
}

async function notifyPromoted(db: DatabaseWrapper, tournamentId: string, promoted: Array<{ player_id: string; nickname: string }>, at = Date.now()) {
  for (const item of promoted) {
    const stamp = nowIso();
    await queuePersonalNotification(db, { notificationKey: `tournament:${tournamentId}:promotion:${item.player_id}:${stamp}`, playerId: item.player_id, eventType: 'tournament_reserve_promoted', entityId: tournamentId, text: await reservePromotionText(db, tournamentId, item.player_id, false, at), actionPath: tournamentPlayerPath(tournamentId) });
    await enqueueOrganizerNotification(db, { messageKey: `tournament:${tournamentId}:promotion:${item.player_id}:${stamp}`, eventType: 'tournament_reserve_promoted', entityId: tournamentId, text: `♟ ${item.nickname} получил(а) освободившееся место в турнире.` });
  }
}

/**
 * The player's answer to a tournament. «Играю» claims a place (or waits for one), «Готов подменить»
 * waits to be called in, «Пока думаю» / «Не смогу» hold nothing. Leaving a place frees it for the next.
 */
export async function answerTournament(db: DatabaseWrapper, tournamentId: string, playerId: string, response: TournamentResponse) {
  if (!TOURNAMENT_RESPONSES.includes(response)) throw new Error('INVALID_RESPONSE');
  let promoted: Array<{ player_id: string; nickname: string }> = [];
  await serializeTournamentMutation(db, () => db.transaction(async (tx) => {
    const tournament = await assertManagedTournamentEvening(tx, tournamentId);
    if (tournament.status !== 'draft') throw new Error('ROSTER_LOCKED');
    const games = await tx.get<any>('SELECT COUNT(*) AS count FROM tournament_games WHERE tournament_id=?', [tournamentId]);
    if (Number(games?.count || 0) > 0) throw new Error('ROSTER_ALREADY_SEATED');
    if (!tournament.published_at || tournament.registration_closed_at) throw new Error('REGISTRATION_CLOSED');
    await assertEligiblePlayer(tx, tournament, playerId);
    const existing = await tx.get<any>('SELECT * FROM tournament_registrations WHERE tournament_id=? AND player_id=? LIMIT 1', [tournamentId, playerId]);
    const now = nowIso();
    const id = existing?.id || crypto.randomUUID();
    const holdsPlace = existing?.status === 'confirmed';
    if (response === 'play') {
      if (holdsPlace) { await tx.run("UPDATE tournament_registrations SET response='play',updated_at=? WHERE id=?", [now, id]); return; }
      const slot = await nextFreeSlot(tx, tournamentId);
      const waiting = await tx.get<any>("SELECT 1 FROM tournament_registrations WHERE tournament_id=? AND status='reserve' AND COALESCE(response,'play')='play' AND player_id<>? LIMIT 1", [tournamentId, playerId]);
      // A free place goes to someone already waiting to play before a newcomer.
      const status = slot != null && !waiting ? 'confirmed' : 'reserve';
      const queue = existing?.status === 'reserve' && (existing.response || 'play') === 'play' ? existing.queue_order : 2147483000;
      if (existing) await tx.run('UPDATE tournament_registrations SET status=?,slot_number=?,queue_order=?,response=\'play\',cancelled_at=NULL,updated_at=? WHERE id=?', [status, status === 'confirmed' ? slot : null, status === 'reserve' ? queue : null, now, id]);
      else await tx.run("INSERT INTO tournament_registrations (id,tournament_id,player_id,status,slot_number,queue_order,response,registered_at,updated_at) VALUES (?,?,?,?,?,?,'play',?,?)", [id, tournamentId, playerId, status, status === 'confirmed' ? slot : null, status === 'reserve' ? queue : null, now, now]);
    } else if (response === 'substitute') {
      const queue = existing?.status === 'reserve' && existing.response === 'substitute' ? existing.queue_order : 2147483000;
      if (existing) await tx.run("UPDATE tournament_registrations SET status='reserve',slot_number=NULL,queue_order=?,response='substitute',cancelled_at=NULL,updated_at=? WHERE id=?", [queue, now, id]);
      else await tx.run("INSERT INTO tournament_registrations (id,tournament_id,player_id,status,queue_order,response,registered_at,updated_at) VALUES (?,?,?,'reserve',?,'substitute',?,?)", [id, tournamentId, playerId, queue, now, now]);
    } else {
      if (existing) await tx.run("UPDATE tournament_registrations SET status='cancelled',slot_number=NULL,queue_order=NULL,response=?,cancelled_at=?,updated_at=? WHERE id=?", [response, now, now, id]);
      else await tx.run("INSERT INTO tournament_registrations (id,tournament_id,player_id,status,response,registered_at,cancelled_at,updated_at) VALUES (?,?,?,'cancelled',?,?,?,?)", [id, tournamentId, playerId, response, now, now, now]);
    }
    await audit(tx, tournamentId, `answer_${response}`, 'player', playerId, playerId, null, { held_place: holdsPlace });
    await renumberReserve(tx, tournamentId);
    // Any answer can open or take a place (e.g. a substitute after the 3-day deadline): refill every time.
    promoted = await fillFreeSlots(tx, tournament, now);
    await syncCanonicalParticipants(tx, tournamentId);
  }));
  await notifyPromoted(db, tournamentId, promoted);
  return loadTournamentEvening(db, tournamentId, playerId);
}

/**
 * Payment deadlines, run by the notification worker:
 * - 4 days before: remind unpaid place holders; ask «Пока думаю» what they decided;
 * - 3 days before: unpaid place holders become «Готов подменить», the places go to the next;
 * - 24 hours before: the same for players called in after the first deadline.
 */
export async function enforceTournamentPaymentDeadlines(db: DatabaseWrapper, now = Date.now()) {
  const tables = new Set((await db.all<any>("SELECT name FROM sqlite_master WHERE type='table'")).map((row: any) => String(row.name)));
  if (!tables.has('tournament_registrations') || !tables.has('tournament_payment_claims')) return 0;
  const tournaments = await db.all<any>(
    `SELECT * FROM tournaments WHERE tournament_evening_flow=1 AND status='draft' AND published_at IS NOT NULL
      AND datetime(date) > datetime(?) AND datetime(date) <= datetime(?)`,
    [new Date(now).toISOString(), new Date(now + (REMINDER_HOURS + 1) * HOUR).toISOString()],
  );
  let actions = 0;
  for (const tournament of tournaments) {
    const tournamentId = String(tournament.id);
    const start = new Date(String(tournament.date)).getTime();
    const fee = Number(tournament.entry_fee_rub || 0);
    const seated = await db.get<any>('SELECT COUNT(*) AS count FROM tournament_games WHERE tournament_id=?', [tournamentId]);
    if (Number(seated?.count || 0) > 0) continue;
    const title = String(tournament.title || 'Турнир');
    // `calledBefore`: a deadline only applies to players who got their place before it; anyone called
    // in after it (including during a catch-up run) keeps the place and pays by the next deadline or on site.
    const unpaidHolders = (conn: DatabaseWrapper = db, calledBefore?: string) => conn.all<any>(
      `SELECT r.*,p.nickname FROM tournament_registrations r JOIN players p ON p.id=r.player_id
        LEFT JOIN tournament_payment_claims pc ON pc.tournament_id=r.tournament_id AND pc.player_id=r.player_id
        WHERE r.tournament_id=? AND r.status='confirmed' AND COALESCE(pc.state,'unpaid') NOT IN (${SETTLED_PAYMENT.map(() => '?').join(',')})
          ${calledBefore ? 'AND (r.called_at IS NULL OR datetime(r.called_at) < datetime(?))' : ''}`,
      calledBefore ? [tournamentId, ...SETTLED_PAYMENT, calledBefore] : [tournamentId, ...SETTLED_PAYMENT],
    );

    if (now >= start - REMINDER_HOURS * HOUR && now < start - TOURNAMENT_PAY_FIRST_DEADLINE_HOURS * HOUR) {
      if (fee > 0) for (const row of await unpaidHolders()) {
        const created = await queuePersonalNotification(db, { notificationKey: `tournament:${tournamentId}:pay-reminder:${row.player_id}`, playerId: String(row.player_id), eventType: 'tournament_payment_reminder', entityId: tournamentId, text: `💳 Турнир «${title}» уже скоро. Чтобы сохранить место, оплатите взнос ${fee.toLocaleString('ru-RU')} ₽ ${paymentDeadlineText(tournament.date, now)} и отметьте оплату в приложении.`, actionPath: tournamentPlayerPath(tournamentId) });
        if (created?.created) actions += 1;
      }
      for (const row of await db.all<any>("SELECT player_id FROM tournament_registrations WHERE tournament_id=? AND response='thinking'", [tournamentId])) {
        const created = await queuePersonalNotification(db, { notificationKey: `tournament:${tournamentId}:thinking:${row.player_id}`, playerId: String(row.player_id), eventType: 'tournament_thinking_followup', entityId: tournamentId, text: `🤔 Что решил насчёт турнира «${title}»? Ответь в приложении: играю, готов подменить или не смогу.`, actionPath: tournamentPlayerPath(tournamentId) });
        if (created?.created) actions += 1;
      }
    }

    for (const [hours, column] of [[TOURNAMENT_PAY_FIRST_DEADLINE_HOURS, 'payment_deadline_72_done_at'], [TOURNAMENT_PAY_LAST_DEADLINE_HOURS, 'payment_deadline_24_done_at']] as const) {
      if (now < start - hours * HOUR || tournament[column]) continue;
      const demoted: Array<{ player_id: string; nickname: string }> = [];
      let promoted: Array<{ player_id: string; nickname: string }> = [];
      await serializeTournamentMutation(db, () => db.transaction(async (tx) => {
        const stamp = new Date(now).toISOString();
        const claimed = await tx.run(`UPDATE tournaments SET ${column}=?,updated_at=? WHERE id=? AND ${column} IS NULL`, [stamp, stamp, tournamentId]);
        if (!claimed.changes) return;
        const fresh = await tx.get<any>('SELECT * FROM tournaments WHERE id=?', [tournamentId]);
        if (fee > 0) for (const row of await unpaidHolders(tx, new Date(start - hours * HOUR).toISOString())) {
          await tx.run("UPDATE tournament_registrations SET status='reserve',slot_number=NULL,queue_order=2147483000,response='substitute',updated_at=? WHERE id=?", [stamp, row.id]);
          await audit(tx, tournamentId, 'payment_deadline_release', 'system', 'system', String(row.player_id), `unpaid at ${hours}h`, null);
          demoted.push({ player_id: String(row.player_id), nickname: String(row.nickname || 'Игрок') });
        }
        await renumberReserve(tx, tournamentId);
        promoted = await fillFreeSlots(tx, fresh, stamp);
        await syncCanonicalParticipants(tx, tournamentId);
      }));
      for (const item of demoted) {
        await queuePersonalNotification(db, { notificationKey: `tournament:${tournamentId}:released:${hours}:${item.player_id}`, playerId: item.player_id, eventType: 'tournament_place_released', entityId: tournamentId, text: `Взнос за турнир «${title}» не оплачен к сроку, поэтому место передано следующему игроку. Вы в списке «Готов подменить» — если место освободится, мы сообщим.`, actionPath: tournamentPlayerPath(tournamentId) });
      }
      if (demoted.length) await enqueueOrganizerNotification(db, { messageKey: `tournament:${tournamentId}:released:${hours}`, eventType: 'tournament_place_released', entityId: tournamentId, text: `♟ Турнир «${title}»: не оплатили к сроку и переведены в «Готов подменить»: ${demoted.map((item) => item.nickname).join(', ')}.` });
      await notifyPromoted(db, tournamentId, promoted, now);
      actions += demoted.length + promoted.length;
    }
  }
  return actions;
}
