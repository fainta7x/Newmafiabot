import 'dotenv/config';
import path from 'path';
import { createDatabaseConnection } from '../db/index.ts';
import { rebuildCanonicalEloRatings } from '../server/services/eloRatingService.ts';

function requiredDbPath(): string {
  const index = process.argv.indexOf('--db');
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) {
    throw new Error('Usage: tsx src/scripts/recalculateElo.ts --db /absolute/path/to/database.sqlite');
  }
  return path.resolve(value);
}

async function main() {
  const db = createDatabaseConnection(requiredDbPath());
  try {
    const rows = await rebuildCanonicalEloRatings(db);
    for (const row of rows) console.log(`${row.nickname}\t${row.elo}`);
  } finally {
    try { db.sqlite.close(); } catch {}
  }
}

main().catch((error) => {
  console.error(`Elo recalculation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
