import PlayerGameNumbers from './PlayerGameNumbers.tsx';
import PlayerNightShots, { type NightShots } from './PlayerNightShots.tsx';
import PlayerCircleExits, { type CircleExitNumbers } from './PlayerCircleExits.tsx';
import PlayerReveals, { type RevealNumbers } from './PlayerReveals.tsx';
import type { PlayerGameStatistics } from '../../lib/gameStatistics';

type TeamSplit = { games: number; wins: number; win_rate: number };
export type ProfileCareerStats = {
  games?: number;
  win_rate?: number;
  current_streak?: number;
  best_streak?: number;
  red?: TeamSplit;
  black?: TeamSplit;
  first_killed?: number;
  best_moves?: number;
  zero_round_voted?: number;
} | null | undefined;
export type ProfileSeason = { label: string; games: number; wins: number; win_rate: number; place: number | null; total_players: number } | null | undefined;

/**
 * What used to be the separate «Карьера» screen, now part of the one player profile: win rate, streaks, the current season,
 * red/black split, the first-killed / best-move counters and «Игра в цифрах». Every number comes from the profile summary,
 * so the overview, the «Игры», «Роли» and «Elo» tabs can no longer disagree.
 */
export default function PlayerProfileCareerSections({ stats, season, gameStats, nightShots, reveals, circleExits }: { stats: ProfileCareerStats; season: ProfileSeason; gameStats?: PlayerGameStatistics | null; nightShots?: NightShots; reveals?: RevealNumbers; circleExits?: CircleExitNumbers }) {
  if (!stats) return null;
  const tile = 'rounded-2xl border border-white/10 bg-white/[.04] p-3';
  return <>
    <section className="grid grid-cols-2 gap-2" aria-label="Серии побед">
      <div className={tile}><div className="text-[10px] uppercase tracking-wider text-white/40">Сейчас</div><div className="mt-1 text-2xl font-semibold tabular-nums">{stats.current_streak || '—'}</div><div className="text-[11px] text-white/50">побед подряд</div></div>
      <div className={tile}><div className="text-[10px] uppercase tracking-wider text-white/40">Лучший результат</div><div className="mt-1 text-2xl font-semibold tabular-nums">{stats.best_streak || '—'}</div><div className="text-[11px] text-white/50">рекорд серии</div></div>
    </section>

    {season ? <section data-testid="profile-season" className="rounded-2xl border border-sky-200/10 bg-sky-200/[0.035] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-100/50">Текущий рейтинговый сезон</div>
          <div className="mt-1 truncate text-lg font-semibold">{season.label}</div>
          <div className="mt-1 text-xs text-white/45">{season.games ? `${season.wins} побед из ${season.games} · ${season.win_rate}%` : 'В этом сезоне игр пока нет'}</div>
        </div>
        {season.place ? <div className="shrink-0 rounded-2xl bg-black/20 px-3 py-2 text-center"><div className="text-xl font-semibold">#{season.place}</div><div className="text-[11px] text-white/40">из {season.total_players}</div></div> : null}
      </div>
    </section> : null}

    {stats.red && stats.black ? <section aria-label="Красные и чёрные" className="rounded-[24px] border border-white/10 bg-white/[0.025] p-3">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">Победы по командам</div>
      <div className="grid grid-cols-2 gap-2">
        {([
          { label: 'За красных', stat: stats.red, color: 'bg-rose-300', border: 'border-rose-200/10' },
          { label: 'За чёрных', stat: stats.black, color: 'bg-white/70', border: 'border-white/10' },
        ]).map(({ label, stat, color, border }) => (
          <div key={label} className={`min-w-0 rounded-2xl border ${border} bg-black/15 p-3`}>
            <div className="text-[11px] text-white/55">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{stat.games ? `${stat.win_rate}%` : '—'}</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${label}: ${stat.games ? stat.win_rate : 0}% побед`}>
              <div className={`h-full rounded-full ${color}`} style={{ width: `${stat.games ? Math.min(100, Math.max(0, stat.win_rate)) : 0}%` }} />
            </div>
            <div className="mt-2 text-[11px] text-white/45">{stat.wins} из {stat.games} игр</div>
          </div>
        ))}
      </div>
    </section> : null}

    {(stats.first_killed || stats.best_moves || stats.zero_round_voted) ? <section className="grid grid-cols-3 gap-2" aria-label="ПУ, ЛХ и нулевой круг">
      <div className={tile}><div className="text-lg font-semibold">{stats.first_killed ?? 0}</div><div className="text-[11px] text-white/50">ПУ — первым убит</div></div>
      <div className={tile}><div className="text-lg font-semibold">{stats.best_moves ?? 0}</div><div className="text-[11px] text-white/50">ЛХ — лучший ход</div></div>
      <div className={tile}><div className="text-lg font-semibold">{stats.zero_round_voted ?? 0}</div><div className="text-[11px] text-white/50">на нулевом круге</div></div>
    </section> : null}

    <PlayerGameNumbers stats={gameStats} totalGames={stats.games} />
    <PlayerNightShots shots={nightShots} />
    <PlayerReveals numbers={reveals} />
    <PlayerCircleExits numbers={circleExits} />
  </>;
}
