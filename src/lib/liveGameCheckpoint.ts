import { organizerHeaders } from './organizerAuth.ts';
import { readJsonResponse } from './requestJson.ts';
import { clubLiveDeathProtocolKey, clubLiveEvidenceKey, clubLiveProtocolNotesKey, clubLiveSessionKey, LEGACY_LIVE_SESSION_KEY } from './liveClubSession.ts';
import { parseGameKey, type GameKey } from '../shared/game.ts';

/**
 * «Продолжить игру» on the device, for EVERY game (one «Игра» layer, docs/ARCHITECTURE_REVIEW_2026-11-03.md): where the
 * engine keeps a game's session on this device, how a copy is read for the server and written back. The game key is the
 * engine's own session key (`club:<id>`, `tournament:<id>`).
 */
export type LiveGameCheckpointPayload = { session: string; evidence?: string | null; death_protocols?: string | null; notes?: string | null };
export type ServerLiveGameCheckpoint = LiveGameCheckpointPayload & { saved_at: string; revision: string };
const revisionKey = (key: GameKey) => `mafia_checkpoint_revision:${key}`;
export const readCheckpointRevision = (key: GameKey): string | null => read(revisionKey(key));
export const storeCheckpointRevision = (key: GameKey, revision: string) => { localStorage.setItem(revisionKey(key), revision); };

/** Undo steps kept in the server copy: enough to take back the last actions, small enough for one request. */
const HISTORY_KEPT = 5;

type DeviceKeys = { session: string; evidence: string; deathProtocols?: string; notes?: string; sharedSession: boolean };

/**
 * A game of an evening has its own device keys (the club recorder swaps them into the shared engine key); a tournament
 * game is kept in the shared engine key under its session key, with its evidence beside it.
 */
const deviceKeys = (key: GameKey): DeviceKeys | null => {
  const parsed = parseGameKey(key);
  if (!parsed) return null;
  if (parsed.storage === 'club') {
    return { session: clubLiveSessionKey(parsed.id), evidence: clubLiveEvidenceKey(parsed.id), deathProtocols: clubLiveDeathProtocolKey(parsed.id), notes: clubLiveProtocolNotesKey(parsed.id), sharedSession: false };
  }
  return { session: LEGACY_LIVE_SESSION_KEY, evidence: `${LEGACY_LIVE_SESSION_KEY}:tournament:${parsed.id}:protocol`, sharedSession: true };
};

const read = (key: string | undefined): string | null => { if (!key) return null; try { return localStorage.getItem(key); } catch { return null; } };

/** This device's session of the game, or null when the device has none (the shared key may hold another game). */
export const readDeviceSession = (key: GameKey): Record<string, any> | null => {
  const keys = deviceKeys(key);
  const raw = keys ? read(keys.session) : null;
  if (!keys || !raw) return null;
  try {
    const session = JSON.parse(raw);
    if (!session?.phase || session.phase === 'setup') return null;
    if (keys.sharedSession && session.sessionKey !== key) return null;
    return session;
  } catch {
    return null;
  }
};

export const readLiveGameCheckpoint = (key: GameKey): LiveGameCheckpointPayload | null => {
  const keys = deviceKeys(key);
  const session = readDeviceSession(key);
  if (!keys || !session) return null;
  if (Array.isArray(session.historyStack)) session.historyStack = session.historyStack.slice(-HISTORY_KEPT);
  return { session: JSON.stringify(session), evidence: read(keys.evidence), death_protocols: read(keys.deathProtocols), notes: read(keys.notes) };
};

/** Writes a server copy back to this device, so the engine restores it as its own saved session. */
export const writeLiveGameCheckpoint = (key: GameKey, checkpoint: LiveGameCheckpointPayload & { revision?: string }) => {
  const keys = deviceKeys(key);
  if (!keys) return;
  localStorage.setItem(keys.session, checkpoint.session);
  for (const [storageKey, value] of [[keys.evidence, checkpoint.evidence], [keys.deathProtocols, checkpoint.death_protocols], [keys.notes, checkpoint.notes]]) {
    if (storageKey) { if (value != null) localStorage.setItem(storageKey, value); else localStorage.removeItem(storageKey); }
  }
  if (checkpoint.revision) storeCheckpointRevision(key, checkpoint.revision);
  else localStorage.removeItem(revisionKey(key));
};

const url = (key: GameKey) => `/api/live-checkpoints/${encodeURIComponent(key)}`;

export const liveGameCheckpointApi = {
  save: async (key: GameKey, checkpoint: LiveGameCheckpointPayload, expectedRevision: string | null = null) => readJsonResponse<{ ok: true; revision: string }>(await fetch(url(key), {
    method: 'PUT', credentials: 'include', signal: AbortSignal.timeout(12_000), headers: { ...organizerHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ...checkpoint, expected_revision: expectedRevision }),
  }), 'Не удалось сохранить игру на сервере'),
  load: async (key: GameKey) => readJsonResponse<ServerLiveGameCheckpoint>(await fetch(url(key), {
    credentials: 'include', signal: AbortSignal.timeout(12_000), headers: organizerHeaders(),
  }), 'Сохранения игры на сервере нет'),
};
