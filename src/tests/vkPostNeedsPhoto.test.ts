import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { sendVk } from '../server/services/eveningTodayPostService.ts';
import { listPendingVkManualPhotos, loadVkManualPhotoImage, markVkManualPhotoDone, saveVkManualPhoto } from '../server/services/vkManualPhotoService.ts';

describe('VK wall post when VK cannot take the picture', () => {
  const saved = { ...process.env };
  let db: DatabaseWrapper | null = null;
  afterEach(() => { process.env = { ...saved }; vi.unstubAllGlobals(); try { db?.sqlite.close(); } catch {} db = null; });

  // Owner, 2026-11-15 (variant «А»): no bare-text post — the organizer gets the text and the picture to post by hand.
  it('is not published as bare text: the post with its picture is handed to the organizer', async () => {
    process.env.VK_GROUP_ID = '212761164';
    process.env.VK_GROUP_ACCESS_TOKEN = 'community-token';
    delete process.env.VK_ACCESS_TOKEN;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ response: { post_id: 77 } })));
    vi.stubGlobal('fetch', fetchMock);
    db = createDatabaseConnection(':memory:');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const result: any = await sendVk('🏅 MVP вечера\nПоздравляем!', { db, eveningId: 'e1', format: 'club', image: { bytes: png, mime: 'image/png' }, context: { key: 'club:mvp-result-vk:e1', kind: 'club-result', entityId: 'e1' } });
    expect(result.error ?? null).toBeNull();
    expect(result.status).toBe('published');
    expect(result.manual).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    const pending = await listPendingVkManualPhotos(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].title).toBe('🏅 MVP вечера');
    expect(pending[0].post_text).toBe('🏅 MVP вечера\nПоздравляем!');
    expect(pending[0].post_url).toBeNull();
    expect((await loadVkManualPhotoImage(db, pending[0].id))?.bytes.equals(png)).toBe(true);
  });

  it('keeps one picture per post and drops it from the list once attached', async () => {
    db = createDatabaseConnection(':memory:');
    const png = Buffer.from([1, 2, 3]);
    const id = await saveVkManualPhoto(db, { postKey: 'k', title: 'Пост', mime: 'image/png', bytes: png });
    expect(id).toBeTruthy();
    // A retry of the same post is the same task, not a second one.
    expect(await saveVkManualPhoto(db, { postKey: 'k', title: 'Пост', mime: 'image/png', bytes: png })).toBe(id);
    expect(await listPendingVkManualPhotos(db)).toHaveLength(1);
    expect(await markVkManualPhotoDone(db, id!)).toBe(true);
    expect(await listPendingVkManualPhotos(db)).toHaveLength(0);
  });
});
