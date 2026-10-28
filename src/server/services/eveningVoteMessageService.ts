import {resolveEveningMvp,mvpDecisionCallbackData} from './eveningMvpService.ts';
import {PRIMARY_ORGANIZER_PLAYER_ID} from '../../db/ensureOrganizerPlayerAccessSchema.ts';
import {MVP_RUNOFF_CATEGORY,ensureMvpRunoffIfNeeded,ensureRunoffSchema,type MvpRunoff} from './eveningVoteRounds.ts';
import type { DatabaseWrapper } from '../../db/index.ts';
import { queuePersonalNotification, resolvePersonalNotificationRouting } from './personalNotificationRouterService.ts';
import { buildMvpVoteCard } from './mvpCardService.ts';

/**
 * The «MVP вечера» vote as buttons in the bot (owner, 2026-10-05): after an evening is closed every attendee who is
 * reached through Telegram gets one message with a button per other attendee. A tap is the vote, tapping another
 * player changes it. Players reached through VK keep voting in the app (Клуб → Истории).
 */

const CALLBACK_LIMIT = 64;

const utf8Length = (value: string) => Buffer.byteLength(value, 'utf8');

/** `evv:<evening>:<start of the player id>` — as much of the id as fits Telegram's 64-byte callback data. */
export const voteCallbackData = (eveningId: string, nomineeId: string,runoff=false): string | null => {
  const head = `${runoff?'evr':'evv'}:${eveningId}:`;
  const room = CALLBACK_LIMIT - utf8Length(head);
  if (room < 4) return null;
  return `${head}${nomineeId.slice(0, Math.min(nomineeId.length, room))}`;
};

const buttonLabel = (nickname: string) => {
  const clean = nickname.trim() || 'Игрок';
  return clean.length > 24 ? `${clean.slice(0, 23)}…` : clean;
};

/**
 * `nudge`: the reminder for attendees who have not voted yet (owner, 2026-10-13: the vote was missed). It goes through
 * the same personal channel — buttons in Telegram, a message with the app link in VK — and never to someone who voted.
 */
