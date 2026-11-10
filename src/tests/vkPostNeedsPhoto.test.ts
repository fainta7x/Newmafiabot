import { afterEach, describe, expect, it } from 'vitest';
import { sendVk } from '../server/services/eveningTodayPostService.ts';

describe('VK wall post without a photo', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('is not sent when no personal VK key can upload the picture', async () => {
    process.env.VK_GROUP_ID = '212761164';
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    delete process.env.VK_ACCESS_TOKEN;
    const result: any = await sendVk('Привет!', { db: {} as any, eveningId: 'e1', format: 'club' });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('личный ключ ВК');
  });

  it('may still be sent as text when the caller asks for no photo', async () => {
    process.env.VK_GROUP_ID = '';
    delete process.env.VK_GROUP_ACCESS_TOKEN;
    const result: any = await sendVk('Привет!', { db: {} as any, eveningId: 'e1', format: 'club', noPhoto: true });
    expect(result.error).not.toContain('личный ключ ВК');
  });
});
