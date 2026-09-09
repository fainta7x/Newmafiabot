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
    rows=await db.all<any>(`SELECT id FROM tournament_registrations WHERE tournament_id=? AND status='reserve' ORDER BY COALESCE(queue_order,2147483647),registered_at ASC,id ASC`,[tournamentId]);
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
  if(existing) await db.run(`UPDATE tournament_registrations SET status=?,slot_number=?,registered_at=?,queue_order=NULL,cancelled_at=NULL,updated_at=?,organizer_reason=? WHERE id=?`,[status,slot,now,now,reason||null,id]);
  else await db.run(`INSERT INTO tournament_registrations (id,tournament_id,player_id,status,slot_number,registered_at,updated_at,organizer_reason) VALUES (?,?,?,?,?,?,?,?)`,[id,tournamentId,playerId,status,slot,now,now,reason||null]);
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
  await queuePersonalNotification(db,{notificationKey:`tournament:${tournamentId}:manual-promotion:${playerId}`,playerId,eventType:'tournament_reserve_promoted',entityId:tournamentId,text:'Организатор перевёл вас из резерва в основной состав турнира.',actionPath:tournamentPlayerPath(tournamentId)});
  await enqueueOrganizerNotification(db,{messageKey:`tournament:${tournamentId}:manual-promotion:${playerId}`,eventType:'tournament_reserve_promoted',entityId:tournamentId,text:`♟ ${promotedName} вручную переведён(а) из резерва в основной состав турнира.`});
  return promoted;
}

export async function cancelTournamentRegistration(db:DatabaseWrapper,tournamentId:string,playerId:string,actorType:'player'|'organizer'='player',actorId?:string|null,reason?:string|null){
  const actor = actorType === 'organizer' ? requireOrganizerActor(actorId) : playerId;
  let promotedPlayerId:string|null=null; let promotedName='';
  const result=await serializeTournamentMutation(db,()=>db.transaction(async(tx)=>{const tournament=await assertManagedTournamentEvening(tx,tournamentId);if(tournament.status!=='draft')throw new Error('ROSTER_LOCKED');const games=await tx.get<any>('SELECT COUNT(*) AS count FROM tournament_games WHERE tournament_id=?',[tournamentId]);if(Number(games?.count||0)>0)throw new Error('ROSTER_ALREADY_SEATED');const registration=await tx.get<any>('SELECT * FROM tournament_registrations WHERE tournament_id=? AND player_id=? LIMIT 1',[tournamentId,playerId]);if(!registration||['cancelled','declined'].includes(registration.status))return{cancelled:false,promotedPlayerId:null};const wasConfirmed=registration.status==='confirmed';const freedSlot=registration.slot_number;const now=nowIso();await tx.run("UPDATE tournament_registrations SET status='cancelled',slot_number=NULL,queue_order=NULL,cancelled_at=?,updated_at=?,organizer_reason=? WHERE id=?",[now,now,reason||null,registration.id]);await audit(tx,tournamentId,'cancel',actorType,actor,playerId,reason||null);if(wasConfirmed){const next=await tx.get<any>("SELECT r.*,p.nickname FROM tournament_registrations r JOIN players p ON p.id=r.player_id WHERE r.tournament_id=? AND r.status='reserve' ORDER BY COALESCE(r.queue_order,2147483647),r.registered_at ASC,r.id ASC LIMIT 1",[tournamentId]);if(next){promotedPlayerId=String(next.player_id);promotedName=String(next.nickname||'Игрок');await tx.run("UPDATE tournament_registrations SET status='confirmed',slot_number=?,queue_order=NULL,updated_at=? WHERE id=?",[freedSlot,now,next.id]);await audit(tx,tournamentId,'promote_from_reserve','system','system',promotedPlayerId,'fifo vacancy promotion',{slot_number:freedSlot});}}await renumberReserve(tx,tournamentId);await syncCanonicalParticipants(tx,tournamentId);return{cancelled:true,promotedPlayerId};}));
  if(promotedPlayerId){await queuePersonalNotification(db,{notificationKey:`tournament:${tournamentId}:promotion:${promotedPlayerId}`,playerId:promotedPlayerId,eventType:'tournament_reserve_promoted',entityId:tournamentId,text:'Вы перешли из резерва в основной состав турнира.',actionPath:tournamentPlayerPath(tournamentId)});await enqueueOrganizerNotification(db,{messageKey:`tournament:${tournamentId}:promotion:${promotedPlayerId}`,eventType:'tournament_reserve_promoted',entityId:tournamentId,text:`♟ ${promotedName} автоматически переведён(а) из резерва в основной состав турнира.`});}
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
