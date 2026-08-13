import { describe, expect, it } from 'vitest';
import {
  buildPersonalHooks,
  buildRelationshipEvents,
  buildWeeklyDigest,
  weekAgoSeasonPlace,
} from '../server/services/clubEngagementService.ts';
import type { CompletedGameSnapshot } from '../server/services/clubGameAnalyticsService.ts';

const now = Date.UTC(2026, 7, 13, 9, 0, 0);
const day = 24 * 60 * 60 * 1000;

const game = (
  id: string,
  daysAgo: number,
  winner: 'red' | 'black',
  players: Array<{ id: string; name: string; team: 'red' | 'black' }>,
): CompletedGameSnapshot => ({
  id,
  source: 'club',
  event_id: `event-${id}`,
  date: new Date(now - daysAgo * day).toISOString(),
  dateMs: now - daysAgo * day,
  played_at: new Date(now - daysAgo * day).toISOString(),
  title: 'Тестовый вечер',
  game_number: Number(id.replace(/\D/g, '')) || 1,
  winner_team: winner,
  players: players.map((player, index) => ({
    player_id: player.id,
    nickname: player.name,
    role: player.team === 'red' ? 'citizen' : 'mafia',
    team: player.team,
    won: player.team === winner,
    seat_number: index + 1,
  })),
});

const basePlayers = [
  { id: 'me', name: 'Я', team: 'red' as const },
  { id: 'rival', name: 'Соперник', team: 'black' as const },
  { id: 'mate', name: 'Напарник', team: 'red' as const },
];

describe('club engagement', () => {
  it('builds a seven-day digest only from recent completed games', () => {
    const snapshots = [
      game('g1', 1, 'red', basePlayers),
      game('g2', 3, 'black', basePlayers),
      game('old', 10, 'red', basePlayers),
    ];
    const digest = buildWeeklyDigest(snapshots, 'me', now);
    expect(digest.games).toBe(2);
    expect(digest.red_wins).toBe(1);
    expect(digest.black_wins).toBe(1);
    expect(digest.viewer?.games).toBe(2);
    expect(digest.share_text).toContain('2LA Noire');
  });

  it('creates rivalry and duo events when a pair reaches three games', () => {
    const snapshots = [
      game('g1', 5, 'red', basePlayers),
      game('g2', 4, 'red', basePlayers),
      game('g3', 3, 'black', basePlayers),
    ];
    const events = buildRelationshipEvents(snapshots);
    expect(events.some((item) => item.type === 'rivalry' && item.player_ids.includes('me') && item.player_ids.includes('rival'))).toBe(true);
    expect(events.some((item) => item.type === 'duo' && item.player_ids.includes('me') && item.player_ids.includes('mate'))).toBe(true);
  });

  it('offers a near-career-milestone comeback hook', () => {
    const snapshots = Array.from({ length: 8 }, (_, index) => game(`g${index + 1}`, index + 1, 'red', basePlayers));
    const hooks = buildPersonalHooks(snapshots, 'me', 1, 1, [], now);
    const milestone = hooks.find((item) => item.type === 'milestone');
    expect(milestone?.title).toContain('2 игры');
    expect(milestone?.title).toContain('10');
  });

  it('reports season-place movement against the week-ago snapshot', () => {
    const oldGames = [
      game('g1', 12, 'red', [
        { id: 'other', name: 'Другой', team: 'red' },
        { id: 'me', name: 'Я', team: 'black' },
      ]),
      game('g2', 11, 'red', [
        { id: 'other', name: 'Другой', team: 'red' },
        { id: 'me', name: 'Я', team: 'black' },
      ]),
    ];
    expect(weekAgoSeasonPlace(oldGames, 'me', now)).toBe(2);
    const hooks = buildPersonalHooks(oldGames, 'me', 1, 2, [], now);
    expect(hooks.some((item) => item.type === 'season_movement' && item.title.includes('поднялся'))).toBe(true);
  });

  it('surfaces a newly unlocked rivalry for the viewer', () => {
    const snapshots = [
      game('g1', 5, 'red', basePlayers),
      game('g2', 4, 'red', basePlayers),
      game('g3', 3, 'black', basePlayers),
    ];
    const events = buildRelationshipEvents(snapshots);
    const hooks = buildPersonalHooks(snapshots, 'me', null, null, events, now);
    expect(hooks.some((item) => item.type === 'rivalry')).toBe(true);
  });
});