export async function queueEveningVoteMessages(db: DatabaseWrapper, eveningId: string, title: string, options: { nudge?: boolean;runoff?:MvpRunoff } = {}): Promise<number> {
  const nudge = Boolean(options.nudge);
  const runoff=options.runoff;
  const voteCategory=runoff?MVP_RUNOFF_CATEGORY:'best_player';
  const prefix=runoff?'evening-runoff-vote':nudge?'evening-vote-nudge':'evening-vote';
  const deadline=runoff?new Date(runoff.deadline_at).toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}):'';
  const voted = nudge
    ? new Set((await db.all<any>("SELECT voter_player_id FROM evening_player_votes WHERE evening_id = ? AND category = ?", [eveningId,voteCategory]).catch(() => [])).map((row: any) => String(row.voter_player_id)))
    : new Set<string>();
  const attendees = await db.all<any>(`
    SELECT p.id, p.nickname
      FROM evening_participants ep JOIN players p ON p.id = ep.player_id
     WHERE ep.evening_id = ? AND ep.attendance_status = 'attended'
     ORDER BY p.nickname COLLATE NOCASE ASC
  `, [eveningId]);
  if (attendees.length < 2) return 0;
  // One picture with every candidate's photo goes with each Telegram message; a failed picture means text and buttons only.
  const card = runoff?null:await buildMvpVoteCard(db, eveningId);
  let queued = 0;
  for (const voter of attendees) {
    if (voted.has(String(voter.id))) continue;
    const routing = await resolvePersonalNotificationRouting(db, String(voter.id));
    if (!routing.personal_enabled || !routing.selected_channel) continue;
    if (routing.selected_channel === 'vk') {
      // Players reached through VK vote in the app: the message carries the link (owner, 2026-10-13).
      if (!nudge&&!runoff) continue;
      const sent = await queuePersonalNotification(db, {
        notificationKey: `${prefix}:${eveningId}:${voter.id}`,
        playerId: String(voter.id), eventType: runoff?'evening_vote_runoff':'evening_vote_nudge', entityId: eveningId,
        text: runoff?`🏅 «${title}»: дополнительное голосование за MVP между лидерами. Первый тур завершился вничью. Голосуем заново до ${deadline}. Откройте приложение, карточка «MVP вечера».`:`🏅 «${title}»: вы ещё не проголосовали за MVP вечера. Откройте приложение, карточка «MVP вечера».`,
        actionPath: '/player',
      });
      if (sent.created) queued += 1;
      continue;
    }
    if (routing.selected_channel !== 'telegram') continue;
    const buttons = attendees
      .filter((other) => String(other.id) !== String(voter.id)&&(!runoff||runoff.nominees.includes(String(other.id))))
      .flatMap((other) => {
        const data = voteCallbackData(eveningId, String(other.id),!!runoff);
        return data ? [{ text: buttonLabel(String(other.nickname || '')), callback_data: data }] : [];
      });
    if (!buttons.length) continue;
    const rows: Array<typeof buttons> = [];
    for (let index = 0; index < buttons.length; index += 2) rows.push(buttons.slice(index, index + 2));
    const result = await queuePersonalNotification(db, {
      notificationKey: `${prefix}:${eveningId}:${voter.id}`,
      playerId: String(voter.id),
      eventType: runoff?'evening_vote_runoff':nudge ? 'evening_vote_nudge' : 'evening_vote',
      entityId: eveningId,
      text: runoff?`🏅 «${title}»: дополнительное голосование за MVP между лидерами.\nГолоса первого тура не переносятся. Выбери одного из финалистов до ${deadline}. Голос можно изменить до закрытия тура.`:`${nudge ? '⏰ Ты ещё не проголосовал.\n' : ''}🏅 «${title}»: кто сыграл лучше всех?\nНажми на игрока — это твой голос за «MVP вечера». Передумал? Нажми на другого, голос заменится. Голосование открыто 3 дня.`,
      telegramReplyMarkup: { inline_keyboard: rows },
      telegramPhotoPng: card,
    });
    if (result.created) queued += 1;
  }
  return queued;
}

/** Personal runoff messages do not depend on whether public club-result posts are enabled. */
export async function runEveningMvpRunoffs(db:DatabaseWrapper,now=Date.now()){
 await ensureRunoffSchema(db);
 const rows=await db.all<any>("SELECT e.id,e.title FROM game_evenings e WHERE e.status='completed' AND (datetime(COALESCE(e.settled_at,e.updated_at,e.starts_at))>=datetime(?) OR EXISTS(SELECT 1 FROM evening_mvp_runoffs r WHERE r.evening_id=e.id AND datetime(r.deadline_at)>=datetime(?)))",[new Date(now-17*86_400_000).toISOString(),new Date(now-14*86_400_000).toISOString()]);
 let queued=0;
 for(const e of rows){
  const round=await ensureMvpRunoffIfNeeded(db,String(e.id),now);if(!round)continue;
  if(Date.parse(round.deadline_at)>now){queued+=await queueEveningVoteMessages(db,String(e.id),String(e.title),{runoff:round});continue;}
  const r=await resolveEveningMvp(db,String(e.id));if(r.status!=='tie')continue;
  const buttons=r.candidates.flatMap(c=>{const data=mvpDecisionCallbackData(String(e.id),c.player_id);return data?[[{text:c.nickname,callback_data:data}]]:[];});
  const result=await queuePersonalNotification(db,{notificationKey:`mvp-ask:${e.id}`,playerId:PRIMARY_ORGANIZER_PLAYER_ID,eventType:'evening_mvp_decision',entityId:String(e.id),text:`🏅 «${e.title}»: дополнительный тур MVP завершился без единственного победителя. Выбери среди оставшихся лидеров.`,telegramReplyMarkup:{inline_keyboard:buttons}});
  if(result.created)queued++;
 }
 return queued;
}
