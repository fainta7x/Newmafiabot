import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { sendVk } from '../server/services/eveningTodayPostService.ts';
import { listPendingVkManualPhotos, loadVkManualPhotoImage, markVkManualPhotoDone, saveVkManualPhoto } from '../server/services/vkManualPhotoService.ts';

describe('VK wall post when VK cannot take the picture', () => {
  const saved = { ...process.env };
  let db: DatabaseWrapper | null = null;
  afterEach(() => { process.env = { ...saved }; vi.unstubAllGlobals(); try { db?.sqlite.close(); } catch {} db = null; });

  it('goes out as text and keeps the picture for manual attaching', async () => {
    process.env.VK_GROUP_ID = '212761164';
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    delete process.env.VK_ACCESS_TOKEN;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ response: { post_id: 77 } }))));
    db = createDatabaseConnection(':memory:');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const result: any = await sendVk('🏅 MVP вечера\nПоздравляем!', { db, eveningId: 'e1', format: 'club', image: { bytes: png, mime: 'image/png' }, context: { key: 'club:mvp-result-vk:e1', kind: 'club-result', entityId: 'e1' } });
    expect(result.error ?? null).toBeNull();
    expect(result.status).toBe('published');
    const pending = await listPendingVkManualPhotos(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].title).toBe('🏅 MVP вечера');
    expect((await loadVkManualPhotoImage(db, pending[0].id))?.bytes.equals(png)).toBe(true);
  });

  it('keeps one picture per post and drops it from the list once attached', async () => {
    db = createDatabaseConnection(':memory:');
    const png = Buffer.from([1, 2, 3]);
    const id = await saveVkManualPhoto(db, { postKey: 'k', title: 'Пост', mime: 'image/png', bytes: png });
    expect(id).toBeTruthy();
    expect(await saveVkManualPhoto(db, { postKey: 'k', title: 'Пост', mime: 'image/png', bytes: png })).toBeNull();
    expect(await markVkManualPhotoDone(db, id!)).toBe(true);
    expect(await listPendingVkManualPhotos(db)).toHaveLength(0);
  });
});
