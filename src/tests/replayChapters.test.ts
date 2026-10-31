import { expect, it } from 'vitest';
import { buildReplayChapters } from '../lib/replayChapters.ts';
import type { LiveBroadcastReplayFrame } from '../lib/liveBroadcast.ts';
import type { LiveGameEvent } from '../shared/liveGameEvents.ts';

it('uses recorded frame indices instead of matching unrelated legacy events', () => {
  const frame = (phaseKey: string, roundNumber: number, phaseTitle: string) => ({ at: '', state: { phaseKey, roundNumber, phaseTitle } }) as LiveBroadcastReplayFrame;
  expect(buildReplayChapters({ replay_frames: [frame('day_speeches', 1, 'Нулевой круг'), frame('day_speeches', 1, 'Нулевой круг'), frame('day_voting', 1, 'Голосование'), frame('night', 2, 'Ночь')], events: [{ type: 'finish', title: 'Итог' }] })).toEqual([{ step: 0, label: 'Нулевой круг' }, { step: 2, label: 'Голосование' }, { step: 3, label: 'Ночь' }]);
});

it('matches the engine renderer order, including a return to an earlier phase', () => {
  const event = (seq: number, phase: string) => ({ seq, phase, round: 2 }) as LiveGameEvent;
  const chapters = buildReplayChapters({ engine_events: [event(4, 'day_speeches'), event(1, 'day_speeches'), event(3, 'day_voting'), event(2, 'day_speeches')], events: [] });
  expect(chapters.map(chapter => chapter.step)).toEqual([0, 2, 3]);
  expect(chapters[1].label).toBe('Голосование · Круг 1');
});

it('keeps a legacy-only record on its own saved timeline and does not invent missing chapters', () => {
  expect(buildReplayChapters({ events: [] })).toEqual([]);
  expect(buildReplayChapters({ events: [{ type: 'votes', round: 2, title: 'Голосование' }, { type: 'votes', round: 2, title: 'Повтор' }, { type: 'night', round: 2, title: 'Записанная ночь' }] })).toEqual([{ step: 0, label: 'Голосование' }, { step: 2, label: 'Записанная ночь' }]);
});
