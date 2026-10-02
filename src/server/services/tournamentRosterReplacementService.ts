import crypto from 'crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { playerLevelAllowsEveningFormat } from '../../db/ensureInviteAudienceSchema.ts';

export type TournamentRosterEditMode = 'full' | 'replacement_only' | 'locked';

const nowIso = () => new Date().toISOString();

async function managedTournament(db: DatabaseWrapper, tournamentId: string) {
  const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ? LIMIT 1', [tournamentId]);
  if (!tournament) throw new Error('TOURNAMENT_NOT_FOUND');
  if (Number(tournament.tournament_evening_flow || 0) !== 1) throw new Error('NOT_TOURNAMENT_EVENING');
  return tournament;
}

/**
 * Full roster editing is safe before seating exists. Once seating is prepared (or the tournament
 * is marked active) the organizer may still do an identity-preserving replacement until the first
 * game actually starts. After that the tournament history is immutable through this workflow.
 */
export async function getTournamentRosterEditMode(
  db: DatabaseWrapper,
  tournamentId: string,
): Promise<TournamentRosterEditMode> {
  const tournament = await managedTournament(db, tournamentId);
  if (!['draft', 'active'].includes(String(tournament.status))) return 'locked';

  const games = await db.all<any>('SELECT status FROM tournament_games WHERE tournament_id = ?', [tournamentId]);
  if (games.some((game) => String(game.status) !== 'planned')) return 'locked';
  if (String(tournament.status) === 'draft' && games.length === 0) return 'full';
  return 'replacement_only';
}

async function renumberReserve(db: DatabaseWrapper, tournamentId: string) {
  const rows = await db.all<any>(
    `SELECT id FROM tournament_registrations
      WHERE tournament_id = ? AND status = 'reserve'
      ORDER BY COALESCE(queue_order, 999999), registered_at, id`,
    [tournamentId],
  );
  for (let index = 0; index < rows.length; index += 1) {
    await db.run('UPDATE tournament_registrations SET queue_order = ? WHERE id = ?', [index + 1, rows[index].id]);
  }
}

export async function replaceConfirmedTournamentPlayer(
  db: DatabaseWrapper,
  tournamentId: string,
  outgoingPlayerId: string,
  replacementPlayerId: string,
  actorId: string,
  reason: string,
) {
  const actor = String(actorId || '').trim();
  if (!actor) throw new Error('ACTOR_REQUIRED');
  const cleanReason = String(reason || '').trim() || 'Замена игрока организатором';
  if (!outgoingPlayerId || !replacementPlayerId || outgoingPlayerId === replacementPlayerId) {
    throw new Error('INVALID_REPLACEMENT');
  }

  return db.transaction(async (tx) => {
    const tournament = await managedTournament(tx, tournamentId);
    const editMode = await getTournamentRosterEditMode(tx, tournamentId);
    if (editMode === 'locked') throw new Error('ROSTER_LOCKED');

    const outgoing = await tx.get<any>(
      `SELECT * FROM tournament_registrations
        WHERE tournament_id = ? AND player_id = ? AND status = 'confirmed' LIMIT 1`,
      [tournamentId, outgoingPlayerId],
    );
    if (!outgoing || outgoing.slot_number == null) throw new Error('NOT_CONFIRMED_PLAYER');

    if (String(tournament.judge_player_id || '') === replacementPlayerId) throw new Error('JUDGE_CANNOT_REGISTER');
    const replacement = await tx.get<any>(
      'SELECT id, nickname, game_level FROM players WHERE id = ? LIMIT 1',
      [replacementPlayerId],
    );
    if (!replacement || !playerLevelAllowsEveningFormat(replacement.game_level, 'TOURNAMENT')) {
      throw new Error('NOT_ELIGIBLE');
    }

    const existingReplacement = await tx.get<any>(
      'SELECT * FROM tournament_registrations WHERE tournament_id = ? AND player_id = ? LIMIT 1',
      [tournamentId, replacementPlayerId],
    );
    if (existingReplacement?.status === 'confirmed') throw new Error('TOURNAMENT_PLAYER_DUPLICATE');

    const participant = await tx.get<any>(
      'SELECT * FROM tournament_participants WHERE tournament_id = ? AND player_id = ? LIMIT 1',
      [tournamentId, outgoingPlayerId],
    );
    if (!participant) throw new Error('ROSTER_MISMATCH');
    const duplicateParticipant = await tx.get<any>(
      'SELECT id FROM tournament_participants WHERE tournament_id = ? AND player_id = ? AND id <> ? LIMIT 1',
      [tournamentId, replacementPlayerId, participant.id],
    );
    if (duplicateParticipant) throw new Error('TOURNAMENT_PLAYER_DUPLICATE');

    const now = nowIso();
    const slotNumber = Number(outgoing.slot_number);

    // Free the confirmed slot first so the partial unique index can accept the replacement.
    await tx.run(
      `UPDATE tournament_registrations
        SET status = 'cancelled', slot_number = NULL, queue_order = NULL, response = 'declined',
            cancelled_at = ?, updated_at = ?, organizer_reason = ?
        WHERE id = ?`,
      [now, now, cleanReason, outgoing.id],
    );

    if (existingReplacement) {
      await tx.run(
        `UPDATE tournament_registrations
          SET status = 'confirmed', slot_number = ?, queue_order = NULL, response = 'play',
              cancelled_at = NULL, called_at = NULL, updated_at = ?, organizer_reason = ?
          WHERE id = ?`,
        [slotNumber, now, cleanReason, existingReplacement.id],
      );
    } else {
      await tx.run(
        `INSERT INTO tournament_registrations
          (id, tournament_id, player_id, status, slot_number, response, registered_at, updated_at, organizer_reason)
          VALUES (?, ?, ?, 'confirmed', ?, 'play', ?, ?, ?)`,
        [crypto.randomUUID(), tournamentId, replacementPlayerId, slotNumber, now, now, cleanReason],
      );
    }

    // Keep the canonical participant id. Every pre-generated game seat points to this id, so the
    // replacement inherits exactly the outgoing player's prepared seats without reshuffling games.
    await tx.run(
      'UPDATE tournament_participants SET player_id = ?, display_name = ? WHERE id = ?',
      [replacementPlayerId, replacement.nickname || `Игрок ${slotNumber}`, participant.id],
    );
    await renumberReserve(tx, tournamentId);
    await tx.run('UPDATE tournaments SET updated_at = ? WHERE id = ?', [now, tournamentId]);
    await tx.run(
      `INSERT INTO tournament_evening_audit
        (id, tournament_id, player_id, action, actor_type, actor_id, reason, payload_json, created_at)
        VALUES (?, ?, ?, 'replace_player', 'organizer', ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        tournamentId,
        replacementPlayerId,
        actor,
        cleanReason,
        JSON.stringify({
          outgoing_player_id: outgoingPlayerId,
          replacement_player_id: replacementPlayerId,
          slot_number: slotNumber,
          participant_id: participant.id,
          roster_edit_mode: editMode,
        }),
        now,
      ],
    );

    return {
      outgoing_player_id: outgoingPlayerId,
      replacement_player_id: replacementPlayerId,
      slot_number: slotNumber,
      participant_id: String(participant.id),
      roster_edit_mode: editMode,
    };
  });
}
