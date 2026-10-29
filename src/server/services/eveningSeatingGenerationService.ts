import { randomUUID } from 'node:crypto';
import { normalizeEveningFormat } from '../../lib/eveningFormat.ts';
import type { DatabaseWrapper } from '../../db/index.ts';
import { planEveningSeats, type EveningSeat, type EveningPlayer, type EveningSeatCandidate } from '../../lib/eveningSeating.ts';
import { ensureEveningSeatingSchema } from './eveningSeatBookingService.ts';
import { loadEveningSlotPlan } from './eveningSlotPlanningService.ts';

/**
 * Idempotent seat preparation at «Сегодня играем». Existing assignments
 * (especially self-booked ones) are kept; only free seats are filled.
 * This produces a plan, never actual club-game records or billing events.
 */
export async function generateEveningSeatingPlan(db: DatabaseWrapper, eveningId: string, targetSlotId?: string) {
  const plan = await loadEveningSlotPlan(db, eveningId);
  await ensureEveningSeatingSchema(db);
  const tables = await db.all<any>(
    'SELECT id, capacity FROM evening_tables WHERE evening_id = ? ORDER BY sort_order, created_at',
    [eveningId],
  );
  if (!tables.length) return { created: 0, reason: 'no_tables' as const };
  const registrations = await db.all<any>(`
    SELECT s.id AS slot_id, s.slot_number, ep.player_id
      FROM evening_game_slots s
      JOIN evening_slot_registrations r ON r.slot_id = s.id
      JOIN evening_participants ep ON ep.id = r.participant_id
     WHERE s.evening_id = ? AND s.status = 'open'
       AND ep.player_id IS NOT NULL AND ep.response_status IN ('going','late')
       AND NOT EXISTS (
         SELECT 1 FROM guest_player_placeholders gp WHERE gp.legacy_participant_id = ep.id
       )
     ORDER BY s.slot_number, ep.player_id`, [eveningId]);
  const slotsByNumber = new Map(plan.slots.map(s => [Number(s.slot_number), String(s.id)]));
  const numbersByPlayer = new Map<string, Set<number>>();
  for (const row of registrations) {
    const id = String(row.player_id);
    const games = numbersByPlayer.get(id) || new Set<number>();
    games.add(Number(row.slot_number));
    numbersByPlayer.set(id, games);
  }
  // Judge assignments are not the same as a permanent evening staff role.
  // A player may judge one game and play another, so don't exclude them
  // from the entire evening based on staff assignments.
  const players: EveningPlayer[] = [...numbersByPlayer]
    .map(([id, games]) => ({ id, eligibleGames: [...games] }));
  const occupied = await db.all<any>(`
    SELECT b.slot_id, s.slot_number, b.table_id, b.seat_number, b.player_id, b.locked, b.started
      FROM evening_seat_plans b JOIN evening_game_slots s ON s.id = b.slot_id
     WHERE b.evening_id = ?`, [eveningId]);
  const existing: EveningSeat[] = occupied.map(b => ({
    game: Number(b.slot_number), tableId: String(b.table_id),
    seat: Number(b.seat_number), playerId: String(b.player_id),
    locked: Boolean(b.locked), started: Boolean(b.started),
  }));
  const allSlots: EveningSeatCandidate[] = [];
  for (const slot of plan.slots) {
    if (slot.status !== 'open' || (targetSlotId && String(slot.id) !== targetSlotId)) continue;
    const eligibleCount = players.filter(player => player.eligibleGames.includes(Number(slot.slot_number))).length;
    const reservedTables = new Set(existing.filter(seat => seat.game === Number(slot.slot_number)).map(seat => seat.tableId));
    // Avoid creating a phantom second table with only one player when a
    // regular game requires a full lineup. Existing reservations stay intact.
    const novice = normalizeEveningFormat(plan.event.format) === 'NOVICE';
    // Novice games are allowed with 8–9 players. On a crowded evening,
    // two tables can use balanced 8–10-player lineups instead of placing
    // everyone into a single ten-seat table and making six people sit out.
    const tableCount = Math.min(tables.length,
      eligibleCount >= 16 ? Math.floor(eligibleCount / 8) :
      eligibleCount >= 10 || (novice && eligibleCount >= 8) ? 1 : 0);
    const selectedTables = tables.filter(table => reservedTables.has(String(table.id)));
    for (const table of tables) {
      if (selectedTables.length >= tableCount) break;
      if (!reservedTables.has(String(table.id))) selectedTables.push(table);
    }
    for (const [tableIndex, table] of selectedTables.entries()) {
      const capacity = Math.max(0, Math.min(10, Number(table.capacity || 10)));
      const balancedSize = tableCount
        ? Math.min(10, Math.floor(eligibleCount / tableCount) + (tableIndex < eligibleCount % tableCount ? 1 : 0))
        : 0;
      for (let seat = 1; seat <= Math.min(capacity, balancedSize); seat += 1) {
        allSlots.push({ game: Number(slot.slot_number), tableId: String(table.id), seat });
      }
    }
  }
  const planned = planEveningSeats(allSlots, players, existing);
  const preexisting = new Set(existing.map(entry => JSON.stringify([entry.game, entry.tableId, entry.seat])));
  const additions = planned.filter(entry => !preexisting.has(JSON.stringify([entry.game, entry.tableId, entry.seat])));
  const now = new Date().toISOString();
  return db.transaction(async tx => {
    let created = 0;
    for (const seat of additions) {
      const slotId = slotsByNumber.get(seat.game);
      if (!slotId) continue;
      const result = await tx.run(`
        INSERT OR IGNORE INTO evening_seat_plans
          (id,evening_id,slot_id,table_id,seat_number,player_id,locked,started,created_at,updated_at)
        VALUES (?,?,?,?,?,?,0,0,?,?)`,
        [randomUUID(), eveningId, slotId, seat.tableId, seat.seat, seat.playerId, now, now]);
      // A concurrent reservation can win instead; never overwrite it.
      if (Number(result?.changes || 0) > 0) created += 1;
    }
    return { created, reason: 'ok' as const };
  });
}
