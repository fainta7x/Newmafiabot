import React from 'react';

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

type TournamentGame = {
  id: string;
  title: string;
  date: string | null;
  game_number: number;
  role: string | null;
  status: string;
  won: boolean | null;
  judge_bonus: number;
  protocol_bonus: number;
  ci_points: number;
  penalty_points: number;
  disciplinary_penalty_points: number;
};

type TournamentAward = {
  id: string;
  title: string;
  tournament_title: string;
  tournament_date: string | null;
};

export type PlayerMeResponse = {
  player: {
    id: string;
    nickname: string;
    full_name: string | null;
    telegram_username: string | null;
    elo: number;
    tokens: number;
    avatar_url: string | null;
  };
  achievements: {
    earned: number;
    total: number;
    percentage: number;
    categories: AchievementCategory[];
  };
  tournaments: {
    games: TournamentGame[];
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

const roleLabel = (role: string | null) => {
  if (role === 'citizen') return 'Мирный';
  if (role === 'sheriff') return 'Шериф';
  if (role === 'mafia') return 'Мафия';
  if (role === 'don') return 'Дон';
  return role || 'Роль не указана';
};

const resultLabel = (game: TournamentGame) => {
  if (game.status !== 'completed') return 'Не завершена';
  if (game.won === true) return 'Победа';
  if (game.won === false) return 'Поражение';
  return 'Результат не определён';
};

const pointLabels = (game: TournamentGame) => [
  game.judge_bonus ? `судья ${game.judge_bonus > 0 ? '+' : ''}${game.judge_bonus}` : null,
  game.protocol_bonus ? `бонус ${game.protocol_bonus > 0 ? '+' : ''}${game.protocol_bonus}` : null,
  game.ci_points ? `CI ${game.ci_points > 0 ? '+' : ''}${game.ci_points}` : null,
  game.penalty_points ? `штраф ${game.penalty_points}` : null,
  game.disciplinary_penalty_points ? `дисц. ${game.disciplinary_penalty_points}` : null,
].filter(Boolean) as string[];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">{title}</h2>
      {children}
    </section>
  );
}

export default function PlayerCabinet({ data, canOpenAdmin = false }: { data: PlayerMeResponse; canOpenAdmin?: boolean }) {
  const { player, achievements, tournaments } = data;
  const earnedAchievements = achievements.categories.flatMap((category) =>
    category.achievements
      .filter((achievement) => achievement.earned)
      .map((achievement) => ({ ...achievement, categoryName: category.name })),
  );

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

        <Section title="Турнирные игры">
          {tournaments.games.length ? (
            <div className="space-y-2">
              {tournaments.games.map((game) => {
                const points = pointLabels(game);
                return <article key={game.id} className="rounded-2xl bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-medium">{game.title}</div><div className="mt-1 text-xs text-white/40">{formatDate(game.date)} · Игра №{game.game_number}</div></div><span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-1 text-xs text-white/65">{resultLabel(game)}</span></div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-white/[0.07] px-2 py-1 text-white/70">{roleLabel(game.role)}</span>{points.map((part) => <span key={part} className="rounded-full bg-white/[0.07] px-2 py-1 text-white/55">{part}</span>)}</div>
                </article>;
              })}
            </div>
          ) : <p className="rounded-2xl bg-black/20 px-3 py-4 text-sm text-white/45">Турнирных игр пока нет.</p>}
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
