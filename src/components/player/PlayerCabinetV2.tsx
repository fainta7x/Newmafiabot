import React, { useEffect, useMemo, useState } from 'react';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import type { PlayerMeResponse } from './PlayerCabinet.tsx';
import PlayerEconomy from './PlayerEconomy.tsx';
import PlayerGameDetail, { formatEloDelta, type PlayerGameDetailData, type PlayerGameEloChange } from './PlayerGameDetail.tsx';
import PlayerRatingPeriods from './PlayerRatingPeriods.tsx';
import PlayerProfileSettings from './PlayerProfileSettings.tsx';

type PlayerTab = 'home' | 'games' | 'rating' | 'stats' | 'profile';
type GameScope = 'mine' | 'all';
type ProfileScope = 'self' | 'players';
type EveningResponseStatus = 'going' | 'late' | 'thinking' | 'declined';

type PlayerEvening = {
  id: string;
  title: string;
  starts_at: string;
  venue: string | null;
  format: string;
  default_price: number | null;
  response_status: EveningResponseStatus | 'unanswered' | string;
  attending_count: number;
};

type RatingPlayer = {
  place: number;
  player_id: string;
  nickname: string;
  elo: number;
  avatar_url: string | null;
};

type AllGame = {
  id: string;
  source: 'club' | 'tournament';
  title: string;
  date: string | null;
  game_number: number;
  format: string;
  winner_team: 'red' | 'black' | null;
  judge_name: string | null;
};

type DirectoryPlayer = {
  id: string;
  nickname: string;
  elo: number;
  game_level: string;
  avatar_url: string | null;
};

type PublicPlayerProfile = {
  player: DirectoryPlayer;
  stats: {
    completedGames: number;
    wins: number;
    losses: number;
    winRate: number;
    clubGames: number;
    tournamentGames: number;
    redGames: number;
    blackGames: number;
    bestMoves: number;
    firstKilled: number;
    zeroRoundVoted: number;
    roleCounts: {
      citizen: number;
      sheriff: number;
      mafia: number;
      don: number;
      unknown: number;
    };
  };
  tournament_awards: {
    firstPlaces: number;
    secondPlaces: number;
    thirdPlaces: number;
    nominations: number;
  };
};

const NAV_ITEMS: Array<{ id: PlayerTab; icon: string; label: string }> = [
  { id: 'home', icon: '⌂', label: 'Главная' },
  { id: 'games', icon: '◫', label: 'Игры' },
  { id: 'rating', icon: '★', label: 'Рейтинг' },
  { id: 'stats', icon: '▥', label: 'Статистика' },
  { id: 'profile', icon: '●', label: 'Профиль' },
];

const RESPONSE_OPTIONS: Array<{ status: EveningResponseStatus; label: string }> = [
  { status: 'going', label: '✅ Иду' },
  { status: 'late', label: '⏳ Приду позже' },
  { status: 'thinking', label: '🤔 Пока думаю' },
  { status: 'declined', label: '❌ Не иду' },
];

const formatDate = (value: string | null) => {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const formatEveningDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const roleLabel = (role: string | null) => {
  if (role === 'citizen') return 'Мирный';
  if (role === 'sheriff') return 'Шериф';
  if (role === 'mafia') return 'Мафия';
  if (role === 'don') return 'Дон';
  return role || 'Роль не указана';
};

const gameLevelLabel = (level: string) => {
  if (level === 'novice') return 'Новичок';
  if (level === 'tournament') return 'Турнирный игрок';
  return 'Игрок клуба';
};

const winnerLabel = (winner: 'red' | 'black' | null) => {
  if (winner === 'red') return '🔴 Победа красных';
  if (winner === 'black') return '⚫ Победа чёрных';
  return 'Результат';
};

const eloDeltaClass = (value: number | null | undefined) => {
  if (value == null || Math.abs(value) < 0.0001) return 'text-white/45';
  return value > 0 ? 'text-emerald-300' : 'text-rose-300';
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">{title}</h2>
      {children}
    </section>
  );
}

function PageHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-1 pb-1 pt-2">
      <div className="text-xs uppercase tracking-[0.2em] text-white/35">2LA Noire</div>
      <h1 className="mt-1 text-2xl font-semibold text-white">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-white/45">{subtitle}</p>}
    </div>
  );
}

function StatCard({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-2xl bg-black/20 p-3">
      <div className="text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-[11px] text-white/40">{label}</div>
    </div>
  );
}

function Toggle<T extends string>({ value, onChange, items }: { value: T; onChange: (value: T) => void; items: Array<{ value: T; label: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.045] p-1">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={`min-h-10 rounded-xl px-3 text-sm font-medium transition ${value === item.value ? 'bg-white text-black' : 'text-white/50'}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function RatingRow({ item, isSelf }: { item: RatingPlayer; isSelf: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${isSelf ? 'border border-white/15 bg-white/[0.09]' : 'bg-black/20'}`}>
      <div className="w-7 shrink-0 text-center text-sm font-semibold text-white/45">{item.place}</div>
      {item.avatar_url ? (
        <img src={item.avatar_url} alt={item.nickname} className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-white/10" />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sm font-semibold text-white/65">{item.nickname.slice(0, 1).toUpperCase()}</div>
      )}
      <div className="min-w-0 flex-1 truncate text-sm font-medium text-white">{item.nickname}{isSelf ? ' · вы' : ''}</div>
      <div className="shrink-0 text-right"><div className="text-sm font-semibold text-white">{item.elo}</div><div className="text-[10px] uppercase tracking-wide text-white/35">ELO</div></div>
    </div>
  );
}

