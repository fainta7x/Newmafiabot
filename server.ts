import dotenv from 'dotenv';
import { createApp } from './src/app.ts';
import { getDb } from './src/db/index.ts';

dotenv.config();

async function startServer() {
  const db = await getDb();
  const app = await createApp(db);
  const PORT = 3000;

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mafia CRM Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((e) => {
  console.error('Failed to start server:', e);
  process.exit(1);
});
