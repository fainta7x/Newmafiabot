import { describe, expect, it } from 'vitest';
import { findOpenDraftWithSameSeats } from '../server/routes/gamesRoutes.ts';

const seats = ['a', 'b', 'c'].map((id) => ({ participant_id: id }));
const draft = (id: number, ids: string[], status = 'draft') => ({
  id,
  protocol_text: JSON.stringify({ kind: 'club_evening_protocol', version: 1, protocol: { status }, player_results: ids.map((participant_id) => ({ participant_id })) }),
});
const dbWith = (rows: any[]) => ({ all: async () => rows }) as any;

describe('a second «create the game» does not double the protocol (game 28 next to game 29, 2026-10-31)', () => {
  it('returns the unfinished draft with the same people', async () => {
    expect(await findOpenDraftWithSameSeats(dbWith([draft(28, ['c', 'a', 'b'])]), 'e1', 't1', seats)).toBe(28);
  });
  it('does not reuse a draft with other people, or a completed one', async () => {
    expect(await findOpenDraftWithSameSeats(dbWith([draft(28, ['a', 'b', 'x'])]), 'e1', 't1', seats)).toBeNull();
    expect(await findOpenDraftWithSameSeats(dbWith([draft(28, ['a', 'b', 'c'], 'completed')]), 'e1', 't1', seats)).toBeNull();
    expect(await findOpenDraftWithSameSeats(dbWith([]), 'e1', 't1', seats)).toBeNull();
  });
});
