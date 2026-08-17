import fs from 'node:fs';

const file = 'src/server/services/eveningSlotPlanningService.ts';
const before = fs.readFileSync(file, 'utf8');
const after = before.replaceAll('async (tx: any)', 'async (tx: DatabaseWrapper)');
if (after === before) throw new Error('No remaining tx:any callbacks found');
fs.writeFileSync(file, after);
console.log('typed remaining evening slot transaction callbacks');
