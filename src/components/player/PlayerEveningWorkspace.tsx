import { useEffect, useState } from 'react';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';
import { playerPathForSection } from '../../lib/appNavigation.ts';

type Person = {
  player_id: string;
  nickname: string;
  table_id: string | null;
  response_status: string;
  attendance_status: string;
  is_self: boolean;
};
type Game = {
  id: number;
  game_key: string | null;
  local_number: number;
  global_number: number;
  table_id: string | null;
  table_name: string | null;
  judge_name: string | null;
  status: 'draft' | 'completed';
  winner_team: 'red' | 'black' | null;
  self_seat: number | null;
  players: Array<{ seat_number: number; player_id: string | null; nickname: string }>;
};
export type PlayerEveningWorkspaceData = {
  evening: { id: string; title: string; status: string; capacity: number };
  participation: {
    response_status: string;
    registration_status: string;
    attendance_status: string;
    can_change_selection: boolean;
  };
  roster: Person[];
  tables: Array<{ id: string; name: string; host_name: string | null; capacity: number; players: Person[] }>;
  games: Game[];
  score: { red: number; black: number; completed: number; running: number };
};
const attendanceLabel = (person: Person) => {
  if (person.attendance_status === 'attended') return 'На месте';
  if (person.response_status === 'late') return 'Опаздывает';
  if (person.response_status === 'going') return 'Идёт';
  if (person.response_status === 'thinking') return 'Думает';
  return 'Участник';
};
const ownStatus = (value: string) =>
  value === 'going' ? 'Иду' : value === 'late' ? 'Приду позже'
    : value === 'thinking' ? 'Пока думаю' : value === 'declined' ? 'Не иду' : 'Пока нет записи';

