/**
 * Read-only, aggregate-only diagnostic for RSVP compatibility drift.
 *
 * Example (from a host with authorised DB file access):
 *   npx tsx src/scripts/auditEveningRsvpDrift.ts --db /path/to/mafia_crm.sqlite
 *
 * Nothing runs on application startup. An explicit file path is mandatory.
 * Opens SQLite with readonly+fileMustExist; no schema ensure, bootstrap,
 * checkpoint restoration, migrations, player IDs or individual rows.
 *
 * The agenda/bot/shortfall/analytics criteria are snapshots of existing
 * readers, not recommendations to change their business policies.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEveningResponse } from '../lib/eveningResponse.ts';

type Scope = 'open' | 'completed' | 'other';

type RsvpGroup = {
  scope: Scope;
  response_status: string;
  registration_status: string;
  attendance_status: string;
  arrival_status: string;
  total: number;
};

type ScopeTotals = {
  participants: number;
  canonical_positive: number;
  bot_raw_positive: number;
  agenda_legacy_or_positive: number;
  analytics_registration: number;
  pending_canonical_expected: number;
  pending_shortfall_raw: number;
  agenda_positive_without_canonical: number;
  agenda_missing_canonical_positive: number;
  bot_missing_canonical_positive: number;
  shortfall_missing_pending_canonical: number;
  declined_with_old_positive_registration: number;
  unanswered_with_old_registered: number;
};

const blank = (): ScopeTotals => ({
  participants: 0,
  canonical_positive: 0,
  bot_raw_positive: 0,
  agenda_legacy_or_positive: 0,
  analytics_registration: 0,
  pending_canonical_expected: 0,
  pending_shortfall_raw: 0,
  agenda_positive_without_canonical: 0,
  agenda_missing_canonical_positive: 0,
  bot_missing_canonical_positive: 0,
  shortfall_missing_pending_canonical: 0,
  declined_with_old_positive_registration: 0,
  unanswered_with_old_registered: 0,
});

/**
 * SQL groups stored status values BEFORE application interpretation. Only
 * category names and counts are read; IDs, nicknames and contact data are
 * never selected or emitted.
 */
export function auditEveningRsvpDrift(db: Database.Database) {
  const groups = db.prepare(`
    SELECT
      CASE
        WHEN e.status IN ('published','active') AND e.settled_at IS NULL THEN 'open'
        WHEN e.status = 'completed' OR e.settled_at IS NOT NULL THEN 'completed'
        ELSE 'other'
      END AS scope,
      lower(trim(coalesce(ep.response_status, ''))) AS response_status,
      lower(trim(coalesce(ep.registration_status, ''))) AS registration_status,
      lower(trim(coalesce(ep.attendance_status, ''))) AS attendance_status,
      lower(trim(coalesce(ep.arrival_status, ''))) AS arrival_status,
      count(*) AS total
    FROM evening_participants ep
    JOIN game_evenings e ON e.id = ep.evening_id
    GROUP BY 1, 2, 3, 4, 5
  `).all() as RsvpGroup[];

  const by_scope: Record<Scope, ScopeTotals> = {
    open: blank(),
    completed: blank(),
    other: blank(),
  };

  for (const g of groups) {
    const target = by_scope[g.scope];
    const n = g.total;
    const positive = ['going', 'late'].includes(getEveningResponse(g));
    const rawPositive = g.response_status === 'going' || g.response_status === 'late';
    const oldAgendaPositive = ['going', 'late', 'registered', 'confirmed'].includes(g.registration_status);
    const agendaPositive = rawPositive || oldAgendaPositive;
    const analyticsRegistration = g.response_status !== 'declined'
      && (rawPositive || ['going', 'confirmed', 'registered'].includes(g.registration_status)
        || ['attended', 'no_show'].includes(g.attendance_status));
    const pending = g.attendance_status === 'pending';

    target.participants += n;
    if (positive) target.canonical_positive += n;
    if (rawPositive) target.bot_raw_positive += n;
    if (agendaPositive) target.agenda_legacy_or_positive += n;
    if (analyticsRegistration) target.analytics_registration += n;
    if (positive && pending) target.pending_canonical_expected += n;
    if (rawPositive && pending) target.pending_shortfall_raw += n;
    if (agendaPositive && !positive) target.agenda_positive_without_canonical += n;
    if (!agendaPositive && positive) target.agenda_missing_canonical_positive += n;
    if (!rawPositive && positive) target.bot_missing_canonical_positive += n;
    if (positive && pending && !rawPositive) target.shortfall_missing_pending_canonical += n;
    if (g.response_status === 'declined' && oldAgendaPositive) target.declined_with_old_positive_registration += n;
    if (g.response_status === 'unanswered' && g.registration_status === 'registered') target.unanswered_with_old_registered += n;
  }

  return {
    kind: 'rsvp_read_policy_drift',
    version: 1,
    interpretation: 'diagnostic snapshots of existing SQL policies; not a replacement for per-service business rules',
    by_scope,
  };
}

/**
 * The only file-opening path for this diagnostic. Fail closed if the database
 * is missing, and never expose writable connections to callers.
 */
export function inspectEveningRsvpFile(databasePath: string) {
  const db = new Database(path.resolve(databasePath), { readonly: true, fileMustExist: true });
  try {
    db.pragma('query_only = ON');
    return auditEveningRsvpDrift(db);
  } finally {
    db.close();
  }
}

const isDirectInvocation = Boolean(process.argv[1])
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--db' || !args[1] || args[1].startsWith('-')) {
    console.error('Usage: npx tsx src/scripts/auditEveningRsvpDrift.ts --db /absolute/path/to/database.sqlite');
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify(inspectEveningRsvpFile(args[1]), null, 2));
    } catch (error) {
      console.error('Не удалось прочитать агрегированные статусы RSVP:', error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
