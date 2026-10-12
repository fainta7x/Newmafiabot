export type CircleExitNumbers = { games: number; votedOut: number; byAlive: Record<string, number>; critical: number } | null | undefined;

/** «Круги ухода»: on which day (by the number alive) and how often on a critical circle the player was voted out. */
export default function PlayerCircleExits({ numbers }: { numbers: CircleExitNumbers }) {
  if (!numbers || numbers.votedOut === 0) return null;
  const rows = Object.entries(numbers.byAlive).map(([alive, count]) => ({ alive: Number(alive), count })).sort((a, b) => b.alive - a.alive);
  const top = [...rows].sort((a, b) => b.count - a.count || b.alive - a.alive)[0];
  return <section data-testid="profile-circle-exits" aria-label="Круги ухода" className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">Круги ухода</div>
    <div className="mt-2 text-sm">Заголосован <b>{numbers.votedOut}</b> раз из {numbers.games} игр{top ? <>; чаще всего — на круге с <b>{top.alive}</b> живыми</> : null}</div>
    <ul className="mt-2 space-y-1">
      {rows.map((row) => <li key={row.alive} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2 text-sm"><span>{row.alive} живых</span><b>{row.count}</b></li>)}
      <li className="flex items-center justify-between gap-3 rounded-xl bg-amber-200/[0.06] px-3 py-2 text-sm"><span>На критике</span><b>{numbers.critical}</b></li>
    </ul>
  </section>;
}
