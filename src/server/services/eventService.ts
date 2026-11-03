import type { DatabaseWrapper } from '../../db/index.ts';
import { eventKey, type ClubEvent, type EventKind, type EventStatus } from '../../shared/event.ts';

/**
 * The one reader of «Событие» over the four event tables (docs/ARCHITECTURE_REVIEW_2026-11-03.md). Read-only; every
 * write path stays where it is. One status per event:
 * - evening: draft → published → running (active) → completed; a settled evening is completed; cancelled;
 * - tournament: draft (not published) → published (published_at, still draft) → running (active, correction) → completed; cancelled;
 * - club event: draft → published → completed; cancelled;
 * - poker: registration = published → running → finished = completed; cancelled.
 */
export const eveningEventStatus = (row: { status?: unknown; settled_at?: unknown }): EventStatus => {
  const status = String(row.status || '');
  if (status === 'cancelled') return 'cancelled';
  if (status === 'completed' || row.settled_at) return 'completed';
  if (status === 'active') return 'running';
  if (status === 'published') return 'published';
  return 'draft';
};
export const tournamentEventStatus = (row: { status?: unknown; published_at?: unknown }): EventStatus => {
  const status = String(row.status || 'draft');
  if (status === 'cancelled') return 'cancelled';
  if (status === 'completed') return 'completed';
  if (status === 'active' || status === 'correction') return 'running';
  return row.published_at ? 'published' : 'draft';
};
export const customEventStatus = (row: { status?: unknown }): EventStatus => {
  const status = String(row.status || 'draft');
  return status === 'published' || status === 'completed' || status === 'cancelled' ? status : 'draft';
};
export const pokerEventStatus = (row: { status?: unknown }): EventStatus => {
  const status = String(row.status || '');
  if (status === 'running') return 'running';
  if (status === 'finished') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  return 'published';
};

const tableExists = async (db: DatabaseWrapper, name: string) =>
  Boolean(await db.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", [name]));

export interface ListEventsOptions { since?: string; until?: string; kinds?: EventKind[]; statuses?: EventStatus[] }

/** Events of every kind starting in [since, until), oldest first. */
export async function listEvents(db: DatabaseWrapper, options: ListEventsOptions = {}): Promise<ClubEvent[]> {
  const since = options.since || '0000';
  const until = options.until || '9999';
  const wanted = (kind: EventKind) => !options.kinds || options.kinds.includes(kind);
  const out: ClubEvent[] = [];
  const push = (kind: EventKind, row: any, startsAt: string, status: EventStatus) => {
    out.push({ key: eventKey(kind, row.id), kind, id: String(row.id), title: String(row.title || ''), startsAt, status, venue: row.venue ? String(row.venue) : null });
  };
  if (wanted('evening')) {
    for (const row of await db.all<any>('SELECT id, title, starts_at, venue, status, settled_at FROM game_evenings WHERE starts_at >= ? AND starts_at < ?', [since, until])) {
      push('evening', row, String(row.starts_at), eveningEventStatus(row));
    }
  }
  if (wanted('tournament') && await tableExists(db, 'tournaments')) {
    const columns = new Set((await db.all<any>('PRAGMA table_info(tournaments)')).map((c: any) => String(c.name)));
    const published = columns.has('published_at') ? 'published_at' : 'NULL AS published_at';
    // A tournament has a day, not a time: compare its date with the day of the bounds.
    for (const row of await db.all<any>(`SELECT id, title, date, venue, status, ${published} FROM tournaments WHERE substr(date, 1, 10) >= substr(?, 1, 10) AND substr(date, 1, 10) < substr(?, 1, 10)`, [since, until])) {
      push('tournament', row, String(row.date), tournamentEventStatus(row));
    }
  }
  if (wanted('custom') && await tableExists(db, 'custom_events')) {
    for (const row of await db.all<any>('SELECT id, title, starts_at, venue, status FROM custom_events WHERE starts_at >= ? AND starts_at < ?', [since, until])) {
      push('custom', row, String(row.starts_at), customEventStatus(row));
    }
  }
  if (wanted('poker') && await tableExists(db, 'poker_tournaments')) {
    for (const row of await db.all<any>('SELECT id, title, start_at, NULL AS venue, status FROM poker_tournaments WHERE start_at >= ? AND start_at < ?', [since, until])) {
      push('poker', row, String(row.start_at), pokerEventStatus(row));
    }
  }
  return out.filter((event) => !options.statuses || options.statuses.includes(event.status))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.key.localeCompare(b.key));
}
