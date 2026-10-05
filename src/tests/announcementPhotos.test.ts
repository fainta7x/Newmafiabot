import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import {
  addAnnouncementPhoto,
  announcementCoverUrl,
  deleteAnnouncementPhoto,
  listAnnouncementPhotos,
  loadAnnouncementPhoto,
  pickAnnouncementPhotoId,
  setAnnouncementPhotoAudience,
} from '../server/services/announcementPhotoService.ts';

let db: DatabaseWrapper | null = null;
afterEach(() => { try { db?.sqlite.close(); } catch { /* closed */ } db = null; });

const jpeg = (marker: number) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, marker, 1, 2, 3]).toString('base64');
const open = () => { db = createDatabaseConnection(':memory:'); return db; };

describe('club photos for announcements', () => {
  it('stores a real picture and refuses other files', async () => {
    const database = open();
    const photo = await addAnnouncementPhoto(database, { base64: `data:image/jpeg;base64,${jpeg(1)}`, audience: 'novice' });
    expect(photo).toMatchObject({ audience: 'NOVICE', mime: 'image/jpeg', size: 8 });
    expect((await loadAnnouncementPhoto(database, photo.id))?.bytes.length).toBe(8);
    await expect(addAnnouncementPhoto(database, { base64: Buffer.from('<svg></svg>').toString('base64'), audience: 'all' }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(addAnnouncementPhoto(database, { base64: jpeg(2), audience: 'everyone' }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(addAnnouncementPhoto(database, { base64: '', audience: 'all' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('picks a photo of the evening kind or for all evenings, the same one for the same evening', async () => {
    const database = open();
    expect(await pickAnnouncementPhotoId(database, 'ev-1', 'CASUAL')).toBeNull();
    const novice = await addAnnouncementPhoto(database, { base64: jpeg(1), audience: 'NOVICE' });
    const all = await addAnnouncementPhoto(database, { base64: jpeg(2), audience: 'all' });
    const club = await addAnnouncementPhoto(database, { base64: jpeg(3), audience: 'CASUAL' });

    const forClub = new Set<string | null>();
    for (let index = 0; index < 20; index += 1) forClub.add(await pickAnnouncementPhotoId(database, `ev-${index}`, 'CASUAL'));
    expect([...forClub].sort()).toEqual([all.id, club.id].sort());
    expect(await pickAnnouncementPhotoId(database, 'ev-7', 'NOVICE')).toBe(await pickAnnouncementPhotoId(database, 'ev-7', 'NOVICE'));
    expect([novice.id, all.id]).toContain(await pickAnnouncementPhotoId(database, 'ev-7', 'NOVICE'));

    await setAnnouncementPhotoAudience(database, all.id, 'RATING');
    expect(await pickAnnouncementPhotoId(database, 'ev-3', 'CASUAL')).toBe(club.id);
    expect(await pickAnnouncementPhotoId(database, 'ev-3', 'TOURNAMENT')).toBe(all.id);

    // No photo for this kind of evening left: any club photo is used, a post never goes out bare while photos exist.
    await deleteAnnouncementPhoto(database, club.id);
    expect([novice.id, all.id]).toContain(await pickAnnouncementPhotoId(database, 'ev-3', 'CASUAL'));
    expect((await listAnnouncementPhotos(database)).map((photo) => photo.id)).toEqual([novice.id, all.id]);
  });

  it('gives the bot a public https address only', async () => {
    const database = open();
    const photo = await addAnnouncementPhoto(database, { base64: jpeg(1), audience: 'all' });
    expect(await announcementCoverUrl(database, 'https://club.example/', 'ev', 'CASUAL')).toBe(`https://club.example/announce-photo/${photo.id}.jpg`);
    expect(await announcementCoverUrl(database, 'http://localhost:3000', 'ev', 'CASUAL')).toBeNull();
  });
});
