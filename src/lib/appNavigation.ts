export type PlayerRouteSection =
  | 'home'
  | 'events'
  | 'games'
  | 'conduct'
  | 'rating'
  | 'ratingperiods'
  | 'stats'
  | 'club'
  | 'payments'
  | 'wallet'
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
    events: target ? `/player/events/${encodeURIComponent(target)}` : '/player/events',
    games: '/player/games',
    conduct: target === 'music' ? '/player/conduct/music' : '/player/conduct',
    rating: '/player/rating',
    ratingperiods: '/player/rating/periods',
    stats: '/player/stats',
    club: '/player/club',
    payments: '/player/wallet',
    wallet: '/player/wallet',
    profile: '/player/profile',
    more: '/player/club',
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
    const target = parts[1] === 'conduct' && parts[2] === 'music' ? 'music' : null;
    return { section: 'conduct', target, replayGameKey: null, canonicalPath: playerPathForSection('conduct', target) };
  }

  if (parts[1] === 'events') {
    const target = parts[2] ? safeDecode(parts[2]) : null;
    return { section: 'events', target, replayGameKey: null, canonicalPath: playerPathForSection('events', target) };
  }

  if (parts[1] === 'recaps') {
    const target = parts[2] ? safeDecode(parts[2]) : null;
    return { section: 'recaps', target, replayGameKey: null, canonicalPath: playerPathForSection('recaps', target) };
  }

  if (parts[1] === 'rating' && parts[2] === 'periods') {
    return { section: 'ratingperiods', target: null, replayGameKey: null, canonicalPath: playerPathForSection('ratingperiods') };
  }

  if (parts[1] === 'more') {
    return { section: 'club', target: null, replayGameKey: null, canonicalPath: playerPathForSection('club') };
  }

  if (parts[1] === 'payments') {
    return { section: 'wallet', target: null, replayGameKey: null, canonicalPath: playerPathForSection('wallet') };
  }

  const sectionBySegment: Record<string, PlayerRouteSection> = {
    events: 'events',
    games: 'games',
    rating: 'rating',
    stats: 'stats',
    club: 'club',
    wallet: 'wallet',
    profile: 'profile',
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
    if (parts[1] === 'events' && parts.length > 2) return '/player/events';
    if (parts[1] === 'recaps' && parts.length > 2) return '/player/recaps';
    if (parts[1] === 'stats' || parts[1] === 'career' || parts[1] === 'recaps') return '/player/games';
    if ((parts[1] === 'rating' && parts[2] === 'periods') || parts[1] === 'elo' || parts[1] === 'seasons') return '/player/rating';
    if (parts[1] === 'conduct' && parts[2] === 'music') return '/player/conduct';
    if (parts[1] === 'conduct' || parts[1] === 'judging' || parts[1] === 'host' || parts[1] === 'table') return '/player';
    return '/player';
  }

  if (parts[0] === 'admin') {
    if (parts.length === 1) return null;
    if (parts[1] === 'evenings' && parts[2]) {
      return parts[3] ? `/admin/evenings/${encodeURIComponent(safeDecode(parts[2]))}` : '/admin/evenings';
    }
    if (parts[1] === 'players' && parts[2]) return '/admin/players';
    if (parts[1] === 'more' && parts[2]) return '/admin/more';
    if (parts[1] === 'tasks' || parts[1] === 'analytics') return '/admin/more';
    return '/admin';
  }

  return null;
};

export const isRoutePrefix = (pathname: string, prefix: string): boolean => pathname === prefix || pathname.startsWith(`${prefix}/`);
