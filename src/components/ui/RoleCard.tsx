import { Heart, Star } from 'lucide-react';
import { GAME_ROLES, type GameRole } from '../../shared/gameRoles.ts';
import { MafiaHatIcon, PistolIcon } from '../LiveGameEngine/Icons';

/**
 * A role card as it lies on the table (owner, 2026-11-01): a card filled with the colour of the role — red for a citizen, black for the
 * mafia, purple for the Don, green for the Sheriff — with the role's own emblem in the centre. No artwork, only colour and emblem.
 */
export const ROLE_CARD_COLORS: Record<GameRole, { from: string; to: string; border: string }> = {
  citizen: { from: '#d1303f', to: '#8f1624', border: '#ff8a96' },
  mafia: { from: '#2a2a31', to: '#0b0b0e', border: '#8b8b97' },
  don: { from: '#8a5cf0', to: '#4b25a8', border: '#c9b3ff' },
  sheriff: { from: '#2fae62', to: '#13683a', border: '#8ff0b4' },
};

const EMBLEMS = { heart: Heart, star: Star, pistol: PistolIcon, hat: MafiaHatIcon } as const;

export function RoleCard({ role, label, count, selected = false, className = '' }: { role: GameRole; label?: string; count?: string; selected?: boolean; className?: string }) {
  const colors = ROLE_CARD_COLORS[role];
  const Emblem = EMBLEMS[GAME_ROLES[role].icon];
  const filled = GAME_ROLES[role].icon === 'heart' || GAME_ROLES[role].icon === 'star';
  return (
    <span data-role-card-face={role} className={`relative flex aspect-[3/4] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.22)] ${className}`}
      style={{ background: `linear-gradient(160deg, ${colors.from}, ${colors.to})`, borderColor: selected ? '#ffffff' : colors.border + '99', boxShadow: selected ? `0 0 0 3px ${colors.border}88` : undefined }}>
      <span aria-hidden="true" className="inline-flex h-[44%] w-[44%] items-center justify-center text-white drop-shadow-[0_2px_6px_rgba(0,0,0,.45)]">
        <Emblem className="h-full w-full" {...(filled ? { fill: 'currentColor' } : {})} />
      </span>
      {label ? <span className="absolute inset-x-0 bottom-1.5 text-center text-[11px] font-bold leading-none tracking-wide text-white/95">{label}</span> : null}
      {count ? <span className="absolute right-1.5 top-1.5 rounded-md bg-black/35 px-1 py-0.5 text-[10px] font-semibold leading-none text-white/90">{count}</span> : null}
    </span>
  );
}
