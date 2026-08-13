export type PlayerRouteSection =
  | 'home'
  | 'games'
  | 'conduct'
  | 'rating'
  | 'stats'
  | 'club'
  | 'payments'
  | 'profile'
  | 'more'
  | 'elo'
  | 'recaps'
  | 'career'
  | 'clubworld';

export type ParsedPlayerRoute = {
  section: PlayerRouteSection;
  target: string | null;
  replayGameKey: string | null;
  canonicalPath: string;
};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const partsOf = (pathname: string) => pathname.split('/').filter(Boolean);

export const playerPathForSection = (section: PlayerRouteSection, target?: string | null): string => {
  const paths: Record<PlayerRouteSection, string> = {
    home: '/player',
    games: '/player/games',
    conduct: '/player/conduct',
    rating: '/player/rating',
    stats: '/player/stats',
    club: '/player/club',
    payments: '/player/payments',
    profile: '/player/profile',
    more: '/player/more',
    elo: '/player/elo',
    recaps: target ? `/player/recaps/${encodeURIComponent(target)}` : '/player/recaps',
    career: '/player/career',
    clubworld: '/player/seasons',
  };
  return paths[section];
};

export const parsePlayerRoute = (pathname: string): ParsedPlayerRoute => {
  const parts = partsOf(pathname);
  if (parts[0] !== 'player') {
    return { section: 'home', target: null, replayGameKey: null, canonicalPath: '/player' };
  }

  if (parts[1] === 'replay' && parts.length > 2) {
    const gameKey = safeDecode(parts.slice(2).join('/'));
    return {
      section: 'games',
      target: null,
      replayGameKey: gameKey,
      canonicalPath: `/player/replay/${encodeURIComponent(gameKey)}`,
    };
  }

  const aliases = new Set(['conduct', 'judging', 'host', 'table']);
  if (aliases.has(parts[1] || '')) {
    return { section: 'conduct', target: null, replayGameKey: null, canonicalPath: '/player/conduct' };
  }

  if (parts[1] === 'recaps') {
    const target = parts[2] ? safeDecode(parts[2]) : null;
    return { section: 'recaps', target, replayGameKey: null, canonicalPath: playerPathForSection('recaps', target) };
  }

  const sectionBySegment: Record<string, PlayerRouteSection> = {
    games: 'games',
    rating: 'rating',
    stats: 'stats',
    club: 'club',
    payments: 'payments',
    profile: 'profile',
    more: 'more',
    elo: 'elo',
    career: 'career',
    seasons: 'clubworld',
  };
  const section = sectionBySegment[parts[1] || ''] || 'home';
  return { section, target: null, replayGameKey: null, canonicalPath: playerPathForSection(section) };
};

export const appBackTarget = (pathname: string): string | null => {
  const parts = partsOf(pathname);
  if (!parts.length) return null;

  if (parts[0] === 'player') {
    if (parts.length === 1) return null;
    if (parts[1] === 'replay') return '/player/games';
    if (parts[1] === 'recaps' && parts.length > 2) return '/player/recaps';
    if (parts[1] === 'conduct' || parts[1] === 'judging' || parts[1] === 'host' || parts[1] === 'table') return '/player';
    if (parts[1] === 'elo' || parts[1] === 'career' || parts[1] === 'seasons') return '/player/more';
    return '/player';
  }

  if (parts[0] === 'admin') {
    if (parts.length === 1) return null;
    if (parts[1] === 'evenings' && parts[2]) {
      return parts[3] ? `/admin/evenings/${encodeURIComponent(safeDecode(parts[2]))}` : '/admin/evenings';
    }
    if (parts[1] === 'players' && parts[2]) return '/admin/players';
    if (parts[1] === 'tasks' || parts[1] === 'analytics') return '/admin/more';
    return '/admin';
  }

  return null;
};

export const isRoutePrefix = (pathname: string, prefix: string): boolean => pathname === prefix || pathname.startsWith(`${prefix}/`);
