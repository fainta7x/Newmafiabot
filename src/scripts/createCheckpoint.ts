import { getDb } from '../db/index.ts';
import { createPreviewCheckpoint } from '../db/previewDatabaseCheckpoint.ts';

async function run() {
  try {
    const db = await getDb();
    console.log('Creating preview database checkpoint in recovery storage...');
    const result = await createPreviewCheckpoint(db);
    if (result.success) {
      console.log(result.message);
      process.exit(0);
    } else {
      console.error(result.message);
      process.exit(1);
    }
  } catch (err) {
    console.error('Failed to create preview checkpoint:', err);
    process.exit(1);
  }
}

run();
