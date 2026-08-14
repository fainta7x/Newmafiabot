import { Router } from 'express';
import { ensureSpeechRecordingSchema } from '../../db/ensureSpeechRecordingSchema.ts';
import speechRecordingRoutes from './speechRecordingRoutes.ts';

const router = Router();
let schemaReady: Promise<void> | null = null;

router.use(async (req, res, next) => {
  try {
    const db = (req as any).db;
    if (!schemaReady) {
      schemaReady = ensureSpeechRecordingSchema(db).catch((error) => {
        schemaReady = null;
        throw error;
      });
    }
    await schemaReady;
    next();
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось подготовить хранилище записей.' });
  }
});

router.use(speechRecordingRoutes);

export default router;
