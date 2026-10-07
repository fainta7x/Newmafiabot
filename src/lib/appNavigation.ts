export type PlayerRouteSection =
  | 'home'
  | 'events'
  | 'games'
  | 'conduct'
  | 'rating'
  | 'ratingperiods'
  | 'ratingtournaments'
  | 'stats'
  | 'club'
  | 'payments'
  | 'wallet'
  | 'profile'
  | 'settings'
  | 'more'
  | 'elo'
  | 'recaps'
  | 'career'
  | 'clubworld'
  | 'poker';

export type ParsedPlayerRoute = {
  section: PlayerRouteSection;
  target: string | null;
  replayGameKey: string | null;
  canonicalPath: string;
};

const safeDecode = (value: string): string => {
  try { return decodeURIComponent(value); } catch { return value; }
};
const partsOf = (pathname: string) => pathname.split('/').filter(Boolean);

export const playerProfilePath = (playerId: string) => `/player/players/${encodeURIComponent(playerId)}`;

export const playerPathForSection = (section: PlayerRouteSection, target?: string | null): string => {
  const paths: Record<PlayerRouteSection, string> = {
    home: '/player',
    events: target ? `/player/events/${encodeURIComponent(target)}` : '/player/events',
    games: target ? `/player/games/${encodeURIComponent(target)}` : '/player/games',
    conduct: target === 'music' ? '/player/conduct/music' : '/player/conduct',
    rating: '/player/rating',
    ratingperiods: '/player/rating/periods',
    ratingtournaments: '/player/rating/tournaments',
    stats: '/player/stats',
    club: '/player/club',
    payments: '/player/wallet',
    wallet: '/player/wallet',
    profile: target?.startsWith('tab:') ? `/player/profile/${encodeURIComponent(target.slice(4))}` : '/player/profile',
    settings: '/player/settings',
    more: '/player/club',
    elo: '/player/profile/elo',
    recaps: target ? `/player/recaps/${encodeURIComponent(target)}` : '/player/recaps',
    career: '/player/career',
    clubworld: '/player/seasons',
    poker: target ? `/player/poker/${encodeURIComponent(target)}` : '/player/poker',
  };
  return paths[section];
};

