/** Explicit, opt-in smoke test against public GoMafia. No club/runtime DB access. */
import { writeFileSync } from 'node:fs';
import { parseGoMafiaPlayerReference } from '../lib/gomafiaExternalProfile.ts';
import { fetchPublicGoMafiaCareer } from '../server/services/goMafiaCareerSource.ts';
const reference = parseGoMafiaPlayerReference(process.argv[2] || '');
if (!reference) throw new Error('Usage: node --import tsx src/scripts/goMafiaCareerSmoke.ts <player-id> [output.json]');
const snapshot = await fetchPublicGoMafiaCareer(reference);
const career = snapshot.career!;
const gameIds = career.tournaments.flatMap(t => t.games.map(g => g.externalGameId));
if (new Set(gameIds).size !== gameIds.length || career.tournaments.length !== career.historyTotal)
  throw new Error('Public career contains incomplete/duplicate source identities');
console.log(JSON.stringify({ externalPlayerId: snapshot.externalPlayerId, retrievedAt: snapshot.retrievedAt,
  totalGames: snapshot.totalGames, overallElo: snapshot.overallElo, tournaments: career.tournaments.length,
  historyGames: gameIds.length, years: career.yearlyStats.map(s => ({ year: s.year, games: s.totalGames })),
  resultsWithScore: career.tournaments.filter(t => t.totalScore !== null).length,
  gamesWithScore: career.tournaments.flatMap(t => t.games).filter(g => g.score !== null).length,
  nominationWins: career.tournaments.flatMap(t=>(t.nominations??[]).filter(n=>n.rank===1).map(n=>({tournamentId:t.tournamentId,date:t.dateStart,key:n.key}))),
  registrations: career.registrationsStatus }, null, 2));
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(snapshot, null, 2) + '\n');
