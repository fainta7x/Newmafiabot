import React, { useEffect, useMemo, useState } from 'react';

type CareerData = {
  viewer_id: string;
  is_self: boolean;
  player: {
    id: string;
    nickname: string;
    elo: number;
    game_level: string;
    member_since: string | null;
    avatar_url: string;
    title: null | { id: string; label: string; icon: string; hint: string };
  };
  career: {
    games: number;
    wins: number;
    win_rate: number;
    current_streak: number;
    best_streak: number;
    achievements: number;
    red: { games: number; wins: number; win_rate: number };
    black: { games: number; wins: number; win_rate: number };
    roles: Array<{ role: string; label: string; games: number; wins: number; win_rate: number }>;
    strongest_role: null | { role: string; label: string; games: number; wins: number; win_rate: number };
    form: boolean[];
  };
  season: { label: string; games: number; wins: number; win_rate: number; place: number | null; total_players: number };
  recent_games: Array<{ game_key: string; date: string; title: string; game_number: number; source: string; role: string | null; team: 'red' | 'black'; won: boolean }>;
};

const roleIcon = (role: string | null) => role === 'citizen' ? '🔴' : role === 'sheriff' ? '⭐' : role === 'mafia' ? '⚫' : role === 'don' ? '🎩' : '🎭';
const roleLabel = (role: string | null) => role === 'citizen' ? 'Мирный' : role === 'sheriff' ? 'Шериф' : role === 'mafia' ? 'Мафия' : role === 'don' ? 'Дон' : '—';
const levelLabel = (value: string) => value === 'novice' ? 'Новичок' : value === 'rating' ? 'Рейтинговый игрок' : value === 'tournament' ? 'Турнирный игрок' : 'Клубный игрок';
const dateText = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};

