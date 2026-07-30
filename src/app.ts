import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { DatabaseWrapper, getDb } from './db/index.ts';
import { parseUserSession } from './server/auth.ts';

import authRoutes from './server/routes/authRoutes.ts';
import eveningsRoutes from './server/routes/eveningsRoutes.ts';
import participantRoutes from './server/routes/participantRoutes.ts';
import playersRoutes from './server/routes/playersRoutes.ts';
import tasksRoutes from './server/routes/tasksRoutes.ts';
import analyticsRoutes from './server/routes/analyticsRoutes.ts';
import gamesRoutes from './server/routes/gamesRoutes.ts';
import crmRoutes from './server/routes/crmRoutes.ts';
import publicRoutes from './server/routes/publicRoutes.ts';
import tournamentsRoutes from './server/routes/tournamentsRoutes.ts';

export async function createApp(customDb?: DatabaseWrapper) {
  const app = express();

  // Helmet for security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Enabled/disabled or configured for Vite inline scripts
    })
  );

  app.use(express.json());
  app.use(cookieParser());

  // Attach database instance to request
  const db = customDb || (await getDb());
  app.use((req, _res, next) => {
    (req as any).db = db;
    next();
  });

  // Global Auth Session Parser
  app.use(parseUserSession);

  // Registered Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/crm', crmRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/evenings', eveningsRoutes);
  app.use('/api/participant', participantRoutes);
  app.use('/api/evening-participants', participantRoutes);
  app.use('/api/players', playersRoutes);
  app.use('/api/tasks', tasksRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/games', gamesRoutes);
  app.use('/api/tournaments', tournamentsRoutes);

  // Vite development or static distribution in production
  if (process.env.NODE_ENV !== 'production' && !process.env.VITEST) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}
