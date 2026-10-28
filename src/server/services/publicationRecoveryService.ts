import type { DatabaseWrapper } from '../../db/index.ts';
import { listHeldPublications, reconcilePublication, deliverPublication, type PublicationResult } from './publicationDeliveryService.ts';
import { sendPublicTelegram } from './publicationTelegramService.ts';
import { createVkWallPost } from './vkPublishingService.ts';

export async function publicationRecoveryQueue(db: DatabaseWrapper) {
  const rows=await listHeldPublications(db);
  return Promise.all(rows.map(async row=>{
    const payload=JSON.parse(row.payload);
    let eveningId=['today','cancel','reschedule'].includes(row.kind)?row.entity_id:null;
    let actionPath:string|null=null;
    if(row.delivery_key.startsWith('club:')){
      const post=await db.get<any>('SELECT evening_id FROM club_result_posts WHERE post_key=?',[row.delivery_key.slice(5).replace(/:text$/,'')]);
      eveningId=post?.evening_id||null;
      const tournament=row.delivery_key.match(/^club:tournament-(?:announce|results):([^:]+)/)?.[1];
      if(tournament)actionPath=`/player/events/${encodeURIComponent(tournament)}`;
    }
    if(['custom','poker'].includes(row.kind))actionPath=`/player/events?event=${encodeURIComponent(row.entity_id)}`;
    const evening=eveningId?await db.get<any>('SELECT title FROM game_evenings WHERE id=?',[eveningId]):null;
    const target=row.channel==='telegram' && payload.fields?.chat_id ? `Группа ${payload.fields.chat_id}${payload.fields.message_thread_id ? ` · тема ${payload.fields.message_thread_id}` : ''}` : row.target;
    return { key:row.delivery_key,attempt_id:row.attempt_id,entity_id:row.entity_id,evening_id:eveningId,title:evening?.title||null,action_path:actionPath,kind:row.kind,channel:row.channel,target,
      text:payload.fields?.text || payload.fields?.caption || payload.fields?.media?.[0]?.caption || payload.message || payload.text || '',
      error:row.result ? JSON.parse(row.result).error : 'Нет подтверждения отправки', legacy:payload.legacy === true,status:row.status === 'ready' ? 'ready' : 'uncertain' };
  }));
}

/** An explicit absence decision permits one claim; modern attempts replay the frozen request immediately. */
export async function resolvePublication(db: DatabaseWrapper,input: Parameters<typeof reconcilePublication>[1],fetchImpl:typeof fetch=fetch) {
  if(input.decision==='retry') {
    const ready=await db.get("SELECT 1 FROM publication_deliveries WHERE delivery_key=? AND attempt_id=? AND status='ready'",[input.key,input.attemptId]);
    if(!ready || input.confirmed!==true || !input.actor)throw Object.assign(new Error('Повтор уже запущен или не разрешён'),{statusCode:409});
  } else await reconcilePublication(db,input);
  const row=await db.get<any>('SELECT * FROM publication_deliveries WHERE delivery_key=?',[input.key]);
  const payload=JSON.parse(row.payload);
  let result:PublicationResult|undefined;
  if(['absent','retry'].includes(input.decision) && !payload.legacy) {
    const context={key:row.delivery_key,kind:row.kind,entityId:row.entity_id};
    if(row.channel==='telegram')result=await sendPublicTelegram(db,payload,fetchImpl,context);
    else if(row.channel==='vk') result=await deliverPublication(db,context,'vk',row.target,payload,async stored=>{
      try{const post=await createVkWallPost(stored as Parameters<typeof createVkWallPost>[0]);return {ok:true,certainty:'accepted',ids:[String(post.postId)],url:post.externalUrl};}
      catch(error:any){return {ok:false,certainty:error?.vkDefinite===true?'rejected':'uncertain',temporary:error?.vkDefinite===true,error:error?.message};}
    });
  }
  const accepted=input.decision==='accepted'||result?.ok;
  const status=accepted?'sent':result?.certainty==='uncertain'?'uncertain':result?'retry':'pending';
  // Old tables are projections. The durable attempt remains the authority for every retry.
  if(input.key.startsWith('club:')) {
    await db.run('UPDATE club_result_posts SET status=?,last_error=?,updated_at=? WHERE post_key=?', [status,result?.error||null,new Date().toISOString(),input.key.slice(5).replace(/:text$/,'')]);
  } else if(['today','cancel'].includes(row.kind)) {
    const table=row.kind==='today'?'evening_today_posts':'evening_cancel_posts';const channel=row.channel==='vk'?'vk':'telegram';
    await db.run(`UPDATE ${table} SET ${channel}_status=?,${channel}_error=?,updated_at=? WHERE evening_id=?`,[accepted?'published':status==='uncertain'?'uncertain':null,result?.error||null,new Date().toISOString(),row.entity_id]);
  } else if(row.kind==='reschedule') {
    const channel=row.channel==='vk'?'vk':'telegram';const id=input.key.slice('reschedule:'.length).replace(/:(telegram|vk)$/,'');
    await db.run(`UPDATE evening_reschedule_notices SET ${channel}_status=? WHERE id=?`,[accepted?'published':status==='uncertain'?'uncertain':'failed',id]);
  } else if(['poker','custom'].includes(row.kind)) {
    const table=row.kind==='poker'?'poker_tournament_publications':'custom_event_publications';const pk=row.kind==='poker'?'tournament_id':'event_id';
    const prefix=`${row.kind}:${row.entity_id}:`;const rest=input.key.slice(prefix.length);const channel=rest.slice(0,rest.indexOf(':'));const target=rest.slice(rest.indexOf(':')+1);
    await db.run(`UPDATE ${table} SET status=?,last_error=? WHERE ${pk}=? AND channel=? AND target_key=?`,[accepted?'sent':status==='uncertain'?'uncertain':'failed',result?.error||null,row.entity_id,channel,target]);
    if(row.kind==='poker'&&!accepted)await db.run('UPDATE poker_tournaments SET announced_at=NULL WHERE id=?',[row.entity_id]);
  }
  return {ok:true,legacy:payload.legacy===true,retried:!!result,result};
}
