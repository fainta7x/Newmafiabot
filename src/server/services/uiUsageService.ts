import type { DatabaseWrapper } from '../../db/index.ts';

/**
 * Anonymous UI usage events: which screens are opened and which buttons are
 * pressed. No player ids or free text are stored — only a per-tab random
 * session key, the surface (player / crm / public) and a normalized name.
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
  ensured.add(db);
}

export const normalizeUiEventName = (value: unknown): string | null => {
  const name = String(value || '').trim().toLowerCase();
  return NAME_PATTERN.test(name) ? name : null;
};

export async function recordUiEvents(
  db: DatabaseWrapper,
  input: { sessionKey: unknown; surface: unknown; role: 'player' | 'organizer'; events: unknown },
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
    const name = normalizeUiEventName(raw?.name);
    if (!kind || !name) continue;
    const atMs = Date.parse(String(raw?.at || ''));
    // Client clocks are only trusted within the last day; otherwise use server time.
    const createdAt = Number.isFinite(atMs) && atMs <= nowMs && nowMs - atMs < 86_400_000 ? new Date(atMs) : now;
    await db.run(
      'INSERT INTO ui_usage_events (created_at, session_key, surface, role, kind, name) VALUES (?, ?, ?, ?, ?, ?)',
      [createdAt.toISOString(), sessionKey, surface, input.role, kind, name],
    );
    stored += 1;
  }
  if (stored && Math.random() < 0.02) {
    await db.run('DELETE FROM ui_usage_events WHERE created_at < ?', [new Date(nowMs - RETENTION_DAYS * 86_400_000).toISOString()]);
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
  const safeDays = Math.min(Math.max(Math.round(days) || 30, 1), RETENTION_DAYS);
  const since = new Date(now.getTime() - safeDays * 86_400_000).toISOString();
  const sessionRows = await db.all<{ surface: string; sessions: number }>(
    'SELECT surface, COUNT(DISTINCT session_key) AS sessions FROM ui_usage_events WHERE created_at >= ? GROUP BY surface',
    [since],
  );
  const top = (kind: UiEventKind) => db.all<UiUsageRow>(
    `SELECT surface, name, COUNT(*) AS events, COUNT(DISTINCT session_key) AS sessions
     FROM ui_usage_events WHERE created_at >= ? AND kind = ?
     GROUP BY surface, name ORDER BY sessions DESC, events DESC LIMIT 60`,
    [since, kind],
  );
  const sessions = { player: 0, crm: 0, public: 0 };
  for (const row of sessionRows) if (row.surface in sessions) sessions[row.surface as keyof typeof sessions] = Number(row.sessions) || 0;
  const cast = (rows: UiUsageRow[]) => rows.map((row) => ({ ...row, events: Number(row.events) || 0, sessions: Number(row.sessions) || 0 }));
  return { days: safeDays, sessions, screens: cast(await top('screen')), actions: cast(await top('action')) };
}
