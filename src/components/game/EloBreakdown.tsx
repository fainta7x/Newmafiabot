// The Elo breakdown of a seat as on the club's result blank (owner, 2026-10-27: «в таком формате… всё расписывалось в
// протоколах игры»). The lines come from the server (`seatEloLines`), the same as the picture in the club chat.

const tone = (value: number | null | undefined) => (Math.round(value || 0) > 0 ? 'text-emerald-300' : Math.round(value || 0) < 0 ? 'text-rose-300' : 'text-white/60');

export const signedElo = (value: number) => `${Math.round(value) > 0 ? '+' : Math.round(value) < 0 ? '−' : ''}${Math.abs(Math.round(value))}`;

/** «Эло +51 · 1014»: the change for the game and the rating after it. */
export function EloChange({ delta, after }: { delta: number; after: number | null }) {
  return (
    <span className="whitespace-nowrap text-[11px] tabular-nums">
      <span className={tone(delta)}>Эло {signedElo(delta)}</span>
      {after != null ? <span className="text-white/40"> · {Math.round(after)}</span> : null}
    </span>
  );
}

/** Every line of the breakdown; «За действия в игре» is coloured by its sign. */
export function EloBreakdownLines({ lines, contribution, testId, spacious = false }: { lines: string[]; contribution: number | null | undefined; testId?: string; spacious?: boolean }) {
  if (!lines.length) return null;
  return (
    <ul data-testid={testId} className={spacious
      ? "mt-3 min-w-0 space-y-2 border-t border-white/[0.09] pt-3 text-[13px] leading-[1.55] text-white/75"
      : "mt-2 min-w-0 space-y-0.5 border-t border-white/[0.06] pt-2 text-[11px] leading-4 text-white/60"}>
      {lines.map((line, index) => {
        const split = spacious ? line.indexOf(': ') : -1;
        return (
          <li key={`${index}:${line}`} className={`min-w-0 whitespace-normal break-words ${spacious ? 'rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5' : ''} ${line.startsWith('За действия в игре') ? `font-semibold ${tone(contribution)}` : ''} ${spacious && line.includes('×2 за критический круг') ? 'border-amber-200/20 bg-amber-200/[0.06] text-white' : ''}`}>
            {split >= 0 ? (
              <>
                <span className="block font-semibold text-white/90">{line.slice(0, split)}</span>
                <span className="mt-1 block">{line.slice(split + 2)}</span>
              </>
            ) : line}
          </li>
        );
      })}
    </ul>
  );
}

/** «Красные 1057 · Чёрные 1067 · команды одного уровня · шанс красных 30%». */
export function EloTableLine({ table, testId }: { table: { redAvg: number; blackAvg: number; level: string; redChancePercent: number }; testId?: string }) {
  return (
    <p data-testid={testId} className="break-words text-[11px] leading-4 text-white/55">
      <span className="text-rose-300">Красные {table.redAvg}</span> · <span className="text-white/85">Чёрные {table.blackAvg}</span> · {table.level} · шанс красных {table.redChancePercent}%
    </p>
  );
}
