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

  return <section data-testid="profile-key-stats" aria-label="Игровые показатели" className="overflow-hidden rounded-[28px] border border-amber-200/15 bg-gradient-to-br from-[#282017] via-[#17181b] to-[#111216] p-4">
    <div className="flex items-center gap-3.5">
      <div className="grid h-[116px] w-[116px] shrink-0 place-items-center rounded-full p-[8px]"
        role="img" aria-label={`Процент побед: ${percent}`}
        style={{ background: `conic-gradient(#ddac65 ${rate ?? 0}%, rgba(255,255,255,.10) 0)` }}>
        <div className="grid h-full w-full place-content-center rounded-full bg-[#111216] text-center">
          <strong className="text-[26px] font-semibold tabular-nums leading-none text-white">{percent}</strong>
          <span className="mt-1 text-[10px] text-white/45">винрейт</span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-amber-100/55">Игровая карьера</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="min-w-0 rounded-xl bg-black/20 px-2.5 py-2">
            <div className="text-xl font-semibold tabular-nums text-white">{games ?? '—'}</div>
            <div className="text-[11px] text-white/50">игр</div>
          </div>
          <div className="min-w-0 rounded-xl bg-black/20 px-2.5 py-2">
            <div className="text-xl font-semibold tabular-nums text-white">{wins ?? '—'}</div>
            <div className="text-[11px] text-white/50">побед</div>
          </div>
        </div>
      </div>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/[0.07] pt-3">
      <div className="min-w-0 rounded-xl bg-black/20 px-3 py-2.5">
        <div className="text-[10px] text-white/45">Текущий Elo · всё время</div>
        <div className="mt-1 text-[22px] font-semibold leading-none tabular-nums">{elo}</div>
      </div>
      <div className="min-w-0 rounded-xl bg-black/20 px-3 py-2.5">
        <div className="text-[10px] text-white/45">Место в сезоне</div>
        <div className="mt-1 text-[22px] font-semibold leading-none tabular-nums">{seasonPlace && seasonPlace > 0 ? `#${seasonPlace}` : '—'}</div>
      </div>
    </div>
  </section>;
}
