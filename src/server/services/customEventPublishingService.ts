import type { DatabaseWrapper } from '../../db/index.ts';
import { createVkWallPost, getVkIntegrationStatus } from './vkPublishingService.ts';
import { queuePersonalNotification } from './personalNotificationRouterService.ts';

type Dependencies = {
  fetchImpl?: typeof fetch;
  createVkPost?: typeof createVkWallPost;
  queueNotification?: typeof queuePersonalNotification;
};

const escapeHtml = (value: unknown) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const appBase = () => String(process.env.PLAYER_APP_URL || process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/,'');
const eventPath = (id: string) => `/player/events?event=${encodeURIComponent(id)}`;
const date = (value: string) => new Date(value).toLocaleString('ru-RU',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'});

export function customEventAnnouncementText(event: any, html = false) {
  const e = html ? escapeHtml : (value: unknown) => String(value ?? '');
  const lines = [`🎉 ${e(event.title)}`, '', `${date(event.starts_at)} — ${date(event.ends_at)}`];
  if (event.venue) lines.push(`📍 ${e(event.venue)}`);
  lines.push(Number(event.price_rub) ? `💳 ${Number(event.price_rub)} ₽` : '💳 Бесплатно');
  lines.push(`👥 До ${Number(event.participant_limit)} участников${Number(event.allow_guest) ? ' · можно +1' : ''}`);
  if (event.description) lines.push('', e(event.description));
  const link = appBase() ? `${appBase()}${eventPath(String(event.id))}` : '';
  if (link) lines.push('', `Записаться: ${link}`);
  return lines.join('\n');
}

async function claim(db: DatabaseWrapper, eventId: string, channel: string, targetKey: string) {
  const existing = await db.get<any>('SELECT status FROM custom_event_publications WHERE event_id=? AND channel=? AND target_key=?',[eventId,channel,targetKey]);
  if (existing && ['sending','sent','uncertain'].includes(String(existing.status))) return false;
  const now = new Date().toISOString();
  await db.run(`INSERT INTO custom_event_publications(event_id,channel,target_key,status,attempted_at) VALUES (?,?,?,'sending',?)
    ON CONFLICT(event_id,channel,target_key) DO UPDATE SET status='sending',last_error=NULL,attempted_at=excluded.attempted_at`,[eventId,channel,targetKey,now]);
  return true;
}
async function finish(db:DatabaseWrapper,eventId:string,channel:string,targetKey:string,status:'sent'|'failed'|'uncertain',externalId?:string|null,error?:string|null){
  const now=new Date().toISOString();
  await db.run('UPDATE custom_event_publications SET status=?,external_id=?,last_error=?,sent_at=?,attempted_at=? WHERE event_id=? AND channel=? AND target_key=?',[status,externalId||null,error?String(error).slice(0,1000):null,status==='sent'?now:null,now,eventId,channel,targetKey]);
}

async function sendTelegram(event:any,destination:any,channel:string,db:DatabaseWrapper,fetchImpl:typeof fetch){
  const target=String(destination.chat_id), key=String(destination.id);
  if(!(await claim(db,event.id,channel,key)))return {channel,status:'skipped'};
  const token=String(process.env.TELEGRAM_BOT_TOKEN||'').trim();
  if(!token){await finish(db,event.id,channel,key,'failed',null,'TELEGRAM_BOT_TOKEN is not configured');return {channel,status:'failed'};}
  try{
    let response:Response;
    if(event.cover_image_data_url){
      const match=String(event.cover_image_data_url).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
      if(match){const bytes=Buffer.from(match[2],'base64'),form=new FormData();form.set('chat_id',target);if(destination.topic_id)form.set('message_thread_id',String(destination.topic_id));form.set('caption',customEventAnnouncementText(event,false).slice(0,1024));form.set('photo',new Blob([bytes],{type:match[1]}),'cover.jpg');response=await fetchImpl(`https://api.telegram.org/bot${token}/sendPhoto`,{method:'POST',body:form});}
      else throw new Error('Некорректная обложка');
    }else response=await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:target,message_thread_id:destination.topic_id||undefined,text:customEventAnnouncementText(event,true),parse_mode:'HTML',disable_web_page_preview:true})});
    const body:any=await response.json().catch(()=>({}));
    if(!response.ok||body.ok===false){await finish(db,event.id,channel,key,'failed',null,body.description||`Telegram HTTP ${response.status}`);return {channel,status:'failed'};}
    await finish(db,event.id,channel,key,'sent',String(body.result?.message_id||''));return {channel,status:'sent'};
  }catch(error:any){await finish(db,event.id,channel,key,'uncertain',null,error.message||String(error));return {channel,status:'uncertain'};}
}

