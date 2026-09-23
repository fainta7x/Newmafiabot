import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../server/auth.ts', () => ({ requireOrganizerAuth: (_req: any, _res: any, next: any) => next() }));
vi.mock('../server/services/telegramSyncOutboxService.ts', () => ({
  getTelegramSyncOutboxSummary: async () => ({ pending: 0, retrying: 0, last_attempt_at: null, next_attempt_at: null, last_error: null }),
}));
vi.mock('../server/services/sqliteBackupStatusService.ts', () => ({ getSqliteBackupStatus: async () => ({ ok: true }) }));

const { default: systemStatusRoutes } = await import('../server/routes/systemStatusRoutes.ts');

const statusFor = async (rows: Array<{ id: string; chat_id: string | null; active: number }>) => {
  const app = express();
  app.use((req: any, _res, next) => { req.db = { all: async () => rows }; next(); });
  app.use('/api/system-status', systemStatusRoutes);
  const response = await request(app).get('/api/system-status');
  return response.body.telegram;
};

describe('system status Telegram destinations', () => {
  it('is healthy when every enabled destination has a chat, even if optional ones are off', async () => {
    const telegram = await statusFor([
      { id: 'public', chat_id: null, active: 0 },
      { id: 'novice', chat_id: null, active: 0 },
      { id: 'club', chat_id: '-100123', active: 1 },
      { id: 'rating', chat_id: null, active: 0 },
    ]);
    expect(telegram).toMatchObject({ ok: true, configured: 1, active: 1, total: 4 });
  });

  it('fails when an enabled destination has no chat', async () => {
    const telegram = await statusFor([
      { id: 'club', chat_id: '-100123', active: 1 },
      { id: 'public', chat_id: '', active: 1 },
    ]);
    expect(telegram.ok).toBe(false);
  });

  it('fails when nothing is enabled', async () => {
    expect((await statusFor([{ id: 'club', chat_id: '-100123', active: 0 }])).ok).toBe(false);
  });
});
