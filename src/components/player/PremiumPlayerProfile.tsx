import React, { useEffect, useMemo, useState } from 'react';

export type PremiumProfileMode = 'self' | 'public' | 'organizer';
type ProfileTab = 'overview' | 'games' | 'roles' | 'elo';

type Summary = {
  viewer: { is_self: boolean; is_organizer: boolean };
  player: {
    id: string; nickname: string; full_name: string | null; telegram_username: string | null; phone: string | null;
    avatar_url: string | null; game_level: string; club_role: string | null; elo: number; rating_position: number;
    rating_movement_30d: number; joined_at: string | null; cosmetics?: Record<string, unknown>;
  };
  stats: null | {
    games: number; wins: number; win_rate: number; recent_form: string[]; recent_wins: number;
    strongest_role: null | { role: string; label: string; games: number; wins: number; win_rate: number; small_sample: boolean };
    personal_elo_max: number;
  };
  recent_games: Array<{ id: string; title: string; date: string | null; game_number: number; role: string | null; won: boolean | null }>;
  elo_preview: Array<{ date: string; elo_after: number; elo_delta: number }>;
  recent_achievements: Array<{ id: string; icon: string; name: string; earned_at: string | null }>;
  achievement_progress: Array<{ id: string; icon: string; name: string; progress: { current: number; target: number } | null }>;
  recent_verified_awards: Array<{ id: string; kind: string; title: string; tournament_name: string | null; place_result: string | null }>;
  facts: Array<{ id: string; text: string; sample_size?: number }>;
};

type GameItem = {
  id: string; title: string; date: string | null; game_number: number; role: string | null; team: 'red' | 'black' | null;
  won: boolean | null; game_points: number; elo_delta: number | null; protocol_path: string;
  disciplinary_penalty_points: number; regular_fouls: number; minor_technical_fouls: number; major_technical_fouls: number;
  first_killed: boolean; best_move: boolean;
};
type GamesResponse = { games: GameItem[]; total: number; next_offset: number | null };
type RolesResponse = {
  overall: { games: number; wins: number; win_rate: number };
  roles: Array<{ role: string; label: string; games: number; wins: number; win_rate: number; average_score: number; best_score: number | null; recent_form: string[]; versus_overall_pp: number; small_sample: boolean }>;
  fingerprint: {
    red_experience: { games: number; share: number }; black_experience: { games: number; share: number };
    team_success: { wins: number; games: number; win_rate: number }; form: { wins: number; games: number }; versatility: { roles_used: number; roles_total: number };
  };
};
type EloResponse = {
  range: 'month' | 'season' | 'all'; current_elo: number; personal_max: number; best_rating_position: number | null; period_change: number; legacy_missing_snapshots: boolean;
  points: Array<{ id: string; date: string; game_number: number; title: string; role: string | null; won: boolean; elo_before: number; elo_after: number; elo_delta: number; rating_position: number; game_path: string }>;
};

const TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: 'overview', label: 'Обзор' }, { id: 'games', label: 'Игры' }, { id: 'roles', label: 'Роли' }, { id: 'elo', label: 'Elo' },
];
const ROLE_LABELS: Record<string, string> = { citizen: 'Мирный', sheriff: 'Шериф', mafia: 'Мафия', don: 'Дон' };
const LEVEL_LABELS: Record<string, string> = { novice: 'Новичок', tournament: 'Турнирный игрок', club: 'Игрок клуба' };
const fmtDate = (value: string | null) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString('ru-RU') : 'Дата не указана';
const signed = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value * 100) / 100}`;

function LoadingCard({ text = 'Загружаем…' }: { text?: string }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-10 text-center text-sm text-white/45">{text}</div>;
}
function ErrorCard({ text, retry }: { text: string; retry: () => void }) {
  return <div className="rounded-3xl border border-rose-300/15 bg-rose-300/[0.06] p-4 text-sm text-rose-100/80"><p>{text}</p><button type="button" onClick={retry} className="mt-3 min-h-11 rounded-xl border border-white/10 px-4 font-semibold text-white">Повторить</button></div>;
}
function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return <div className="min-w-0 rounded-2xl border border-white/[0.06] bg-black/20 p-3"><div className="break-words text-xl font-semibold text-white">{value}</div><div className="mt-1 text-xs text-white/45">{label}</div>{hint ? <div className="mt-1 text-[11px] leading-4 text-white/30">{hint}</div> : null}</div>;
}
function FormDots({ form }: { form: string[] }) {
  return <span className="inline-flex gap-1" aria-label={`Последние игры: ${form.join(', ') || 'нет данных'}`}>{form.map((item, index) => <span key={`${item}-${index}`} className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold ${item === 'W' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-rose-400/12 text-rose-200'}`}>{item === 'W' ? 'В' : 'П'}</span>)}</span>;
}

