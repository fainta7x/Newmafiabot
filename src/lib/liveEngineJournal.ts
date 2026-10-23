import {
  cloneLiveProtocolEvidence,
  updateLiveProtocolEvidence,
  type LiveProtocolEvidence,
  type LiveSessionSnapshot,
} from './liveClubSession.ts';

/** Producer cursor, separate from Undo: reversing an action is another recorded transition. */
export type LiveEngineJournal = {
  snapshot: LiveSessionSnapshot;
  evidence: LiveProtocolEvidence;
};

export function advanceLiveEngineJournal(
  previous: LiveEngineJournal | null,
  current: LiveSessionSnapshot,
): LiveEngineJournal {
  // Do not feed the embedded evidence back into its own producer.
  const { protocolEvidence: _embedded, ...snapshot } = current;
  return {
    snapshot,
    evidence: updateLiveProtocolEvidence(previous?.evidence || { votes: [], shots: [] }, snapshot, previous?.snapshot || null),
  };
}

/** Reload never recreates history from a single snapshot. Legacy sessions keep their recorder. */
export function restoreLiveEngineJournal(session: LiveSessionSnapshot): LiveEngineJournal | null {
  if (!session.protocolEvidence) return null;
  const { protocolEvidence, ...snapshot } = session;
  return { snapshot, evidence: cloneLiveProtocolEvidence(protocolEvidence) };
}
