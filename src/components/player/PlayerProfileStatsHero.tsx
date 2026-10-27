/** Compact, visual overview of a player's career at a 390px phone width.
 * Values are passed from the existing scoped profile summary: this component never fetches
 * or recomputes Elo / season standings.
 */
type Props = {
  games: number | null | undefined;
  wins: number | null | undefined;
  winRate: number | null | undefined;
  elo: string;
  seasonPlace: number | null | undefined;
};

export default function PlayerProfileStatsHero({ games, wins, winRate, elo, seasonPlace }: Props) {
  const played = Number(games);
  const won = Number(wins);
  const hasPlayed = Number.isFinite(played) && played > 0;
  const knownWins = Number.isFinite(won) && won >= 0 && wins != null;
  const explicitRate = winRate == null ? null : Number(winRate);
  const rate = !hasPlayed ? null : Number.isFinite(explicitRate)
    ? Math.min(100, Math.max(0, explicitRate as number))
    : knownWins ? Math.min(100, Math.max(0, won / played * 100)) : null;
  const percent = rate === null ? '—' : `${Math.round(rate)}%`;

  return <section data-testid="profile-key-stats" aria-label="Игровые показатели" className="pt-3">
    <h2 className="text-sm font-semibold">Игровая карьера</h2>
    <dl className="mt-3 grid grid-cols-[88px_1fr_1fr] items-center gap-4">
      <div className="flex flex-col items-center"><dt className="order-2 mt-1 text-center text-xs text-white/55">Процент побед</dt><dd className="relative grid h-20 w-20 place-items-center text-xl font-semibold tabular-nums">
        <svg aria-hidden="true" className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="6" /><circle cx="40" cy="40" r="34" fill="none" stroke="#d6b66d" strokeWidth="6" strokeLinecap="round" pathLength="100" strokeDasharray={`${rate ?? 0} 100`} /></svg>
        <span className="relative">{percent}</span>
      </dd></div>
      {[['Игры', games ?? '—'], ['Победы', wins ?? '—']].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-white/55">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd></div>)}
    </dl>
    <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-3">
      <div><dt className="text-xs text-white/55">Текущий Elo · всё время</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{elo}</dd></div>
      <div><dt className="text-xs text-white/55">Место в сезоне</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{seasonPlace && seasonPlace > 0 ? `#${seasonPlace}` : '—'}</dd></div>
    </dl>
  </section>;
}
