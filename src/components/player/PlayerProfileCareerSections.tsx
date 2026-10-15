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
  return <>
    <section aria-label="Результаты и команды" className="space-y-4 pb-3">
      <dl aria-label="Серии побед" className="grid grid-cols-2 gap-3">
        <div><dt className="text-xs text-white/55">Побед подряд сейчас</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{stats.current_streak ?? '—'}</dd></div>
        <div><dt className="text-xs text-white/55">Рекорд серии</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{stats.best_streak ?? '—'}</dd></div>
      </dl>
      {season && <div data-testid="profile-season" className="flex items-start justify-between gap-3 border-t border-white/10 pt-3">
        <div className="min-w-0"><p className="text-xs text-white/55">Текущий рейтинговый сезон</p><h3 className="mt-1 break-words text-sm font-semibold">{season.label}</h3><p className="mt-1 text-xs text-white/60">{season.games ? `${season.wins} побед из ${season.games} · ${season.win_rate}%` : 'В этом рейтинговом сезоне игр пока нет'}</p></div>
        {season.place ? <p className="shrink-0 text-right text-lg font-semibold">#{season.place}<span className="block text-xs font-normal text-white/55">из {season.total_players}</span></p> : null}
      </div>}
      {stats.red && stats.black && <div aria-label="Красные и чёрные" className="border-t border-white/10 pt-3">
        <h3 className="text-sm font-semibold">Победы по командам</h3>
        <div className="mt-3 grid grid-cols-2 gap-4">{[
          { label: 'За красных', stat: stats.red, color: 'bg-rose-300' },
          { label: 'За чёрных', stat: stats.black, color: 'bg-violet-300' },
        ].map(({label,stat,color}) => <div key={label} className="min-w-0">
          <div className="text-xs text-white/65">{label}</div><p className="mt-1 text-xl font-semibold tabular-nums">{stat.games ? `${stat.win_rate}%` : '—'}</p>
          <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={'h-full rounded-full ' + color} style={{width: `${stat.games ? Math.min(100,Math.max(0,stat.win_rate)) : 0}%`}}/></div>
          <p className="mt-2 text-xs text-white/55">{stat.wins} из {stat.games} игр</p>
        </div>)}</div>
      </div>}
      {[stats.first_killed,stats.best_moves,stats.zero_round_voted].some(value => value != null) && <dl aria-label="ПУ, ЛХ и нулевой круг" className="grid grid-cols-3 gap-3 border-t border-white/10 pt-3">
        <div><dt className="text-xs text-white/55">ПУ — первым убит</dt><dd className="mt-1 text-lg font-semibold">{stats.first_killed ?? '—'}</dd></div>
        <div><dt className="text-xs text-white/55">ЛХ — лучший ход</dt><dd className="mt-1 text-lg font-semibold">{stats.best_moves ?? '—'}</dd></div>
        <div><dt className="text-xs text-white/55">На нулевом круге</dt><dd className="mt-1 text-lg font-semibold">{stats.zero_round_voted ?? '—'}</dd></div>
      </dl>}
    </section>
    <PlayerGameNumbers stats={gameStats} totalGames={stats.games} />
    <PlayerNightShots shots={nightShots} />
    <PlayerReveals numbers={reveals} />
    <PlayerCircleExits numbers={circleExits} />
  </>;
}
