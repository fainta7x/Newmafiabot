import type { DatabaseWrapper } from '../../db/index.ts';
import { sanitizeUiActionName, sanitizeUiScreenName } from '../../lib/uiUsageNames.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../../db/ensureOrganizerPlayerAccessSchema.ts';
import { parseAnalyticsPeriod, type AnalyticsRange } from '../../lib/analyticsPeriod.ts';

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

const lastPurgeDay = new WeakMap<object,string>();

/** Retention runs once per database per day on event ingestion, never on a summary read. */
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
  if (stored && lastPurgeDay.get(db) !== today) {
    await purgeExpired(db, now);
    lastPurgeDay.set(db,today);
  }
  return stored;
}

/**
 * `people` = different people (a signed-in player by his id, otherwise by the browser session), `visits` = visits (the events
 * of one session without a gap longer than 30 minutes), `events` = every recorded event, kept for reference only. `sessions`
 * equals `visits` (the old name, kept for the API). Refreshes, back-and-forth and repeated presses inside one visit count once.
 */
export type UiUsageRow = { surface: string; name: string; events: number; sessions: number; visits: number; people: number };
export type UiUsageSummary = {
  range?: AnalyticsRange;
  retentionDays?: number;
  days: number;
  sessions: { player: number; crm: number; public: number };
  visits: { player: number; crm: number; public: number };
  people: { player: number; crm: number; public: number };
  screens: UiUsageRow[];
  actions: UiUsageRow[];
};

const VISIT_GAP_MS = 30 * 60 * 1000;

/**
 * Honest usage numbers (owner, 2026-10-05): the club owner's own player activity is left out (he opens everything many times),
 * organizers browsing the player app are not players, and inside one visit a repeated screen or button counts once.
 * Computed when shown, so older events are recounted by the same rules. The CRM surface keeps every organizer session, as it
 * cannot tell one organizer from another.
 */
export async function getUiUsageSummary(db: DatabaseWrapper, period: number | AnalyticsRange, now = new Date()): Promise<UiUsageSummary> {
  const safeDays = typeof period === 'number' ? Math.min(Math.max(Math.round(period) || 30,1),RETENTION_DAYS) : RETENTION_DAYS;
  const range = typeof period === 'number' ? parseAnalyticsPeriod(safeDays + 'd',now.getTime()) : period;
  const retentionSince = new Date(now.getTime()-RETENTION_DAYS*86_400_000).toISOString();
  const since = typeof period === 'number' ? new Date(now.getTime()-safeDays*86_400_000).toISOString() : (range.since > retentionSince ? range.since : retentionSince);
  const until = range.until;
  const cte = `WITH filtered AS (
    SELECT id,created_at,CAST(ROUND((julianday(created_at)-2440587.5)*86400000) AS INTEGER) event_ms,session_key,surface,kind,name,COALESCE('p:'||NULLIF(player_id,''),'s:'||session_key) person
    FROM ui_usage_events WHERE julianday(created_at)>=julianday(?) AND julianday(created_at)<julianday(?)
      AND COALESCE(player_id,'')<>? AND NOT (role='organizer' AND surface<>'crm')
  ), gaps AS (
    SELECT *, LAG(event_ms) OVER (PARTITION BY session_key ORDER BY created_at,id) previous FROM filtered
  ), numbered AS (
    SELECT *, SUM(CASE WHEN previous IS NULL OR event_ms-previous>1800000 THEN 1 ELSE 0 END)
      OVER (PARTITION BY session_key ORDER BY created_at,id ROWS UNBOUNDED PRECEDING) visit_no FROM gaps
  ), visits AS (SELECT *,session_key||':'||visit_no visit FROM numbered)`;
  const params = [since,until,PRIMARY_ORGANIZER_PLAYER_ID];
  const totals = await db.all<{ surface: string; people: number; visits: number }>(`${cte} SELECT surface,COUNT(DISTINCT person) people,COUNT(DISTINCT visit) visits FROM visits GROUP BY surface`,params);
  const rows = await db.all<UiUsageRow & { kind: UiEventKind }>(`${cte}, grouped AS (
    SELECT kind,surface,name,COUNT(*) events,COUNT(DISTINCT person) people,COUNT(DISTINCT visit) visits,COUNT(DISTINCT visit) sessions FROM visits GROUP BY kind,surface,name
  ), ranked AS (SELECT *,ROW_NUMBER() OVER (PARTITION BY kind,surface ORDER BY people DESC,visits DESC,events DESC,name) ranking FROM grouped)
    SELECT kind,surface,name,events,people,visits,sessions FROM ranked WHERE ranking<=30 ORDER BY kind,surface,ranking`,params);
  const people = { player:0,crm:0,public:0 }, visits = { player:0,crm:0,public:0 };
  for (const row of totals) if (row.surface in people) { people[row.surface as keyof typeof people]=row.people; visits[row.surface as keyof typeof visits]=row.visits; }
  const top = (kind: UiEventKind) => rows.filter(row => row.kind===kind).map(({ kind: _kind,...row })=>row);
  return { days:safeDays, range:{...range,since}, retentionDays:RETENTION_DAYS, sessions:visits, visits, people, screens:top('screen'), actions:top('action') };
}

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
