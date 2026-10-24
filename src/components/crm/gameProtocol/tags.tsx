import React from 'react';
import { Ban, Check, Crosshair, Heart, HeartCrack, Moon, ShieldAlert, Siren, Skull, Vote } from 'lucide-react';
import { GAME_ROLES, normalizeGameRole } from '../../../shared/gameRoles';
import { GameRoleIcon } from '../../ui/GameRole';
import { cx } from './ui';

/**
 * The tag language of the protocol. Every state has one colour, one icon and one word, in this order of meaning, so a
 * judge can scan a list by colour and still read it when colour is not enough:
 *   violet · night (killed, the shot, the checks)      rose · voting (voted out, the votes)
 *   red · removed by the judge                          amber · attention (PPK, fouls, left out of the record)
 *   green · fine / confirmed / still in the game        sky · information (best move, notes)
 * Roles keep the colours and icons of the canonical role registry.
 */

type TagProps = { icon?: React.ElementType; className?: string; children: React.ReactNode; title?: string };

const BASE = 'inline-flex min-h-6 max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium leading-4';

const Tag: React.FC<TagProps & { tone: string }> = ({ icon: Icon, tone, className, children, title }) => (
  <span title={title} className={cx(BASE, tone, className)}>{Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}{children}</span>
);

const TONES = {
  night: 'border-violet-300/25 bg-violet-300/[0.12] text-violet-100',
  vote: 'border-rose-300/25 bg-rose-300/[0.12] text-rose-100',
  removed: 'border-red-400/35 bg-red-500/[0.16] text-red-100',
  attention: 'border-amber-300/25 bg-amber-300/[0.13] text-amber-100',
  good: 'border-emerald-300/25 bg-emerald-300/[0.12] text-emerald-100',
  info: 'border-sky-300/25 bg-sky-300/[0.12] text-sky-100',
  quiet: 'border-white/12 bg-white/[0.06] text-white/70',
} as const;

export const InfoTag: React.FC<TagProps & { tone?: keyof typeof TONES }> = ({ tone = 'quiet', ...props }) => <Tag tone={TONES[tone]} {...props} />;

/** How a player left the game (or that he is still in it). */
export const ExitTag: React.FC<{ exit: string | null | undefined; className?: string }> = ({ exit, className }) => {
  switch (exit) {
    case 'killed': return <Tag tone={TONES.night} icon={Moon} className={className}>Убит ночью</Tag>;
    case 'voted_day': return <Tag tone={TONES.vote} icon={Vote} className={className}>Заголосован</Tag>;
    case 'voted_zero_round': return <Tag tone={TONES.vote} icon={Vote} className={className}>Заголосован в нуле</Tag>;
    case 'removed': return <Tag tone={TONES.removed} icon={Ban} className={className}>Удалён</Tag>;
    default: return <Tag tone={TONES.good} icon={Heart} className={className}>В игре</Tag>;
  }
};

export const exitIcon = (exit: string | null | undefined): React.ElementType => (exit === 'killed' ? Moon : exit === 'removed' ? Ban : exit === 'voted_day' || exit === 'voted_zero_round' ? Vote : Heart);

export const RoleTag: React.FC<{ role: string | null | undefined; className?: string }> = ({ role, className }) => {
  const key = normalizeGameRole(role);
  if (!key) return <Tag tone={TONES.attention} icon={ShieldAlert} className={className}>Роль не выбрана</Tag>;
  const def = GAME_ROLES[key];
  return (
    <span className={cx(BASE, 'border-white/12 bg-white/[0.05]', className)} style={{ color: def.foreground }}>
      <GameRoleIcon role={key} className="h-3.5 w-3.5" />{def.label}
    </span>
  );
};

export const PpkTag: React.FC<{ className?: string }> = ({ className }) => <Tag tone={TONES.attention} icon={Siren} className={className}>ППК</Tag>;
export const FoulTag: React.FC<{ count: number; kind?: 'foul' | 'minor' | 'major'; className?: string }> = ({ count, kind = 'foul', className }) => (
  <Tag tone={kind === 'foul' ? TONES.attention : TONES.removed} icon={kind === 'foul' ? undefined : ShieldAlert} className={className}>{kind === 'foul' ? `Фолов ${count}` : kind === 'minor' ? `Малый техфол ${count}` : `Большой техфол ${count}`}</Tag>
);
export const FirstKilledTag: React.FC<{ className?: string }> = ({ className }) => <Tag tone={TONES.night} icon={Skull} className={className}>Первый убитый</Tag>;
export const BestMoveTag: React.FC<{ className?: string }> = ({ className }) => <Tag tone={TONES.info} icon={Crosshair} className={className}>Лучший ход</Tag>;
export const ConfirmedTag: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children = 'Подтверждено', className }) => <Tag tone={TONES.good} icon={Check} className={className}>{children}</Tag>;
export const NeedsTag: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => <Tag tone={TONES.attention} icon={ShieldAlert} className={className}>{children}</Tag>;

/** The answer of a night check: «чёрный» / «красный» for the Sheriff, «Шериф» / «не Шериф» for the Don. */
export const CheckAnswerTag: React.FC<{ kind: 'don' | 'sheriff'; result: string | null; className?: string }> = ({ kind, result, className }) => {
  if (!result) return <Tag tone={TONES.quiet} className={className}>без ответа</Tag>;
  const text = result.toLowerCase();
  if (kind === 'don') return result === 'sheriff' ? <Tag tone={TONES.info} icon={Check} className={className}>Шериф</Tag> : <Tag tone={TONES.quiet} icon={HeartCrack} className={className}>не Шериф</Tag>;
  const black = text.includes('чёрн') || text.includes('черн') || text === 'black';
  return black ? <span className={cx(BASE, 'border-white/25 bg-black/60 text-white', className)}>чёрный</span> : <Tag tone={TONES.vote} className={className}>красный</Tag>;
};
