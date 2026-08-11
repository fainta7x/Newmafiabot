import React, { useEffect, useState } from 'react';
import { EVENING_FORMAT_LABELS, normalizeEveningFormat } from '../../lib/eveningFormat.ts';

type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity_name: string;
  rarity_icon: string;
  earned: boolean;
};

type AchievementCategory = {
  id: string;
  name: string;
  achievements: Achievement[];
};

type PlayerGame = {
  id: string;
  source: 'club' | 'tournament';
  title: string;
  date: string | null;
  game_number: number;
  role: string | null;
  status: string;
  won: boolean | null;
  seat_number: number;
  judge_name: string | null;
  table_name: string | null;
  judge_bonus: number;
  protocol_bonus: number;
  ci_points: number;
  penalty_points: number;
  disciplinary_penalty_points: number;
  regular_fouls: number;
  minor_technical_fouls: number;
  major_technical_fouls: number;
  best_move: boolean;
  first_killed: boolean;
  zero_round_voted: boolean;
};

type PlayerGameStats = {
  totalGames: number;
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
  lastGameAt: string | null;
  roleCounts: {
    citizen: number;
    sheriff: number;
    mafia: number;
    don: number;
    unknown: number;
  };
};

type TournamentAward = {
  id: string;
  title: string;
  tournament_title: string;
  tournament_date: string | null;
};

type RatingPlayer = {
  place: number;
  player_id: string;
  nickname: string;
  elo: number;
  game_level: 'novice' | 'club' | 'tournament' | string;
  avatar_url: string | null;
};

type RatingResponse = {
  generated_at: string;
  players: RatingPlayer[];
};

type EveningResponseStatus = 'going' | 'late' | 'thinking' | 'declined';

type PlayerEvening = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  venue: string | null;
  format: string;
  status: string;
  capacity: number | null;
  default_price: number | null;
  notes: string | null;
  response_status: EveningResponseStatus | 'unanswered' | string;
  registration_status: string;
  attending_count: number;
  thinking_count: number;
};

type PlayerEveningsResponse = {
  player_id: string;
  game_level: string;
  evenings: PlayerEvening[];
};

export type PlayerMeResponse = {
  player: {
    id: string;
    nickname: string;
    full_name: string | null;
    telegram_username: string | null;
    elo: number;
    tokens: number;
    game_level: string;
    avatar_url: string | null;
  };
  achievements: {
    earned: number;
    total: number;
    percentage: number;
    categories: AchievementCategory[];
  };
  games: {
    all: PlayerGame[];
    stats: PlayerGameStats;
  };
  tournaments: {
    games: PlayerGame[];
    awards: TournamentAward[];
    award_stats: {
      firstPlaces: number;
      secondPlaces: number;
      thirdPlaces: number;
      nominations: number;
    };
    completed_participations: unknown[];
  };
};

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

const resultLabel = (game: PlayerGame) => {
  if (game.status !== 'completed') return 'Не завершена';
  if (game.won === true) return 'Победа';
  if (game.won === false) return 'Поражение';
  return 'Результат не определён';
};

const pointLabels = (game: PlayerGame) => [
  game.judge_bonus ? `судья ${game.judge_bonus > 0 ? '+' : ''}${game.judge_bonus}` : null,
  game.protocol_bonus ? `бонус ${game.protocol_bonus > 0 ? '+' : ''}${game.protocol_bonus}` : null,
  game.ci_points ? `CI ${game.ci_points > 0 ? '+' : ''}${game.ci_points}` : null,
  game.penalty_points ? `штраф ${game.penalty_points}` : null,
  game.disciplinary_penalty_points ? `дисц. ${game.disciplinary_penalty_points}` : null,
].filter(Boolean) as string[];

const foulLabels = (game: PlayerGame) => [
  game.regular_fouls ? `фолы ${game.regular_fouls}` : null,
  game.minor_technical_fouls ? `мал. тех ${game.minor_technical_fouls}` : null,
  game.major_technical_fouls ? `бол. тех ${game.major_technical_fouls}` : null,
].filter(Boolean) as string[];

