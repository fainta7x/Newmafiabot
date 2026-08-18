import type { OrganizerPrimaryTab } from '../../lib/organizerUx.ts';
import type { EveningSection } from './EveningWorkspace.tsx';

export type OrganizerMainTab = OrganizerPrimaryTab | 'tasks' | 'analytics';

export type OrganizerRouteState = {
  tab: OrganizerMainTab;
  eveningId: string | null;
  eveningSection: EveningSection;
  playerId: string | null;
};

export type OrganizerPlayerReturnContext = {
  tab: OrganizerMainTab;
  eveningId: string | null;
  eveningSection: EveningSection;
  scrollY: number;
} | null;

const EVENING_SECTIONS = new Set<EveningSection>(['overview', 'participants', 'tables', 'games']);

const safeDecode = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const parseOrganizerRoute = (pathname: string): OrganizerRouteState => {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'admin') {
    return { tab: 'overview', eveningId: null, eveningSection: 'overview', playerId: null };
  }

  if (parts[1] === 'evenings') {
    const eveningId = safeDecode(parts[2]);
    const section = EVENING_SECTIONS.has(parts[3] as EveningSection)
      ? parts[3] as EveningSection
      : 'overview';
    return { tab: 'evenings', eveningId, eveningSection: section, playerId: null };
  }

  if (parts[1] === 'players') {
    return {
      tab: 'players',
      eveningId: null,
      eveningSection: 'overview',
      playerId: safeDecode(parts[2]),
    };
  }

  if (parts[1] === 'tasks') {
    return { tab: 'tasks', eveningId: null, eveningSection: 'overview', playerId: null };
  }

  if (parts[1] === 'analytics') {
    return { tab: 'analytics', eveningId: null, eveningSection: 'overview', playerId: null };
  }

  if (parts[1] === 'more') {
    return { tab: 'more', eveningId: null, eveningSection: 'overview', playerId: null };
  }

  return { tab: 'overview', eveningId: null, eveningSection: 'overview', playerId: null };
};

export const organizerTabPath = (tab: OrganizerMainTab): string => {
  if (tab === 'overview') return '/admin';
  if (tab === 'evenings') return '/admin/evenings';
  if (tab === 'players') return '/admin/players';
  if (tab === 'tasks') return '/admin/tasks';
  if (tab === 'analytics') return '/admin/analytics';
  return '/admin/more';
};

export const organizerEveningPath = (eveningId: string, section: EveningSection = 'overview'): string => {
  const base = `/admin/evenings/${encodeURIComponent(eveningId)}`;
  return section === 'overview' ? base : `${base}/${section}`;
};

export const organizerPlayerPath = (playerId: string): string => `/admin/players/${encodeURIComponent(playerId)}`;

export const routePathForReturnContext = (context: NonNullable<OrganizerPlayerReturnContext>): string => {
  if (context.tab === 'evenings' && context.eveningId) {
    return organizerEveningPath(context.eveningId, context.eveningSection);
  }
  return organizerTabPath(context.tab);
};
