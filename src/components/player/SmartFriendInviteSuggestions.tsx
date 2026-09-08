import { useEffect, useState } from 'react';

type Suggestion = {
  player_id: string;
  nickname: string;
  avatar_url: string;
  relationship: string;
  shared_games: number;
  same_team_games: number;
  opponent_games: number;
  evening: {
    id: string;
    title: string;
    starts_at: string | null;
    venue: string | null;
    format: string;
  };
};

const fmtDate = (value: string | null) => value && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : 'Дата не указана';

function openPlayerProfile(playerId: string) {
  const path = `/player/players/${encodeURIComponent(playerId)}`;
  window.history.pushState({ playerProfileReturn: window.location.pathname }, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function SmartFriendInviteSuggestions() {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPlayerId, setBusyPlayerId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const response = await fetch('/api/player/friend-invite-suggestions', { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить подсказки');
      setItems(Array.isArray(body.suggestions) ? body.suggestions : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const invite = async (item: Suggestion) => {
    if (busyPlayerId) return;
    setBusyPlayerId(item.player_id);
    setMessage('');
    try {
      const response = await fetch(`/api/player/profiles/${encodeURIComponent(item.player_id)}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ evening_id: item.evening.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось отправить приглашение');
      setMessage(`${item.nickname}: приглашение отправлено.`);
      setItems((current) => current.filter((candidate) => candidate.player_id !== item.player_id));
      void load();
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось отправить приглашение');
    } finally {
      setBusyPlayerId(null);
    }
  };

  if (!loading && items.length === 0 && !message) return null;

  return (
    <section data-testid="smart-friend-invite-suggestions" className="rounded-[26px] border border-white/10 bg-white/[0.045] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Позови своих</div>
      <h2 className="mt-1 text-base font-semibold">С кем ты часто играешь</h2>
      <p className="mt-1 text-xs leading-5 text-white/40">Показываем знакомых по завершённым играм, которые ещё не записались на ближайший вечер, куда ты уже идёшь.</p>

      {loading ? <div className="py-5 text-center text-xs text-white/30">Ищем, кого можно позвать…</div> : null}

      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <article key={`${item.player_id}:${item.evening.id}`} className="rounded-2xl bg-black/20 p-3">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => openPlayerProfile(item.player_id)} className="shrink-0" aria-label={`Открыть профиль ${item.nickname}`}>
                <img src={item.avatar_url} alt="" className="h-11 w-11 rounded-2xl object-cover ring-1 ring-white/10" />
              </button>
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => openPlayerProfile(item.player_id)} className="block max-w-full truncate text-left text-sm font-semibold">{item.nickname}</button>
                <div className="mt-0.5 text-xs text-white/40">{item.relationship} · {item.shared_games} игр вместе</div>
                <div className="mt-1 text-[11px] leading-4 text-white/30">Не записан на «{item.evening.title}» · {fmtDate(item.evening.starts_at)}</div>
              </div>
            </div>
            <button
              type="button"
              disabled={busyPlayerId !== null}
              onClick={() => void invite(item)}
              className="mt-3 min-h-11 w-full rounded-xl bg-white px-3 text-xs font-semibold text-black disabled:opacity-40"
            >
              {busyPlayerId === item.player_id ? 'Отправляем…' : `Позвать ${item.nickname}`}
            </button>
          </article>
        ))}
      </div>

      {message ? <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-white/60">{message}</div> : null}
    </section>
  );
}
