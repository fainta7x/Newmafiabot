import type { CSSProperties } from 'react';
import { openCanonicalPlayerProfile } from './playerProfileNavigation.ts';

export type VisualPlayer = {
  player_id?: string | null;
  seat_number: number;
  nickname: string;
  avatar_url?: string | null;
  team?: 'red' | 'black' | null;
};

const initials = (name: string) => name.trim().slice(0, 1).toUpperCase() || '?';

/** Interactive seating diagram. Seat identity and team come from the game protocol; no generated positions imply moves. */
export function GameTableScene({ players, winner, selfId }: {
  players: VisualPlayer[];
  winner: 'red' | 'black' | null;
  selfId: string;
}) {
  const seats = players.filter((player) => player.seat_number >= 1 && player.seat_number <= 10);
  return <figure data-testid="game-table-scene" className="mx-auto w-full max-w-[560px] overflow-hidden rounded-2xl border border-white/10 bg-[#101013]">
    <div className="relative aspect-[1.15]">
    <div className="pointer-events-none absolute inset-0 opacity-60" style={{background: 'radial-gradient(ellipse at 50% 50%,rgba(159,120,57,.18),transparent 65%),radial-gradient(ellipse at 65% 10%,rgba(147,92,126,.11),transparent 45%)'}} />
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 460 400" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="noir-table" cx="45%" cy="35%" r="70%"><stop offset="0" stopColor="#2c3530"/><stop offset=".72" stopColor="#172320"/><stop offset="1" stopColor="#0c1314"/></radialGradient>
      </defs>
      <ellipse cx="230" cy="200" rx="146" ry="132" fill="#090a0b" stroke="#8d794c" strokeWidth="8" opacity=".9" />
      <ellipse cx="230" cy="200" rx="139" ry="125" fill="url(#noir-table)" stroke="#d5b873" strokeOpacity=".35" strokeWidth="2" />
      <ellipse cx="230" cy="200" rx="116" ry="103" fill="none" stroke="#e6d099" strokeOpacity=".1" strokeDasharray="3 7" />
      <path d="M140 202 Q230 172 320 202 M230 102 L230 298" fill="none" stroke="#cbb988" strokeOpacity=".07" strokeWidth="2"/>
    </svg>
    <div className="absolute left-[30%] top-[33%] flex h-[35%] w-[40%] flex-col items-center justify-center text-center">
      <span className="text-[9px] font-semibold uppercase tracking-[.22em] text-amber-100/45">2LA NOIRE</span>
      <span aria-hidden="true" className="my-1 text-[30px] leading-none text-amber-200/45 sm:text-5xl">♠</span>
      <span className="text-[11px] font-semibold text-white/85 sm:text-sm">{winner === 'red' ? 'Красные выиграли' : winner === 'black' ? 'Чёрные выиграли' : 'Итог не указан'}</span>
      <span className="mt-1 text-[9px] text-white/40">{seats.length} за столом</span>
    </div>
    {seats.map((p) => {
      const angle = (p.seat_number - 1) * Math.PI / 5;
      const style: CSSProperties = {
        left: (50 + 42 * Math.sin(angle)) + '%',
        top: (50 - 39 * Math.cos(angle)) + '%',
        transform: 'translate(-50%, -50%)',
      };
      const isSelf = Boolean(p.player_id) && p.player_id === selfId;
      return <button
        key={p.seat_number}
        type="button"
        disabled={!p.player_id}
        title={'Место ' + p.seat_number + ' · ' + p.nickname}
        aria-label={'Место ' + p.seat_number + ': ' + p.nickname + (p.player_id ? ', открыть профиль' : '')}
        onClick={() => p.player_id && openCanonicalPlayerProfile(p.player_id)}
        style={style}
        className={'absolute z-10 flex h-[13%] min-h-11 w-[14%] min-w-11 flex-col items-center justify-center rounded-[15px] border shadow-[0_6px_18px_rgba(0,0,0,.5)] transition-transform enabled:active:scale-95 ' +
          (isSelf ? 'border-amber-200/75 bg-[#594528] text-amber-50 ring-2 ring-amber-200/40' :
            p.team === 'black' ? 'border-violet-200/55 bg-[#33273f] text-violet-100' :
            p.team === 'red' ? 'border-rose-200/55 bg-[#492a31] text-rose-100' :
            'border-white/25 bg-[#24242a] text-white/80')}
      >
        <span className="absolute -top-2 flex h-4 min-w-4 items-center justify-center rounded-full border border-black/40 bg-[#0e1012] px-1 text-[9px] font-semibold tabular-nums text-white/80">{p.seat_number}</span>
        <span className="text-base font-bold sm:text-xl">{initials(p.nickname)}</span>
      </button>;
    })}
    </div>
    <figcaption className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-white/10 px-3 py-2 text-xs text-white/65">
      <span><i aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-300"/>За красных</span>
      <span><i aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-300"/>За чёрных</span>
      <span><i aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-200"/>Моё место</span>
    </figcaption>
  </figure>;
}

/** Actual aggregate counts; one comparable bar per candidate, no invented voter identities. */
export function VoteSplitScene({ candidates, eligible }: {
  candidates: Array<{ seat: number; nickname: string; votes: number; team?: 'red' | 'black' | null }>;
  eligible: number | null;
}) {
  const total = candidates.reduce((sum, item) => sum + Math.max(0, item.votes), 0);
  return <div data-testid="game-vote-graphic" className="mt-3 space-y-3">
    {eligible != null && <p className="text-xs text-white/55">Могли голосовать: {eligible}</p>}
    {candidates.map(candidate => <div key={candidate.seat} aria-label={'Кандидат ' + candidate.nickname + ': ' + candidate.votes + ' голосов'}>
      <div className="flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 break-words"><span className="text-white/50">№{candidate.seat}</span> {candidate.nickname}</span><strong className="shrink-0 tabular-nums">{candidate.votes}</strong></div>
      {candidates.length > 1 && <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white/65" style={{width: `${total ? Math.max(0,candidate.votes) / total * 100 : 0}%`}}/></div>}
    </div>)}
    {total === 0 && <p className="text-xs text-white/55">За выставленных кандидатов голоса не записаны.</p>}
  </div>;
}

/** A recorded night action is a fact in the chronology, not an illustrated landscape. */
export function NightShotScene({ target, seat, result }: { target: string; seat: number; result: 'killed' | 'miss' | string | null }) {
  return <p data-testid="game-night-graphic" className="mt-2 text-sm leading-5 text-white/75">Мафия стреляла в {target} · место №{seat}. {result === 'killed' ? 'Попадание' : result === 'miss' ? 'Промах' : 'Итог в протоколе'}.</p>;
}
