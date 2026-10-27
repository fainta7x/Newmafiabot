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
export function EloBreakdownLines({ lines, contribution, testId }: { lines: string[]; contribution: number | null | undefined; testId?: string }) {
  if (!lines.length) return null;
  return (
    <ul data-testid={testId} className="mt-2 min-w-0 space-y-0.5 border-t border-white/[0.06] pt-2 text-[11px] leading-4 text-white/60">
      {lines.map((line, index) => (
        <li key={`${index}:${line}`} className={`break-words ${line.startsWith('За действия в игре') ? `font-semibold ${tone(contribution)}` : ''}`}>{line}</li>
      ))}
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
