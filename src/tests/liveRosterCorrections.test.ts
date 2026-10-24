import { describe, expect, it } from 'vitest';
import { completeLiveRosterIdentity, initialLiveRosterEvents, restoreJournalRosterIdentity, liveRosterCorrectionEvents, replayLiveRosterIdentity } from '../lib/liveRosterCorrections.ts';
import { sanitizeLiveGameEvents } from '../shared/liveGameEvents.ts';
const rows = (ids: string[]) => ids.map((id, index) => ({ seat_number: index + 1, participant_id: id }));
const ctx = { nextSeq: 10, at: '2026-10-23T17:00:00Z', round: 3, phase: 'day' };
describe('CRM roster event boundary', () => {
  it('rejects partial, duplicate and unidentifiable rosters', () => {
    expect(completeLiveRosterIdentity(rows(['a', 'b']), 2)).toEqual({ 1: 'a', 2: 'b' });
    expect(completeLiveRosterIdentity(rows(['a']), 2)).toBeNull();
    expect(completeLiveRosterIdentity(rows(['a', 'a']), 2)).toBeNull();
    expect(completeLiveRosterIdentity(rows(['a', '']), 2)).toBeNull();
    expect(completeLiveRosterIdentity([{ seat_number: 1, participant_id: 'a' }, { seat_number: 1, participant_id: 'b' }], 2)).toBeNull();
  });
  it('writes both sides of a swap once and replays only current identities', () => {
    const before = completeLiveRosterIdentity(rows(['a', 'b']), 2)!;
    const after = completeLiveRosterIdentity(rows(['b', 'a']), 2)!;
    const events = liveRosterCorrectionEvents(before, after, ctx);
    expect(events.map(e => [e.kind, e.seat, e.value])).toEqual([['player_reseated', 1, 'b'], ['player_reseated', 2, 'a']]);
    const originalHistory = [{ kind: 'vote', seat: 1, target: 2 }];
    expect(replayLiveRosterIdentity(before, sanitizeLiveGameEvents(events))).toEqual(after);
    expect(originalHistory).toEqual([{ kind: 'vote', seat: 1, target: 2 }]);
    expect(liveRosterCorrectionEvents(after, after, ctx)).toEqual([]);
  });
  it('restores a swapped roster from the original journal, including after Undo, without changing historic seats', () => {
    const initial = { 1: 'a', 2: 'b' };
    const swap = { 1: 'b', 2: 'a' };
    const events = sanitizeLiveGameEvents([
      ...initialLiveRosterEvents(initial, ctx),
      ...liveRosterCorrectionEvents(initial, swap, { ...ctx, nextSeq: 12 }),
      { ...ctx, seq: 14, kind: 'vote', seat: 1, target: 2 },
    ]);
    expect(restoreJournalRosterIdentity(events)).toEqual(swap);
    expect(liveRosterCorrectionEvents(restoreJournalRosterIdentity(events)!, swap, ctx)).toEqual([]);
    expect(events.find(e => e.kind === 'vote')).toMatchObject({ seat: 1, target: 2 });
    expect(restoreJournalRosterIdentity([{ ...ctx, seq: 20, kind: 'player_reseated', seat: 1, value: 'b' }])).toBeNull();
  });
  it('records a replacement without assigning past actions to the incoming player', () => {
    const previous = { 1: 'a', 2: 'b' };
    const incoming = { 1: 'a', 2: 'c' };
    const events = liveRosterCorrectionEvents(previous, incoming, ctx);
    expect(events).toHaveLength(1);
    expect(replayLiveRosterIdentity(previous, events)).toEqual(incoming);
    expect(liveRosterCorrectionEvents(previous, { 1: 'a' }, ctx)).toEqual([]);
  });
});

describe('roster events in the game log', () => {
  it('hides the roster baseline and names a CRM reseat in words, never as a raw event kind', async () => {
    const { describeLiveGameEvents } = await import('../lib/liveGameEventText.ts');
    const context = { nextSeq: 1, at: '2026-10-23T12:00:00Z', round: 1, phase: 'day_speeches' };
    const baseline = initialLiveRosterEvents({ 1: 'p1', 2: 'p2' }, context);
    const reseat = liveRosterCorrectionEvents({ 1: 'p1', 2: 'p2' }, { 1: 'p3', 2: 'p2' }, { ...context, nextSeq: 3 });
    const lines = describeLiveGameEvents([...baseline, ...reseat], (seat) => `#${seat} Игрок`).map((line) => line.text);
    expect(lines).toEqual(['CRM: на место #1 посажен другой игрок']);
  });
});
