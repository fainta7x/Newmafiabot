import PlayerGameNumbers from './PlayerGameNumbers.tsx';
import type { PlayerGameStatistics } from '../../lib/gameStatistics';

type TeamSplit = { games: number; wins: number; win_rate: number };
export type ProfileCareerStats = {
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
export default function PlayerProfileCareerSections({ stats, season, gameStats }: { stats: ProfileCareerStats; season: ProfileSeason; gameStats?: PlayerGameStatistics | null }) {
  if (!stats) return null;
  const tile = 'rounded-2xl border border-white/10 bg-white/[.04] p-3';
  return <>
    <section className="grid grid-cols-3 gap-2" aria-label="Серии и винрейт">
      <div className={tile}><div className="text-lg font-semibold">{stats.win_rate ?? 0}%</div><div className="text-[11px] text-white/50">винрейт</div></div>
      <div className={tile}><div className="text-lg font-semibold">{stats.current_streak || '—'}</div><div className="text-[11px] text-white/50">побед подряд</div></div>
      <div className={tile}><div className="text-lg font-semibold">{stats.best_streak || '—'}</div><div className="text-[11px] text-white/50">рекорд серии</div></div>
    </section>

    {season ? <section data-testid="profile-season" className="rounded-2xl border border-sky-200/10 bg-sky-200/[0.035] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-100/50">Текущий сезон</div>
          <div className="mt-1 truncate text-lg font-semibold">{season.label}</div>
          <div className="mt-1 text-xs text-white/45">{season.games ? `${season.wins} побед из ${season.games} · ${season.win_rate}%` : 'В этом сезоне игр пока нет'}</div>
        </div>
        {season.place ? <div className="shrink-0 rounded-2xl bg-black/20 px-3 py-2 text-center"><div className="text-xl font-semibold">#{season.place}</div><div className="text-[11px] text-white/40">из {season.total_players}</div></div> : null}
      </div>
    </section> : null}

    {stats.red && stats.black ? <section className="grid grid-cols-2 gap-2" aria-label="Красные и чёрные">
      <div className="rounded-2xl border border-rose-200/10 bg-rose-200/[0.03] p-4"><div className="text-[11px] uppercase tracking-[0.1em] text-rose-100/50">За красных</div><div className="mt-1 text-2xl font-semibold">{stats.red.games ? `${stats.red.win_rate}%` : '—'}</div><div className="text-[11px] text-white/40">{stats.red.wins} побед из {stats.red.games}</div></div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-[11px] uppercase tracking-[0.1em] text-white/50">За чёрных</div><div className="mt-1 text-2xl font-semibold">{stats.black.games ? `${stats.black.win_rate}%` : '—'}</div><div className="text-[11px] text-white/40">{stats.black.wins} побед из {stats.black.games}</div></div>
    </section> : null}

    {(stats.first_killed || stats.best_moves || stats.zero_round_voted) ? <section className="grid grid-cols-3 gap-2" aria-label="ПУ, ЛХ и нулевой круг">
      <div className={tile}><div className="text-lg font-semibold">{stats.first_killed ?? 0}</div><div className="text-[11px] text-white/50">ПУ — первым убит</div></div>
      <div className={tile}><div className="text-lg font-semibold">{stats.best_moves ?? 0}</div><div className="text-[11px] text-white/50">ЛХ — лучший ход</div></div>
      <div className={tile}><div className="text-lg font-semibold">{stats.zero_round_voted ?? 0}</div><div className="text-[11px] text-white/50">на нулевом круге</div></div>
    </section> : null}

    <PlayerGameNumbers stats={gameStats} />
  </>;
}
