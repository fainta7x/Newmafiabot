import type { OrganizerPrimaryTab } from '../../lib/organizerUx.ts';
import type { EveningSection } from './EveningWorkspace.tsx';

export type OrganizerMainTab = OrganizerPrimaryTab | 'tasks' | 'analytics';
export type OrganizerMoreScreen = 'data' | 'betting' | 'commerce' | 'telegram' | 'system' | 'developer' | 'music';

export type OrganizerRouteState = {
  tab: OrganizerMainTab;
  eveningId: string | null;
  eveningSection: EveningSection;
  playerId: string | null;
  moreScreen: OrganizerMoreScreen | null;
};

export type OrganizerPlayerReturnContext = {
  tab: OrganizerMainTab;
  eveningId: string | null;
  eveningSection: EveningSection;
  scrollY: number;
} | null;

const EVENING_SECTIONS = new Set<EveningSection>(['overview', 'participants', 'management', 'tables', 'games']);
const MORE_SCREENS = new Set<OrganizerMoreScreen>(['data', 'betting', 'commerce', 'telegram', 'system', 'developer', 'music']);

const rootRoute = (tab: OrganizerMainTab = 'overview'): OrganizerRouteState => ({
  tab,
  eveningId: null,
  eveningSection: 'overview',
  playerId: null,
  moreScreen: null,
});

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
    return rootRoute();
  }

  if (parts[1] === 'evenings') {
    const eveningId = safeDecode(parts[2]);
    const section = EVENING_SECTIONS.has(parts[3] as EveningSection)
      ? parts[3] as EveningSection
      : 'overview';
    return { ...rootRoute('evenings'), eveningId, eveningSection: section };
  }

  if (parts[1] === 'players') {
    return {
      tab: 'players',
      eveningId: null,
      eveningSection: 'overview',
      playerId: safeDecode(parts[2]),
      moreScreen: null,
    };
  }

  if (parts[1] === 'tasks') {
    return rootRoute('tasks');
  }

  if (parts[1] === 'analytics') {
    return rootRoute('analytics');
  }

  if (parts[1] === 'more') {
    const moreScreen = MORE_SCREENS.has(parts[2] as OrganizerMoreScreen)
      ? parts[2] as OrganizerMoreScreen
      : null;
    return { ...rootRoute('more'), moreScreen };
  }

  return rootRoute();
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

export const organizerMorePath = (screen?: OrganizerMoreScreen | null): string => screen
  ? `/admin/more/${screen}`
  : '/admin/more';

export const routePathForReturnContext = (context: NonNullable<OrganizerPlayerReturnContext>): string => {
  if (context.tab === 'evenings' && context.eveningId) {
    return organizerEveningPath(context.eveningId, context.eveningSection);
  }
  return organizerTabPath(context.tab);
};
