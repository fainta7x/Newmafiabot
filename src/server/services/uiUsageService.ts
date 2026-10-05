import type { DatabaseWrapper } from '../../db/index.ts';
import { sanitizeUiActionName, sanitizeUiScreenName } from '../../lib/uiUsageNames.ts';

/**
 * UI usage events: which screens are opened and which buttons are pressed. No free text is stored — only a per-tab
 * random session key, the surface (player / crm / public) and a normalized name. Events of a signed-in player also carry
 * his id (owner request, 2026-10-05: per-player visits and clicks in the CRM player card; players are not told, only the
 * owner and organizers see it); the anonymous summaries (`getUiUsageSummary`) never expose it.
 */
export type UiEventKind = 'screen' | 'action';
export type UiSurface = 'player' | 'crm' | 'public';
export type UiEventInput = { kind: UiEventKind; name: string; at?: string };

const MAX_EVENTS_PER_BATCH = 50;
const RETENTION_DAYS = 180;
const NAME_PATTERN = /^[a-z0-9/:_.-]{1,80}$/;
const SESSION_PATTERN = /^[a-z0-9-]{8,64}$/;
const ensured = new WeakSet<object>();

export async function ensureUiUsageSchema(db: DatabaseWrapper) {
  if (ensured.has(db)) return;
  await db.run(`
    CREATE TABLE IF NOT EXISTS ui_usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      session_key TEXT NOT NULL,
      surface TEXT NOT NULL,
      role TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL
    )
  `);
  await db.run('CREATE INDEX IF NOT EXISTS idx_ui_usage_events_created ON ui_usage_events(created_at)');
  const columns = await db.all<{ name: string }>('PRAGMA table_info(ui_usage_events)');
  if (!columns.some((column) => column.name === 'player_id')) await db.run('ALTER TABLE ui_usage_events ADD COLUMN player_id TEXT');
  await db.run('CREATE INDEX IF NOT EXISTS idx_ui_usage_events_player ON ui_usage_events(player_id, created_at)');
  ensured.add(db);
}

/** Re-sanitizes on the server so an old or tampered client cannot store entity ids. */
export const normalizeUiEventName = (kind: UiEventKind, value: unknown): string | null => {
  const raw = String(value || '').trim().toLowerCase();
  if (!NAME_PATTERN.test(raw)) return null;
  return kind === 'screen' ? sanitizeUiScreenName(raw) : sanitizeUiActionName(raw);
};

let lastPurgeDay = '';

/** Deterministic retention: expired rows are removed at least once per day of use and on every summary. */
async function purgeExpired(db: DatabaseWrapper, now: Date) {
  await db.run('DELETE FROM ui_usage_events WHERE created_at < ?', [new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString()]);
}

export async function recordUiEvents(
  db: DatabaseWrapper,
  input: { sessionKey: unknown; surface: unknown; role: 'player' | 'organizer'; events: unknown; playerId?: string | null },
  now = new Date(),
): Promise<number> {
  const sessionKey = String(input.sessionKey || '').toLowerCase();
  const surface = input.surface === 'crm' || input.surface === 'player' || input.surface === 'public' ? input.surface : null;
  if (!SESSION_PATTERN.test(sessionKey) || !surface || !Array.isArray(input.events)) return 0;
  await ensureUiUsageSchema(db);
  const nowMs = now.getTime();
  let stored = 0;
  for (const raw of input.events.slice(0, MAX_EVENTS_PER_BATCH)) {
    const kind = raw?.kind === 'screen' || raw?.kind === 'action' ? raw.kind : null;
    const name = kind ? normalizeUiEventName(kind, raw?.name) : null;
    if (!kind || !name) continue;
    const atMs = Date.parse(String(raw?.at || ''));
    // Client clocks are only trusted within the last day; otherwise use server time.
    const createdAt = Number.isFinite(atMs) && atMs <= nowMs && nowMs - atMs < 86_400_000 ? new Date(atMs) : now;
    await db.run(
      'INSERT INTO ui_usage_events (created_at, session_key, surface, role, kind, name, player_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [createdAt.toISOString(), sessionKey, surface, input.role, kind, name, input.role === 'player' && input.playerId ? String(input.playerId) : null],
    );
    stored += 1;
  }
  const today = now.toISOString().slice(0, 10);
  if (stored && lastPurgeDay !== today) {
    lastPurgeDay = today;
    await purgeExpired(db, now);
  }
  return stored;
}

export type UiUsageRow = { surface: string; name: string; events: number; sessions: number };
export type UiUsageSummary = {
  days: number;
  sessions: { player: number; crm: number; public: number };
  screens: UiUsageRow[];
  actions: UiUsageRow[];
};

