import { AvatarImage } from '../ui/AvatarImage.tsx';
import SmartFriendInviteSuggestions from './SmartFriendInviteSuggestions.tsx';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import { Input } from '../ui/Input.tsx';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';
import PersonalRecentEvening from './PersonalRecentEvening.tsx';
import PersonalTeamwork from './PersonalTeamwork.tsx';
import { useEffect, useMemo, useState } from 'react';
import { getJson, sendJson } from '../../lib/requestJson.ts';
import { gameResultText } from '../../lib/playerResultObservations.ts';
import PlayerConnectionHistory, {type SharedConnectionGame} from './PlayerConnectionHistory.tsx';

type Connection = {
  player_id: string;
  nickname: string;
  avatar_url: string;
  relationship: string;
  shared_games: number;
  same_team_games: number;
  opponent_games: number;
  same_team_wins?: number;
  same_team_win_rate?: number;
  recent_shared_games?: SharedConnectionGame[];
  last_played_at: string | null;
  last_shared_game_date?: string | null;
};

type ReferralPlayer = {
  player_id: string;
  nickname: string;
  avatar_url: string;
  created_at?: string | null;
};

type InvitationState = 'eligible' | 'registered' | 'reserve' | 'already_invited' | 'registration_closed' | 'sender_limit' | 'unavailable_format';

type InvitationEvening = {
  id: string;
  title: string;
  starts_at: string | null;
  venue: string | null;
  format: string;
  state?: InvitationState;
  existing_invitation?: { id: string; status: string; created_at: string } | null;
};

type InvitationContext = {
  can_invite: boolean;
  reason?: string | null;
  recipient_state?: 'available' | 'registered' | 'reserve' | 'unavailable' | 'self' | string;
  evenings: InvitationEvening[];
};

type IncomingInvitation = {
  id: string;
  evening_id: string;
  status: 'sent' | 'opened' | 'accepted';
  evening: { id: string; title: string; starts_at: string | null; venue: string | null; format: string; status: string };
  inviter: { player_id: string; nickname: string; avatar_url: string };
};

const fmtDate = (value: string | null) => value && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
  : 'Дата не указана';

const inviteStateLabel = (state?: InvitationState) => ({
  eligible: 'Можно пригласить',
  registered: 'Уже записан',
  reserve: 'Уже в резерве',
  already_invited: 'Уже приглашён',
  registration_closed: 'Регистрация закрыта',
  sender_limit: 'Лимит приглашений исчерпан',
  unavailable_format: 'Формат недоступен',
}[state || 'eligible'] || 'Недоступно');

const unavailableReasonLabel = (context: InvitationContext) => {
  if (context.reason==='load_failed') return 'Не удалось проверить возможность приглашения';
  if (context.recipient_state === 'unavailable' || String(context.reason || '').startsWith('recipient_') || context.reason === 'player_not_found') return 'Игрок недоступен для приглашения';
  if (context.reason === 'registered') return 'Игрок уже записан';
  if (context.reason === 'reserve') return 'Игрок уже в резерве';
  if (context.reason === 'sender_limit') return 'Лимит приглашений исчерпан';
  if (context.reason === 'unavailable_format') return 'Подходящий формат недоступен';
  if (context.reason === 'registration_closed') return 'Регистрация закрыта';
  return 'Сейчас нет доступного вечера для приглашения';
};

// What the inviter can do next: most often sign up for an evening first.
const unavailableReasonHint = (context: InvitationContext) => {
  if (context.reason === 'no_active_evening') return 'Сначала нужно записаться на вечер: звать можно только на тот, куда идёт сам приглашающий.';
  return 'Приглашение не записывает игрока на вечер — он запишется сам.';
};

const openPlayerProfile = openCanonicalPlayerProfile;

