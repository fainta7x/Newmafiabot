import { circleTitle } from '../components/crm/gameProtocol/protocolReview.ts';
import type { LiveBroadcastReplayFrame } from './liveBroadcast.ts';
import type { LiveGameEvent } from '../shared/liveGameEvents.ts';
import { liveGamePhaseLabel } from './liveGameEventText.ts';

export type ReplayChapter = { step: number; label: string };

/** Indices always refer to the sequence the player actually renders. Never match by approximate time. */
export function buildReplayChapters(data: {
  replay_frames?: LiveBroadcastReplayFrame[];
  engine_events?: LiveGameEvent[];
  events: Array<{ type: string; round?: number; title: string }>;
}): ReplayChapter[] {
  const result: ReplayChapter[] = [];
  let previous = '';
  const add = (key: string, label: string, step: number) => {
    if (key !== previous) result.push({ step, label });
    previous = key;
  };
  if (data.replay_frames?.length) {
    data.replay_frames.forEach(({ state }, step) => add(`${state.roundNumber}:${state.phaseKey}`, state.phaseTitle || 'Состояние игры', step));
  } else if (data.engine_events?.length) {
    [...data.engine_events].sort((a, b) => a.seq - b.seq).forEach((event, step) => add(`${event.round}:${event.phase}`, `${liveGamePhaseLabel(event.phase)} · ${circleTitle(Math.max(0, event.round - 1), { events: data.engine_events })}`, step));
  } else {
    data.events.forEach((event, step) => add(`${event.round ?? ''}:${event.type}`, event.title, step));
  }
  return result;
}