const RESPONSE_OPTIONS: Array<{ status: EveningResponseStatus; label: string }> = [
  { status: 'going', label: '✅ Иду' },
  { status: 'late', label: '⏳ Приду позже' },
  { status: 'thinking', label: '🤔 Пока думаю' },
  { status: 'declined', label: '❌ Не иду' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">{title}</h2>
      {children}
    </section>
  );
}

function RatingRow({ item, isSelf }: { item: RatingPlayer; isSelf: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${isSelf ? 'border border-white/15 bg-white/[0.09]' : 'bg-black/20'}`}>
      <div className="w-7 shrink-0 text-center text-sm font-semibold text-white/45">{item.place}</div>
      {item.avatar_url ? (
        <img src={item.avatar_url} alt={item.nickname} className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-white/10" />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sm font-semibold text-white/65">
          {item.nickname.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">{item.nickname}{isSelf ? ' · вы' : ''}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold text-white">{item.elo}</div>
        <div className="text-[10px] uppercase tracking-wide text-white/35">ELO</div>
      </div>
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

export default function PlayerCabinet({ data, canOpenAdmin = false }: { data: PlayerMeResponse; canOpenAdmin?: boolean }) {
  const { player, achievements, tournaments } = data;
  const gameProfile = data.games;
  const [rating, setRating] = useState<RatingPlayer[] | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [evenings, setEvenings] = useState<PlayerEvening[] | null>(null);
  const [eveningsError, setEveningsError] = useState<string | null>(null);
  const [savingEveningId, setSavingEveningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/rating', { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить ELO');
        if (!cancelled) {
          setRating(Array.isArray((body as RatingResponse).players) ? (body as RatingResponse).players : []);
          setRatingError(null);
        }
      } catch (error: any) {
        if (!cancelled) setRatingError(error?.message || 'Не удалось загрузить ELO');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/player/evenings', { credentials: 'include' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить игровые вечера');
        if (!cancelled) {
          setEvenings(Array.isArray((body as PlayerEveningsResponse).evenings) ? (body as PlayerEveningsResponse).evenings : []);
          setEveningsError(null);
        }
      } catch (error: any) {
        if (!cancelled) setEveningsError(error?.message || 'Не удалось загрузить игровые вечера');
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
      setEvenings((current) => (current || []).map((evening) =>
        evening.id === eveningId ? { ...evening, response_status: status, registration_status: status } : evening
      ));
      setEveningsError(null);
    } catch (error: any) {
      setEveningsError(error?.message || 'Не удалось сохранить ответ');
    } finally {
      setSavingEveningId(null);
    }
  };

  const earnedAchievements = achievements.categories.flatMap((category) =>
    category.achievements
      .filter((achievement) => achievement.earned)
      .map((achievement) => ({ ...achievement, categoryName: category.name })),
  );
  const ratingTop = (rating || []).slice(0, 10);
  const selfRating = (rating || []).find((item) => item.player_id === player.id) || null;
  const selfOutsideTop = Boolean(selfRating && !ratingTop.some((item) => item.player_id === player.id));
  const stats = gameProfile.stats;

  return (
    <main className="min-h-screen bg-[#090a0d] px-3 pb-10 pt-3 text-white">
      <div className="mx-auto flex w-full max-w-[430px] flex-col gap-3">
        <header className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.035] p-4">
          <div className="flex items-center gap-4">
            {player.avatar_url ? (
              <img src={player.avatar_url} alt={player.nickname} className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-white/15" />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl font-semibold text-white/70">
                {player.nickname.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-[0.2em] text-white/40">2LA Noire</div>
              <h1 className="mt-1 truncate text-2xl font-semibold">{player.nickname}</h1>
              {player.full_name && <p className="mt-1 truncate text-sm text-white/60">{player.full_name}</p>}
              {player.telegram_username && <p className="mt-1 truncate text-sm text-white/45">@{player.telegram_username.replace(/^@/, '')}</p>}
            </div>
          </div>
          {canOpenAdmin && (
            <a
              href="/admin"
              className="mt-4 block rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-center text-sm font-medium text-white/80"
            >
              Панель организатора
            </a>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-black/25 px-3 py-3"><div className="text-xs text-white/45">ELO</div><div className="mt-1 text-xl font-semibold">{player.elo}</div></div>
            <div className="rounded-2xl bg-black/25 px-3 py-3"><div className="text-xs text-white/45">Жетоны</div><div className="mt-1 text-xl font-semibold">{player.tokens}</div></div>
          </div>
        </header>

        <Section title="Ближайшие игры">
          {eveningsError && <p className="mb-3 rounded-2xl bg-black/20 px-3 py-3 text-sm text-white/55">{eveningsError}</p>}
          {evenings === null ? (
            <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Загрузка игровых вечеров…</p>
          ) : evenings.length ? (
            <div className="space-y-3">
              {evenings.map((evening) => {
                const format = normalizeEveningFormat(evening.format);
                const saving = savingEveningId === evening.id;
                return (
                  <article key={evening.id} className="rounded-2xl bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{evening.title}</div>
                        <div className="mt-1 text-xs text-white/45">{formatEveningDate(evening.starts_at)}</div>
                        {evening.venue && <div className="mt-1 truncate text-xs text-white/35">📍 {evening.venue}</div>}
                      </div>
                      <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-1 text-[10px] font-medium text-white/60">
                        {EVENING_FORMAT_LABELS[format]}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-white/40">
                      <span>Идут: {evening.attending_count}</span>
                      {evening.default_price != null && <span>{Number(evening.default_price)} ₽</span>}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {RESPONSE_OPTIONS.map((option) => {
                        const selected = evening.response_status === option.status;
                        return (
                          <button
                            key={option.status}
                            type="button"
                            disabled={saving}
                            onClick={() => void respondToEvening(evening.id, option.status)}
                            className={`min-h-11 rounded-xl border px-2 py-2 text-xs font-medium transition ${selected ? 'border-white/30 bg-white text-black' : 'border-white/10 bg-white/[0.05] text-white/70'} ${saving ? 'opacity-50' : ''}`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Сейчас нет доступных игровых вечеров.</p>
          )}
        </Section>

        <Section title="Статистика">
          <div className="grid grid-cols-3 gap-2">
            <StatCard value={stats.completedGames} label="игр" />
            <StatCard value={stats.wins} label="побед" />
            <StatCard value={`${stats.winRate}%`} label="винрейт" />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <StatCard value={stats.redGames} label="за красных" />
            <StatCard value={stats.blackGames} label="за чёрных" />
          </div>
          <div className="mt-3 rounded-2xl bg-black/20 p-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-white/35">Роли</div>
            <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
              <div><div className="text-base font-semibold">{stats.roleCounts.citizen}</div><div className="text-[10px] text-white/35">Мирный</div></div>
              <div><div className="text-base font-semibold">{stats.roleCounts.sheriff}</div><div className="text-[10px] text-white/35">Шериф</div></div>
              <div><div className="text-base font-semibold">{stats.roleCounts.mafia}</div><div className="text-[10px] text-white/35">Мафия</div></div>
              <div><div className="text-base font-semibold">{stats.roleCounts.don}</div><div className="text-[10px] text-white/35">Дон</div></div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <StatCard value={stats.firstKilled} label="ПУ" />
            <StatCard value={stats.bestMoves} label="ЛХ" />
            <StatCard value={stats.zeroRoundVoted} label="0 круг" />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-white/35">
            <span>Клубные: {stats.clubGames}</span>
            <span>Турнирные: {stats.tournamentGames}</span>
          </div>
        </Section>

        <Section title="Мои игры">
          {gameProfile.all.length ? (
            <div className="space-y-2">
              {gameProfile.all.map((game) => {
                const points = pointLabels(game);
                const fouls = foulLabels(game);
                return (
                  <article key={game.id} className="rounded-2xl bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{game.title}</div>
                        <div className="mt-1 text-xs text-white/40">
                          {formatDate(game.date)} · {game.source === 'tournament' ? 'Турнир' : 'Клуб'}
                          {game.game_number ? ` · Игра №${game.game_number}` : ''}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-1 text-xs text-white/65">{resultLabel(game)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-white/[0.07] px-2 py-1 text-white/70">{roleLabel(game.role)}</span>
                      {game.seat_number > 0 && <span className="rounded-full bg-white/[0.07] px-2 py-1 text-white/55">место {game.seat_number}</span>}
                      {game.first_killed && <span className="rounded-full bg-white/[0.07] px-2 py-1 text-white/55">ПУ</span>}
                      {game.best_move && <span className="rounded-full bg-white/[0.07] px-2 py-1 text-white/55">ЛХ</span>}
                      {points.map((part) => <span key={part} className="rounded-full bg-white/[0.07] px-2 py-1 text-white/55">{part}</span>)}
                      {fouls.map((part) => <span key={part} className="rounded-full bg-white/[0.07] px-2 py-1 text-white/45">{part}</span>)}
                    </div>
                    {(game.table_name || game.judge_name) && (
                      <div className="mt-2 text-[11px] text-white/30">
                        {[game.table_name, game.judge_name ? `судья ${game.judge_name}` : null].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Сохранённых игр пока нет.</p>
          )}
        </Section>

        <Section title="ELO клуба">
          {ratingError ? (
            <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">{ratingError}</p>
          ) : rating === null ? (
            <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Загрузка ELO…</p>
          ) : ratingTop.length ? (
            <div className="space-y-2">
              {ratingTop.map((item) => <RatingRow key={item.player_id} item={item} isSelf={item.player_id === player.id} />)}
              {selfOutsideTop && selfRating && (
                <>
                  <div className="py-0.5 text-center text-xs text-white/25">•••</div>
                  <RatingRow item={selfRating} isSelf />
                </>
              )}
            </div>
          ) : (
            <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">ELO пока пуст.</p>
          )}
        </Section>

        <Section title="Достижения">
          <div className="flex items-end justify-between gap-3">
            <div><div className="text-2xl font-semibold">{achievements.earned} / {achievements.total}</div><div className="text-sm text-white/45">получено достижений</div></div>
            <div className="text-lg font-semibold text-white/75">{achievements.percentage}%</div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white/70" style={{ width: `${Math.max(0, Math.min(100, achievements.percentage))}%` }} /></div>
          {earnedAchievements.length ? (
            <div className="mt-4 space-y-2">
              {earnedAchievements.map((achievement) => (
                <div key={achievement.id} className="rounded-2xl bg-black/20 p-3">
                  <div className="flex gap-3"><div className="text-2xl">{achievement.icon}</div><div className="min-w-0 flex-1"><div className="font-medium">{achievement.name}</div><div className="mt-1 text-sm text-white/50">{achievement.description}</div><div className="mt-1 text-xs text-white/35">{achievement.categoryName} · {achievement.rarity_icon} {achievement.rarity_name}</div></div></div>
                </div>
              ))}
            </div>
          ) : <p className="mt-4 rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Пока нет полученных достижений.</p>}
        </Section>

        <Section title="Награды турниров">
          <div className="mb-3 grid grid-cols-4 gap-1.5 text-center">
            <div className="rounded-xl bg-black/20 p-2"><div className="text-lg font-semibold">{tournaments.award_stats.firstPlaces}</div><div className="text-[10px] text-white/40">1 место</div></div>
            <div className="rounded-xl bg-black/20 p-2"><div className="text-lg font-semibold">{tournaments.award_stats.secondPlaces}</div><div className="text-[10px] text-white/40">2 место</div></div>
            <div className="rounded-xl bg-black/20 p-2"><div className="text-lg font-semibold">{tournaments.award_stats.thirdPlaces}</div><div className="text-[10px] text-white/40">3 место</div></div>
            <div className="rounded-xl bg-black/20 p-2"><div className="text-lg font-semibold">{tournaments.award_stats.nominations}</div><div className="text-[10px] text-white/40">Номинации</div></div>
          </div>
          {tournaments.awards.length ? <div className="space-y-2">{tournaments.awards.map((award) => <div key={award.id} className="rounded-2xl bg-black/20 p-3"><div className="font-medium">{award.title}</div><div className="mt-1 text-sm text-white/50">{award.tournament_title}</div><div className="mt-1 text-xs text-white/35">{formatDate(award.tournament_date)}</div></div>)}</div> : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Турнирных наград пока нет.</p>}
        </Section>
      </div>
    </main>
  );
}
