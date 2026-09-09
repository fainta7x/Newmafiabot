import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureVkPersonalMessageSchema } from '../../db/ensureVkPersonalMessageSchema.ts';
import { startVkMessageOutboxWorker } from './vkMessageOutboxService.ts';

export async function bootstrapVkMessageOutbox(
  db: DatabaseWrapper,
  startWorker: (database: DatabaseWrapper) => void = startVkMessageOutboxWorker,
) {
  await ensureVkPersonalMessageSchema(db);
  startWorker(db);
}
