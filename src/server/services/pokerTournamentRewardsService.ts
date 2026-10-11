import crypto from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import type { PokerTournamentConfig } from '../../shared/pokerTournament.ts';
import { evaluateAchievementsForPlayers } from './playerAchievementsService.ts';
import { mutateTokenBalance } from './tokenLedgerService.ts';

/**
 * What a finished poker tournament gives (owner, 2026-10-10): the token prize the organizer set for each place, a cup in
 * the profile for the winner, medals for second and third, and the achievements for winning. Every part is idempotent
 * (ledger key, award source key), so repeating the settlement never pays or awards twice.
 */
export async function settlePokerTournamentRewards(
  db: DatabaseWrapper,
  tournament: { id: string; title: string },
  config: PokerTournamentConfig,
  finishedAtIso: string,
) {
  const placed = await db.all<{ player_id: string; place: number; nickname: string }>(
    `SELECT e.player_id, e.place, COALESCE(p.nickname, 'Игрок') AS nickname
       FROM poker_tournament_entries e LEFT JOIN players p ON p.id = e.player_id
      WHERE e.tournament_id = ? AND e.place IS NOT NULL ORDER BY e.place ASC`,
    [tournament.id],
  );
  const date = finishedAtIso.slice(0, 10);
  const year = Number(date.slice(0, 4));

  for (const entry of placed) {
    const prize = Math.max(0, Math.trunc(config.prizeTokens[entry.place - 1] || 0));
    if (prize > 0) {
      await mutateTokenBalance(db, {
        playerId: entry.player_id,
        delta: prize,
        reasonType: 'poker_tournament_prize',
        description: `Покерный турнир «${tournament.title}»: ${entry.place} место`,
        sourceType: 'poker_tournament',
        sourceId: tournament.id,
        idempotencyKey: `poker-tournament-prize:${tournament.id}:${entry.player_id}`,
        actorType: 'system',
        actorId: null,
        metadata: { tournament_id: tournament.id, place: entry.place, amount: prize },
      });
      await db.run('UPDATE poker_tournament_entries SET prize_tokens = ? WHERE tournament_id = ? AND player_id = ?', [prize, tournament.id, entry.player_id]);
    }
    if (entry.place > 3) continue;
    // The cup (and the medals) carry no tournament_id on purpose: that field links to the mafia tournaments.
    const winner = entry.place === 1;
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO player_verified_awards (
         id, player_id, kind, title, tournament_id, tournament_name, club_organizer, award_date, award_year, place_result,
         description, source, source_type, source_key, verification_status, created_by, verified_by, verified_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, 'automatic', ?, 'verified', 'system', 'system', ?, ?, ?)
       ON CONFLICT(source_key) DO NOTHING`,
      [
        `award_${crypto.randomUUID()}`, entry.player_id, winner ? 'trophy' : 'medal',
        winner ? `Победитель покерного турнира «${tournament.title}»` : `${entry.place} место в покерном турнире «${tournament.title}»`,
        tournament.title, date, year, `${entry.place} место`,
        `Покерный турнир клуба, ${placed.length} ${placed.length === 1 ? 'игрок' : placed.length < 5 ? 'игрока' : 'игроков'}`,
        `poker_tournament:${tournament.id}`, `poker_tournament:${tournament.id}:${entry.player_id}`, now, now, now,
      ],
    );
  }

  const winnerId = placed.find((entry) => entry.place === 1)?.player_id;
  if (winnerId) {
    try { await evaluateAchievementsForPlayers(db, [winnerId]); }
    catch (error) { console.error('[POKER TOURNAMENT] achievements will be granted by the next sweep:', error instanceof Error ? error.message : String(error)); }
  }
}