export const parsePlayerRoute = (pathname: string): ParsedPlayerRoute => {
  const parts = partsOf(pathname);
  if (parts[0] !== 'player') return { section: 'home', target: null, replayGameKey: null, canonicalPath: '/player' };

  if (parts[1] === 'players' && parts[2]) {
    const playerId = safeDecode(parts[2]);
    return { section: 'profile', target: `player:${playerId}`, replayGameKey: null, canonicalPath: playerProfilePath(playerId) };
  }

  if (parts[1] === 'replay' && parts.length > 2) {
    const gameKey = safeDecode(parts.slice(2).join('/'));
    return { section: 'games', target: null, replayGameKey: gameKey, canonicalPath: `/player/replay/${encodeURIComponent(gameKey)}` };
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
  // Personal Elo history is a tab of the one profile: «/player/elo» and «/player/profile/elo» open it.
  if (parts[1] === 'elo' || (parts[1] === 'profile' && parts[2])) {
    const tab = parts[1] === 'elo' ? 'elo' : safeDecode(parts[2]);
    const target = `tab:${tab}`;
    return { section: 'profile', target, replayGameKey: null, canonicalPath: playerPathForSection('profile', target) };
  }
  if (parts[1] === 'games' && parts[2]) {
    const target = safeDecode(parts[2]);
    return { section: 'games', target, replayGameKey: null, canonicalPath: playerPathForSection('games', target) };
  }
  if (parts[1] === 'poker') {
    const target = parts[2] ? safeDecode(parts[2]) : null;
    return { section: 'poker', target, replayGameKey: null, canonicalPath: playerPathForSection('poker', target) };
  }
  if (parts[1] === 'recaps') {
    const target = parts[2] ? safeDecode(parts[2]) : null;
    return { section: 'recaps', target, replayGameKey: null, canonicalPath: playerPathForSection('recaps', target) };
  }
  if (parts[1] === 'rating' && parts[2] === 'periods') return { section: 'ratingperiods', target: null, replayGameKey: null, canonicalPath: playerPathForSection('ratingperiods') };
  if (parts[1] === 'rating' && parts[2] === 'tournaments') return { section: 'ratingtournaments', target: null, replayGameKey: null, canonicalPath: playerPathForSection('ratingtournaments') };
  if (parts[1] === 'more') return { section: 'club', target: null, replayGameKey: null, canonicalPath: playerPathForSection('club') };
  if (parts[1] === 'payments') return { section: 'wallet', target: null, replayGameKey: null, canonicalPath: playerPathForSection('wallet') };

  const sectionBySegment: Record<string, PlayerRouteSection> = {
    events: 'events', games: 'games', rating: 'rating', stats: 'profile', club: 'club', wallet: 'wallet', profile: 'profile', progress: 'profile', settings: 'settings', elo: 'elo', career: 'profile', seasons: 'clubworld', poker: 'poker',
  };
  const section = sectionBySegment[parts[1] || ''] || 'home';
  return { section, target: null, replayGameKey: null, canonicalPath: playerPathForSection(section) };
};

export const appBackTarget = (pathname: string): string | null => {
  const parts = partsOf(pathname);
  if (!parts.length) return null;
  // The public rules page is opened from the player events tab; Telegram's Back returns there.
  // Opened from «Прогресс → Обучение» it carries ?from=progress (kept on every guide screen) and returns there.
  if (parts[0] === 'guide') {
    const search = typeof window !== 'undefined' ? window.location.search : '';
    return new URLSearchParams(search).get('from') === 'progress' ? '/player/profile/learning' : '/player/events';
  }
  if (parts[0] === 'player') {
    if (parts.length === 1) return null;
    if (parts[1] === 'players' && parts[2]) {
      const state = typeof window !== 'undefined' ? window.history.state : null;
      return typeof state?.playerProfileReturn === 'string' && state.playerProfileReturn.startsWith('/player') ? state.playerProfileReturn : '/player/club';
    }
    if (parts[1] === 'replay') return '/player/games';
    if (parts[1] === 'events' && parts.length > 2) return '/player/events';
    if (parts[1] === 'recaps' && parts.length > 2) return '/player/recaps';
    if (parts[1] === 'poker' && parts.length > 2) return '/player/poker';
    if (parts[1] === 'games' && parts.length > 2) {
      const state = typeof window !== 'undefined' ? window.history.state : null;
      return typeof state?.gameReturn === 'string' && state.gameReturn.startsWith('/player') ? state.gameReturn : '/player/games';
    }
    // «Прошедшие» and «Мои игры» are tabs of «Вечера»: Back goes to its first tab «Скоро».
    if (parts[1] === 'recaps' || parts[1] === 'games') return '/player/events';
    if ((parts[1] === 'rating' && (parts[2] === 'periods' || parts[2] === 'tournaments')) ) return '/player/rating';
    if (parts[1] === 'seasons') return '/player/club';
    if (parts[1] === 'conduct' && parts[2] === 'music') return '/player/conduct';
    if (parts[1] === 'conduct' || parts[1] === 'judging' || parts[1] === 'host' || parts[1] === 'table') return '/player';
    return '/player';
  }
  if (parts[0] === 'admin') {
    if (parts.length === 1) return null;
    if (parts[1] === 'evenings' && parts[2]) return parts[3] ? `/admin/evenings/${encodeURIComponent(safeDecode(parts[2]))}` : '/admin/evenings';
    if (parts[1] === 'players' && parts[2]) return '/admin/players';
    if (parts[1] === 'more' && parts[2]) return '/admin/more';
    if (parts[1] === 'tasks' || parts[1] === 'analytics') return '/admin/more';
    return '/admin';
  }
  return null;
};

export const isRoutePrefix = (pathname: string, prefix: string): boolean => pathname === prefix || pathname.startsWith(`${prefix}/`);
