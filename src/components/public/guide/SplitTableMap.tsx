/**
 * The table as a picture for the split-vote trainers, laid out the club way: eleven places around a
 * round table, the host at the bottom, players 1–10 starting at the host's left hand and going round
 * the table (1 bottom-left, up the left side, over the top, 10 bottom-right next to the host). Shows who was killed, who is nominated and split, the learner's seat, the sheriff claims
 * with their checks and — when `votes` is given — whom every seat votes for, in the split player's
 * colour, so the way the table divides is visible at a glance.
 */
const SEATS = Array.from({ length: 10 }, (_, index) => index + 1);
/** Colours of the split players, in nomination order. */
export const SPLIT_COLORS = ['#38bdf8', '#c084fc', '#34d399'] as const;

export type TableClaim = { seat: number; check: number; black: boolean };

type Props = {
  killed?: number | null;
  /** Nomination order. */
  candidates: number[];
  split: number[];
  seat?: number | null;
  claims?: TableClaim[];
  /** Nominee → the seats that vote for him. */
  votes?: Record<number, number[]>;
};

/** Place 0 is the host at the bottom; seats 1–10 follow on his left hand. */
const position = (seat: number, radius: number) => {
  const angle = ((90 + (seat * 360) / 11) * Math.PI) / 180;
  return { x: 150 + radius * Math.cos(angle), y: 150 + radius * Math.sin(angle) };
};

export const SplitTableMap = ({ killed = null, candidates, split, seat = null, claims = [], votes }: Props) => {
  // A vote for a nominee outside the split (a broken split) shows in grey.
  const splitColor = (candidate: number) => SPLIT_COLORS[split.indexOf(candidate)] ?? '#a1a1aa';
  const votedFor = (voter: number) => candidates.find((candidate) => votes?.[candidate]?.includes(voter));
  const sheriffs = new Map(claims.map((claim) => [claim.seat, claim]));
  const checks = new Map(claims.map((claim) => [claim.check, claim.black]));

  return (
    <figure data-testid="split-table-map" className="rounded-2xl border border-white/10 bg-black/20 p-2">
      <svg viewBox="0 0 300 300" role="img" aria-label="Схема стола" className="mx-auto block w-full max-w-[280px]">
        <circle cx="150" cy="150" r="78" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)" />
        <text x="150" y="132" textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.5)">выставлены</text>
        <text x="150" y="150" textAnchor="middle" fontSize="14" fontWeight="600" fill="#fff">
          {candidates.map((candidate, index) => (
            <tspan key={candidate} fill={split.includes(candidate) ? splitColor(candidate) : 'rgba(255,255,255,0.75)'}>{index ? ' → ' : ''}{candidate}</tspan>
          ))}
        </text>
        {killed ? <text x="150" y="172" textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.5)">убит {killed}</text> : null}
        {(() => { const host = position(0, 116); return (
          <g data-testid="split-table-host">
            <rect x={host.x - 22} y={host.y - 13} width="44" height="26" rx="13" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" />
            <text x={host.x} y={host.y + 4} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.75)">ведущий</text>
          </g>
        ); })()}
        {SEATS.map((number) => {
          const { x, y } = position(number, 116);
          const dead = number === killed;
          const target = dead ? undefined : votedFor(number);
          const isSplit = split.includes(number);
          const nominated = candidates.includes(number);
          const claim = sheriffs.get(number);
          const check = checks.get(number);
          return (
            <g key={number} data-testid={`split-table-seat-${number}`} opacity={dead ? 0.35 : 1}>
              <circle cx={x} cy={y} r="20"
                fill={target ? `${splitColor(target)}55` : number === seat ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)'}
                stroke={isSplit ? splitColor(number) : nominated ? 'rgba(255,255,255,0.7)' : target ? splitColor(target) : 'rgba(255,255,255,0.2)'}
                strokeWidth={isSplit ? 3.5 : nominated ? 2 : 1.5} strokeDasharray={nominated && !isSplit ? '4 3' : undefined} />
              <text x={x} y={y + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff">{number}</text>
              {dead ? <line x1={x - 14} y1={y - 14} x2={x + 14} y2={y + 14} stroke="#fff" strokeWidth="2" /> : null}
              {number === seat || target ? (
                <text x={x} y={y + 33} textAnchor="middle" fontSize="10" fontWeight="700" fill={target ? splitColor(target) : '#fff'}>
                  {number === seat ? 'ты' : ''}{number === seat && target ? ' ' : ''}{target ? `→${target}` : ''}
                </text>
              ) : null}
              {claim ? <g><circle cx={x + 15} cy={y - 15} r="8" fill="#f59e0b" /><text x={x + 15} y={y - 11.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#000">Ш</text></g> : null}
              {check !== undefined ? <g><circle cx={x - 15} cy={y - 15} r="8" fill={check ? '#000' : '#e11d48'} stroke="#fff" strokeWidth="1" /><text x={x - 15} y={y - 11.5} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">{check ? 'Ч' : 'К'}</text></g> : null}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 px-1 text-[11px] leading-4 text-white/55">
        {split.map((candidate) => (
          <span key={candidate} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: splitColor(candidate) }} />пилится {candidate}{votes ? ` — ${votes[candidate]?.length ?? 0} гол.` : ''}</span>
        ))}
        {candidates.some((candidate) => !split.includes(candidate)) ? <span>пунктир — выставлен, не пилится</span> : null}
        {claims.length ? <span><b className="text-amber-400">Ш</b> — шериф · <b className="text-white">Ч</b>/<b className="text-rose-400">К</b> — его проверка</span> : null}
      </figcaption>
    </figure>
  );
};

export default SplitTableMap;
