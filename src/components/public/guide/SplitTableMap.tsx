/**
 * The table as a picture for the split-vote trainers, laid out the club way: eleven places around a
 * round table, the host at the bottom, players 1–10 starting at the host's left hand and going round
 * the table (1 bottom-left, up the left side, over the top, 10 bottom-right next to the host). Shows who was killed, who is nominated and split, the learner's seat, the sheriff claims
 * with their checks and — when `votes` is given — whom every seat votes for, in the split player's
 * colour, so the way the table divides is visible at a glance.
 */
import { seatList } from '../../../lib/splitVoteTraining.ts';

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
  const voteCount = Object.values(votes ?? {}).reduce((sum, voters) => sum + voters.length, 0);

  return (
    <figure data-testid="split-table-map" className="min-w-0 space-y-2.5 rounded-2xl border border-white/15 bg-black/25 p-3">
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-white/55">Порядок выставления</p>
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Выставлены по порядку">
          {candidates.map((candidate, index) => <span key={candidate} className="inline-flex items-center gap-1.5">
            {index ? <span aria-hidden="true" className="text-white/45">→</span> : null}
            <span className="grid h-9 min-w-9 place-items-center rounded-xl border px-2 text-sm font-black"
              style={{ color: split.includes(candidate) ? splitColor(candidate) : '#e4e4e7', borderColor: split.includes(candidate) ? splitColor(candidate) : 'rgba(255,255,255,.25)', backgroundColor: split.includes(candidate) ? splitColor(candidate) + '1c' : 'rgba(255,255,255,.05)' }}>{candidate}</span>
          </span>)}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[12px]">
        {split.length ? <span className="rounded-lg bg-white/10 px-2 py-1 font-bold text-white">Попил: {split.join(' / ')}</span> : <span className="rounded-lg bg-white/10 px-2 py-1 text-white">Выбери, кого пилить</span>}
        {killed ? <span className="rounded-lg border border-rose-400/30 px-2 py-1 font-semibold text-rose-200">Убит: {killed}</span> : null}
        {seat ? <span className="rounded-lg border border-emerald-400/35 bg-emerald-400/10 px-2 py-1 font-bold text-emerald-200">Ты: {seat}</span> : null}
      </div>
      <svg viewBox="0 0 300 300" role="img" aria-label="Круглый стол. Стрелка у номера означает, за кого этот игрок проголосовал." className="mx-auto block w-full max-w-[294px]">
        <circle cx="150" cy="150" r="78" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)" />
        <text x="150" y="141" textAnchor="middle" fontSize="12" fontWeight="700" fill="rgba(255,255,255,0.75)">За столом</text>
        <text x="150" y="162" textAnchor="middle" fontSize="16" fontWeight="800" fill="#fff">{killed ? '9 игроков' : '10 игроков'}</text>
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
                fill={target !== undefined ? splitColor(target) + '36' : number === seat ? 'rgba(52,211,153,.15)' : 'rgba(255,255,255,0.07)'}
                stroke={number === seat ? '#34d399' : isSplit ? splitColor(number) : nominated ? 'rgba(255,255,255,0.85)' : target !== undefined ? splitColor(target) : 'rgba(255,255,255,0.2)'}
                strokeWidth={number === seat || isSplit ? 3 : nominated ? 2 : 1.5} strokeDasharray={nominated && !isSplit && number !== seat ? '4 3' : undefined} />
              <text x={x} y={target !== undefined ? y - 1 : y + 5} textAnchor="middle" fontSize="16" fontWeight="800" fill="#fff">{number}</text>
              {target !== undefined ? <text x={x} y={y + 13} textAnchor="middle" fontSize="10" fontWeight="800" fill={splitColor(target)}>{'→' + target}</text> : null}
              {number === seat && !dead ? <text x={x} y={y - 27} textAnchor="middle" fontSize="10" fontWeight="800" fill="#6ee7b7">Я</text> : null}
              {dead ? <line x1={x - 14} y1={y - 14} x2={x + 14} y2={y + 14} stroke="#fff" strokeWidth="2" /> : null}
              {claim ? <g><circle cx={x + 15} cy={y - 15} r="8" fill="#f59e0b" /><text x={x + 15} y={y - 11.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#000">Ш</text></g> : null}
              {check !== undefined ? <g><circle cx={x - 15} cy={y - 15} r="8" fill={check ? '#000' : '#e11d48'} stroke="#fff" strokeWidth="1" /><text x={x - 15} y={y - 11.5} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">{check ? 'Ч' : 'К'}</text></g> : null}
            </g>
          );
        })}
      </svg>
      <figcaption className="space-y-2 px-0.5 text-[12px] leading-5 text-white/70">
        <p>Обводка — участник попила; <b className="text-emerald-200">Я</b> — моё место. Стрелка <b className="text-white">→</b> — куда ушёл голос.</p>
        {candidates.some((candidate) => !split.includes(candidate)) ? <p>Пунктир — выставлен, но не входит в попил.</p> : null}
        {claims.length ? <p><b className="text-amber-300">Ш</b> — шериф · <b>Ч</b>/<b className="text-rose-300">К</b> — чёрная/красная проверка</p> : null}
        {votes !== undefined ? <div data-testid="split-map-vote-legend" className="space-y-1 rounded-xl border border-white/10 bg-white/[.035] p-2.5">
          <p className="font-bold text-white">{voteCount ? 'Куда ушли голоса' : 'Голосов пока нет'}</p>
          {candidates.filter((candidate) => (votes[candidate]?.length ?? 0) > 0).map((candidate) => <div key={candidate} className="flex items-center gap-2">
            <span className="min-w-10 shrink-0 rounded-md px-1.5 py-0.5 text-center font-black" style={{ color: splitColor(candidate), backgroundColor: splitColor(candidate) + '20' }}>{'В ' + candidate}</span>
            <span className="min-w-0 flex-1 text-white/90">{votes[candidate].length === 1 ? String(votes[candidate][0]) : seatList(votes[candidate])}</span>
            <span className="shrink-0 text-white/60">{votes[candidate].length} гол.</span>
          </div>)}
        </div> : null}
      </figcaption>
    </figure>
  );
};

export default SplitTableMap;
