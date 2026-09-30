import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';

const CONNECTION_ID = 'main';
const PAIRING_TTL_MS = 10 * 60 * 1000;
const ONLINE_TTL_MS = 12 * 1000;
const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type ObsRemoteRow = {
  bridge_token_hash: string | null;
  pairing_code_hash: string | null;
  pairing_expires_at: string | null;
  paired_at: string | null;
};

type LiveObsStatus = Required<ObsBridgeHeartbeat> & { last_seen_at: string };

const liveStatuses = new WeakMap<DatabaseWrapper, LiveObsStatus>();

export type ObsBridgeHeartbeat = {
  obs_connected: boolean;
  obs_version?: string | null;
  websocket_version?: string | null;
  current_scene?: string | null;
  stream_active?: boolean;
  recording_active?: boolean;
  last_error?: string | null;
};

const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

const safeEqual = (left: string | null, right: string) => {
  if (!left || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
};

const cleanText = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean ? clean.slice(0, maxLength) : null;
};

const makePairingCode = () => Array.from({ length: 8 }, () =>
  PAIRING_ALPHABET[crypto.randomInt(PAIRING_ALPHABET.length)],
).join('');

const loadConnection = (db: DatabaseWrapper) => db.get<ObsRemoteRow>(
  `SELECT bridge_token_hash, pairing_code_hash, pairing_expires_at, paired_at
     FROM obs_remote_connections WHERE id = ? LIMIT 1`,
  [CONNECTION_ID],
);

export async function createObsPairingCode(db: DatabaseWrapper) {
  const code = makePairingCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS).toISOString();
  await db.run(
    `UPDATE obs_remote_connections
        SET pairing_code_hash = ?, pairing_expires_at = ?, updated_at = ?
      WHERE id = ?`,
    [digest(code), expiresAt, now.toISOString(), CONNECTION_ID],
  );
  return { code, expires_at: expiresAt };
}

export async function pairObsBridge(db: DatabaseWrapper, rawCode: unknown) {
  const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase().replace(/[\s-]/g, '') : '';
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) return null;
  const row = await loadConnection(db);
  if (!row?.pairing_code_hash || !row.pairing_expires_at) return null;
  if (Date.parse(row.pairing_expires_at) <= Date.now()) return null;
  if (!safeEqual(row.pairing_code_hash, digest(code))) return null;

  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  await db.run(
    `UPDATE obs_remote_connections
        SET bridge_token_hash = ?, pairing_code_hash = NULL, pairing_expires_at = NULL,
            paired_at = ?, updated_at = ?
      WHERE id = ?`,
    [digest(token), now, now, CONNECTION_ID],
  );
  liveStatuses.delete(db);
  return { bridge_token: token };
}

export async function authenticateObsBridge(db: DatabaseWrapper, token: string | null | undefined) {
  if (!token) return false;
  const row = await loadConnection(db);
  return safeEqual(row?.bridge_token_hash || null, digest(token));
}

export async function updateObsBridgeHeartbeat(db: DatabaseWrapper, heartbeat: ObsBridgeHeartbeat) {
  const now = new Date().toISOString();
  liveStatuses.set(db, {
    obs_connected: heartbeat.obs_connected,
    obs_version: cleanText(heartbeat.obs_version, 80),
    websocket_version: cleanText(heartbeat.websocket_version, 80),
    current_scene: cleanText(heartbeat.current_scene, 160),
    stream_active: heartbeat.stream_active === true,
    recording_active: heartbeat.recording_active === true,
    last_error: cleanText(heartbeat.last_error, 300),
    last_seen_at: now,
  });
}

export async function getObsRemoteStatus(db: DatabaseWrapper) {
  const row = await loadConnection(db);
  const live = liveStatuses.get(db);
  const heartbeatFresh = Boolean(live?.last_seen_at && Date.now() - Date.parse(live.last_seen_at) <= ONLINE_TTL_MS);
  const bridgeOnline = heartbeatFresh && Boolean(row?.bridge_token_hash);
  return {
    paired: Boolean(row?.bridge_token_hash),
    bridge_online: bridgeOnline,
    obs_connected: bridgeOnline && live?.obs_connected === true,
    obs_version: live?.obs_version || null,
    websocket_version: live?.websocket_version || null,
    current_scene: live?.current_scene || null,
    stream_active: bridgeOnline && live?.stream_active === true,
    recording_active: bridgeOnline && live?.recording_active === true,
    last_error: bridgeOnline ? live?.last_error || null : null,
    paired_at: row?.paired_at || null,
    last_seen_at: live?.last_seen_at || null,
  };
}

export async function revokeObsBridge(db: DatabaseWrapper) {
  const now = new Date().toISOString();
  await db.run(
    `UPDATE obs_remote_connections
        SET bridge_token_hash = NULL, pairing_code_hash = NULL, pairing_expires_at = NULL,
            paired_at = NULL, updated_at = ?
      WHERE id = ?`,
    [now, CONNECTION_ID],
  );
  liveStatuses.delete(db);
}
