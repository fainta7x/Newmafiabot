import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'mafia_crm.runtime.sqlite');
console.log('Opening database in readonly mode:', dbPath);

try {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const integrity = db.pragma('integrity_check', { simple: false });
  console.log('Integrity check result:', JSON.stringify(integrity));

  const playersCount = db.prepare('SELECT COUNT(*) as c FROM players').get().c;
  const tournamentsCount = db.prepare('SELECT COUNT(*) as c FROM tournaments').get().c;
  const gamesCount = db.prepare('SELECT COUNT(*) as c FROM tournament_games').get().c;
  const completedProtocolsCount = db.prepare("SELECT COUNT(*) as c FROM tournament_game_protocols WHERE status = 'completed'").get().c;
  const playerResultsCount = db.prepare('SELECT COUNT(*) as c FROM tournament_game_player_results').get().c;

  console.log({
    playersCount,
    tournamentsCount,
    gamesCount,
    completedProtocolsCount,
    playerResultsCount
  });

  db.close();
} catch (err) {
  console.error('Error verifying runtime database:', err);
}
