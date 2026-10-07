import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { buildAnonymizedSnapshot } from '../services/anonymizedSnapshotService.ts';

export function createDeveloperSnapshotHandler(build = buildAnonymizedSnapshot): RequestHandler {
  let inFlight = false;
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const key = String(process.env.DEVELOPMENT_SNAPSHOT_KEY || '');
    if (key.length < 32) { res.status(503).json({ error: 'Development snapshots are not configured' }); return; }
    const supplied = Buffer.from(String(req.header('X-Development-Snapshot-Key') || ''));
    const expected = Buffer.from(key);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      res.status(401).json({ error: 'Invalid snapshot credential' }); return;
    }
    if (inFlight) { res.status(429).json({ error: 'A snapshot is already being built' }); return; }
    inFlight = true;
    try {
      const { gzip, stats } = await build(req.db);
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', 'attachment; filename="development.sqlite.gz"');
      res.setHeader('X-Snapshot-Metadata', JSON.stringify({ ...stats, generatedAt: new Date().toISOString(), sha256: crypto.createHash('sha256').update(gzip).digest('hex') }));
      res.send(gzip);
    } catch {
      console.warn('[DEV SNAPSHOT] Export rejected; no snapshot returned');
      res.status(500).json({ error: 'Snapshot could not be safely exported' });
    } finally { inFlight = false; }
  };
}