async function audience(db:DatabaseWrapper,event:any){
  if(event.visibility==='invite')return db.all<any>(`SELECT p.id FROM players p JOIN custom_event_invitations i ON i.player_id=p.id WHERE i.event_id=? AND COALESCE(p.contact_status,'')<>'blocked'`,[event.id]);
  if(event.visibility==='club')return db.all<any>("SELECT id FROM players WHERE club_stage='CLUB_PLAYER' AND COALESCE(contact_status,'')<>'blocked'");
  return db.all<any>("SELECT id FROM players WHERE COALESCE(contact_status,'')<>'blocked'");
}

export async function publishCustomEvent(db:DatabaseWrapper,eventId:string,deps:Dependencies={}){
  const event=await db.get<any>('SELECT * FROM custom_events WHERE id=?',[eventId]);
  if(!event)throw Object.assign(new Error('Ивент не найден'),{statusCode:404});
  if(event.status!=='published')throw Object.assign(new Error('Сначала опубликуйте ивент в приложении'),{statusCode:409});
  const results:any[]=[];
  const fetchImpl=deps.fetchImpl||fetch;
  if(Number(event.announce_telegram_channel)||Number(event.announce_club_group)){
    const destinations=await db.all<any>("SELECT id,chat_id,topic_id,active FROM telegram_destinations WHERE id IN ('public','club')");
    for(const [flag,id,channel] of [[event.announce_telegram_channel,'public','telegram_channel'],[event.announce_club_group,'club','club_group']] as const){
      if(!Number(flag))continue;const destination=destinations.find((x:any)=>x.id===id);
      if(!destination?.active||!destination?.chat_id){results.push({channel,status:'not_configured'});continue;}
      results.push(await sendTelegram(event,destination,channel,db,fetchImpl));
    }
  }
  if(Number(event.announce_vk)){
    const status=getVkIntegrationStatus(), groupId=status.group_id||'';
    if(!status.configured||!groupId)results.push({channel:'vk',status:'not_configured'});
    else if(!(await claim(db,event.id,'vk',groupId)))results.push({channel:'vk',status:'skipped'});
    else try{const post=await (deps.createVkPost||createVkWallPost)({groupId,message:customEventAnnouncementText(event,false)});await finish(db,event.id,'vk',groupId,'sent',String(post.postId));results.push({channel:'vk',status:'sent'});}
    catch(error:any){const state=error?.vkDefinite===true?'failed':'uncertain';await finish(db,event.id,'vk',groupId,state,null,error.message||String(error));results.push({channel:'vk',status:state});}
  }
  if(Number(event.announce_bot_dm)){
    const players=await audience(db,event);let queued=0,skipped=0;
    for(const player of players){const playerId=String(player.id);if(playerId===String(event.organizer_player_id))continue;
      if(!(await claim(db,event.id,'bot_dm',playerId))){skipped++;continue;}
      try{await (deps.queueNotification||queuePersonalNotification)(db,{notificationKey:`custom-event:${event.id}:${playerId}`,playerId,eventType:'custom_event_announcement',entityId:event.id,text:customEventAnnouncementText(event,false),actionPath:eventPath(event.id)});await finish(db,event.id,'bot_dm',playerId,'sent');queued++;}
      catch(error:any){await finish(db,event.id,'bot_dm',playerId,'failed',null,error.message||String(error));}
    }
    results.push({channel:'bot_dm',status:'queued',queued,skipped});
  }
  return {event_id:event.id,results,publications:await db.all('SELECT channel,target_key,status,external_id,last_error,attempted_at,sent_at FROM custom_event_publications WHERE event_id=? ORDER BY channel,target_key',[event.id])};
}
