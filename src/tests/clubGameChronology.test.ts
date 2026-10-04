import { describe, expect, it } from 'vitest';
import { canonicalizeClubGameSave } from '../server/services/clubGameProtocolService.ts';
import { buildFinalChronology } from '../lib/liveGameEventLog.ts';

const roles = ['citizen', 'mafia', 'citizen', 'sheriff', 'citizen', 'mafia', 'citizen', 'don', 'citizen', 'citizen'];
const results = roles.map((role, index) => ({
  participant_id: `pt${index + 1}`, seat_number: index + 1, player_id: `p${index + 1}`, display_name: `Игрок ${index + 1}`, role,
  exit_type: 'alive', regular_fouls: 0, minor_technical_fouls: 0, major_technical_fouls: 0, technical_fouls: 0,
  judge_bonus: 0, protocol_bonus: 0, penalty_points: 0, ci_points: 0, color_protocol: [],
}));
const event = (seq: number, kind: string, extra: Record<string, unknown> = {}) => ({ seq, at: '2026-10-04T10:00:00Z', round: 1, phase: 'day_voting', kind, ...extra });

describe('chronology of a club evening game', () => {
  it('is stored with the protocol and cleaned on the server', () => {
    const previous = { version: 1, kind: 'club_evening_protocol', protocol: { status: 'draft' }, player_results: results };
    const saved = canonicalizeClubGameSave(previous, { status: 'completed', winner_team: 'red', events: [event(1, 'vote', { seat: 1, target: 3 }), { kind: '<script>', seq: 5 }, 'junk'] }, results, 'completed');
    expect(saved.protocol.events.map((item: any) => item.kind)).toEqual(['vote', 'script']);
  });

  it('keeps the stored chronology when a manual save carries none', () => {
    const stored = [event(1, 'nomination', { seat: 3, by: 1 })];
    const previous = { version: 1, kind: 'club_evening_protocol', protocol: { status: 'draft', events: stored }, player_results: results };
    const saved = canonicalizeClubGameSave(previous, { status: 'draft' }, results, 'draft');
    expect(saved.protocol.events).toHaveLength(1);
  });

  it('is built the same way for every game mode', () => {
    const chronology = buildFinalChronology({
      events: [event(1, 'vote', { seat: 1, target: 3 })],
      lastSnapshot: null,
      gameData: { winning_team: 'Чёрные' },
      deathProtocols: { 3: { red: [1], black: [2], sheriff: [] } },
      at: '2026-10-04T11:00:00Z',
    });
    expect(chronology.map((item) => item.kind)).toEqual(['vote', 'death_protocol', 'game_end']);
    expect(chronology.map((item) => item.seq)).toEqual([1, 2, 3]);
    expect(chronology[2].value).toBe('black');
  });
});
