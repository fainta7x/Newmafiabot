export type CircleExitNumbers = { games: number; votedOut: number; byAlive: Record<string, number>; critical: number } | null | undefined;

/** «Круги ухода»: on which day (by the number alive) and how often on a critical circle the player was voted out. */
export default function PlayerCircleExits({ numbers }: { numbers: CircleExitNumbers }) {
  if (!numbers || numbers.votedOut === 0) return null;
  const rows = Object.entries(numbers.byAlive).map(([alive, count]) => ({ alive: Number(alive), count })).sort((a, b) => b.alive - a.alive);
  const top = [...rows].sort((a, b) => b.count - a.count || b.alive - a.alive)[0];
  return <section data-testid="profile-circle-exits" aria-label="Круги ухода" className="border-t border-white/10 pt-4">
    <div className="text-sm font-semibold text-white/85">Круги ухода</div>
    <p className="mt-1 text-xs leading-5 text-white/55">Уходы голосованием в сохранённых играх. Число живых показывает ситуацию за столом при уходе.</p>
    <div className="mt-2 text-sm">Заголосован <b>{numbers.votedOut}</b> раз из {numbers.games} игр{top ? <>; чаще всего — на круге с <b>{top.alive}</b> живыми</> : null}</div>
    <ul className="mt-2 space-y-1">
      {rows.map((row) => <li key={row.alive} className="flex items-center justify-between gap-3 border-b border-white/[.06] py-2 text-sm"><span>{row.alive} живых</span><b>{row.count}</b></li>)}
      <li className="flex items-center justify-between gap-3 rounded-xl bg-amber-200/[0.06] px-3 py-2 text-sm"><span>На критике</span><b>{numbers.critical}</b></li>
    </ul>
  </section>;
}
