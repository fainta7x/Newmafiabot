import fs from 'node:fs';

const changes = [
  [
    'src/server/services/eveningSlotPlanningService.ts',
    '  await db.transaction(async (tx: any) => {',
    '  await db.transaction(async (tx: DatabaseWrapper) => {',
  ],
  [
    'src/server/services/playerEveningSummaryService.ts',
    '  const missingIds = [...new Set(rows.map((row: any) => String(row.nominee_player_id)))]',
    '  const missingIds = [...new Set<string>(rows.map((row: any) => String(row.nominee_player_id)))]',
  ],
  [
    'src/server/routes/tournamentsRoutes.ts',
    "export { internalGetStandings, internalGetNominations } from './tournamentsRoutesBase.ts';",
    "export { internalGetStandings, internalGetNominations, validateTournamentBackupData } from './tournamentsRoutesBase.ts';",
  ],
];

for (const [file, from, to] of changes) {
  const before = fs.readFileSync(file, 'utf8');
  if (!before.includes(from)) throw new Error(`Expected text not found in ${file}`);
  fs.writeFileSync(file, before.replace(from, to));
  console.log(`updated ${file}`);
}
