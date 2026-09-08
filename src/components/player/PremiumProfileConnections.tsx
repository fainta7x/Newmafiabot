import { useEffect, useMemo, useState } from 'react';

type Connection = {
  player_id: string;
  nickname: string;
  avatar_url: string;
  relationship: string;
  shared_games: number;
  same_team_games: number;
  opponent_games: number;
  last_played_at: string | null;
};

type ReferralPlayer = {
  player_id: string;
  nickname: string;
  avatar_url: string;
  created_at?: string | null;
};

type InvitationEvening = {
  id: string;
  title: string;
  starts_at: string | null;
  venue: string | null;
  format: string;
  existing_invitation?: { id: string; status: string; created_at: string } | null;
};

type IncomingInvitation = {
  id: string;
  evening_id: string;
  status: 'sent' | 'opened' | 'accepted';
  evening: { id: string; title: string; starts_at: string | null; venue: string | null; format: string; status: string };
  inviter: { player_id: string; nickname: string; avatar_url: string };
};

const fmtDate = (value: string | null) => value && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : 'Дата не указана';

function openPlayerProfile(playerId: string) {
  const path = `/player/players/${encodeURIComponent(playerId)}`;
  const current = window.location.pathname;
  window.history.pushState({ playerProfileReturn: current }, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function openEvening(eveningId: string) {
  const path = `/player/events/${encodeURIComponent(eveningId)}`;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function Avatar({ src, name }: { src?: string | null; name: string }) {
  return src ? <img src={src} alt="" className="h-11 w-11 shrink-0 rounded-2xl object-cover ring-1 ring-white/10" />
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
  const [invitedBy, setInvitedBy] = useState<ReferralPlayer | null>(null);
  const [invitedPlayers, setInvitedPlayers] = useState<ReferralPlayer[]>([]);
  const [connectionsError, setConnectionsError] = useState('');
  const [context, setContext] = useState<{ can_invite: boolean; reason?: string | null; evenings: InvitationEvening[] } | null>(null);
  const [inbox, setInbox] = useState<IncomingInvitation[]>([]);
  const [selectedEveningId, setSelectedEveningId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const loadConnections = async () => {
    setConnectionsError('');
    try {
      const response = await fetch(`/api/player/profiles/${encodeURIComponent(playerId)}/connections`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить связи');
      setConnections(Array.isArray(body.connections) ? body.connections : []);
      setInvitedBy(body.invited_by || null);
      setInvitedPlayers(Array.isArray(body.invited_players) ? body.invited_players : []);
    } catch (error: any) {
      setConnections(null);
      setInvitedBy(null);
      setInvitedPlayers([]);
      setConnectionsError(error?.message || 'Не удалось загрузить связи');
    }
  };

  const loadInviteContext = async () => {
    if (isSelf) return;
    try {
      const response = await fetch(`/api/player/profiles/${encodeURIComponent(playerId)}/invitation-context`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось проверить приглашение');
      setContext(body);
      const firstAvailable = (body.evenings || []).find((item: InvitationEvening) => !item.existing_invitation);
      setSelectedEveningId((current) => current || firstAvailable?.id || body.evenings?.[0]?.id || '');
    } catch {
      setContext({ can_invite: false, reason: 'unavailable', evenings: [] });
    }
  };

  const loadInbox = async () => {
    if (!isSelf) return;
    try {
      const response = await fetch('/api/player/evening-invitations/inbox', { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (response.ok) setInbox(Array.isArray(body.invitations) ? body.invitations : []);
    } catch {
      // Connections remain usable if invitation inbox cannot be refreshed.
    }
  };

  useEffect(() => { void loadConnections(); }, [playerId]);
  useEffect(() => { void (isSelf ? loadInbox() : loadInviteContext()); }, [playerId, selfPlayerId]);

  const selectedEvening = useMemo(() => context?.evenings.find((item) => item.id === selectedEveningId) || null, [context, selectedEveningId]);

  const sendInvitation = async () => {
    if (!selectedEveningId || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/player/profiles/${encodeURIComponent(playerId)}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ evening_id: selectedEveningId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось отправить приглашение');
      setMessage(body.created === false ? 'Приглашение уже было отправлено.' : 'Приглашение отправлено. Запись на вечер у игрока не изменилась.');
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
      const response = await fetch(`/api/player/evening-invitations/${encodeURIComponent(invitation.id)}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось обработать приглашение');
      if (action === 'open') {
        openEvening(invitation.evening_id);
        return;
      }
      if (action === 'accept') setMessage('Приглашение принято. Место не забронировано — запись подтверждается отдельно.');
      await loadInbox();
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось обработать приглашение');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid="premium-profile-connections" className="space-y-3">
      {isSelf && inbox.length > 0 ? (
        <div className="rounded-[26px] border border-amber-200/10 bg-amber-200/[0.045] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100/55">Приглашения</div>
          <h2 className="mt-1 text-base font-semibold">Тебя зовут на игру</h2>
          <p className="mt-1 text-xs leading-5 text-white/40">Принять приглашение — не то же самое, что записаться. Место подтверждается на странице вечера.</p>
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
        <div className="rounded-[26px] border border-white/10 bg-white/[0.045] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Позвать за стол</div>
          <h2 className="mt-1 text-base font-semibold">Пригласить на игровой вечер</h2>
          <p className="mt-1 text-xs leading-5 text-white/40">Доступны вечера, на которые ты уже идёшь и которые подходят обоим игрокам.</p>
          <select value={selectedEveningId} onChange={(event) => setSelectedEveningId(event.target.value)} className="mobile-field mt-3 w-full text-sm" aria-label="Игровой вечер для приглашения">
            {context.evenings.map((evening) => <option key={evening.id} value={evening.id}>{evening.title} · {fmtDate(evening.starts_at)}{evening.existing_invitation ? ' · уже приглашён' : ''}</option>)}
          </select>
          {selectedEvening ? <div className="mt-2 text-xs text-white/35">{selectedEvening.venue || 'Площадка не указана'}</div> : null}
          <button type="button" disabled={busy || !selectedEveningId || Boolean(selectedEvening?.existing_invitation)} onClick={() => void sendInvitation()} className="mt-3 min-h-12 w-full rounded-2xl bg-white px-4 text-sm font-semibold text-black disabled:opacity-35">{selectedEvening?.existing_invitation ? 'Приглашение уже отправлено' : busy ? 'Отправляем…' : 'Позвать на этот вечер'}</button>
          <p className="mt-2 text-[11px] leading-4 text-white/30">Приглашение появится в приложении и уйдёт в Telegram, если он привязан. Оно не создаёт запись автоматически.</p>
        </div>
      ) : null}

      {message ? <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-3 text-xs leading-5 text-white/65">{message}</div> : null}

      {(invitedBy || invitedPlayers.length > 0) ? <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Клубные связи</div>
        <h2 className="mt-1 text-base font-semibold">Кто кого привёл в 2LA noire</h2>
        <p className="mt-1 text-xs leading-5 text-white/35">Только подтверждённая организатором история — без догадок по старым данным.</p>
        <div className="mt-3 space-y-2">
          {invitedBy ? <ReferralLink label="В клуб пригласил" player={invitedBy} /> : null}
          {invitedPlayers.map((item) => <ReferralLink key={item.player_id} label="Пригласил в клуб" player={item} />)}
        </div>
      </div> : null}

      <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-start justify-between gap-3">
          <div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Связи за столом</div><h2 className="mt-1 text-base font-semibold">С кем чаще пересекается игрок</h2></div>
          {connections ? <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-white/40">{connections.length}</span> : null}
        </div>
        <p className="mt-1 text-xs leading-5 text-white/35">Только факты завершённых игр: один стол, одна команда или разные стороны. Без оценок совместимости.</p>
        {connectionsError ? <div className="mt-3 rounded-2xl bg-rose-300/[0.06] p-3 text-xs text-rose-100/70">{connectionsError}</div> : connections === null ? <div className="mt-3 py-8 text-center text-xs text-white/30">Считаем связи…</div> : connections.length ? (
          <div className="mt-3 space-y-2">
            {connections.map((item) => (
              <button key={item.player_id} type="button" onClick={() => openPlayerProfile(item.player_id)} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-black/20 p-2.5 text-left active:bg-white/[0.05]">
                <Avatar src={item.avatar_url} name={item.nickname} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{item.nickname}</div>
                  <div className="mt-0.5 text-xs text-white/40">{item.relationship}</div>
                  <div className="mt-1 text-[11px] text-white/28">вместе {item.same_team_games} · против {item.opponent_games} · всего {item.shared_games}</div>
                </div>
                <span className="text-white/25">→</span>
              </button>
            ))}
          </div>
        ) : <div className="mt-3 rounded-2xl bg-black/20 px-3 py-6 text-center text-xs text-white/35">Нужно минимум две завершённые совместные игры, чтобы показать связь.</div>}
      </div>
    </section>
  );
}
