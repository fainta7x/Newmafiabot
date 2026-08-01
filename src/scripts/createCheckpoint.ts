import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { createDatabaseConnection } from '../db/index.ts';
import { createPreviewCheckpoint } from '../db/previewDatabaseCheckpoint.ts';

const TOURNAMENT_TITLE = 'Турнир Богдана 1.08';

async function run(): Promise<void> {
  const baseDir = process.cwd();
  const runtimePath = path.join(baseDir, 'mafia_crm.runtime.sqlite');
  const checkpointPath = path.join(baseDir, 'mafia_crm.checkpoint.sqlite');

  if (!fs.existsSync(runtimePath)) {
    throw new Error(`Runtime database not found at ${runtimePath}`);
  }

  const runtimeDb = createDatabaseConnection(runtimePath);
  try {
    const result = await createPreviewCheckpoint(runtimeDb, { baseDir });
    if (!result.success) {
      throw new Error(result.message);
    }
  } finally {
    runtimeDb.sqlite.close();
  }

  const checkpointDb = new Database(checkpointPath, {
    readonly: true,
    fileMustExist: true,
  });

  try {
    const integrityRows = checkpointDb.pragma('integrity_check', {
      simple: false,
    }) as Array<{ integrity_check?: string }>;
    const integrity = integrityRows[0]?.integrity_check;
    const pageSize = checkpointDb.pragma('page_size', { simple: true }) as number;
    const pageCount = checkpointDb.pragma('page_count', { simple: true }) as number;
    const size = fs.statSync(checkpointPath).size;

    if (integrity !== 'ok') {
      throw new Error(`Checkpoint integrity check failed: ${integrity ?? 'no result'}`);
    }
    if (size !== pageSize * pageCount) {
      throw new Error(`Checkpoint size mismatch: expected ${pageSize * pageCount}, got ${size}`);
    }

    const tournament = checkpointDb
      .prepare('SELECT id, status FROM tournaments WHERE title = ?')
      .get(TOURNAMENT_TITLE) as { id: string; status: string } | undefined;
    if (!tournament) {
      throw new Error(`Tournament "${TOURNAMENT_TITLE}" was not found in checkpoint`);
    }

    const participantCount = (
      checkpointDb
        .prepare('SELECT count(*) AS count FROM tournament_participants WHERE tournament_id = ?')
        .get(tournament.id) as { count: number }
    ).count;
    const gameCount = (
      checkpointDb
        .prepare('SELECT count(*) AS count FROM tournament_games WHERE tournament_id = ?')
        .get(tournament.id) as { count: number }
    ).count;
    const seatCount = (
      checkpointDb
        .prepare(
          `SELECT count(*) AS count
           FROM tournament_game_seats
           WHERE game_id IN (SELECT id FROM tournament_games WHERE tournament_id = ?)`
        )
        .get(tournament.id) as { count: number }
    ).count;

    if (participantCount !== 10 || gameCount !== 10 || seatCount !== 100) {
      throw new Error(
        `Unexpected tournament structure: participants=${participantCount}, games=${gameCount}, seats=${seatCount}`
      );
    }

    console.log(
      JSON.stringify(
        {
          checkpointPath,
          integrity,
          size,
          pageSize,
          pageCount,
          tournament: TOURNAMENT_TITLE,
          status: tournament.status,
          participantCount,
          gameCount,
          seatCount,
        },
        null,
        2
      )
    );
  } finally {
    checkpointDb.close();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