function EloSparkline({ points }: { points: Array<{ elo_after: number }> }) {
  if (points.length < 2) return <div className="rounded-2xl bg-black/20 p-4 text-sm text-white/40">Недостаточно точек для графика Elo.</div>;
  const values = points.map((point) => Number(point.elo_after));
  const min = Math.min(...values); const max = Math.max(...values); const span = Math.max(1, max - min);
  const coords = values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${44 - ((value - min) / span) * 38}`).join(' ');
  return <div className="rounded-2xl bg-black/20 p-3"><svg viewBox="0 0 100 48" className="h-28 w-full" role="img" aria-label={`Тренд Elo от ${values[0]} до ${values.at(-1)}`} preserveAspectRatio="none"><polyline points={coords} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" className="text-white/75" /></svg><div className="mt-1 flex justify-between text-xs text-white/35"><span>{Math.round(values[0])}</span><span>{Math.round(values.at(-1) || 0)}</span></div></div>;
}

export default function PremiumPlayerProfile({
  playerId,
  mode = 'public',
  onClose,
  ownTools,
}: {
  playerId: string;
  mode?: PremiumProfileMode;
  onClose?: () => void;
  ownTools?: React.ReactNode;
}) {
  const [tab, setTab] = useState<ProfileTab>('overview');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryNonce, setSummaryNonce] = useState(0);
  const [games, setGames] = useState<GamesResponse | null>(null);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [gameRole, setGameRole] = useState('');
  const [gameTeam, setGameTeam] = useState('');
  const [gameResult, setGameResult] = useState('');
  const [roles, setRoles] = useState<RolesResponse | null>(null);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [elo, setElo] = useState<EloResponse | null>(null);
  const [eloError, setEloError] = useState<string | null>(null);
  const [eloRange, setEloRange] = useState<'month' | 'season' | 'all'>('all');
  const [selectedEloPoint, setSelectedEloPoint] = useState<EloResponse['points'][number] | null>(null);

  useEffect(() => {
    let cancelled = false; setSummary(null); setSummaryError(null); setTab('overview');
    void fetch(`/api/player/profiles/${encodeURIComponent(playerId)}/summary`, { credentials: 'include' })
      .then(async (response) => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить профиль'); return body as Summary; })
      .then((body) => { if (!cancelled) setSummary(body); })
      .catch((error) => { if (!cancelled) setSummaryError(error?.message || 'Не удалось загрузить профиль'); });
    return () => { cancelled = true; };
  }, [playerId, summaryNonce]);

  useEffect(() => {
    if (tab !== 'games') return;
    let cancelled = false; setGames(null); setGamesError(null);
    const query = new URLSearchParams({ limit: '15', offset: '0' });
    if (gameRole) query.set('role', gameRole); if (gameTeam) query.set('team', gameTeam); if (gameResult) query.set('result', gameResult);
    void fetch(`/api/player/profiles/${encodeURIComponent(playerId)}/games?${query}`, { credentials: 'include' })
      .then(async (response) => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить игры'); return body as GamesResponse; })
      .then((body) => { if (!cancelled) setGames(body); })
      .catch((error) => { if (!cancelled) setGamesError(error?.message || 'Не удалось загрузить игры'); });
    return () => { cancelled = true; };
  }, [tab, playerId, gameRole, gameTeam, gameResult]);

  useEffect(() => {
    if (tab !== 'roles' || roles) return;
    let cancelled = false; setRolesError(null);
    void fetch(`/api/player/profiles/${encodeURIComponent(playerId)}/roles`, { credentials: 'include' })
      .then(async (response) => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить роли'); return body as RolesResponse; })
      .then((body) => { if (!cancelled) setRoles(body); })
      .catch((error) => { if (!cancelled) setRolesError(error?.message || 'Не удалось загрузить роли'); });
    return () => { cancelled = true; };
  }, [tab, playerId, roles]);

  useEffect(() => {
    if (tab !== 'elo') return;
    let cancelled = false; setElo(null); setEloError(null); setSelectedEloPoint(null);
    void fetch(`/api/player/profiles/${encodeURIComponent(playerId)}/elo?range=${eloRange}`, { credentials: 'include' })
      .then(async (response) => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить Elo'); return body as EloResponse; })
      .then((body) => { if (!cancelled) setElo(body); })
      .catch((error) => { if (!cancelled) setEloError(error?.message || 'Не удалось загрузить Elo'); });
    return () => { cancelled = true; };
  }, [tab, playerId, eloRange]);

  const loadMoreGames = async () => {
    if (!games?.next_offset) return;
    const query = new URLSearchParams({ limit: '15', offset: String(games.next_offset) });
    if (gameRole) query.set('role', gameRole); if (gameTeam) query.set('team', gameTeam); if (gameResult) query.set('result', gameResult);
    const response = await fetch(`/api/player/profiles/${encodeURIComponent(playerId)}/games?${query}`, { credentials: 'include' });
    const body = await response.json().catch(() => ({}));
    if (response.ok) setGames((current) => current ? { ...body, games: [...current.games, ...(body.games || [])] } : body);
  };

  const heroSubtitle = useMemo(() => {
    if (!summary) return '';
    const parts = [summary.player.club_role, LEVEL_LABELS[summary.player.game_level] || 'Игрок клуба'].filter(Boolean);
    return parts.join(' · ');
  }, [summary]);

  if (summaryError) return <div className="mx-auto w-full max-w-[520px] p-3"><ErrorCard text={summaryError} retry={() => setSummaryNonce((value) => value + 1)} /></div>;
  if (!summary) return <div className="mx-auto w-full max-w-[520px] p-3"><LoadingCard text="Собираем профиль игрока…" /></div>;

  return <main data-testid="premium-player-profile" className="min-h-full bg-[#090a0d] text-white">
    <div className="mx-auto w-full max-w-[520px] px-3 pb-28 pt-3">
      {onClose ? <button type="button" onClick={onClose} className="mb-2 min-h-11 rounded-xl border border-white/10 bg-black/25 px-3 text-sm font-semibold text-white/70" aria-label="Вернуться к предыдущему экрану">← Назад</button> : null}

      <header className="relative overflow-hidden rounded-[30px] border border-white/10 bg-gradient-to-br from-white/[0.11] via-white/[0.055] to-black/30 p-4 shadow-[0_24px_80px_rgba(0,0,0,.32)] motion-safe:animate-[fade-in_.22s_ease-out]">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-white/[0.035] blur-2xl" />
        <div className="relative flex items-start gap-4">
          {summary.player.avatar_url ? <img src={summary.player.avatar_url} alt={summary.player.nickname} className="h-24 w-24 shrink-0 rounded-[26px] object-cover ring-1 ring-white/15" /> : <div className="grid h-24 w-24 shrink-0 place-items-center rounded-[26px] bg-white/10 text-4xl font-semibold text-white/70">{summary.player.nickname.slice(0, 1).toUpperCase()}</div>}
          <div className="min-w-0 flex-1 pt-1"><h1 className="break-words text-[25px] font-semibold leading-[1.05] tracking-tight">{summary.player.nickname}</h1>{summary.player.full_name ? <p className="mt-1 break-words text-sm text-white/55">{summary.player.full_name}</p> : null}<p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-white/35">{heroSubtitle}</p></div>
        </div>
        <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Elo" value={Math.round(summary.player.elo)} hint={summary.player.rating_movement_30d ? `${signed(summary.player.rating_movement_30d)} за 30 дней` : 'без движения за 30 дней'} />
          <Stat label="Место" value={`#${summary.player.rating_position}`} />
          <Stat label="Игры" value={summary.stats?.games ?? '—'} />
          <Stat label="В клубе" value={summary.player.joined_at ? fmtDate(summary.player.joined_at) : '—'} />
        </div>
        {summary.stats?.strongest_role ? <div className="relative mt-3 flex items-center justify-between gap-3 rounded-2xl bg-black/20 px-3 py-2.5 text-sm"><span className="text-white/45">Самая успешная роль</span><strong className="text-right">{summary.stats.strongest_role.label} · {summary.stats.strongest_role.win_rate}% <span className="font-normal text-white/35">({summary.stats.strongest_role.games} игр)</span></strong></div> : null}
      </header>

      <nav aria-label="Разделы профиля" className="sticky top-0 z-20 -mx-1 mt-3 overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#0d0e12]/95 p-1 backdrop-blur [scrollbar-width:none]">
        <div className="flex min-w-max gap-1">{TABS.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-current={tab === item.id ? 'page' : undefined} className={`min-h-11 rounded-xl px-4 text-sm font-semibold transition-colors ${tab === item.id ? 'bg-white text-black' : 'text-white/55'}`}>{item.label}</button>)}</div>
      </nav>

      <div className="mt-3">
        {tab === 'overview' ? <div className="space-y-3" data-testid="profile-overview">
          {summary.stats ? <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4"><div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Форма</h2><p className="mt-1 text-sm text-white/45">Последние завершённые игры</p></div><FormDots form={summary.stats.recent_form} /></div><div className="mt-3 grid grid-cols-2 gap-2"><Stat label="Победы" value={summary.stats.wins} /><Stat label="Винрейт" value={`${summary.stats.win_rate}%`} /><Stat label="Elo максимум" value={Math.round(summary.stats.personal_elo_max)} /><Stat label="Побед в последних 5" value={`${summary.stats.recent_wins}/${Math.min(5, summary.stats.recent_form.length)}`} /></div></section> : null}
          {summary.facts.length ? <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-amber-100/[0.06] to-white/[0.03] p-4"><h2 className="text-base font-semibold">Что сейчас интересно</h2><div className="mt-3 space-y-2">{summary.facts.map((fact) => <div key={fact.id} className="rounded-2xl bg-black/20 p-3 text-sm leading-5 text-white/75">{fact.text}{fact.sample_size ? <span className="ml-1 text-xs text-white/35">· выборка {fact.sample_size}</span> : null}</div>)}</div></section> : null}
          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4"><div className="flex items-center justify-between"><h2 className="text-base font-semibold">Последние игры</h2><button type="button" onClick={() => setTab('games')} className="min-h-10 px-2 text-sm text-white/50">Все игры →</button></div>{summary.recent_games.length ? <div className="mt-2 space-y-2">{summary.recent_games.map((game) => <div key={game.id} className="flex items-center gap-3 rounded-2xl bg-black/20 p-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-bold ${game.won ? 'bg-emerald-400/15 text-emerald-200' : 'bg-rose-400/10 text-rose-200'}`}>{game.won ? 'В' : 'П'}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{game.title}</div><div className="mt-0.5 text-xs text-white/40">{fmtDate(game.date)} · игра №{game.game_number} · {ROLE_LABELS[game.role || ''] || 'роль не указана'}</div></div></div>)}</div> : <div className="mt-3 rounded-2xl bg-black/20 p-5 text-center text-sm text-white/40">Игровой истории пока нет.</div>}</section>
          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4"><div className="flex items-center justify-between"><h2 className="text-base font-semibold">Elo — последние изменения</h2><button type="button" onClick={() => setTab('elo')} className="min-h-10 px-2 text-sm text-white/50">Подробнее →</button></div><div className="mt-3"><EloSparkline points={summary.elo_preview} /></div></section>
          {(summary.recent_verified_awards.length || summary.recent_achievements.length) ? <section className="grid gap-3 sm:grid-cols-2"><div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4"><h2 className="text-sm font-semibold">Недавние награды</h2>{summary.recent_verified_awards.length ? <div className="mt-2 space-y-2">{summary.recent_verified_awards.map((award) => <div key={award.id} className="rounded-xl bg-black/20 p-2.5 text-sm">🏆 {award.title}</div>)}</div> : <p className="mt-2 text-sm text-white/35">Пока нет.</p>}</div><div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4"><h2 className="text-sm font-semibold">Достижения приложения</h2>{summary.recent_achievements.length ? <div className="mt-2 space-y-2">{summary.recent_achievements.map((item) => <div key={item.id} className="rounded-xl bg-black/20 p-2.5 text-sm">{item.icon} {item.name}</div>)}</div> : <p className="mt-2 text-sm text-white/35">Пока нет.</p>}</div></section> : null}
          {summary.achievement_progress.length ? <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4"><h2 className="text-base font-semibold">Ближайшие достижения</h2><div className="mt-3 space-y-2">{summary.achievement_progress.map((item) => { const progress = item.progress; const pct = progress ? Math.min(100, Math.round((progress.current / Math.max(1, progress.target)) * 100)) : 0; return <div key={item.id} className="rounded-2xl bg-black/20 p-3"><div className="flex justify-between gap-3 text-sm"><span>{item.icon} {item.name}</span><span className="text-white/40">{progress?.current}/{progress?.target}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white/70" style={{ width: `${pct}%` }} /></div></div>; })}</div></section> : null}
          {mode === 'self' && ownTools ? <section data-testid="own-profile-tools" className="space-y-3">{ownTools}</section> : null}
        </div> : null}

        {tab === 'games' ? <div className="space-y-3" data-testid="profile-games"><section className="rounded-3xl border border-white/10 bg-white/[0.045] p-3"><div className="grid grid-cols-3 gap-2"><select aria-label="Фильтр роли" value={gameRole} onChange={(event) => setGameRole(event.target.value)} className="mobile-field text-sm"><option value="">Все роли</option><option value="citizen">Мирный</option><option value="sheriff">Шериф</option><option value="mafia">Мафия</option><option value="don">Дон</option></select><select aria-label="Фильтр команды" value={gameTeam} onChange={(event) => setGameTeam(event.target.value)} className="mobile-field text-sm"><option value="">Все команды</option><option value="red">Красные</option><option value="black">Чёрные</option></select><select aria-label="Фильтр результата" value={gameResult} onChange={(event) => setGameResult(event.target.value)} className="mobile-field text-sm"><option value="">Все исходы</option><option value="win">Победы</option><option value="loss">Поражения</option></select></div></section>{gamesError ? <ErrorCard text={gamesError} retry={() => { setGameResult((value) => value === '__retry' ? '' : value); }} /> : !games ? <LoadingCard text="Загружаем историю…" /> : games.games.length ? <><div className="space-y-2">{games.games.map((game) => <article key={game.id} className="rounded-3xl border border-white/[0.07] bg-white/[0.04] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="break-words text-sm font-semibold">{game.title}</div><div className="mt-1 text-xs text-white/40">{fmtDate(game.date)} · игра №{game.game_number}</div></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${game.won ? 'bg-emerald-400/15 text-emerald-200' : 'bg-rose-400/10 text-rose-200'}`}>{game.won ? 'Победа' : 'Поражение'}</span></div><div className="mt-3 flex flex-wrap gap-1.5 text-xs"><span className="rounded-full bg-white/[0.07] px-2 py-1">{ROLE_LABELS[game.role || ''] || 'Роль —'}</span><span className="rounded-full bg-white/[0.07] px-2 py-1">{game.team === 'red' ? 'Красные' : 'Чёрные'}</span><span className="rounded-full bg-white/[0.07] px-2 py-1">Очки {game.game_points}</span>{game.elo_delta != null ? <span className="rounded-full bg-white/[0.07] px-2 py-1">Elo {signed(game.elo_delta)}</span> : null}{game.disciplinary_penalty_points ? <span className="rounded-full bg-rose-400/10 px-2 py-1 text-rose-100">Дисц. −{game.disciplinary_penalty_points}</span> : null}{game.first_killed ? <span className="rounded-full bg-white/[0.07] px-2 py-1">ПУ</span> : null}{game.best_move ? <span className="rounded-full bg-white/[0.07] px-2 py-1">ЛХ</span> : null}</div><a href={game.protocol_path} className="mt-3 flex min-h-11 items-center justify-between rounded-xl border border-white/10 px-3 text-sm font-semibold text-white/65"><span>Протокол игры</span><span>→</span></a></article>)}</div>{games.next_offset != null ? <button type="button" onClick={() => void loadMoreGames()} className="min-h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-semibold">Показать ещё · {games.games.length}/{games.total}</button> : <p className="py-2 text-center text-xs text-white/30">Показаны все {games.total} игр</p>}</> : <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-white/40">По выбранным фильтрам игр нет.</div>}</div> : null}

        {tab === 'roles' ? <div className="space-y-3" data-testid="profile-roles">{rolesError ? <ErrorCard text={rolesError} retry={() => setRoles(null)} /> : !roles ? <LoadingCard text="Считаем роли…" /> : <><section className="grid grid-cols-2 gap-2">{roles.roles.map((role) => <article key={role.role} className="rounded-3xl border border-white/10 bg-white/[0.045] p-3"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{role.label}</h3>{role.small_sample && role.games > 0 ? <span className="rounded-full bg-amber-300/10 px-2 py-1 text-[10px] text-amber-100/70">малая выборка</span> : null}</div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><strong className="text-lg">{role.games}</strong><div className="text-xs text-white/35">игр</div></div><div><strong className="text-lg">{role.win_rate}%</strong><div className="text-xs text-white/35">побед</div></div><div><strong>{role.average_score}</strong><div className="text-xs text-white/35">ср. очки</div></div><div><strong>{signed(role.versus_overall_pp)} п.п.</strong><div className="text-xs text-white/35">к среднему</div></div></div>{role.games ? <div className="mt-3"><FormDots form={role.recent_form} /></div> : <p className="mt-3 text-xs text-white/30">На этой роли игр пока нет.</p>}</article>)}</section><section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4"><h2 className="text-base font-semibold">Игровой отпечаток</h2><p className="mt-1 text-sm text-white/40">Только понятные показатели из сыгранных игр — без психологических оценок.</p><div className="mt-3 grid grid-cols-2 gap-2"><Stat label="Опыт за красных" value={`${roles.fingerprint.red_experience.games} игр`} hint={`${roles.fingerprint.red_experience.share}% истории`} /><Stat label="Опыт за чёрных" value={`${roles.fingerprint.black_experience.games} игр`} hint={`${roles.fingerprint.black_experience.share}% истории`} /><Stat label="Командный успех" value={`${roles.fingerprint.team_success.win_rate}%`} hint={`${roles.fingerprint.team_success.wins}/${roles.fingerprint.team_success.games} побед`} /><Stat label="Разнообразие ролей" value={`${roles.fingerprint.versatility.roles_used}/${roles.fingerprint.versatility.roles_total}`} hint="сыгранных ролей" /></div></section></>}</div> : null}

        {tab === 'elo' ? <div className="space-y-3" data-testid="profile-elo"><div className="grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.045] p-1">{([['month','Месяц'],['season','Сезон'],['all','Всё']] as const).map(([value,label]) => <button key={value} type="button" onClick={() => setEloRange(value)} aria-pressed={eloRange === value} className={`min-h-11 rounded-xl text-sm font-semibold ${eloRange === value ? 'bg-white text-black' : 'text-white/50'}`}>{label}</button>)}</div>{eloError ? <ErrorCard text={eloError} retry={() => setEloRange((value) => value === 'all' ? 'season' : 'all')} /> : !elo ? <LoadingCard text="Строим историю Elo…" /> : <><section className="grid grid-cols-2 gap-2"><Stat label="Текущий Elo" value={Math.round(elo.current_elo)} /><Stat label="Личный максимум" value={Math.round(elo.personal_max)} /><Stat label="Лучшее место" value={elo.best_rating_position ? `#${elo.best_rating_position}` : '—'} /><Stat label="Изменение периода" value={signed(elo.period_change)} /></section>{elo.points.length ? <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4"><EloSparkline points={elo.points} /><div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">{[...elo.points].reverse().map((point) => <button key={point.id} type="button" onClick={() => setSelectedEloPoint(point)} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left text-sm hover:bg-white/[0.04]"><span className="w-16 shrink-0 text-xs text-white/35">{fmtDate(point.date)}</span><span className="min-w-0 flex-1 truncate">{point.title}</span><strong className={point.elo_delta >= 0 ? 'text-emerald-200' : 'text-rose-200'}>{signed(point.elo_delta)}</strong></button>)}</div></section> : <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-white/40">{elo.legacy_missing_snapshots ? 'Для старых игр нет восстановимой истории Elo. Текущий Elo сохранён.' : 'В выбранном периоде изменений Elo нет.'}</div>}{selectedEloPoint ? <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-4"><div className="flex justify-between gap-3"><div><div className="text-xs uppercase tracking-wider text-white/35">Выбранная игра</div><h3 className="mt-1 font-semibold">{selectedEloPoint.title}</h3></div><button type="button" onClick={() => setSelectedEloPoint(null)} className="h-11 w-11 rounded-xl border border-white/10" aria-label="Закрыть детали точки">×</button></div><div className="mt-3 grid grid-cols-2 gap-2"><Stat label="Elo" value={`${Math.round(selectedEloPoint.elo_before)} → ${Math.round(selectedEloPoint.elo_after)}`} /><Stat label="Изменение" value={signed(selectedEloPoint.elo_delta)} /><Stat label="Роль" value={ROLE_LABELS[selectedEloPoint.role || ''] || '—'} /><Stat label="Результат" value={selectedEloPoint.won ? 'Победа' : 'Поражение'} /></div><a href={selectedEloPoint.game_path} className="mt-3 flex min-h-11 items-center justify-between rounded-xl border border-white/10 px-3 text-sm font-semibold"><span>Открыть игру</span><span>→</span></a></section> : null}</>}</div> : null}
      </div>
    </div>
  </main>;
}
