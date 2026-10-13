import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { resetWhatsNewSchemaForTests } from '../db/ensureWhatsNewSchema.ts';
import { createApp } from '../app.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { createWhatsNew, deleteWhatsNew, listAllWhatsNew, listPublishedWhatsNew, updateWhatsNew } from '../server/services/whatsNewService.ts';

let db: DatabaseWrapper;
beforeEach(() => { resetWhatsNewSchemaForTests(); db = createDatabaseConnection(':memory:'); });
afterEach(() => { try { db.sqlite.close(); } catch {} });

describe('«Что нового»: written by the organizer, read by players', () => {
  it('starts with drafts only — nothing reaches the players before the owner publishes it', async () => {
    expect(await listPublishedWhatsNew(db)).toEqual([]);
    const all = await listAllWhatsNew(db);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((entry) => !entry.published)).toBe(true);
  });

  it('creates, edits, publishes, unpublishes and deletes', async () => {
    const created = await createWhatsNew(db, { title: '  Новый экран  ', body: 'Теперь можно так.' });
    expect(created).toMatchObject({ title: 'Новый экран', published: false, published_at: null });
    const published = await updateWhatsNew(db, created.id, { published: true });
    expect(published.published).toBe(true);
    expect(published.published_at).toBeTruthy();
    expect((await listPublishedWhatsNew(db)).map((entry) => entry.id)).toEqual([created.id]);
    const edited = await updateWhatsNew(db, created.id, { body: 'Исправленный текст' });
    expect(edited.body).toBe('Исправленный текст');
    expect(edited.published_at).toBe(published.published_at);
    await updateWhatsNew(db, created.id, { published: false });
    expect(await listPublishedWhatsNew(db)).toEqual([]);
    await deleteWhatsNew(db, created.id);
    await expect(deleteWhatsNew(db, created.id)).rejects.toMatchObject({ status: 404 });
  });

  it('shows the newest published notice first and refuses an empty or too long text', async () => {
    const first = await createWhatsNew(db, { title: 'Первое', published: true });
    await new Promise<void>((resolve) => { setTimeout(resolve, 5); });
    const second = await createWhatsNew(db, { title: 'Второе', published: true });
    expect((await listPublishedWhatsNew(db)).map((entry) => entry.id)).toEqual([second.id, first.id]);
    await expect(createWhatsNew(db, { title: '   ' })).rejects.toMatchObject({ status: 400 });
    await expect(createWhatsNew(db, { title: 'x'.repeat(121) })).rejects.toMatchObject({ status: 400 });
    await expect(createWhatsNew(db, { title: 'Ок', body: 'y'.repeat(1201) })).rejects.toMatchObject({ status: 400 });
  });

  it('is open to signed-in people only, and only organizers can write', async () => {
    const app = await createApp(db);
    expect((await request(app).get('/api/whats-new')).status).toBe(401);
    expect((await request(app).get('/api/whats-new/all')).status).toBe(401);
    expect((await request(app).post('/api/whats-new').send({ title: 'x' })).status).toBe(401);
    const cookie = `organizer_token=${generateOrganizerToken()}`;
    const made = await request(app).post('/api/whats-new').set('Cookie', cookie).send({ title: 'Через CRM', body: 'текст', published: true });
    expect(made.status).toBe(201);
    const list = await request(app).get('/api/whats-new').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body.entries[0]).toMatchObject({ title: 'Через CRM', published: true });
    expect((await request(app).delete(`/api/whats-new/${made.body.entry.id}`).set('Cookie', cookie)).status).toBe(204);
  });
});
