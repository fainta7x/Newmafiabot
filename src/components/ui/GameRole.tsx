import { CircleHelp, Heart, Star } from 'lucide-react';
import { GAME_ROLES, GAME_ROLE_KEYS, UNKNOWN_GAME_ROLE_LABEL, normalizeGameRole } from '../../shared/gameRoles.ts';
import { MafiaHatIcon, PistolIcon } from '../LiveGameEngine/Icons';

export const GAME_ROLE_CSS_VARIABLES = Object.fromEntries(GAME_ROLE_KEYS.map(key => ['--role-' + key, GAME_ROLES[key].accent]));

const ICONS = { heart: Heart, star: Star, pistol: PistolIcon, hat: MafiaHatIcon };

export function GameRoleIcon({ role, className = 'h-5 w-5', surface = 'dark' }: { role?: string | null; className?: string; surface?: 'dark' | 'light' }) {
  const key = normalizeGameRole(role);
  const definition = key ? GAME_ROLES[key] : null;
  const Icon = definition ? ICONS[definition.icon] : CircleHelp;
  return <span aria-hidden="true" data-game-role={key ?? 'unknown'} className={'inline-flex shrink-0 ' + className} style={{ color: definition ? surface === 'light' ? definition.ink : definition.foreground : '#94a3b8' }}>
    <Icon className="h-full w-full" {...(definition?.icon === 'heart' || definition?.icon === 'star' ? { fill: 'currentColor' } : {})} />
  </span>;
}

export function GameRoleMark({ role }: { role?: string | null }) {
  const key = normalizeGameRole(role);
  const definition = key ? GAME_ROLES[key] : null;
  return <span aria-hidden="true" className="relative grid h-12 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,.08)]" style={{ borderColor: (definition?.foreground ?? '#94a3b8') + '40', backgroundColor: (definition?.accent ?? '#94a3b8') + '18' }}>
    <GameRoleIcon role={role} className="h-7 w-7" />
  </span>;
}

/** Inline role label for read-only game rows; visibility is controlled by the caller. */
export function GameRoleBadge({ role }: { role?: string | null }) {
  const key = normalizeGameRole(role);
  return <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: key ? GAME_ROLES[key].foreground : '#94a3b8' }}><GameRoleIcon role={role} className="h-4 w-4" />{key ? GAME_ROLES[key].label : UNKNOWN_GAME_ROLE_LABEL}</span>;
}
