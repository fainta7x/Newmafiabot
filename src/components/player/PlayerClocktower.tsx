import { useCallback, useEffect, useState } from 'react';
import PokerInvitePanel from './PokerInvitePanel.tsx';

/**
 * «Кровь на часовой башне» (owner, 2026-10-18): a joke-level stub next to the poker table. There is no game engine:
 * rooms gather people, the Storyteller is chosen by hand, the game is played at a real table. The rules live in the guide.
 */
type Member = { player_id: string; nickname: string; is_storyteller: boolean };
type Room = {
  id: string; title: string; note: string; starts_at: string | null; host_nickname: string;
  members: Member[]; joined: boolean; is_host: boolean; has_storyteller: boolean; i_am_storyteller: boolean;
};

const MAX_PLAYERS = 20;

const formatStart = (value: string | null) => {
  if (!value) return 'Время не назначено';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Время не назначено' : date.toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
};

const request = async (url: string, method: 'GET' | 'POST', body?: unknown) => {
  const response = await fetch(url, {
    method, credentials: 'include',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Не получилось. Попробуйте ещё раз.');
  return data;
};

export default function PlayerClocktower({ initialRoomId = null, onExit, onOpenRules, onOpenRoom }: {
  initialRoomId?: string | null; onExit?: () => void; onOpenRules?: () => void; onOpenRoom?: (roomId: string | null) => void;
}) {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [startsAt, setStartsAt] = useState('');

  const load = useCallback(async () => {
    const data = await request('/api/player/clocktower/rooms', 'GET');
    setRooms(Array.isArray(data?.rooms) ? data.rooms : []);
  }, []);

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message));
    const timer = window.setInterval(() => void load().catch(() => undefined), 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try { await work(); await load(); } catch (e: any) { setError(e?.message || 'Не получилось.'); } finally { setBusy(false); }
  };

  const current = initialRoomId ? rooms?.find((room) => room.id === initialRoomId) || null : null;
  const roomUrl = (roomId: string) => `/api/player/clocktower/rooms/${encodeURIComponent(roomId)}`;

  const create = () => act(async () => {
    const data = await request('/api/player/clocktower/rooms', 'POST', { title, note, starts_at: startsAt ? new Date(startsAt).toISOString() : '' });
    setCreating(false); setTitle(''); setNote(''); setStartsAt('');
    onOpenRoom?.(String(data.id));
  });

  const header = (
    <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-white/10 bg-[#0b0a12]/95 px-3 backdrop-blur">
      <button type="button" data-testid="clocktower-back" onClick={() => (current ? onOpenRoom?.(null) : onExit?.())} className="min-h-10 rounded-xl border border-white/10 px-3 text-sm text-white/70">← {current ? 'К комнатам' : 'В приложение'}</button>
      <div className="text-center"><div className="text-sm font-semibold">Кровь на часовой башне</div><div className="text-[9px] uppercase tracking-[.2em] text-rose-200/50">Настольная игра · заглушка</div></div>
      <span className="w-[106px]" />
    </header>
  );

  const roomCard = (room: Room, full: boolean) => {
    const seats = room.members.length;
    return (
      <section key={room.id} data-testid="clocktower-room" className="space-y-3 rounded-3xl border border-white/10 bg-black/35 p-4">
        <div>
          <h2 className="text-base font-semibold">{room.title}</h2>
          <p className="mt-0.5 text-xs text-white/50">{formatStart(room.starts_at)} · зовёт {room.host_nickname}</p>
          {room.note ? <p className="mt-2 whitespace-pre-line text-sm text-white/70">{room.note}</p> : null}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-white/40">В комнате {seats} из {MAX_PLAYERS}{room.has_storyteller ? '' : ' · Рассказчика нет'}</div>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {room.members.map((member) => (
              <li key={member.player_id} className={`rounded-full px-2.5 py-1 text-xs ${member.is_storyteller ? 'bg-rose-300/20 text-rose-100' : 'bg-white/[.07] text-white/80'}`}>{member.is_storyteller ? '📖 ' : ''}{member.nickname}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          {room.joined ? (
            <>
              <button type="button" disabled={busy} data-testid="clocktower-leave" onClick={() => void act(async () => { await request(`${roomUrl(room.id)}/leave`, 'POST'); if (full) onOpenRoom?.(null); })} className="min-h-10 rounded-xl border border-white/15 px-3 text-sm text-white/75">Выйти</button>
              <button type="button" disabled={busy} data-testid="clocktower-storyteller" onClick={() => void act(() => request(`${roomUrl(room.id)}/storyteller`, 'POST', { value: !room.i_am_storyteller }))} className="min-h-10 rounded-xl border border-rose-200/25 px-3 text-sm text-rose-100">{room.i_am_storyteller ? 'Не буду Рассказчиком' : 'Я — Рассказчик'}</button>
              {room.is_host ? <button type="button" disabled={busy} data-testid="clocktower-close" onClick={() => { if (window.confirm('Закрыть комнату для всех?')) void act(async () => { await request(`${roomUrl(room.id)}/close`, 'POST'); if (full) onOpenRoom?.(null); }); }} className="min-h-10 rounded-xl border border-white/15 px-3 text-sm text-white/55">Закрыть комнату</button> : null}
            </>
          ) : (
            <button type="button" disabled={busy || seats >= MAX_PLAYERS} data-testid="clocktower-join" onClick={() => void act(() => request(`${roomUrl(room.id)}/join`, 'POST'))} className="min-h-11 rounded-xl bg-rose-300 px-4 text-sm font-black text-black disabled:opacity-50">{seats >= MAX_PLAYERS ? 'Мест нет' : 'Присоединиться'}</button>
          )}
          {!full ? <button type="button" data-testid="clocktower-open-room" onClick={() => onOpenRoom?.(room.id)} className="min-h-10 rounded-xl border border-white/15 px-3 text-sm text-white/75">Открыть</button> : null}
        </div>
        {full && room.joined ? (
          <PokerInvitePanel
            lobbyId={room.id}
            candidatesUrl="/api/player/clocktower/invite-candidates"
            inviteUrl={`${roomUrl(room.id)}/invite`}
            contactText={`Зову тебя сыграть в «Кровь на часовой башне»: ${typeof window !== 'undefined' ? window.location.origin : ''}/player/clocktower/${encodeURIComponent(room.id)}`}
          />
        ) : null}
      </section>
    );
  };

  return (
    <main data-testid="player-clocktower" className="min-h-[var(--tg-viewport-stable-height,100dvh)] bg-[#0b0a12] px-3 pb-12 pt-20 text-white">
      {header}
      <div className="mx-auto max-w-lg space-y-4">
        <section className="rounded-3xl border border-rose-200/15 bg-gradient-to-b from-rose-950/50 to-black/40 p-4">
          <h1 className="text-lg font-semibold">Кровь на часовой башне</h1>
          <p className="mt-1 text-sm leading-6 text-white/65">Социальная игра на дедукцию: добрые ищут Демона, злые прячутся. Играем за столом руками, нужен Рассказчик. Здесь можно собрать комнату и позвать людей.</p>
          <p className="mt-2 text-[11px] leading-4 text-white/40">Это шуточная заглушка: самой игры в приложении нет, на рейтинг и статистику мафии вечер не влияет.</p>
          <button type="button" data-testid="clocktower-rules" onClick={onOpenRules} className="mt-3 min-h-10 rounded-xl border border-white/15 px-3 text-sm text-white/80">Правила и роли →</button>
        </section>

        {error ? <div role="alert" className="rounded-2xl bg-rose-400/15 p-3 text-sm text-rose-100">{error}</div> : null}

        {current ? roomCard(current, true) : initialRoomId && rooms ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-4 text-center text-sm text-white/50">Эта комната закрыта или её уже нет.</div>
        ) : (
          <>
            {creating ? (
              <section className="space-y-2 rounded-3xl border border-white/10 bg-black/35 p-4" data-testid="clocktower-create-form">
                <label className="block text-xs text-white/55">Название<input data-testid="clocktower-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Кровь на часовой башне" className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-white/[.06] px-3 text-sm text-white" /></label>
                <label className="block text-xs text-white/55">Когда<input data-testid="clocktower-starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-white/[.06] px-3 text-sm text-white" /></label>
                <label className="block text-xs text-white/55">Пара слов для гостей<textarea data-testid="clocktower-note" value={note} maxLength={400} rows={3} onChange={(e) => setNote(e.target.value)} placeholder="Где собираемся, кто ведёт, есть ли набор игры" className="mt-1 w-full rounded-xl border border-white/10 bg-white/[.06] px-3 py-2 text-sm text-white" /></label>
                <div className="flex gap-2">
                  <button type="button" disabled={busy} data-testid="clocktower-create-submit" onClick={() => void create()} className="min-h-11 flex-1 rounded-xl bg-rose-300 text-sm font-black text-black">Создать комнату</button>
                  <button type="button" onClick={() => setCreating(false)} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm text-white/70">Отмена</button>
                </div>
              </section>
            ) : (
              <button type="button" data-testid="clocktower-create" onClick={() => setCreating(true)} className="min-h-12 w-full rounded-2xl bg-rose-300 text-sm font-black text-black">Создать комнату и позвать людей</button>
            )}
            {rooms === null ? <div className="p-4 text-center text-sm text-white/40">Загружаем…</div> : rooms.length ? rooms.map((room) => roomCard(room, false)) : (
              <div className="rounded-2xl border border-dashed border-white/15 p-4 text-center text-sm text-white/45">Открытых комнат пока нет. Создайте первую.</div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
