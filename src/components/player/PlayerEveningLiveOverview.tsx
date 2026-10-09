import { useEffect, useState } from 'react';

type Game = {
  id: number;
  game_key: string;
  local_number: number;
  status: 'completed' | 'draft';
  winner_team: 'red' | 'black' | null;
  table_name: string | null;
  judge_name: string | null;
  players: Array<{ seat_number: number; player_id: string | null; nickname: string }>;
  self_played: boolean;
  self_seat?: number | null;
  self_won: boolean | null;
};

type Journey = {
  phase: string;
  evening?: { id: string; title: string; starts_at: string | null; venue: string | null };
  participation?: { state?: string; response_status?: string; attendance_status?: string; seat_number?: number | null; game_id?: number | null };
  score?: { red: number; black: number; completed: number };
  present_count?: number;
  roster?: Array<{ player_id: string; nickname: string; response_status: string; attendance_status: string }>;
  current_game?: Game | null;
  current_games?: Game[];
  recent_results?: Game[];
};

const stateLabel: Record<string, string> = {
  playing: 'Ты за столом', waiting: 'Ты на вечере, ждёшь игру',
  expected: 'Ты записан на вечер', watching: 'Ты пока не записан',
};
const winner = (team: Game['winner_team']) => team === 'red' ? 'Победа красных' : team === 'black' ? 'Победа чёрных' : 'Ожидаем результат';

export default function PlayerEveningLiveOverview({ onOpenGame, onOpenEvening }: {
  onOpenGame: (gameKey: string, eveningId: string) => void;
  onOpenEvening: (eveningId: string) => void;
}) {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch('/api/player/evening-journey', { credentials: 'include', cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить вечер');
        if (alive) { setJourney(body.journey || null); setError(''); }
      } catch (err: any) {
        if (alive) setError(err?.message || 'Не удалось обновить вечер');
      }
    };
    void load();
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30000);
    return () => { alive = false; window.clearInterval(interval); };
  }, []);

  const active = journey?.phase === 'live' && journey.evening;
  if (!active && !error) return null;
  const recent = journey?.recent_results || [];
  const activeGames = journey?.current_games || (journey?.current_game ? [journey.current_game] : []);
  return <section data-testid="player-evening-live-overview" className="mx-auto mb-3 w-full max-w-[430px] px-3">
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      {active ? <>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200/65">Вечер идёт сейчас</div>
            <h2 className="mt-1 text-lg font-semibold">{journey.evening!.title}</h2>
            <p className="mt-1 text-xs text-white/45">{stateLabel[journey.participation?.state || ''] || 'Вечер в процессе'}{journey.participation?.seat_number ? ` · место #${journey.participation.seat_number}` : ''}</p>
          </div>
          <div className="shrink-0 rounded-xl bg-black/25 px-3 py-2 text-center">
            <div className="text-xl font-black">{journey.score?.red || 0}:{journey.score?.black || 0}</div>
            <div className="text-[10px] text-white/35">красные / чёрные</div>
          </div>
        </div>
        {activeGames.map((game) => <div key={game.id} className="mt-3 rounded-2xl bg-black/20 p-3">
          <div className="text-xs font-semibold">Сейчас игра {game.local_number} · {game.table_name || 'Стол'}</div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {game.players.map((player) => <div key={player.seat_number} className={`truncate rounded-lg px-2 py-1.5 text-[11px] ${game.self_seat != null && game.self_seat === player.seat_number ? 'bg-emerald-300/15 text-emerald-100' : 'bg-white/[0.05] text-white/55'}`}>#{player.seat_number} {player.nickname}</div>)}
          </div>
          <p className="mt-2 text-[11px] text-white/35">Роли и закрытые проверки откроются только после завершения партии.</p>
        </div>)}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="text-xs text-white/40">{journey.score?.completed || 0} завершённых игр · {journey.present_count || 0} участников</div>
          <button type="button" onClick={() => onOpenEvening(journey.evening!.id)} className="min-h-10 rounded-xl bg-white/[0.08] px-3 text-xs font-semibold">Моё участие ›</button>
        </div>
        {(journey.roster?.length || 0) > 0 && <details className="mt-3 rounded-2xl bg-black/20 p-3">
          <summary className="cursor-pointer text-xs font-semibold">Участники вечера · {journey.roster!.length}</summary>
          <div className="mt-3 space-y-1.5">{journey.roster!.map(person => <div key={person.player_id} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs">
            <span className="min-w-0 truncate">{person.nickname}</span>
            <span className="shrink-0 text-white/40">{person.attendance_status === 'attended' ? 'На месте' : person.response_status === 'late' ? 'Опаздывает' : person.response_status === 'going' ? 'Записан' : 'Думает'}</span>
          </div>)}</div>
        </details>}
        {recent.length > 0 && <div className="mt-3 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-white/40">Все завершённые игры · полные протоколы</h3>
          {recent.map(game => <button key={game.id} type="button" onClick={() => onOpenGame(game.game_key, journey.evening!.id)} className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl bg-black/25 px-3 text-left text-xs">
            <span><strong>Игра {game.local_number}</strong><span className="mt-1 block text-white/45">{game.table_name || 'Стол'} · {winner(game.winner_team)}</span></span>
            <span className="text-white/50">Протокол ›</span>
          </button>)}
        </div>}
      </> : <p className="text-xs text-rose-200/80">{error}</p>}
    </div>
  </section>;
}
