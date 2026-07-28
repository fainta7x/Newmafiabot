import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

import { parseUserSession } from './src/server/auth.ts';
import { migrateLegacyData } from './src/db/migrateLegacyData.ts';

import authRoutes from './src/server/routes/authRoutes.ts';
import eveningsRoutes from './src/server/routes/eveningsRoutes.ts';
import participantRoutes from './src/server/routes/participantRoutes.ts';
import playersRoutes from './src/server/routes/playersRoutes.ts';
import tasksRoutes from './src/server/routes/tasksRoutes.ts';
import analyticsRoutes from './src/server/routes/analyticsRoutes.ts';
import gamesRoutes from './src/server/routes/gamesRoutes.ts';
import legacyRoutes from './src/server/routes/legacyRoutes.ts';

dotenv.config();

async function startServer() {
  // Run SQLite legacy migration if necessary
  try {
    await migrateLegacyData();
  } catch (err) {
    console.error('Error running legacy DB migration:', err);
  }

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Attach session parser
  app.use(parseUserSession);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/evenings', eveningsRoutes);
  app.use('/api/evening-participants', participantRoutes);
  app.use('/api/players', playersRoutes);
  app.use('/api/tasks', tasksRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/games', gamesRoutes);
  app.use('/api', legacyRoutes);

  // Vite or Production Static Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((e) => {
  console.error('Failed to start server:', e);
});
