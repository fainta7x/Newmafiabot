import { Router } from 'express';
import { ensureSpeechRecordingSchema } from '../../db/ensureSpeechRecordingSchema.ts';
import speechRecordingRoutes from './speechRecordingRoutes.ts';

const router = Router();
const schemaReadyByDb = new WeakMap<object, Promise<void>>();

router.use(async (req, res, next) => {
  try {
    const db = (req as any).db;
    if (!db || (typeof db !== 'object' && typeof db !== 'function')) {
      throw new Error('База данных недоступна.');
    }

    const dbKey = db as object;
    let schemaReady = schemaReadyByDb.get(dbKey);
    if (!schemaReady) {
      schemaReady = ensureSpeechRecordingSchema(db).catch((error) => {
        schemaReadyByDb.delete(dbKey);
        throw error;
      });
      schemaReadyByDb.set(dbKey, schemaReady);
    }

    await schemaReady;
    next();
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Не удалось подготовить хранилище записей.' });
  }
});

router.use(speechRecordingRoutes);

export default router;
