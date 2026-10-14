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
const clamp = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;

/** Interactive seating diagram. Seat identity and team come from the game protocol; no generated positions imply moves. */
export function GameTableScene({ players, winner, selfId }: {
  players: VisualPlayer[];
  winner: 'red' | 'black' | null;
  selfId: string;
}) {
  const seats = players.filter((player) => player.seat_number >= 1 && player.seat_number <= 10);
  return <figure data-testid="game-table-scene" className="relative mx-auto aspect-[1.15] w-full max-w-[560px] overflow-hidden rounded-[32px] border border-amber-200/15 bg-[#101013] shadow-[0_25px_80px_rgba(0,0,0,.35)]">
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
      <span className="text-[11px] font-semibold text-white/85 sm:text-sm">{winner === 'red' ? 'Победа красных' : winner === 'black' ? 'Победа чёрных' : 'Итог не указан'}</span>
      <span className="mt-1 text-[9px] text-white/40">{seats.length} за столом</span>
    </div>
    {seats.map((p) => {
      const angle = (p.seat_number - 1) * Math.PI / 5;
      const style: CSSProperties = {
        left: (50 + 42 * Math.sin(angle)) + '%',
        top: (50 - 43 * Math.cos(angle)) + '%',
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
        className={'absolute z-10 flex h-[13%] w-[14%] min-w-0 flex-col items-center justify-center rounded-[15px] border shadow-[0_6px_18px_rgba(0,0,0,.5)] transition-transform enabled:active:scale-95 ' +
          (isSelf ? 'border-amber-200/75 bg-[#594528] text-amber-50 ring-2 ring-amber-200/40' :
            p.team === 'black' ? 'border-violet-200/55 bg-[#33273f] text-violet-100' :
            p.team === 'red' ? 'border-rose-200/55 bg-[#492a31] text-rose-100' :
            'border-white/25 bg-[#24242a] text-white/80')}
      >
        <span className="absolute -top-2 flex h-4 min-w-4 items-center justify-center rounded-full border border-black/40 bg-[#0e1012] px-1 text-[9px] font-semibold tabular-nums text-white/80">{p.seat_number}</span>
        <span className="text-base font-bold sm:text-xl">{initials(p.nickname)}</span>
      </button>;
    })}
    <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-4 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-5 text-[10px] text-white/65">
      <span><i aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-300"/>Красные</span>
      <span><i aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-300"/>Чёрные</span>
      <span><i aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-200"/>Вы</span>
    </figcaption>
  </figure>;
}

export function ConnectionGraph({ members, roles = [], tone = 'violet' }: {
  members: Array<{ player_id: string; nickname: string }>;
  roles?: string[];
  tone?: 'violet' | 'rose' | 'amber';
}) {
  const display = members.slice(0, 3);
  const triple = display.length >= 3;
  const spots = triple ? [{ x: 18, y: 38 }, { x: 50, y: 65 }, { x: 82, y: 38 }] : [{ x: 26, y: 49 }, { x: 74, y: 49 }];
  const stroke = tone === 'rose' ? '#f4a9ad' : tone === 'amber' ? '#e7c47c' : '#b9a0ef';
  return <div data-testid="connection-graph" className="relative h-[172px] overflow-hidden rounded-[20px] bg-[radial-gradient(ellipse_at_center,rgba(213,194,148,.09),transparent_70%)]">
    <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 360 172" preserveAspectRatio="none">
      <defs><linearGradient id="connection-line" x1="0" y1="0" x2="1" y2="1"><stop stopColor={stroke} stopOpacity=".8"/><stop offset="1" stopColor={stroke} stopOpacity=".2"/></linearGradient></defs>
      {spots.slice(0, display.length).flatMap((spot, i) => spots.slice(i + 1, display.length).map((to, k) =>
        <path key={i + ':' + k} d={'M' + spot.x * 3.6 + ' ' + spot.y * 1.72 + ' Q180 84 ' + to.x * 3.6 + ' ' + to.y * 1.72}
          fill="none" stroke="url(#connection-line)" strokeWidth="2" strokeDasharray={tone === 'rose' ? '5 4' : undefined} />))}
      <circle cx="180" cy="86" r="40" fill="none" stroke={stroke} strokeOpacity=".14" strokeDasharray="2 7"/>
    </svg>
    {display.map((member, i) => <button key={member.player_id} type="button"
      onClick={() => openCanonicalPlayerProfile(member.player_id)}
      style={{left: spots[i].x + '%', top: spots[i].y + '%', transform: 'translate(-50%, -50%)'}}
      className="ds-focus-ring absolute flex w-[32%] min-w-0 flex-col items-center gap-1 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full border-2 bg-[#232128] text-lg font-bold text-white shadow-[0_5px_24px_rgba(0,0,0,.65)]" style={{borderColor: stroke}}>
        {initials(member.nickname)}
      </span>
      <span className="w-full truncate text-[11px] font-semibold text-white/90">{member.nickname}</span>
      {roles[i] && <span className="text-[9px] text-white/55">{roles[i]}</span>}
    </button>)}
    {display.length === 0 && <span className="absolute inset-0 grid place-items-center text-xs text-white/45">Нет данных для схемы</span>}
  </div>;
}

export function WinOrbit({ percent, value, caption, tone = 'amber' }: {
  percent: number; value?: string; caption: string; tone?: 'amber' | 'rose' | 'violet' | 'emerald';
}) {
  const color = { amber: '#e7c47c', rose: '#f4a9ad', violet: '#b9a0ef', emerald: '#84d9bc' }[tone];
  const progress = clamp(percent);
  return <div className="relative mx-auto aspect-square w-[116px] max-w-full" role="img" aria-label={caption + ': ' + progress + '%'}>
    <svg aria-hidden="true" viewBox="0 0 120 120" className="h-full w-full -rotate-90">
      <circle cx="60" cy="60" r="49" stroke="#ffffff" strokeOpacity=".10" strokeWidth="7" fill="none"/>
      <circle cx="60" cy="60" r="49" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={String(progress * 3.07876) + ' 307.876'} fill="none"/>
      <circle cx="60" cy="60" r="39" fill="#0f1013" fillOpacity=".5"/>
    </svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
      <span className="text-[23px] font-semibold tabular-nums text-white">{value ?? String(Math.round(progress)) + '%'}</span>
      <span className="mt-1 px-2 text-[10px] text-white/55">{caption}</span>
    </div>
  </div>;
}
