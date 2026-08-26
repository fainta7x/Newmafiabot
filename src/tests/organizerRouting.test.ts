import { describe, expect, it } from 'vitest';
import {
  organizerEveningPath,
  organizerMorePath,
  organizerPlayerPath,
  organizerTabPath,
  parseOrganizerRoute,
  routePathForReturnContext,
} from '../components/crm/organizerRouting.ts';

describe('organizer routing model', () => {
  it('parses organizer roots and secondary sections', () => {
    expect(parseOrganizerRoute('/admin')).toEqual({ tab: 'overview', eveningId: null, eveningSection: 'overview', playerId: null, moreScreen: null });
    expect(parseOrganizerRoute('/admin/tasks').tab).toBe('tasks');
    expect(parseOrganizerRoute('/admin/analytics').tab).toBe('analytics');
    expect(parseOrganizerRoute('/admin/more').tab).toBe('more');
    expect(parseOrganizerRoute('/admin/more/music').moreScreen).toBe('music');
    expect(parseOrganizerRoute('/admin/more/not-real').moreScreen).toBeNull();
    expect(parseOrganizerRoute('/outside')).toEqual({ tab: 'overview', eveningId: null, eveningSection: 'overview', playerId: null, moreScreen: null });
  });

  it('decodes evening and player identifiers and validates evening sections', () => {
    expect(parseOrganizerRoute('/admin/evenings/Friday%20Night/participants')).toEqual({
      tab: 'evenings',
      eveningId: 'Friday Night',
      eveningSection: 'participants',
      playerId: null,
      moreScreen: null,
    });
    expect(parseOrganizerRoute('/admin/evenings/abc/not-a-section').eveningSection).toBe('overview');
    expect(parseOrganizerRoute('/admin/players/%D0%A7%D0%B0%D0%B3%D0%B8%D0%BD').playerId).toBe('Чагин');
  });

  it('builds encoded organizer paths', () => {
    expect(organizerTabPath('overview')).toBe('/admin');
    expect(organizerTabPath('tasks')).toBe('/admin/tasks');
    expect(organizerTabPath('more')).toBe('/admin/more');
    expect(organizerMorePath('music')).toBe('/admin/more/music');
    expect(organizerMorePath(null)).toBe('/admin/more');
    expect(organizerEveningPath('Friday Night')).toBe('/admin/evenings/Friday%20Night');
    expect(organizerEveningPath('Friday Night', 'games')).toBe('/admin/evenings/Friday%20Night/games');
    expect(organizerPlayerPath('Игрок 1')).toBe('/admin/players/%D0%98%D0%B3%D1%80%D0%BE%D0%BA%201');
  });

  it('restores the correct path after an external player card', () => {
    expect(routePathForReturnContext({ tab: 'evenings', eveningId: 'Friday Night', eveningSection: 'tables', scrollY: 240 })).toBe('/admin/evenings/Friday%20Night/tables');
    expect(routePathForReturnContext({ tab: 'analytics', eveningId: null, eveningSection: 'overview', scrollY: 0 })).toBe('/admin/analytics');
  });
});