export default function PlayerCabinetV2({ data, canOpenAdmin = false }: { data: PlayerMeResponse; canOpenAdmin?: boolean }) {
  const { achievements, tournaments, games } = data;
  const [player, setPlayer] = useState(data.player);
  const [tab, setTab] = useState<PlayerTab>('home');
  const [tokensOpen, setTokensOpen] = useState(false);
  const [gameScope, setGameScope] = useState<GameScope>('mine');
  const [profileScope, setProfileScope] = useState<ProfileScope>('self');
  const [tokenBalance, setTokenBalance] = useState(Number(player.tokens || 0));
  const [rating, setRating] = useState<RatingPlayer[] | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [evenings, setEvenings] = useState<PlayerEvening[] | null>(null);
  const [eveningsError, setEveningsError] = useState<string | null>(null);
  const [savingEveningId, setSavingEveningId] = useState<string | null>(null);
  const [allGames, setAllGames] = useState<AllGame[] | null>(null);
  const [allGamesError, setAllGamesError] = useState<string | null>(null);
  const [eloGames, setEloGames] = useState<Record<string, PlayerGameEloChange> | null>(null);
  const [eloGamesError, setEloGamesError] = useState<string | null>(null);
  const [selectedGameKey, setSelectedGameKey] = useState<string | null>(null);
  const [selectedGameDetail, setSelectedGameDetail] = useState<PlayerGameDetailData | null>(null);
  const [gameDetailLoading, setGameDetailLoading] = useState(false);
  const [gameDetailError, setGameDetailError] = useState<string | null>(null);
  const [clubPlayers, setClubPlayers] = useState<DirectoryPlayer[] | null>(null);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [playerSearch, setPlayerSearch] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<PublicPlayerProfile | null>(null);
  const [selectedProfileLoading, setSelectedProfileLoading] = useState(false);
  const [selectedProfileError, setSelectedProfileError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/player/evenings', { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить игровые вечера');
        if (!cancelled) setEvenings(Array.isArray(body?.evenings) ? body.evenings : []);
      } catch (error: any) {
        if (!cancelled) setEveningsError(error?.message || 'Не удалось загрузить игровые вечера');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/rating', { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить ELO');
        if (!cancelled) setRating(Array.isArray(body?.players) ? body.players : []);
      } catch (error: any) {
        if (!cancelled) setRatingError(error?.message || 'Не удалось загрузить ELO');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (tab !== 'games' || gameScope !== 'all' || allGames !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/player/games/all', { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить все игры');
        if (!cancelled) setAllGames(Array.isArray(body?.games) ? body.games : []);
      } catch (error: any) {
        if (!cancelled) setAllGamesError(error?.message || 'Не удалось загрузить все игры');
      }
    })();
    return () => { cancelled = true; };
  }, [tab, gameScope, allGames]);

  useEffect(() => {
    if (tab !== 'games' || eloGames !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/player/games/elo', { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить историю Elo');
        const entries = Array.isArray(body?.games) ? body.games as PlayerGameEloChange[] : [];
        const map = Object.fromEntries(entries.map((item) => [item.id, item]));
        if (!cancelled) {
          setEloGames(map);
          setEloGamesError(null);
        }
      } catch (error: any) {
        if (!cancelled) {
          setEloGames({});
          setEloGamesError(error?.message || 'Не удалось загрузить историю Elo');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [tab, eloGames]);

  useEffect(() => {
    if (tab !== 'profile' || profileScope !== 'players' || clubPlayers !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/player/players', { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить игроков');
        if (!cancelled) setClubPlayers(Array.isArray(body?.players) ? body.players : []);
      } catch (error: any) {
        if (!cancelled) setPlayersError(error?.message || 'Не удалось загрузить игроков');
      }
    })();
    return () => { cancelled = true; };
  }, [tab, profileScope, clubPlayers]);

  const respondToEvening = async (eveningId: string, status: EveningResponseStatus) => {
    setSavingEveningId(eveningId);
    try {
      const response = await fetch(`/api/player/evenings/${encodeURIComponent(eveningId)}/respond`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_status: status }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось сохранить ответ');
      setEvenings((current) => (current || []).map((evening) => evening.id === eveningId ? { ...evening, response_status: status } : evening));
      setEveningsError(null);
    } catch (error: any) {
      setEveningsError(error?.message || 'Не удалось сохранить ответ');
    } finally {
      setSavingEveningId(null);
    }
  };

  const openGameDetail = async (gameKey: string) => {
    setSelectedGameKey(gameKey);
    setSelectedGameDetail(null);
    setGameDetailLoading(true);
    setGameDetailError(null);
    try {
      const response = await fetch(`/api/player/games/${encodeURIComponent(gameKey)}`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить игру');
      setSelectedGameDetail(body as PlayerGameDetailData);
    } catch (error: any) {
      setGameDetailError(error?.message || 'Не удалось загрузить игру');
    } finally {
      setGameDetailLoading(false);
    }
  };

  const closeGameDetail = () => {
    setSelectedGameKey(null);
    setSelectedGameDetail(null);
    setGameDetailError(null);
    setGameDetailLoading(false);
  };

  const openPlayerProfile = async (targetId: string) => {
    setSelectedProfileLoading(true);
    setSelectedProfileError(null);
    try {
      const response = await fetch(`/api/player/players/${encodeURIComponent(targetId)}`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить профиль');
      setSelectedProfile(body as PublicPlayerProfile);
    } catch (error: any) {
      setSelectedProfileError(error?.message || 'Не удалось загрузить профиль');
    } finally {
      setSelectedProfileLoading(false);
    }
  };

  const earnedAchievements = achievements.categories.flatMap((category) =>
    category.achievements.filter((achievement) => achievement.earned).map((achievement) => ({ ...achievement, categoryName: category.name })),
  );
  const ratingTop = (rating || []).slice(0, 10);
  const selfRating = (rating || []).find((item) => item.player_id === player.id) || null;
  const selfOutsideTop = Boolean(selfRating && !ratingTop.some((item) => item.player_id === player.id));
  const stats = games.stats;
  const filteredPlayers = useMemo(() => {
    const query = playerSearch.trim().toLocaleLowerCase('ru-RU');
    if (!query) return clubPlayers || [];
    return (clubPlayers || []).filter((item) => item.nickname.toLocaleLowerCase('ru-RU').includes(query));
  }, [clubPlayers, playerSearch]);

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-28 pt-3 text-white">
      <div className="mx-auto flex w-full max-w-[430px] flex-col gap-3">
        {tokensOpen && (
          <>
            <button type="button" onClick={() => setTokensOpen(false)} className="self-start rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-white/60">← На главную</button>
            <PageHeading title="Жетоны" subtitle="Кошелёк, магазин, ставки и история операций" />
            <PlayerEconomy onBalanceChange={setTokenBalance} />
          </>
        )}

        {!tokensOpen && tab === 'home' && (
          <>
            <PageHeading title="Главная" subtitle={`Привет, ${player.nickname}`} />
            <button
              type="button"
              onClick={() => setTokensOpen(true)}
              className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.09] to-white/[0.035] p-4 text-left shadow-[0_18px_60px_rgba(0,0,0,0.22)] transition active:bg-white/[0.08]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Жетоны</div>
                  <div className="mt-2 text-3xl font-semibold text-white">{tokenBalance.toLocaleString('ru-RU')} 🪙</div>
                  <div className="mt-1 text-sm text-white/40">Кошелёк, магазин, ставки и история</div>
                </div>
                <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.07] text-lg text-white/55">→</div>
              </div>
            </button>
            <Section title="Ближайшие игры">
              {eveningsError && <p className="mb-3 rounded-2xl bg-black/20 px-3 py-3 text-sm text-white/55">{eveningsError}</p>}
              {evenings === null ? <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Загрузка игровых вечеров…</p> : evenings.length ? (
                <div className="space-y-3">{evenings.map((evening) => {
                  const format = normalizeEveningFormat(evening.format);
                  const saving = savingEveningId === evening.id;
                  return <article key={evening.id} className="rounded-2xl bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="truncate font-medium">{evening.title}</div><div className="mt-1 text-xs text-white/45">{formatEveningDate(evening.starts_at)}</div>{evening.venue && <div className="mt-1 truncate text-xs text-white/35">📍 {evening.venue}</div>}</div><span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-1 text-[10px] font-medium text-white/60">{EVENING_FORMAT_LABELS[format]}</span></div>
                    <div className="mt-3 flex items-center justify-between text-xs text-white/40"><span>Идут: {evening.attending_count}</span>{evening.default_price != null && <span>{Number(evening.default_price)} ₽</span>}</div>
                    <div className="mt-3 grid grid-cols-2 gap-2">{RESPONSE_OPTIONS.map((option) => {
                      const selected = evening.response_status === option.status;
                      return <button key={option.status} type="button" disabled={saving} onClick={() => void respondToEvening(evening.id, option.status)} className={`min-h-11 rounded-xl border px-2 py-2 text-xs font-medium transition ${selected ? 'border-white/30 bg-white text-black' : 'border-white/10 bg-white/[0.05] text-white/70'} ${saving ? 'opacity-50' : ''}`}>{option.label}</button>;
                    })}</div>
                  </article>;
                })}</div>
              ) : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Сейчас нет доступных игровых вечеров.</p>}
            </Section>
          </>
        )}

        {!tokensOpen && tab === 'games' && (
          selectedGameKey ? (
            <PlayerGameDetail
              detail={selectedGameDetail}
              loading={gameDetailLoading}
              error={gameDetailError}
              selfId={player.id}
              onBack={closeGameDetail}
            />
          ) : (
            <>
              <PageHeading title="Игры" subtitle="Личная история и общий архив клуба" />
              <Toggle<GameScope> value={gameScope} onChange={setGameScope} items={[{ value: 'mine', label: 'Мои игры' }, { value: 'all', label: 'Все игры' }]} />
              {gameScope === 'mine' ? (
                <Section title="Моя история">
                  {eloGamesError && <p className="mb-3 rounded-2xl bg-black/20 px-3 py-3 text-xs text-white/40">{eloGamesError}</p>}
                  {games.all.length ? <div className="space-y-2">{games.all.map((game: any) => {
                    const points = [game.judge_bonus ? `судья ${game.judge_bonus > 0 ? '+' : ''}${game.judge_bonus}` : null, game.protocol_bonus ? `бонус ${game.protocol_bonus > 0 ? '+' : ''}${game.protocol_bonus}` : null, game.ci_points ? `CI ${game.ci_points > 0 ? '+' : ''}${game.ci_points}` : null, game.penalty_points ? `штраф ${game.penalty_points}` : null, game.disciplinary_penalty_points ? `дисц. ${game.disciplinary_penalty_points}` : null].filter(Boolean);
                    const eloChange = eloGames?.[game.id];
                    return <button key={game.id} type="button" onClick={() => void openGameDetail(game.id)} className="w-full rounded-2xl bg-black/20 p-3 text-left transition active:bg-white/[0.06]">
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="truncate font-medium">{game.title}</div><div className="mt-1 text-xs text-white/40">{formatDate(game.date)} · {game.source === 'tournament' ? 'Турнир' : 'Клуб'}{game.game_number ? ` · Игра №${game.game_number}` : ''}</div></div><span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-1 text-xs text-white/65">{game.status !== 'completed' ? 'Не завершена' : game.won === true ? 'Победа' : game.won === false ? 'Поражение' : 'Результат'}</span></div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-white/[0.07] px-2 py-1 text-white/70">{roleLabel(game.role)}</span>{game.seat_number > 0 && <span className="rounded-full bg-white/[0.07] px-2 py-1 text-white/55">место {game.seat_number}</span>}{game.first_killed && <span className="rounded-full bg-white/[0.07] px-2 py-1 text-white/55">ПУ</span>}{game.best_move && <span className="rounded-full bg-white/[0.07] px-2 py-1 text-white/55">ЛХ</span>}{points.map((part) => <span key={String(part)} className="rounded-full bg-white/[0.07] px-2 py-1 text-white/55">{part}</span>)}</div>
                      <div className="mt-3 flex items-end justify-between gap-3 border-t border-white/[0.06] pt-2">
                        <div className="min-w-0 text-[11px] text-white/30">{[game.table_name, game.judge_name ? `судья ${game.judge_name}` : null].filter(Boolean).join(' · ') || 'Нажмите, чтобы открыть игру'}</div>
                        <div className="shrink-0 text-right"><div className={`text-xs font-semibold ${eloDeltaClass(eloChange?.elo_delta)}`}>{eloGamesError ? 'Elo недоступно' : eloGames === null ? 'Elo…' : formatEloDelta(eloChange?.elo_delta)}</div><div className="mt-0.5 text-[10px] text-white/25">Подробнее ›</div></div>
                      </div>
                    </button>;
                  })}</div> : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Сохранённых игр пока нет.</p>}
                </Section>
              ) : (
                <Section title="Все игры клуба">
                  {allGamesError ? <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">{allGamesError}</p> : allGames === null ? <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Загрузка общего архива…</p> : allGames.length ? <div className="space-y-2">{allGames.map((game) => {
                    const normalizedFormat = normalizeEveningFormat(game.format);
                    return <button key={game.id} type="button" onClick={() => void openGameDetail(game.id)} className="w-full rounded-2xl bg-black/20 p-3 text-left transition active:bg-white/[0.06]">
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="truncate font-medium">{game.title}</div><div className="mt-1 text-xs text-white/40">{formatDate(game.date)}{game.game_number ? ` · Игра №${game.game_number}` : ''}</div></div><span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-1 text-[10px] text-white/55">{game.source === 'tournament' ? 'Турнир' : EVENING_FORMAT_LABELS[normalizedFormat]}</span></div>
                      <div className="mt-3 flex items-center justify-between gap-2 text-xs"><span className="text-white/65">{winnerLabel(game.winner_team)}</span><span className="min-w-0 truncate text-right text-white/30">{game.judge_name ? `судья ${game.judge_name} · ` : ''}Подробнее ›</span></div>
                    </button>;
                  })}</div> : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Завершённых игр пока нет.</p>}
                </Section>
              )}
            </>
          )
        )}

        {!tokensOpen && tab === 'rating' && (
          <>
            <PageHeading title="Рейтинг" subtitle="Рейтинговые периоды и общий Elo клуба" />
            <PlayerRatingPeriods
              playerId={player.id}
              onOpenGame={(gameKey) => {
                setTab('games');
                void openGameDetail(gameKey);
              }}
            />
            <Section title="ELO клуба">
              {ratingError ? <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">{ratingError}</p> : rating === null ? <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Загрузка ELO…</p> : ratingTop.length ? <div className="space-y-2">{ratingTop.map((item) => <RatingRow key={item.player_id} item={item} isSelf={item.player_id === player.id} />)}{selfOutsideTop && selfRating && <><div className="py-0.5 text-center text-xs text-white/25">•••</div><RatingRow item={selfRating} isSelf /></>}</div> : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">ELO пока пуст.</p>}
            </Section>
          </>
        )}

        {!tokensOpen && tab === 'stats' && (
          <>
            <PageHeading title="Статистика" subtitle="Игровые показатели, достижения и турнирные награды" />
            <Section title="Игровая статистика">
              <div className="grid grid-cols-3 gap-2"><StatCard value={stats.completedGames} label="игр" /><StatCard value={stats.wins} label="побед" /><StatCard value={`${stats.winRate}%`} label="винрейт" /></div>
              <div className="mt-2 grid grid-cols-2 gap-2"><StatCard value={stats.redGames} label="за красных" /><StatCard value={stats.blackGames} label="за чёрных" /></div>
              <div className="mt-3 rounded-2xl bg-black/20 p-3"><div className="text-[11px] uppercase tracking-[0.14em] text-white/35">Роли</div><div className="mt-2 grid grid-cols-4 gap-1.5 text-center"><div><div className="text-base font-semibold">{stats.roleCounts.citizen}</div><div className="text-[10px] text-white/35">Мирный</div></div><div><div className="text-base font-semibold">{stats.roleCounts.sheriff}</div><div className="text-[10px] text-white/35">Шериф</div></div><div><div className="text-base font-semibold">{stats.roleCounts.mafia}</div><div className="text-[10px] text-white/35">Мафия</div></div><div><div className="text-base font-semibold">{stats.roleCounts.don}</div><div className="text-[10px] text-white/35">Дон</div></div></div></div>
              <div className="mt-2 grid grid-cols-3 gap-2"><StatCard value={stats.firstKilled} label="ПУ" /><StatCard value={stats.bestMoves} label="ЛХ" /><StatCard value={stats.zeroRoundVoted} label="0 круг" /></div>
              <div className="mt-3 flex items-center justify-between text-xs text-white/35"><span>Клубные: {stats.clubGames}</span><span>Турнирные: {stats.tournamentGames}</span></div>
            </Section>
            <Section title="Достижения">
              <div className="flex items-end justify-between gap-3"><div><div className="text-2xl font-semibold">{achievements.earned} / {achievements.total}</div><div className="text-sm text-white/45">получено достижений</div></div><div className="text-lg font-semibold text-white/75">{achievements.percentage}%</div></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white/70" style={{ width: `${Math.max(0, Math.min(100, achievements.percentage))}%` }} /></div>
              {earnedAchievements.length ? <div className="mt-4 space-y-2">{earnedAchievements.map((achievement) => <div key={achievement.id} className="rounded-2xl bg-black/20 p-3"><div className="flex gap-3"><div className="text-2xl">{achievement.icon}</div><div className="min-w-0 flex-1"><div className="font-medium">{achievement.name}</div><div className="mt-1 text-sm text-white/50">{achievement.description}</div><div className="mt-1 text-xs text-white/35">{achievement.categoryName} · {achievement.rarity_icon} {achievement.rarity_name}</div></div></div></div>)}</div> : <p className="mt-4 rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Пока нет полученных достижений.</p>}
            </Section>
            <Section title="Награды турниров">
              <div className="mb-3 grid grid-cols-4 gap-1.5 text-center"><div className="rounded-xl bg-black/20 p-2"><div className="text-lg font-semibold">{tournaments.award_stats.firstPlaces}</div><div className="text-[10px] text-white/40">1 место</div></div><div className="rounded-xl bg-black/20 p-2"><div className="text-lg font-semibold">{tournaments.award_stats.secondPlaces}</div><div className="text-[10px] text-white/40">2 место</div></div><div className="rounded-xl bg-black/20 p-2"><div className="text-lg font-semibold">{tournaments.award_stats.thirdPlaces}</div><div className="text-[10px] text-white/40">3 место</div></div><div className="rounded-xl bg-black/20 p-2"><div className="text-lg font-semibold">{tournaments.award_stats.nominations}</div><div className="text-[10px] text-white/40">Номинации</div></div></div>
              {tournaments.awards.length ? <div className="space-y-2">{tournaments.awards.map((award) => <div key={award.id} className="rounded-2xl bg-black/20 p-3"><div className="font-medium">{award.title}</div><div className="mt-1 text-sm text-white/50">{award.tournament_title}</div><div className="mt-1 text-xs text-white/35">{formatDate(award.tournament_date)}</div></div>)}</div> : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Турнирных наград пока нет.</p>}
            </Section>
          </>
        )}

        {!tokensOpen && tab === 'profile' && (
          <>
            <PageHeading title="Профиль" subtitle="Мой аккаунт и игроки клуба" />
            <Toggle<ProfileScope> value={profileScope} onChange={(value) => { setProfileScope(value); if (value === 'self') setSelectedProfile(null); }} items={[{ value: 'self', label: 'Мой профиль' }, { value: 'players', label: 'Игроки клуба' }]} />
            {profileScope === 'self' ? (
              <>
                <header className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4">
                  <div className="flex items-center gap-4">{player.avatar_url ? <img src={player.avatar_url} alt={player.nickname} className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-white/15" /> : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl font-semibold text-white/70">{player.nickname.slice(0, 1).toUpperCase()}</div>}<div className="min-w-0 flex-1"><h2 className="truncate text-2xl font-semibold">{player.nickname}</h2>{player.full_name && <p className="mt-1 truncate text-sm text-white/60">{player.full_name}</p>}{player.telegram_username && <p className="mt-1 truncate text-sm text-white/45">@{player.telegram_username.replace(/^@/, '')}</p>}<p className="mt-2 text-xs text-white/35">{gameLevelLabel(player.game_level)}</p></div></div>
                  <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-2xl bg-black/25 px-3 py-3"><div className="text-xs text-white/45">ELO</div><div className="mt-1 text-xl font-semibold">{player.elo}</div></div><div className="rounded-2xl bg-black/25 px-3 py-3"><div className="text-xs text-white/45">Статус</div><div className="mt-1 text-sm font-semibold text-white/80">{gameLevelLabel(player.game_level)}</div></div></div>
                  {canOpenAdmin && <a href="/admin" className="mt-4 block rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-center text-sm font-medium text-white/80">Панель организатора</a>}
                </header>
                <PlayerProfileSettings
                  player={player}
                  onPlayerChange={(next) => {
                    setPlayer(next);
                    setClubPlayers((current) => current ? current.map((item) => item.id === next.id ? { ...item, nickname: next.nickname, elo: next.elo, game_level: next.game_level, avatar_url: next.avatar_url } : item) : current);
                  }}
                />
              </>
            ) : selectedProfile ? (
              <>
                <button type="button" onClick={() => setSelectedProfile(null)} className="self-start rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-white/60">← Все игроки</button>
                <header className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4">
                  <div className="flex items-center gap-4">{selectedProfile.player.avatar_url ? <img src={selectedProfile.player.avatar_url} alt={selectedProfile.player.nickname} className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-white/15" /> : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl font-semibold text-white/70">{selectedProfile.player.nickname.slice(0, 1).toUpperCase()}</div>}<div className="min-w-0 flex-1"><h2 className="truncate text-2xl font-semibold">{selectedProfile.player.nickname}</h2><p className="mt-2 text-xs text-white/35">{gameLevelLabel(selectedProfile.player.game_level)}</p><div className="mt-2 text-sm text-white/55">ELO {selectedProfile.player.elo}</div></div></div>
                </header>
                <Section title="Статистика игрока"><div className="grid grid-cols-3 gap-2"><StatCard value={selectedProfile.stats.completedGames} label="игр" /><StatCard value={selectedProfile.stats.wins} label="побед" /><StatCard value={`${selectedProfile.stats.winRate}%`} label="винрейт" /></div><div className="mt-2 grid grid-cols-3 gap-2"><StatCard value={selectedProfile.stats.firstKilled} label="ПУ" /><StatCard value={selectedProfile.stats.bestMoves} label="ЛХ" /><StatCard value={selectedProfile.tournament_awards.nominations} label="номинаций" /></div></Section>
              </>
            ) : (
              <Section title="Игроки клуба">
                <input value={playerSearch} onChange={(event) => setPlayerSearch(event.target.value)} placeholder="Найти игрока" className="mb-3 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25" />
                {selectedProfileError && <p className="mb-3 rounded-2xl bg-black/20 px-3 py-3 text-sm text-white/45">{selectedProfileError}</p>}
                {playersError ? <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">{playersError}</p> : clubPlayers === null ? <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Загрузка игроков…</p> : filteredPlayers.length ? <div className="space-y-2">{filteredPlayers.map((item) => <button key={item.id} type="button" disabled={selectedProfileLoading} onClick={() => void openPlayerProfile(item.id)} className="flex w-full items-center gap-3 rounded-2xl bg-black/20 p-3 text-left disabled:opacity-50">{item.avatar_url ? <img src={item.avatar_url} alt={item.nickname} className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-white/10" /> : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sm font-semibold text-white/65">{item.nickname.slice(0, 1).toUpperCase()}</div>}<div className="min-w-0 flex-1"><div className="truncate font-medium text-white">{item.nickname}{item.id === player.id ? ' · вы' : ''}</div><div className="mt-1 text-xs text-white/35">{gameLevelLabel(item.game_level)}</div></div><div className="shrink-0 text-sm font-semibold text-white/60">{item.elo} ELO</div></button>)}</div> : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Игроки не найдены.</p>}
              </Section>
            )}
          </>
        )}
      </div>

      {!tokensOpen && <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0c10]/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur-xl">
        <div className="mx-auto grid w-full max-w-[430px] grid-cols-5 gap-1">{NAV_ITEMS.map((item) => {
          const active = item.id === tab;
          return <button key={item.id} type="button" onClick={() => { setTab(item.id); if (item.id !== 'games') closeGameDetail(); }} className={`flex min-h-14 flex-col items-center justify-center rounded-2xl px-1 text-[10px] transition ${active ? 'bg-white/[0.09] text-white' : 'text-white/40'}`}><span className="text-lg leading-none">{item.icon}</span><span className="mt-1 truncate">{item.label}</span></button>;
        })}</div>
      </nav>}
    </main>
  );
}