export default function PlayerCareerProfile({ playerId, onBack }: { playerId: string; onBack?: () => void }) {
  const [data, setData] = useState<CareerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllGames, setShowAllGames] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch(`/api/player/career/${encodeURIComponent(playerId || 'me')}`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить карьерный профиль');
        if (!cancelled) setData(body as CareerData);
      })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'Не удалось загрузить карьерный профиль'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [playerId]);

  const bestRole = useMemo(() => data?.career.strongest_role || null, [data]);

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#090a0d] text-white"><div className="text-center"><div className="text-4xl">🎭</div><div className="mt-3 text-xs text-white/30">Собираем игровую карьеру…</div></div></main>;
  if (error || !data) return <main className="grid min-h-screen place-items-center bg-[#090a0d] px-5 text-white"><div className="w-full max-w-md rounded-3xl border border-rose-300/10 bg-rose-300/[0.04] p-5 text-center"><div className="text-2xl">⚠️</div><div className="mt-2 text-sm font-semibold">{error || 'Профиль недоступен'}</div>{onBack && <button type="button" onClick={onBack} className="mt-4 rounded-xl bg-white px-4 py-2 text-xs font-bold text-black">Назад</button>}</div></main>;

  const games = showAllGames ? data.recent_games : data.recent_games.slice(0, 8);

  return <main className="min-h-screen bg-[#090a0d] px-3 pb-10 pt-3 text-white">
    <div className="mx-auto w-full max-w-[430px]">
      <div className="flex items-center justify-between gap-3"><button type="button" onClick={onBack || (() => window.history.back())} className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.045] text-white/55">←</button><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/25">Игровая карьера · 2LA Noire</div><div className="h-11 w-11" /></div>

      <section className="mt-3 overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-white/[0.075] via-white/[0.03] to-rose-300/[0.025] p-5 text-center">
        <img src={data.player.avatar_url} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="mx-auto h-28 w-28 rounded-[28px] border border-white/10 object-cover" />
        <h1 className="mt-4 truncate text-3xl font-black">{data.player.nickname}</h1>
        <div className="mt-1 text-xs text-amber-100/45">{data.player.title ? `${data.player.title.icon} ${data.player.title.label}` : levelLabel(data.player.game_level)}</div>
        <div className="mt-5 grid grid-cols-3 gap-1.5"><div className="rounded-2xl bg-black/20 p-3"><div className="text-xl font-black">{Math.round(data.player.elo)}</div><div className="text-[8px] uppercase tracking-wide text-white/25">Elo</div></div><div className="rounded-2xl bg-black/20 p-3"><div className="text-xl font-black">{data.career.games}</div><div className="text-[8px] uppercase tracking-wide text-white/25">игр</div></div><div className="rounded-2xl bg-black/20 p-3"><div className="text-xl font-black">{data.career.win_rate}%</div><div className="text-[8px] uppercase tracking-wide text-white/25">побед</div></div></div>
        <div className="mt-4 flex justify-center gap-1.5">{data.career.form.length ? data.career.form.map((won, index) => <span key={index} className={`h-3 w-3 rounded-full ${won ? 'bg-emerald-400' : 'bg-rose-400'}`} />) : <span className="text-[10px] text-white/25">Форма появится после завершённых игр</span>}</div>
      </section>

      <section className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-[22px] border border-white/[0.06] bg-white/[0.03] p-4"><div className="text-[9px] uppercase tracking-[0.12em] text-white/25">Текущая серия</div><div className="mt-1 text-2xl font-black">{data.career.current_streak || '—'}</div><div className="text-[9px] text-white/25">побед подряд</div></div><div className="rounded-[22px] border border-white/[0.06] bg-white/[0.03] p-4"><div className="text-[9px] uppercase tracking-[0.12em] text-white/25">Рекорд серии</div><div className="mt-1 text-2xl font-black">{data.career.best_streak || '—'}</div><div className="text-[9px] text-white/25">побед подряд</div></div></section>

      <section className="mt-3 rounded-[24px] border border-sky-200/10 bg-sky-200/[0.035] p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-sky-100/40">Текущий сезон</div><div className="mt-1 text-lg font-black">{data.season.label}</div><div className="mt-1 text-[10px] text-white/30">{data.season.wins}/{data.season.games} побед · {data.season.win_rate}%</div></div>{data.season.place && <div className="rounded-2xl bg-black/20 px-3 py-2 text-center"><div className="text-xl font-black">#{data.season.place}</div><div className="text-[8px] text-white/25">из {data.season.total_players}</div></div>}</div></section>

      <section className="mt-3 rounded-[24px] border border-white/[0.06] bg-white/[0.025] p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Карьера по ролям</div><div className="mt-3 grid grid-cols-2 gap-2">{data.career.roles.map((role) => <div key={role.role} className={`rounded-2xl border p-3 ${bestRole?.role === role.role ? 'border-amber-200/15 bg-amber-200/[0.04]' : 'border-white/[0.04] bg-black/15'}`}><div className="flex items-center justify-between"><span className="text-lg">{roleIcon(role.role)}</span>{bestRole?.role === role.role && <span className="text-[8px] text-amber-100/45">сильнейшая</span>}</div><div className="mt-2 text-[11px] font-semibold">{role.label}</div><div className="mt-1 text-xl font-black">{role.games ? `${role.win_rate}%` : '—'}</div><div className="text-[8px] text-white/25">{role.wins}/{role.games} побед</div></div>)}</div></section>

      <section className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-[22px] border border-rose-200/10 bg-rose-200/[0.03] p-4"><div className="text-[9px] uppercase tracking-[0.12em] text-rose-100/35">🔴 За красных</div><div className="mt-1 text-2xl font-black">{data.career.red.win_rate}%</div><div className="text-[9px] text-white/25">{data.career.red.wins}/{data.career.red.games} побед</div></div><div className="rounded-[22px] border border-white/[0.06] bg-white/[0.025] p-4"><div className="text-[9px] uppercase tracking-[0.12em] text-white/30">⚫ За чёрных</div><div className="mt-1 text-2xl font-black">{data.career.black.win_rate}%</div><div className="text-[9px] text-white/25">{data.career.black.wins}/{data.career.black.games} побед</div></div></section>

      {data.career.achievements > 0 && <section className="mt-3 rounded-[22px] border border-amber-200/10 bg-amber-200/[0.03] p-4"><div className="text-[9px] uppercase tracking-[0.12em] text-amber-100/35">🏅 Достижения</div><div className="mt-1 text-2xl font-black">{data.career.achievements}</div><div className="text-[9px] text-white/25">открыто в клубной истории</div></section>}

      <section className="mt-4"><div className="flex items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Последние игры</div><div className="mt-0.5 text-[9px] text-white/20">Завершённые клубные и турнирные партии</div></div>{data.recent_games.length > 8 && <button type="button" onClick={() => setShowAllGames((value) => !value)} className="text-[9px] font-semibold text-white/35">{showAllGames ? 'Свернуть' : 'Показать 20'}</button>}</div><div className="mt-2 space-y-1.5">{games.map((game) => <div key={game.game_key} className="flex items-center gap-3 rounded-2xl border border-white/[0.04] bg-white/[0.025] p-3"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${game.won ? 'bg-emerald-300/10' : 'bg-rose-300/10'}`}>{game.won ? '✓' : '×'}</div><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold">{game.title}</div><div className="mt-0.5 text-[9px] text-white/25">{dateText(game.date)} · {roleIcon(game.role)} {roleLabel(game.role)} · игра {game.game_number}</div></div><div className={`text-[9px] font-semibold ${game.won ? 'text-emerald-300' : 'text-rose-300'}`}>{game.won ? 'Победа' : 'Поражение'}</div></div>)}</div></section>

      <div className="mt-6 text-center text-[9px] text-white/18">{data.player.member_since ? `В клубной базе с ${dateText(data.player.member_since)} · ` : ''}2LA noire · Тула</div>
    </div>
  </main>;
}
