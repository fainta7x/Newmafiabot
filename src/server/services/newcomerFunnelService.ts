import { randomUUID } from 'node:crypto';
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
export const LEAD_SOURCES = ['vk', 'telegram', 'friend', 'other'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const LEAD_SOURCE_LABELS: Record<string, string> = { vk: 'Пост ВКонтакте', telegram: 'Пост в Telegram', friend: 'Привёл знакомый', other: 'Другое', unknown: 'Неизвестно' };

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
});

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
    await replacePlayerSlotSelection(db, eveningId, playerId, slots.map((slot) => String(slot.id)), { notifyOrganizer: false, source: 'welcome_page' });
    return true;
  } catch (error) {
    console.warn('[LEAD] Seat not booked:', error instanceof Error ? error.message : error);
    return false;
  }
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
export async function createWelcomeLead(db: DatabaseWrapper, input: { name: unknown; contactKind: unknown; contactValue: unknown; source?: unknown; referredBy?: unknown; eveningId?: unknown }, now = new Date()) {
  await ensure(db);
  const name = clean(input.name, 40);
  if (name.length < 2) throw new LeadError('Напишите, как к вам обращаться');
  const contact = normalizeLeadContact(input.contactKind, input.contactValue);
  const existing = await db.get<{ player_id: string }>('SELECT player_id FROM newcomer_leads WHERE contact_kind = ? AND contact_value = ?', [contact.kind, contact.value]);
  const eveningId = await openNoviceEveningId(db, input.eveningId);
  if (existing) {
    // Someone's contact is not a secret, so the form never changes a booking that already exists: it keeps the old one and says so
    // (moving to another Friday goes through the organizer or the signed-in cabinet).
    const playerId = String(existing.player_id);
    if (!eveningId) return { playerId, created: false, booked: false, alreadyBooked: false };
    const before = await db.get<{ evening_id: string | null }>('SELECT evening_id FROM newcomer_leads WHERE player_id = ?', [playerId]);
    const bookedEvening = before?.evening_id ?? null;
    if (bookedEvening === eveningId) return { playerId, created: false, booked: true, alreadyBooked: true };
    if (bookedEvening) return { playerId, created: false, booked: false, alreadyBooked: true };
    await db.run('UPDATE newcomer_leads SET evening_id = ? WHERE player_id = ?', [eveningId, playerId]);
    return { playerId, created: false, booked: await bookLeadSeats(db, playerId, eveningId, null), alreadyBooked: false };
  }

  const taken = new Set((await db.all<{ nickname: string }>('SELECT nickname FROM players WHERE lower(nickname) LIKE lower(?)', [`${name}%`])).map((row) => String(row.nickname).toLowerCase()));
  let nickname = name;
  for (let n = 2; taken.has(nickname.toLowerCase()); n += 1) nickname = `${name} ${n}`;
  const playerId = randomUUID();
  const stamp = now.toISOString();
  const source = sourceOf(input.source);
  const referredBy = clean(input.referredBy, 60) || null;
  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO players (id, nickname, lifecycle_status, source, game_level, club_stage, elo, tokens, referred_by, phone, telegram_username, created_at, updated_at)
       VALUES (?, ?, 'newcomer', 'welcome_page', 'novice', 'NEW', 1000, 0, ?, ?, ?, ?, ?)`,
      [playerId, nickname, referredBy, contact.kind === 'phone' ? contact.value : null, contact.kind === 'telegram' ? contact.value : null, stamp, stamp],
    );
    await tx.run('INSERT INTO newcomer_leads (player_id, contact_kind, contact_value, source, referred_by, created_at, evening_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [playerId, contact.kind, contact.value, source, referredBy, stamp, eveningId]);
    await tx.run('INSERT OR IGNORE INTO newcomer_funnel_events (id, visitor_id, step, source, day, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [randomUUID(), `lead-${playerId}`, 'contact_left', source, dayOf(now), stamp]);
  });
  return { playerId, created: true, booked: await bookLeadSeats(db, playerId, eveningId, null), alreadyBooked: false };
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
      WHERE l.first_contact_at IS NULL AND COALESCE(p.lifecycle_status, '') NOT IN ('archived', 'merged', 'blocked')
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