export default function PlayerEveningWorkspace({
  eveningId, onOpenGame, onCanChangeSelection, refreshKey = 0,
}: {
  eveningId: string;
  onOpenGame?: (gameKey: string, eveningId: string) => void;
  onCanChangeSelection?: (allowed: boolean) => void;
  refreshKey?: number;
}) {
  const [data, setData] = useState<PlayerEveningWorkspaceData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/player/evenings/${encodeURIComponent(eveningId)}/overview`, {
          credentials: 'include', cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || 'Не удалось загрузить вечер');
        if (active) {
          setData(payload as PlayerEveningWorkspaceData);
          setError('');
          onCanChangeSelection?.(Boolean(payload?.participation?.can_change_selection));
        }
      } catch (cause: any) {
        if (active) setError(cause?.message || 'Не удалось загрузить вечер');
      } finally {
        if (active) setBusy(false);
      }
    };
    setBusy(true);
    setData(null);
    setError('');
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, [eveningId, refreshKey]);

  if (busy && !data) return <section className="mt-3 rounded-2xl bg-white/[0.035] p-4 text-xs text-white/50">Загружаем участников и игры…</section>;
  if (!data) return <section role="status" className="mt-3 rounded-2xl border border-white/10 p-4 text-xs text-white/55">{error || 'Информация о вечере пока недоступна'}</section>;

  const unassigned = data.roster.filter(person => !person.table_id || !data.tables.some(table => table.id === person.table_id));
  const activeGames = data.games.filter(game => game.status !== 'completed');
  const finishedGames = data.games.filter(game => game.status === 'completed');
  const showPerson = (person: Person) => <button type="button" key={person.player_id}
    onClick={() => openCanonicalPlayerProfile(person.player_id)}
    className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs ${person.is_self ? 'bg-emerald-300/10 text-emerald-100' : 'bg-white/[0.045] text-white/70'}`}>
    <span className="min-w-0 truncate">{person.is_self ? '★ ' : ''}{person.nickname}</span>
    <span className="shrink-0 text-[11px] text-white/40">{attendanceLabel(person)}</span>
  </button>;
  const gameCard = (game: Game) => <article key={game.id} className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h4 className="text-sm font-semibold">Игра {game.local_number} · {game.table_name || 'Стол не указан'}</h4>
        <p className="mt-1 text-[11px] text-white/45">{game.judge_name ? `Ведущий: ${game.judge_name} · ` : ''}
          {game.status === 'completed' ? game.winner_team === 'red' ? 'Победа красных' : game.winner_team === 'black' ? 'Победа чёрных' : 'Завершена' : 'Идёт / готовится'}</p>
      </div>
      {game.game_key && <a href={playerPathForSection('games', game.game_key)}
        onClick={event => { if (onOpenGame) { event.preventDefault(); onOpenGame(game.game_key!, eveningId); } }}
        className="flex min-h-10 shrink-0 items-center rounded-xl bg-white/[0.10] px-3 text-xs font-semibold text-white">Протокол ›</a>}
    </div>
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      {game.players.map(person => <div key={person.seat_number}
        className={`truncate rounded-lg px-2 py-2 text-[11px] ${person.seat_number === game.self_seat && game.self_seat !== null ? 'bg-emerald-300/15 text-emerald-100' : 'bg-white/[0.05] text-white/60'}`}>
        #{person.seat_number} {person.nickname}
      </div>)}
    </div>
    {game.status !== 'completed' && <p className="mt-2 text-[11px] text-white/35">Роли и проверки откроются после игры.</p>}
  </article>;

  return <section data-testid="player-evening-workspace" className="mt-3 space-y-3 text-white">
    <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.04] p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold">Вечер в деталях</h2>
          <p className="mt-1 text-xs text-white/50">{data.evening.status === 'completed' ? 'Вечер завершён' : data.evening.status === 'active' ? 'Вечер идёт' : 'Идёт набор'} · {ownStatus(data.participation.response_status)}</p>
          {data.participation.registration_status === 'waitlist' && <p className="mt-1 text-[11px] text-amber-100/70">В резерве</p>}
          {data.participation.registration_status === 'confirmed' && <p className="mt-1 text-[11px] text-emerald-100/70">Участие подтверждено</p>}
          {data.participation.attendance_status === 'attended' && <p className="mt-1 text-[11px] text-emerald-200/70">Присутствие отмечено</p>}
        </div>
        <div className="shrink-0 rounded-xl bg-black/25 px-3 py-2 text-center">
          <div className="text-xl font-bold">{data.score.red}:{data.score.black}</div>
          <div className="text-[10px] text-white/40">Красные / чёрные</div>
        </div>
      </div>
      <p className="mt-3 text-xs text-white/45">{data.roster.length} участников · {data.tables.length} столов · {data.score.completed} завершённых партий</p>
      {!data.participation.can_change_selection && data.evening.status !== 'completed' && <p className="mt-2 text-[11px] text-amber-100/60">Запись после отметки явки изменяет организатор.</p>}
    </div>

    <details className="rounded-[22px] border border-white/[0.07] bg-white/[0.03] p-3" open={data.evening.status === 'active'}>
      <summary className="cursor-pointer px-1 text-sm font-semibold">Участники и рассадка · {data.roster.length}</summary>
      <div className="mt-3 space-y-3">
        {data.tables.map(table => <div key={table.id} className="rounded-2xl bg-black/20 p-3">
          <div className="flex items-center justify-between gap-2 text-xs"><strong>{table.name}</strong><span className="text-white/40">{table.players.length}/{table.capacity || '—'}</span></div>
          {table.host_name && <p className="mt-1 text-[11px] text-white/35">Ведущий: {table.host_name}</p>}
          <div className="mt-2 space-y-1">{table.players.length ? table.players.map(showPerson) : <p className="text-xs text-white/35">Рассадка пока не назначена</p>}</div>
        </div>)}
        {unassigned.length > 0 && <div className="rounded-2xl bg-black/20 p-3"><div className="text-xs font-semibold">Без назначенного стола · {unassigned.length}</div><div className="mt-2 space-y-1">{unassigned.map(showPerson)}</div></div>}
        {!data.roster.length && <p className="px-2 py-2 text-xs text-white/40">Пока никто не записался.</p>}
      </div>
    </details>

    {data.games.length > 0 && <div className="rounded-[22px] border border-white/[0.07] bg-white/[0.03] p-3">
      <h3 className="px-1 text-sm font-semibold">Игры вечера · {data.games.length}</h3>
      <p className="mt-1 px-1 text-[11px] text-white/40">После завершения игры доступен полный протокол как в CRM, но только для просмотра.</p>
      {activeGames.length > 0 && <div className="mt-3 space-y-2"><p className="px-1 text-[11px] uppercase tracking-wide text-amber-100/60">На столах сейчас</p>{activeGames.map(gameCard)}</div>}
      {finishedGames.length > 0 && <div className="mt-3 space-y-2"><p className="px-1 text-[11px] uppercase tracking-wide text-emerald-100/60">Завершённые партии</p>{finishedGames.map(gameCard)}</div>}
    </div>}
    {error && <p role="status" className="px-1 text-[11px] text-amber-100/60">Не удалось обновить данные: {error}</p>}
  </section>;
}
