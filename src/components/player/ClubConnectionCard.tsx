import type {ReactNode} from 'react';
import {getGameRoleDefinition,type GameRole} from '../../shared/gameRoles.ts';
import {openCanonicalPlayerProfile} from './playerProfileNavigation.ts';
type Member={player_id:string;nickname:string};
/** One reading order for a pair, a role combination, a trio and table encounters. */
export default function ClubConnectionCard({members,roles,context,children,testId,onOpenPair}:{members:Member[];roles?:GameRole[];context:string;children:ReactNode;testId?:string;onOpenPair?:(a:string,b:string)=>void}){
 return <article className="rounded-2xl border border-white/10 bg-black/20 p-3" data-testid={testId||"club-connection-card"}>
  <div className="grid gap-2" style={{gridTemplateColumns:`repeat(${Math.max(1,members.length)},minmax(0,1fr))`}}>{members.map((member,index)=><button key={member.player_id} type="button" aria-label={'Открыть профиль '+member.nickname} onClick={()=>openCanonicalPlayerProfile(member.player_id)} className={'ds-focus-ring flex min-h-11 min-w-0 gap-2 rounded-xl '+(members.length===3?'flex-col items-center text-center':'items-start text-left')}><span aria-hidden="true" className="relative grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/10 text-sm text-white/75">{member.nickname.trim().slice(0,1)}<img src={'/api/player/players/'+encodeURIComponent(member.player_id)+'/avatar'} alt="" onError={event=>{event.currentTarget.style.display='none';}} className="absolute inset-0 h-full w-full rounded-xl object-cover"/></span><span className="min-w-0"><span className="block break-words text-xs font-semibold leading-4 text-white/90">{member.nickname}</span>{roles?.[index]&&<span className="mt-1 block text-[11px] text-white/55">{getGameRoleDefinition(roles[index])?.label}</span>}</span></button>)}</div>
  <p className="mt-3 text-[11px] leading-4 text-white/55">{context}</p>
  <div className="mt-2 space-y-1 text-xs leading-5 text-white/75">{children}</div>
  {members.length===2&&onOpenPair&&<button type="button" className="ds-focus-ring mt-3 min-h-11 w-full rounded-xl border border-white/10 px-3 text-xs text-white/70" onClick={()=>onOpenPair(members[0].player_id,members[1].player_id)}>История пары ›</button>}
 </article>;
}