export async function getUiUsageSummary(db: DatabaseWrapper, days: number, now = new Date()): Promise<UiUsageSummary> {
  await ensureUiUsageSchema(db);
  await purgeExpired(db, now);
  const safeDays = Math.min(Math.max(Math.round(days) || 30, 1), RETENTION_DAYS);
  const since = new Date(now.getTime() - safeDays * 86_400_000).toISOString();
  const sessionRows = await db.all<{ surface: string; sessions: number }>(
    'SELECT surface, COUNT(DISTINCT session_key) AS sessions FROM ui_usage_events WHERE created_at >= ? GROUP BY surface',
    [since],
  );
  // Ranked per surface so one surface can never crowd the other out of the result.
  const top = async (kind: UiEventKind) => {
    const rows: UiUsageRow[] = [];
    for (const surface of ['player', 'crm', 'public'] as const) {
      rows.push(...await db.all<UiUsageRow>(
        `SELECT surface, name, COUNT(*) AS events, COUNT(DISTINCT session_key) AS sessions
         FROM ui_usage_events WHERE created_at >= ? AND kind = ? AND surface = ?
         GROUP BY name ORDER BY sessions DESC, events DESC LIMIT 30`,
        [since, kind, surface],
      ));
    }
    return rows;
  };
  const sessions = { player: 0, crm: 0, public: 0 };
  for (const row of sessionRows) if (row.surface in sessions) sessions[row.surface as keyof typeof sessions] = Number(row.sessions) || 0;
  const cast = (rows: UiUsageRow[]) => rows.map((row) => ({ ...row, events: Number(row.events) || 0, sessions: Number(row.sessions) || 0 }));
  return { days: safeDays, sessions, screens: cast(await top('screen')), actions: cast(await top('action')) };
}


const VISIT_GAP_MS = 30 * 60 * 1000;
const clubDay = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });

/**
 * One player's app activity for the CRM card: when he was last seen, how many visits (a visit = events with no gap longer
 * than 30 minutes), the days he came, the screens he opened, the buttons he pressed and the latest steps in order.
 * History exists only from the moment events started to carry the player id.
 */
export async function loadPlayerActivity(db: DatabaseWrapper, playerId: string, days = 30, now = new Date()) {
  await ensureUiUsageSchema(db);
  const span = Math.min(180, Math.max(1, Math.trunc(days) || 30));
  const since = new Date(now.getTime() - span * 86_400_000).toISOString();
  const rows = await db.all<{ created_at: string; kind: string; name: string }>(
    'SELECT created_at, kind, name FROM ui_usage_events WHERE player_id = ? AND created_at >= ? ORDER BY created_at ASC LIMIT 20000',
    [playerId, since],
  );
  const edge = await db.get<{ first_at: string | null; last_at: string | null }>(
    'SELECT MIN(created_at) AS first_at, MAX(created_at) AS last_at FROM ui_usage_events WHERE player_id = ?', [playerId],
  );

  const visitsByDay = new Map<string, { visits: number; events: number }>();
  const screens = new Map<string, number>();
  const actions = new Map<string, number>();
  let visits = 0;
  let lastAt = 0;
  const sevenDays = now.getTime() - 7 * 86_400_000;
  let visitsLast7 = 0;
  for (const row of rows) {
    const at = Date.parse(row.created_at);
    const day = clubDay(row.created_at);
    const bucket = visitsByDay.get(day) || { visits: 0, events: 0 };
    if (!lastAt || at - lastAt > VISIT_GAP_MS) {
      visits += 1;
      bucket.visits += 1;
      if (at >= sevenDays) visitsLast7 += 1;
    }
    bucket.events += 1;
    visitsByDay.set(day, bucket);
    lastAt = at;
    const target = row.kind === 'screen' ? screens : actions;
    target.set(row.name, (target.get(row.name) || 0) + 1);
  }
  const top = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
  return {
    days: span,
    tracking_since: edge?.first_at || null,
    last_seen_at: edge?.last_at || null,
    visits: { total: visits, last_7_days: visitsLast7, today: visitsByDay.get(clubDay(now.toISOString()))?.visits || 0 },
    active_days: visitsByDay.size,
    by_day: [...visitsByDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14).map(([day, value]) => ({ day, ...value })),
    top_screens: top(screens).map(([name, opens]) => ({ name, opens })),
    top_actions: top(actions).map(([name, count]) => ({ name, count })),
    recent: rows.slice(-40).reverse().map((row) => ({ at: row.created_at, kind: row.kind, name: row.name })),
  };
}