function TeamResult({connection}:{connection:Connection}) {
  const wins=connection.same_team_wins;
  if(connection.same_team_games<=0||typeof wins!=='number'||!Number.isFinite(wins))return null;
  return <span>Вместе: {gameResultText({wins,games:connection.same_team_games})}{typeof connection.same_team_win_rate==='number'&&Number.isFinite(connection.same_team_win_rate)?` (${Math.round(connection.same_team_win_rate)}%)`:''}</span>;
}

function openEvening(eveningId: string) {
  const path = `/player/events/${encodeURIComponent(eveningId)}`;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function Avatar({ src, name }: { src?: string | null; name: string }) {
  return src ? <AvatarImage src={src} alt="" className="h-11 w-11 shrink-0 rounded-2xl object-cover ring-1 ring-white/10" />
    : <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/[0.07] text-sm font-semibold text-white/55">{name.slice(0, 1).toUpperCase()}</div>;
}

function ReferralLink({ label, player }: { label: string; player: ReferralPlayer }) {
  return <button type="button" onClick={() => openPlayerProfile(player.player_id)} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-black/20 p-2.5 text-left active:bg-white/[0.05]">
    <Avatar src={player.avatar_url} name={player.nickname} />
    <div className="min-w-0 flex-1"><div className="text-[11px] uppercase tracking-[0.1em] text-white/30">{label}</div><div className="mt-0.5 truncate text-sm font-semibold">{player.nickname}</div></div>
    <span className="text-white/25">→</span>
  </button>;
}

export default function PremiumProfileConnections({ playerId, selfPlayerId }: { playerId: string; selfPlayerId: string }) {
  const isSelf = playerId === selfPlayerId;
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [connectionsMeta,setConnectionsMeta]=useState<{minimum_shared_games?:number;maximum_connections?:number}|null>(null);
  const [mostSuccessful, setMostSuccessful] = useState<Connection | null>(null);
  const [invitedBy, setInvitedBy] = useState<ReferralPlayer | null>(null);
  const [invitedPlayers, setInvitedPlayers] = useState<ReferralPlayer[]>([]);
  const [connectionsError, setConnectionsError] = useState('');
  const [context, setContext] = useState<InvitationContext | null>(null);
  const [inbox, setInbox] = useState<IncomingInvitation[]>([]);
  const [selectedEveningId, setSelectedEveningId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [selfSection,setSelfSection]=useState<'players'|'team'|'invites'>(()=>{try{const saved=sessionStorage.getItem(`connections-view:${playerId}`);return saved==='team'||saved==='invites'?saved:'players';}catch{return 'players';}});
  const [search,setSearch]=useState(()=>{try{return sessionStorage.getItem(`connections-search:${selfPlayerId}:${playerId}`)||'';}catch{return '';}});
  const [inboxLoading,setInboxLoading]=useState(false);
  const [inboxError,setInboxError]=useState('');
  const [connectionsHidden,setConnectionsHidden]=useState(false);
  const [filter, setFilter] = useState<'all' | 'mates' | 'rivals'>(()=>{try{const value=sessionStorage.getItem(`connections-filter:${selfPlayerId}:${playerId}`);return value==='mates'||value==='rivals'?value:'all';}catch{return 'all';}});
  useEffect(()=>{try{sessionStorage.setItem(`connections-search:${selfPlayerId}:${playerId}`,search);sessionStorage.setItem(`connections-filter:${selfPlayerId}:${playerId}`,filter);}catch{}},[selfPlayerId,playerId,search,filter]);

  const loadConnections = async () => {
    setConnectionsError('');setConnectionsHidden(false);
    try {
      const body = await getJson<any>(`/api/player/profiles/${encodeURIComponent(playerId)}/connections`, 'Не удалось загрузить связи');
      setConnections(Array.isArray(body.connections) ? body.connections : []);
      setConnectionsMeta(body.meta||null);
      setMostSuccessful(body.most_successful_partnership || null);
      setInvitedBy(body.invited_by || null);
      setInvitedPlayers(Array.isArray(body.invited_players) ? body.invited_players : []);
    } catch (error: any) {
      setConnections(null);
      setConnectionsMeta(null);
      setMostSuccessful(null);
      setInvitedBy(null);
      setInvitedPlayers([]);
      setConnectionsHidden(error?.status===403&&String(error?.message).includes('скрыты'));
      setConnectionsError(error?.message || 'Не удалось загрузить связи');
    }
  };

  const loadInviteContext = async () => {
    if (isSelf) return;
    try {
      const body = await getJson<any>(`/api/player/profiles/${encodeURIComponent(playerId)}/invitation-context`, 'Не удалось проверить приглашение');
      setContext(body);
      const firstAvailable = (body.evenings || []).find((item: InvitationEvening) => (item.state || 'eligible') === 'eligible' && !item.existing_invitation);
      setSelectedEveningId((current) => {
        const stillExists = (body.evenings || []).some((item: InvitationEvening) => item.id === current);
        return stillExists ? current : firstAvailable?.id || body.evenings?.[0]?.id || '';
      });
    } catch {
      setContext({ can_invite: false, reason: 'load_failed', evenings: [] });
      setSelectedEveningId('');
    }
  };

  const loadInbox = async () => {
    if (!isSelf) return;
    setInboxLoading(true);setInboxError('');
    try {
      const body = await getJson<any>('/api/player/evening-invitations/inbox','Не удалось загрузить приглашения');
      if (body) setInbox(Array.isArray(body.invitations) ? body.invitations : []);
    } catch (reason:any) {setInboxError(reason?.message||'Не удалось обновить приглашения');}
    finally{setInboxLoading(false);}
  };

  useEffect(() => { void loadConnections(); }, [playerId]);
  useEffect(() => { setContext(null); setSelectedEveningId(''); void (isSelf ? loadInbox() : loadInviteContext()); }, [playerId, selfPlayerId]);

  const shown = useMemo(() => {
    const query=search.trim().toLocaleLowerCase('ru-RU');
    const list = (connections || []).filter(item=>!query||item.nickname.toLocaleLowerCase('ru-RU').includes(query));
    if (filter === 'mates') return list.filter((item) => item.same_team_games > 0).sort((a, b) => b.same_team_games - a.same_team_games);
    if (filter === 'rivals') return list.filter((item) => item.opponent_games > 0).sort((a, b) => b.opponent_games - a.opponent_games);
    return list;
  }, [connections, filter, search]);

  const selectedEvening = useMemo(() => context?.evenings.find((item) => item.id === selectedEveningId) || null, [context, selectedEveningId]);
  const selectedState = selectedEvening?.existing_invitation ? 'already_invited' : selectedEvening?.state || 'eligible';
  const canSendSelected = Boolean(selectedEveningId && selectedEvening && selectedState === 'eligible' && context?.can_invite);

  const sendInvitation = async () => {
    if (!canSendSelected || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const body = await sendJson<any>(`/api/player/profiles/${encodeURIComponent(playerId)}/invitations`, 'POST', { evening_id: selectedEveningId }, 'Не удалось отправить приглашение');
      setMessage(body.created === false ? 'Приглашение уже было отправлено.' : 'Приглашение отправлено. Игрок запишется на вечер сам.');
      await loadInviteContext();
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось отправить приглашение');
    } finally {
      setBusy(false);
    }
  };

  const respond = async (invitation: IncomingInvitation, action: 'open' | 'accept' | 'decline' | 'ignore') => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await sendJson(`/api/player/evening-invitations/${encodeURIComponent(invitation.id)}/respond`, 'POST', { action }, 'Не удалось обработать приглашение');
      if (action === 'open') {
        openEvening(invitation.evening_id);
        return;
      }
      if (action === 'accept') setMessage('Приглашение принято. Теперь запишись на вечер на его странице.');
      await loadInbox();
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось обработать приглашение');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid="premium-profile-connections" className="space-y-3">
      {isSelf&&<><SegmentedControl wrapLabels ariaLabel="Мои связи" value={selfSection} onValueChange={next=>{setSelfSection(next);try{sessionStorage.setItem(`connections-view:${playerId}`,next);}catch{}}} items={[{value:'players',label:'Игроки'},{value:'team',label:'Моя команда'},{value:'invites',label:inbox.length?`Приглашения · ${inbox.length}`:'Приглашения'}]} />
      <p className="px-1 text-xs leading-5 text-white/55">{selfSection==='players'?'Найдите игрока и откройте его профиль.':selfSection==='team'?'Ваша сыгранность, роли и соперники.':'Кто зовёт на вечер и кого можно позвать.'}</p></>}
      {isSelf&&selfSection==='invites'&&<SmartFriendInviteSuggestions/>}
      {isSelf&&selfSection==='invites'&&inboxLoading&&<p role="status" className="p-3 text-sm text-white/60">Загружаем приглашения…</p>}
      {isSelf&&selfSection==='invites'&&inboxError&&<div role="alert" className="rounded-2xl border border-rose-300/20 p-3 text-sm text-rose-200"><p>{inboxError}</p><button type="button" onClick={()=>void loadInbox()} className="mt-2 min-h-11 px-3">Повторить загрузку приглашений</button></div>}
      {isSelf&&selfSection==='invites'&&!inboxLoading&&!inboxError&&inbox.length===0&&<p className="rounded-2xl border border-white/10 p-4 text-sm text-white/60">Входящих приглашений пока нет. Позвать знакомого можно из его профиля.</p>}
      {isSelf && selfSection==='invites' && inbox.length > 0 ? (
        <div className="rounded-[26px] border border-amber-200/10 bg-amber-200/[0.045] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/55">Приглашения</div>
          <h2 className="mt-1 text-base font-semibold">Зовут на игру</h2>
          <p className="mt-1 text-xs leading-5 text-white/40">Принятое приглашение — ещё не запись. Записаться можно на странице вечера.</p>
          <div className="mt-3 space-y-2">
            {inbox.map((item) => (
              <article key={item.id} className="rounded-2xl bg-black/20 p-3">
                <div className="flex gap-3">
                  <button type="button" onClick={() => openPlayerProfile(item.inviter.player_id)} className="shrink-0"><Avatar src={item.inviter.avatar_url} name={item.inviter.nickname} /></button>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{item.inviter.nickname} зовёт на «{item.evening.title}»</div>
                    <div className="mt-1 text-xs text-white/40">{fmtDate(item.evening.starts_at)}{item.evening.venue ? ` · ${item.evening.venue}` : ''}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" disabled={busy} onClick={() => void respond(item, 'accept')} className="min-h-11 rounded-xl bg-white px-3 text-xs font-semibold text-black disabled:opacity-50">Принять</button>
                  <button type="button" disabled={busy} onClick={() => void respond(item, 'open')} className="min-h-11 rounded-xl border border-white/10 px-3 text-xs font-semibold text-white/70 disabled:opacity-50">Открыть вечер</button>
                  <button type="button" disabled={busy} onClick={() => void respond(item, 'decline')} className="min-h-10 rounded-xl border border-white/[0.07] px-3 text-xs text-white/45 disabled:opacity-50">Отказаться</button>
                  <button type="button" disabled={busy} onClick={() => void respond(item, 'ignore')} className="min-h-10 rounded-xl px-3 text-xs text-white/30 disabled:opacity-50">Скрыть</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {!isSelf && context?.evenings?.length ? (
        <div className="rounded-[26px] border border-white/10 bg-white/[0.045] p-4" data-testid="invitation-picker">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Позвать за стол</div>
          <h2 className="mt-1 text-base font-semibold">Пригласить на игровой вечер</h2>
          <p className="mt-1 text-xs leading-5 text-white/40">Звать можно на вечера, на которые записан сам приглашающий.</p>
          <select value={selectedEveningId} onChange={(event) => setSelectedEveningId(event.target.value)} className="mobile-field mt-3 w-full text-sm" aria-label="Игровой вечер для приглашения">
            {context.evenings.map((evening) => {
              const state = evening.existing_invitation ? 'already_invited' : evening.state || 'eligible';
              return <option key={evening.id} value={evening.id}>{evening.title} · {fmtDate(evening.starts_at)} · {inviteStateLabel(state)}</option>;
            })}
          </select>
          {selectedEvening ? <div className="mt-2 flex items-center justify-between gap-2 text-xs"><span className="text-white/35">{selectedEvening.venue || 'Площадка не указана'}</span><span className={selectedState === 'eligible' ? 'text-emerald-200/65' : 'text-white/35'}>{inviteStateLabel(selectedState)}</span></div> : null}
          <button type="button" disabled={busy || !canSendSelected} onClick={() => void sendInvitation()} className="mt-3 min-h-12 w-full rounded-2xl bg-white px-4 text-sm font-semibold text-black disabled:opacity-35">{busy ? 'Отправляем…' : selectedState === 'eligible' ? 'Позвать на этот вечер' : inviteStateLabel(selectedState)}</button>
          <p className="mt-2 text-[11px] leading-4 text-white/30">Игрок получит приглашение в приложении и сообщением, если у него подключены уведомления. Записаться на вечер он решит сам.</p>
        </div>
      ) : null}

      {!isSelf && context && context.evenings.length === 0 ? (
        <div data-testid="invitation-unavailable-state" className="rounded-[26px] border border-white/10 bg-white/[0.045] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Приглашение</div>
          <h2 className="mt-1 text-base font-semibold">{unavailableReasonLabel(context)}</h2>
          <p className="mt-1 text-xs leading-5 text-white/40">{context.reason==='load_failed'?'Попробуйте загрузить доступные вечера ещё раз.':unavailableReasonHint(context)}</p>{context.reason==='load_failed'&&<button type="button" onClick={()=>void loadInviteContext()} className="mt-2 min-h-11 px-3 text-sm">Повторить проверку</button>}
        </div>
      ) : null}

      {message ? <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-3 text-xs leading-5 text-white/65">{message}</div> : null}

      {(!isSelf||selfSection==='invites')&&(invitedBy || invitedPlayers.length > 0) ? <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Клуб</div>
        <h2 className="mt-1 text-base font-semibold">Кто привёл в клуб</h2>
        <p className="mt-1 text-xs leading-5 text-white/35">Это отмечает организатор.</p>
        <div className="mt-3 space-y-2">
          {invitedBy ? <ReferralLink label="В клуб пригласил" player={invitedBy} /> : null}
          {invitedPlayers.map((item) => <ReferralLink key={item.player_id} label="Пригласил в клуб" player={item} />)}
        </div>
      </div> : null}

      {(!isSelf||selfSection==='team')&&mostSuccessful ? <button type="button" onClick={() => openPlayerProfile(mostSuccessful.player_id)} className="w-full rounded-[26px] border border-emerald-200/10 bg-emerald-200/[0.045] p-4 text-left">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/45">Победы с напарником</div>
        <div className="mt-2 flex items-center gap-3"><Avatar src={mostSuccessful.avatar_url} name={mostSuccessful.nickname} /><div className="min-w-0 flex-1"><div className="break-words text-sm font-semibold">{mostSuccessful.nickname}</div><div className="mt-1 text-xs leading-5 text-white/60"><TeamResult connection={mostSuccessful}/></div></div><span className="text-white/25">→</span></div>
      </button> : null}

      {isSelf&&selfSection==='team' ? <PersonalTeamwork /> : null}

      {(!isSelf||selfSection==='players')&&<div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-start justify-between gap-3">
          <div><div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Связи</div><h2 className="mt-1 text-base font-semibold">{isSelf ? 'С кем я играю' : 'С кем играет игрок'}</h2></div>
          {connections ? <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-white/40">{connections.length}</span> : null}
        </div>
        {connections&&<p className="mt-2 text-xs leading-5 text-white/55">За всю историю{connectionsMeta?.minimum_shared_games&&connectionsMeta?.maximum_connections?` · от ${connectionsMeta.minimum_shared_games} общих игр · до ${connectionsMeta.maximum_connections} игроков`:''}</p>}
        {!!connections?.length&&<div className="mt-3 flex items-center gap-2"><label className="min-w-0 flex-1 text-xs text-white/60">Найти игрока<Input type="search" aria-label="Найти среди связей" value={search} onChange={event=>setSearch(event.target.value)} className="mt-1" /></label>{search&&<button type="button" onClick={()=>setSearch('')} className="mt-4 min-h-11 rounded-lg px-3 text-xs text-white/70">Очистить</button>}</div>}
        {connections && connections.length > 0 ? (
          <div role="group" aria-label="Кого показать" className="mt-3 grid grid-cols-3 gap-1.5">
            {([['all', 'Все'], ['mates', 'Напарники'], ['rivals', 'Соперники']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-10 rounded-xl px-2 text-xs ${filter === value ? 'bg-white text-black font-semibold' : 'bg-white/[0.05] text-white/55'}`}>{label}</button>
            ))}
          </div>
        ) : null}
        {connectionsError ? <div className="mt-3 rounded-2xl bg-rose-300/[0.06] p-3 text-xs text-rose-100/70">{connectionsError}{!connectionsHidden&&<button type="button" onClick={()=>void loadConnections()} className="mt-2 block min-h-11 px-3">Повторить загрузку связей</button>}</div> : connections === null ? <div className="mt-3 py-8 text-center text-xs text-white/30">Загружаем…</div> : connections.length ? (
          <div className="mt-3 space-y-2"><p role="status" className="text-xs text-white/50">Показано {shown.length} из {connections.length}</p>
            {shown.map((item) => (
              <article key={item.player_id} className="overflow-hidden rounded-2xl bg-black/20">
              <button type="button" onClick={() => openPlayerProfile(item.player_id)} className="flex min-h-14 w-full items-center gap-3 p-2.5 text-left active:bg-white/[0.05]">
                <Avatar src={item.avatar_url} name={item.nickname} />
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-semibold">{item.nickname}</div>
                  <div className="mt-0.5 text-xs text-white/45">{item.relationship}</div>
                  <div className="mt-1 text-xs leading-5 text-white/60">{item.same_team_games} в одной команде · {item.opponent_games} друг против друга</div>
                  <div className="mt-1 text-xs leading-5 text-white/60"><TeamResult connection={item}/></div>
                  {item.last_shared_game_date ? <div className="mt-1 text-[11px] text-white/30">Последний раз играли: {fmtDate(item.last_shared_game_date)}</div> : null}
                </div>
                <span className="text-white/25">→</span>
              </button>
              {isSelf&&<PlayerConnectionHistory games={item.recent_shared_games}/>}
              </article>
            ))}
            {!shown.length ? <div className="rounded-2xl bg-black/20 px-3 py-5 text-center text-xs text-white/35">{search.trim()?'Никого не нашли. Измените запрос или очистите поиск.':filter === 'mates' ? 'Пока нет игроков, с кем получилось сыграть в одной команде.' : 'Пока нет игроков, с кем получилось сыграть друг против друга.'}</div> : null}
          </div>
        ) : <div className="mt-3 rounded-2xl bg-black/20 px-3 py-6 text-center text-xs text-white/35">{isSelf ? 'Здесь появятся игроки, с которыми уже сыграно несколько игр.' : 'Пока нет общих игр, чтобы что-то показать.'}</div>}
      </div>}

      {isSelf&&selfSection==='team' ? <PersonalRecentEvening /> : null}
    </section>
  );
}
