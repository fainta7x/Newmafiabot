import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { replacePlayerSlotSelection } from './eveningSlotWritesService.ts';
import { ensureSlotsForEvening } from './eveningSlotPlanningService.ts';
import { openEveningSql } from '../../lib/eveningStatus.ts';
import type { DatabaseWrapper } from '../../db/index.ts';
import { oncePerDatabase } from '../../db/oncePerDatabase.ts';
import { PLAYER_VISITS_SQL } from './playerVisitsService.ts';

/**
 * Newcomer funnel and the welcome page (owner, 2026-11-11: newcomers do not register through the app; leads are registered on a page of
 * their own and the funnel is tracked). A lead is a player (lifecycle `newcomer`, source `welcome_page`) with one row of contact details in
 * `newcomer_leads`; page opens are counted in `newcomer_funnel_events`. The later steps (signed up for an evening, came, came again) are
 * read from the data the club already has, so nothing is entered by hand.
 */
export type LeadContactKind = 'telegram' | 'vk' | 'phone';
export const LEAD_SOURCES = ['vk', 'telegram', 'site', 'friend', 'other'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const LEAD_SOURCE_LABELS: Record<string, string> = { vk: 'Пост ВКонтакте', telegram: 'Пост в Telegram', site: 'Сайт', friend: 'Привёл знакомый', other: 'Другое', unknown: 'Неизвестно' };

const ensure = oncePerDatabase(async (db: DatabaseWrapper) => {
  await db.run(`CREATE TABLE IF NOT EXISTS newcomer_funnel_events (
    id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, step TEXT NOT NULL, source TEXT, day TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE (visitor_id, step, day))`);
  await db.run(`CREATE TABLE IF NOT EXISTS newcomer_leads (
    player_id TEXT PRIMARY KEY, contact_kind TEXT NOT NULL, contact_value TEXT NOT NULL, source TEXT, referred_by TEXT,
    created_at TEXT NOT NULL, first_contact_at TEXT)`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_newcomer_leads_contact ON newcomer_leads(contact_kind, contact_value)');
  // The evening the person picked on the site (owner, 2026-11-12: «выбираешь день, время, оставляешь контакты»).
  const columns = await db.all<{ name: string }>('PRAGMA table_info(newcomer_leads)');
  if (!columns.some((column) => column.name === 'evening_id')) await db.run('ALTER TABLE newcomer_leads ADD COLUMN evening_id TEXT');
  // The «Лиды» tab (owner, 2026-11-16): a lead is active, «Позвать снова» (invited again before each next novice evening, archived by itself
  // after two invitations without a sign-up), archived, or made a player by hand. `added_by` tells a lead typed in the CRM from the site / bot.
  for (const [name, type] of [['status', "TEXT NOT NULL DEFAULT 'active'"], ['recall_count', 'INTEGER NOT NULL DEFAULT 0'], ['recall_evening_id', 'TEXT'], ['status_changed_at', 'TEXT'], ['added_by', 'TEXT']] as const) {
    if (!columns.some((column) => column.name === name)) await db.run(`ALTER TABLE newcomer_leads ADD COLUMN ${name} ${type}`);
  }
  for (const name of ['management_token_hash', 'management_expires_at']) {
    if (!columns.some((column) => column.name === name)) await db.run(`ALTER TABLE newcomer_leads ADD COLUMN ${name} TEXT`);
  }
  await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_management_token ON newcomer_leads(management_token_hash)');
});
export const ensureNewcomerFunnelSchema = ensure;
export const leadManagementTokenHash = (value: unknown): string | null => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
  ? createHash('sha256').update(value).digest('hex') : null;

/** The id of an open novice evening, or null: a stale or made-up id from the page is ignored, never an error for the guest. */
async function openNoviceEveningId(db: DatabaseWrapper, value: unknown): Promise<string | null> {
  const id = clean(value, 80);
  if (!id) return null;
  const row = await db.get<{ id: string }>(
    `SELECT id FROM game_evenings WHERE id = ? AND UPPER(COALESCE(format, '')) = 'NOVICE' AND ${openEveningSql()} AND datetime(starts_at) >= datetime('now', '-3 hours')`, [id]).catch(() => null);
  return row ? String(row.id) : null;
}

const clean = (value: unknown, max: number) => Array.from(String(value ?? '')).map((character) => (character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || character === '<' || character === '>' ? ' ' : character)).join('').replace(/\s+/g, ' ').trim().slice(0, max);
const sourceOf = (value: unknown): LeadSource | null => (LEAD_SOURCES as readonly string[]).includes(String(value)) ? String(value) as LeadSource : null;
const dayOf = (now = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(now);


/**
 * The lead's seat (owner, 2026-11-12: «заявка должна бронировать место»): all open games of the chosen novice evening, the same way the player
 * would pick them in the app. The organizer still confirms by writing. A failure does not lose the lead: the contact is already saved.
 */
async function bookLeadSeats(db: DatabaseWrapper, playerId: string, eveningId: string | null, previousEveningId: string | null): Promise<boolean> {
  try {
    if (previousEveningId && previousEveningId !== eveningId) {
      await replacePlayerSlotSelection(db, previousEveningId, playerId, [], { notifyOrganizer: false, source: 'welcome_page' }).catch(() => null);
    }
    if (!eveningId) return false;
    await ensureSlotsForEvening(db, eveningId);
    const slots = await db.all<{ id: string }>("SELECT id FROM evening_game_slots WHERE evening_id = ? AND status = 'open' ORDER BY slot_number", [eveningId]);
    if (!slots.length) return false;
    await replacePlayerSlotSelection(db, eveningId, playerId, slots.map((slot) => String(slot.id)), { notifyOrganizer: false, source: 'welcome_page', noviceLead: true });
    return true;
  } catch (error) {
    console.warn('[LEAD] Seat not booked:', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * «Удалить лид» (owner, 2026-11-12: «не могу удалить лид»): a mistaken or test lead is removed with its seat. Only a lead that has never played or
 * been marked as arrived can go; the person is archived, not erased, so nothing else in the club's history changes.
 */
export async function removeLead(db: DatabaseWrapper, playerIdRaw: unknown) {
  await ensure(db);
  const playerId = String(playerIdRaw || '').trim();
  const lead = playerId ? await db.get<{ player_id: string; evening_id: string | null }>('SELECT player_id, evening_id FROM newcomer_leads WHERE player_id = ?', [playerId]) : null;
  if (!lead) throw new LeadError('Такого лида нет', 404);
  const played = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM evening_participants WHERE player_id = ? AND (COALESCE(attendance_status, 'pending') <> 'pending' OR COALESCE(amount_paid, 0) > 0)", [playerId]);
  if (Number(played?.n || 0) > 0) throw new LeadError('Этот человек уже был на вечере или платил, удалить его заявку нельзя', 409);
  if (lead.evening_id) await replacePlayerSlotSelection(db, String(lead.evening_id), playerId, [], { notifyOrganizer: false, source: 'lead_removed' }).catch(() => null);
  const stamp = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.run("DELETE FROM evening_participants WHERE player_id = ? AND COALESCE(attendance_status, 'pending') = 'pending' AND COALESCE(amount_paid, 0) = 0", [playerId]);
    await tx.run('DELETE FROM newcomer_leads WHERE player_id = ?', [playerId]);
    await tx.run("UPDATE players SET lifecycle_status = 'archived', contact_status = 'blocked', updated_at = ? WHERE id = ?", [stamp, playerId]);
  });
  return { removed: true };
}

export class LeadError extends Error { constructor(message: string, readonly statusCode = 400) { super(message); } }

/** A page open: one per visitor and day, so a refresh does not inflate the count. */
export async function recordWelcomeVisit(db: DatabaseWrapper, input: { visitorId: unknown; source?: unknown }, now = new Date()) {
  await ensure(db);
  const visitorId = clean(input.visitorId, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(visitorId)) return false;
  const result = await db.run('INSERT OR IGNORE INTO newcomer_funnel_events (id, visitor_id, step, source, day, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [randomUUID(), visitorId, 'page_view', sourceOf(input.source), dayOf(now), now.toISOString()]);
  return result.changes > 0;
}

/** Contact as the person typed it, reduced to a form the organizer can open. */
export function normalizeLeadContact(kindRaw: unknown, valueRaw: unknown): { kind: LeadContactKind; value: string } {
  const kind = String(kindRaw) as LeadContactKind;
  const raw = clean(valueRaw, 120);
  if (kind === 'telegram') {
    const name = raw.replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, '').replace(/^@/, '').split(/[/?\s]/)[0];
    if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name)) throw new LeadError('Укажите ник в Telegram, например @ivan_ivanov');
    return { kind, value: `@${name}` };
  }
  if (kind === 'vk') {
    const name = raw.replace(/^(https?:\/\/)?(m\.)?(vk\.com|vk\.ru)\//i, '').replace(/^@/, '').split(/[/?\s]/)[0];
    if (!/^[A-Za-z0-9_.]{3,40}$/.test(name)) throw new LeadError('Укажите ссылку на страницу ВК, например vk.com/ivan');
    return { kind, value: `https://vk.com/${name}` };
  }
  if (kind === 'phone') {
    const digits = raw.replace(/\D/g, '');
    const normal = digits.length === 11 && /^[78]/.test(digits) ? digits.slice(1) : digits.length === 10 ? digits : '';
    if (!normal) throw new LeadError('Укажите номер телефона целиком, например +7 900 123-45-67');
    return { kind, value: `+7${normal}` };
  }
  throw new LeadError('Выберите, как с вами связаться');
}

/**
 * The contact-only path of the welcome page. The same contact never creates a second lead. The new player starts as a novice
 * (game_level novice, club stage NEW) like everyone who comes in, and appears in the organizer's «Дела» with a ready message.
 */
export async function createWelcomeLead(db: DatabaseWrapper, input: { name: unknown; contactKind: unknown; contactValue: unknown; source?: unknown; referredBy?: unknown; eveningId?: unknown; addedBy?: 'site' | 'bot' | 'crm'; managementToken?: unknown }, now = new Date()): Promise<{ playerId: string; created: boolean; booked: boolean; alreadyBooked: boolean; managementToken?: string; managementRequired?: boolean }> {
  await ensure(db);
  const name = clean(input.name, 40);
  if (name.length < 2) throw new LeadError('Напишите, как к вам обращаться');
  const contact = normalizeLeadContact(input.contactKind, input.contactValue);
  const existing = await db.get<{ player_id: string; management_token_hash: string | null; management_expires_at: string | null; status: string; lifecycle_status: string | null }>('SELECT l.player_id,l.management_token_hash,l.management_expires_at,l.status,p.lifecycle_status FROM newcomer_leads l JOIN players p ON p.id=l.player_id WHERE l.contact_kind=? AND l.contact_value=?', [contact.kind, contact.value]);
  const eveningId = await openNoviceEveningId(db, input.eveningId);
  if (existing) {
    // Someone's contact is not a secret, so the form never changes a booking that already exists: it keeps the old one and says so
    // (moving to another Friday goes through the organizer or the signed-in cabinet).
    const playerId = String(existing.player_id);
    if (existing.management_token_hash && (existing.status === 'converted' || ['archived', 'merged', 'blocked', 'guest_placeholder'].includes(existing.lifecycle_status || '') || leadManagementTokenHash(input.managementToken) !== existing.management_token_hash || !existing.management_expires_at || existing.management_expires_at <= now.toISOString())) {
      return { playerId, created: false, booked: false, alreadyBooked: false, managementRequired: true };
    }
    if (!eveningId) return { playerId, created: false, booked: false, alreadyBooked: false };
    const before = await db.get<{ evening_id: string | null }>('SELECT evening_id FROM newcomer_leads WHERE player_id = ?', [playerId]);
    const bookedEvening = before?.evening_id ?? null;
    if (bookedEvening === eveningId) return { playerId, created: false, booked: true, alreadyBooked: true };
    if (bookedEvening) return { playerId, created: false, booked: false, alreadyBooked: true };
    await db.run("UPDATE newcomer_leads SET evening_id = ?, status = 'active', recall_count = 0, recall_evening_id = NULL WHERE player_id = ? AND status <> 'converted'", [eveningId, playerId]);
    return { playerId, created: false, booked: await bookLeadSeats(db, playerId, eveningId, null), alreadyBooked: false };
  }

  const taken = new Set((await db.all<{ nickname: string }>('SELECT nickname FROM players WHERE lower(nickname) LIKE lower(?)', [`${name}%`])).map((row) => String(row.nickname).toLowerCase()));
  let nickname = name;
  for (let n = 2; taken.has(nickname.toLowerCase()); n += 1) nickname = `${name} ${n}`;
  const playerId = randomUUID();
  const stamp = now.toISOString();
  const source = sourceOf(input.source);
  const referredBy = clean(input.referredBy, 60) || null;
  const proposedHash = leadManagementTokenHash(input.managementToken);
  const tokenAlreadyUsed = proposedHash ? await db.get('SELECT player_id FROM newcomer_leads WHERE management_token_hash=?', [proposedHash]) : null;
  const managementToken = (input.addedBy || 'site') === 'site'
    ? (proposedHash && !tokenAlreadyUsed ? String(input.managementToken) : randomBytes(32).toString('base64url')) : undefined;
  await db.transaction(async (tx) => {
    if (await tx.get('SELECT player_id FROM newcomer_leads WHERE contact_kind=? AND contact_value=?', [contact.kind, contact.value])) throw new LeadError('Запись для этого контакта уже существует. Открой персональную ссылку или повтори отправку.', 409);
    await tx.run(
      `INSERT INTO players (id, nickname, lifecycle_status, source, game_level, club_stage, elo, tokens, referred_by, phone, telegram_username, created_at, updated_at)
       VALUES (?, ?, 'newcomer', 'welcome_page', 'novice', 'NEW', 1000, 0, ?, ?, ?, ?, ?)`,
      [playerId, nickname, referredBy, contact.kind === 'phone' ? contact.value : null, contact.kind === 'telegram' ? contact.value : null, stamp, stamp],
    );
    await tx.run('INSERT INTO newcomer_leads (player_id, contact_kind, contact_value, source, referred_by, created_at, evening_id, added_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [playerId, contact.kind, contact.value, source, referredBy, stamp, eveningId, input.addedBy || 'site']);
    if (managementToken) await tx.run('UPDATE newcomer_leads SET management_token_hash = ?, management_expires_at = ? WHERE player_id = ?',
      [leadManagementTokenHash(managementToken), new Date(now.getTime() + 90 * 86400_000).toISOString(), playerId]);
    await tx.run('INSERT OR IGNORE INTO newcomer_funnel_events (id, visitor_id, step, source, day, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [randomUUID(), `lead-${playerId}`, 'contact_left', source, dayOf(now), stamp]);
  });
  return { playerId, created: true, booked: await bookLeadSeats(db, playerId, eveningId, null), alreadyBooked: false, ...(managementToken ? { managementToken } : {}) };
}

export type FunnelStep = { key: string; label: string; count: number };
export type FunnelSourceRow = { source: string; label: string; leads: number; came: number };

/** Players who entered through the newcomer routes in the period: leads of the page and the ones who signed in through the bot / VK. */
const COHORT_SQL = `(p.source IN ('welcome_page','vk_verified_onboarding','telegram_verified_onboarding','telegram_bot_registration','vk_self_registration')
  AND COALESCE(p.lifecycle_status, '') NOT IN ('archived', 'merged', 'blocked', 'guest_placeholder')
  AND datetime(p.created_at) >= datetime(?))`;

export async function loadNewcomerFunnel(db: DatabaseWrapper, days = 90, now = new Date()) {
  await ensure(db);
  const from = new Date(now.getTime() - days * 86_400_000).toISOString();
  const views = Number((await db.get<{ n: number }>("SELECT COUNT(DISTINCT visitor_id) AS n FROM newcomer_funnel_events WHERE step = 'page_view' AND datetime(created_at) >= datetime(?)", [from]))?.n || 0);
  const people = await db.all<{ id: string; source: string | null; lead_source: string | null; visits: number; signed: number }>(
    `SELECT p.id, p.source, l.source AS lead_source,
            (SELECT COUNT(*) FROM (${PLAYER_VISITS_SQL}) v WHERE v.player_id = CAST(p.id AS TEXT)) AS visits,
            (SELECT COUNT(*) FROM evening_participants ep WHERE ep.player_id = p.id AND ep.response_status IN ('going', 'late')) AS signed
       FROM players p LEFT JOIN newcomer_leads l ON l.player_id = p.id
      WHERE ${COHORT_SQL}`, [from]);
  const count = (predicate: (row: (typeof people)[number]) => boolean) => people.filter(predicate).length;
  const steps: FunnelStep[] = [
    { key: 'page_view', label: 'Открыли страницу для новичков', count: views },
    { key: 'joined', label: 'Оставили контакт или вошли', count: people.length },
    { key: 'signed', label: 'Записались на вечер', count: count((row) => Number(row.signed) > 0) },
    { key: 'first_visit', label: 'Пришли на первый вечер', count: count((row) => Number(row.visits) >= 1) },
    { key: 'second_visit', label: 'Пришли второй раз', count: count((row) => Number(row.visits) >= 2) },
  ];
  const bySource = new Map<string, FunnelSourceRow>();
  for (const row of people) {
    const key = row.lead_source || (row.source === 'welcome_page' ? 'unknown' : row.source === 'vk_verified_onboarding' || row.source === 'vk_self_registration' ? 'vk' : 'telegram');
    const entry = bySource.get(key) || { source: key, label: LEAD_SOURCE_LABELS[key] || LEAD_SOURCE_LABELS.unknown, leads: 0, came: 0 };
    entry.leads += 1; if (Number(row.visits) >= 1) entry.came += 1;
    bySource.set(key, entry);
  }
  return { days, steps, sources: [...bySource.values()].sort((a, b) => b.leads - a.leads), leads_waiting: Number((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM newcomer_leads WHERE first_contact_at IS NULL'))?.n || 0) };
}

/** Leads nobody has written to yet (for «Дела»). */
export async function loadLeadsToContact(db: DatabaseWrapper) {
  await ensure(db);
  return db.all<{ player_id: string; nickname: string; contact_kind: LeadContactKind; contact_value: string; source: string | null; created_at: string }>(
    `SELECT l.player_id, p.nickname, l.contact_kind, l.contact_value, l.source, l.created_at
       FROM newcomer_leads l JOIN players p ON p.id = l.player_id
      WHERE l.first_contact_at IS NULL AND COALESCE(l.status, 'active') = 'active' AND COALESCE(p.lifecycle_status, '') NOT IN ('archived', 'merged', 'blocked')
      ORDER BY l.created_at ASC LIMIT 50`);
}

export async function markLeadContacted(db: DatabaseWrapper, playerId: string, now = new Date()) {
  await ensure(db);
  await db.run('UPDATE newcomer_leads SET first_contact_at = COALESCE(first_contact_at, ?) WHERE player_id = ?', [now.toISOString(), playerId]);
}

/** What the organizer typed (a Telegram nick, a VK link or a phone) → the kind of contact. */
export function detectLeadContactKind(raw: unknown): LeadContactKind | null {
  const text = String(raw ?? '').trim();
  if (/vk\.(com|ru)\//i.test(text)) return 'vk';
  if (/^@|t\.me\/|telegram\.me\//i.test(text)) return 'telegram';
  if (text.replace(/\D/g, '').length >= 10) return 'phone';
  if (/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(text)) return 'telegram';
  return null;
}


/* ------------------------------------------------------------------------------------------------------------------------------
 * The «Лиды» tab of «Игроки» (owner, 2026-11-16, agreed with mock-ups): every lead — from the site, the bot or typed in the CRM — in one
 * list. The stage is read from what already happens (written to, booked, came); «Позвать снова», the archive and «Сделать игроком» are
 * the organizer's buttons. A lead is booked only on a novice evening.
 * ------------------------------------------------------------------------------------------------------------------------------ */
export type LeadStatus = 'active' | 'recall' | 'archived' | 'converted';
export const LEAD_RECALL_LIMIT = 2;

export async function listLeads(db: DatabaseWrapper) {
  await ensure(db);
  await archiveExhaustedRecalls(db);
  const rows = await db.all<any>(`
    SELECT l.player_id, p.nickname, l.contact_kind, l.contact_value, l.source, l.referred_by, l.created_at, l.first_contact_at,
           COALESCE(l.status, 'active') AS status, COALESCE(l.recall_count, 0) AS recall_count, l.added_by, l.status_changed_at,
           e.id AS evening_id, e.starts_at AS evening_starts_at,
           (SELECT COUNT(*) FROM (${PLAYER_VISITS_SQL}) v WHERE v.player_id = CAST(p.id AS TEXT)) AS visits,
           (SELECT MAX(ge.starts_at) FROM evening_participants ep JOIN game_evenings ge ON ge.id = ep.evening_id
             WHERE ep.player_id = p.id AND COALESCE(ep.attendance_status, 'pending') = 'attended') AS last_visit_at
      FROM newcomer_leads l
      JOIN players p ON p.id = l.player_id
      LEFT JOIN game_evenings e ON e.id = l.evening_id AND ${openEveningSql('e')}
     WHERE COALESCE(p.lifecycle_status, '') NOT IN ('merged')
     ORDER BY l.created_at DESC`);
  return rows.map((row) => ({
    player_id: String(row.player_id), nickname: String(row.nickname || ''), contact_kind: row.contact_kind as LeadContactKind, contact_value: String(row.contact_value),
    source: row.source as string | null, source_label: row.source ? (LEAD_SOURCE_LABELS[row.source] || null) : null, referred_by: row.referred_by as string | null,
    added_by: (row.added_by || 'site') as string, created_at: String(row.created_at), status: row.status as LeadStatus, recall_count: Number(row.recall_count || 0),
    evening: row.evening_id ? { id: String(row.evening_id), starts_at: String(row.evening_starts_at) } : null,
    // The stage shown on the card: what already happened, not something the organizer ticks.
    stage: Number(row.visits) > 0 ? 'came' : row.evening_id ? 'booked' : row.first_contact_at ? 'written' : 'new',
    last_visit_at: row.last_visit_at as string | null,
  }));
}

/** The open novice evenings a lead can be booked on, nearest first. */
export async function noviceEveningsForLeads(db: DatabaseWrapper) {
  return db.all<{ id: string; starts_at: string; title: string }>(
    `SELECT id, starts_at, title FROM game_evenings WHERE UPPER(COALESCE(format, '')) = 'NOVICE' AND ${openEveningSql()}
       AND datetime(starts_at) >= datetime('now', '-3 hours') ORDER BY datetime(starts_at) LIMIT 4`);
}

async function leadRow(db: DatabaseWrapper, playerIdRaw: unknown) {
  await ensure(db);
  const playerId = String(playerIdRaw || '').trim();
  const lead = playerId ? await db.get<{ player_id: string; evening_id: string | null; status: string }>("SELECT player_id, evening_id, COALESCE(status, 'active') AS status FROM newcomer_leads WHERE player_id = ?", [playerId]) : null;
  if (!lead) throw new LeadError('Такого лида нет', 404);
  return lead;
}

/** «Записать» / another evening: the lead's own seat moves to this novice evening; a lead who was in «Позвать снова» is active again. */
export async function bookLead(db: DatabaseWrapper, playerIdRaw: unknown, eveningIdRaw: unknown) {
  const lead = await leadRow(db, playerIdRaw);
  const eveningId = await openNoviceEveningId(db, eveningIdRaw);
  if (!eveningId) throw new LeadError('Лида записываем только на открытый вечер новичков');
  const booked = await bookLeadSeats(db, lead.player_id, eveningId, lead.evening_id);
  await db.run("UPDATE newcomer_leads SET evening_id = ?, status = 'active', recall_count = 0, recall_evening_id = NULL, status_changed_at = ? WHERE player_id = ?",
    [eveningId, new Date().toISOString(), lead.player_id]);
  return { booked };
}

/**
 * «Позвать снова», «В архив», «Вернуть», «Сделать игроком». A lead put off or archived loses the seat he had not used; a lead made a
 * player keeps everything and leaves the tab (he is in «Игроки» from now on).
 */
export async function setLeadStatus(db: DatabaseWrapper, playerIdRaw: unknown, statusRaw: unknown, now = new Date()) {
  const lead = await leadRow(db, playerIdRaw);
  const status = String(statusRaw) as LeadStatus;
  if (!['active', 'recall', 'archived', 'converted'].includes(status)) throw new LeadError('Неизвестный статус');
  if ((status === 'recall' || status === 'archived') && lead.evening_id) {
    const used = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM evening_participants WHERE player_id = ? AND evening_id = ? AND COALESCE(attendance_status, 'pending') <> 'pending'", [lead.player_id, lead.evening_id]);
    if (!Number(used?.n || 0)) await replacePlayerSlotSelection(db, String(lead.evening_id), lead.player_id, [], { notifyOrganizer: false, source: 'lead_status' }).catch(() => null);
  }
  const keepEvening = status === 'active' || status === 'converted';
  await db.run(`UPDATE newcomer_leads SET status = ?, status_changed_at = ?, recall_count = CASE WHEN ? = 'recall' THEN 0 ELSE recall_count END,
                  recall_evening_id = CASE WHEN ? = 'recall' THEN NULL ELSE recall_evening_id END${keepEvening ? '' : ', evening_id = NULL'} WHERE player_id = ?`,
    [status, now.toISOString(), status, status, lead.player_id]);
  return { status };
}

/** «Написал» on the card: the same mark «Дела» makes. */
export async function markLeadWritten(db: DatabaseWrapper, playerIdRaw: unknown) {
  const lead = await leadRow(db, playerIdRaw);
  await markLeadContacted(db, lead.player_id);
  return { written: true };
}

/** The novice evening the «Позвать снова» leads are invited to now: the nearest open one. */
async function nextNoviceEvening(db: DatabaseWrapper) {
  return (await noviceEveningsForLeads(db))[0] ?? null;
}

/**
 * Two invitations without a sign-up and the lead goes to the archive by itself (owner, 2026-11-16: «после 2»). Counted when the next
 * evening to invite to is not the one he was last invited to: his last invitation had its chance.
 */
async function archiveExhaustedRecalls(db: DatabaseWrapper) {
  const next = await nextNoviceEvening(db).catch(() => null);
  await db.run(`UPDATE newcomer_leads SET status = 'archived', status_changed_at = ?
                 WHERE COALESCE(status, 'active') = 'recall' AND COALESCE(recall_count, 0) >= ? AND COALESCE(recall_evening_id, '') <> ?`,
    [new Date().toISOString(), LEAD_RECALL_LIMIT, next?.id ?? '']);
}

/** «Позвать снова» leads to invite to the next novice evening (for «Дела»): not invited to it yet. */
export async function loadLeadsToRecall(db: DatabaseWrapper) {
  await ensure(db);
  await archiveExhaustedRecalls(db);
  const evening = await nextNoviceEvening(db);
  if (!evening) return { evening: null, leads: [] as Array<{ player_id: string; nickname: string; contact_kind: LeadContactKind; contact_value: string; recall_count: number }> };
  const leads = await db.all<{ player_id: string; nickname: string; contact_kind: LeadContactKind; contact_value: string; recall_count: number }>(
    `SELECT l.player_id, p.nickname, l.contact_kind, l.contact_value, COALESCE(l.recall_count, 0) AS recall_count
       FROM newcomer_leads l JOIN players p ON p.id = l.player_id
      WHERE COALESCE(l.status, 'active') = 'recall' AND COALESCE(l.recall_evening_id, '') <> ?
        AND COALESCE(p.lifecycle_status, '') NOT IN ('archived', 'merged', 'blocked')
      ORDER BY l.status_changed_at ASC LIMIT 50`, [evening.id]);
  return { evening, leads };
}

/** «Написал» on a «Позвать снова» item: one more invitation, to this evening. */
export async function markLeadRecalled(db: DatabaseWrapper, playerId: string) {
  await ensure(db);
  const evening = await nextNoviceEvening(db);
  if (!evening) return;
  await db.run(`UPDATE newcomer_leads SET recall_count = COALESCE(recall_count, 0) + 1, recall_evening_id = ?
                 WHERE player_id = ? AND COALESCE(status, 'active') = 'recall' AND COALESCE(recall_evening_id, '') <> ?`, [evening.id, playerId, evening.id]);
}
