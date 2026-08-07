import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';

let app: any;
let db: DatabaseWrapper;
let organizerCookie: string;
const playerId = 'test-player-avatar-123';

// 1x1 valid JPEG Buffer
const tinyJpegBuffer = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
  0x00, 0x60, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
  0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
  0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
  0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x08,
  0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x37, 0xFF, 0xD9
]);
const tinyJpegBase64 = `data:image/jpeg;base64,${tinyJpegBuffer.toString('base64')}`;

beforeEach(async () => {
  db = createDatabaseConnection(':memory:');
  app = await createApp(db);

  const token = generateOrganizerToken();
  organizerCookie = `organizer_token=${token}`;

  // Insert a test player
  await db.run(
    `INSERT INTO players (id, nickname, phone, contact_status, created_at, updated_at)
     VALUES (?, ?, ?, 'normal', ?, ?)`,
    [playerId, 'Bogdan', '+79991234567', new Date().toISOString(), new Date().toISOString()]
  );
});

describe('Player Avatar Management Tests', () => {
  it('should verify player_avatars table and index creation', () => {
    const tableInfo = db.sqlite.pragma("table_info(player_avatars)") as any[];
    expect(tableInfo.length).toBeGreaterThan(0);
    
    const hasPlayerId = tableInfo.some(col => col.name === 'player_id');
    const hasImageData = tableInfo.some(col => col.name === 'image_data');
    expect(hasPlayerId).toBe(true);
    expect(hasImageData).toBe(true);

    const indexList = db.sqlite.pragma("index_list(player_avatars)") as any[];
    expect(indexList.length).toBeGreaterThan(0);
  });

  it('should enforce authorization on avatar endpoints', async () => {
    const getRes = await request(app).get(`/api/players/${playerId}/avatar`);
    expect(getRes.status).toBe(401);

    const putRes = await request(app)
      .put(`/api/players/${playerId}/avatar`)
      .send({ data_url: tinyJpegBase64, width: 512, height: 512 });
    expect(putRes.status).toBe(401);

    const deleteRes = await request(app).delete(`/api/players/${playerId}/avatar`);
    expect(deleteRes.status).toBe(401);
  });

  it('should successfully upload (PUT) and retrieve (GET) the avatar, storing as a BLOB', async () => {
    // 1. Upload
    const putRes = await request(app)
      .put(`/api/players/${playerId}/avatar`)
      .set('Cookie', organizerCookie)
      .send({ data_url: tinyJpegBase64, width: 512, height: 512 });
    expect(putRes.status).toBe(200);
    expect(putRes.body.success).toBe(true);
    expect(putRes.body.updated_at).toBeDefined();

    // 2. Retrieve via GET endpoint
    const getRes = await request(app)
      .get(`/api/players/${playerId}/avatar`)
      .set('Cookie', organizerCookie);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data_url).toBe(tinyJpegBase64);
    expect(getRes.body.mime_type).toBe('image/jpeg');
    expect(getRes.body.byte_size).toBe(tinyJpegBuffer.length);
    expect(getRes.body.width).toBe(512);
    expect(getRes.body.height).toBe(512);

    // 3. Verify in-database BLOB storage directly
    const row = db.sqlite.prepare('SELECT image_data FROM player_avatars WHERE player_id = ?').get(playerId) as any;
    expect(row).toBeDefined();
    expect(Buffer.isBuffer(row.image_data)).toBe(true);
    expect(row.image_data.equals(tinyJpegBuffer)).toBe(true);
  });

  it('should include avatar_updated_at metadata in players list and detail responses', async () => {
    // 1. Initially should be null or missing
    const detailBefore = await request(app)
      .get(`/api/players/${playerId}`)
      .set('Cookie', organizerCookie);
    expect(detailBefore.status).toBe(200);
    expect(detailBefore.body.avatar_updated_at).toBeNull();

    // 2. Upload
    await request(app)
      .put(`/api/players/${playerId}/avatar`)
      .set('Cookie', organizerCookie)
      .send({ data_url: tinyJpegBase64, width: 512, height: 512 });

    // 3. Check detailed card metadata
    const detailAfter = await request(app)
      .get(`/api/players/${playerId}`)
      .set('Cookie', organizerCookie);
    expect(detailAfter.status).toBe(200);
    expect(detailAfter.body.avatar_updated_at).not.toBeNull();
    expect(detailAfter.body.avatar_updated_at).toBeDefined();

    // 4. Check players list metadata
    const listRes = await request(app)
      .get('/api/players')
      .set('Cookie', organizerCookie);
    expect(listRes.status).toBe(200);
    const pInList = listRes.body.find((p: any) => p.id === playerId);
    expect(pInList).toBeDefined();
    expect(pInList.avatar_updated_at).not.toBeNull();
  });

  it('should correctly replace existing avatar without adding duplicate rows', async () => {
    // Upload first avatar
    await request(app)
      .put(`/api/players/${playerId}/avatar`)
      .set('Cookie', organizerCookie)
      .send({ data_url: tinyJpegBase64, width: 512, height: 512 });

    // Replace with secondary size
    const putRes2 = await request(app)
      .put(`/api/players/${playerId}/avatar`)
      .set('Cookie', organizerCookie)
      .send({ data_url: tinyJpegBase64, width: 256, height: 256 });
    expect(putRes2.status).toBe(200);

    // Verify only 1 row exists
    const rows = db.sqlite.prepare('SELECT COUNT(*) as count FROM player_avatars WHERE player_id = ?').all(playerId) as any[];
    expect(rows[0].count).toBe(1);

    // Verify it updated correctly
    const avatar = db.sqlite.prepare('SELECT width FROM player_avatars WHERE player_id = ?').get(playerId) as any;
    expect(avatar.width).toBe(256);
  });

  it('should reject invalid image format and malformed Base64', async () => {
    // 1. PNG prefix
    const pngRes = await request(app)
      .put(`/api/players/${playerId}/avatar`)
      .set('Cookie', organizerCookie)
      .send({ data_url: 'data:image/png;base64,iVBORw0KGg==', width: 512, height: 512 });
    expect(pngRes.status).toBe(400);

    // 2. Malformed Base64 payload
    const malformedB64 = await request(app)
      .put(`/api/players/${playerId}/avatar`)
      .set('Cookie', organizerCookie)
      .send({ data_url: 'data:image/jpeg;base64,malformed_chars_!@#', width: 512, height: 512 });
    expect(malformedB64.status).toBe(400);

    // 3. Not valid JPEG starts/ends bytes
    const invalidBytes = Buffer.from([0x11, 0x22, 0x33, 0x44]);
    const invalidBytesRes = await request(app)
      .put(`/api/players/${playerId}/avatar`)
      .set('Cookie', organizerCookie)
      .send({ data_url: `data:image/jpeg;base64,${invalidBytes.toString('base64')}`, width: 512, height: 512 });
    expect(invalidBytesRes.status).toBe(400);
  });

  it('should enforce 700 KB maximum decoded size limit', async () => {
    const largeBuffer = Buffer.alloc(701 * 1024); // 701 KB
    largeBuffer[0] = 0xFF;
    largeBuffer[1] = 0xD8;
    largeBuffer[2] = 0xFF;
    largeBuffer[largeBuffer.length - 2] = 0xFF;
    largeBuffer[largeBuffer.length - 1] = 0xD9;

    const largeRes = await request(app)
      .put(`/api/players/${playerId}/avatar`)
      .set('Cookie', organizerCookie)
      .send({ data_url: `data:image/jpeg;base64,${largeBuffer.toString('base64')}`, width: 512, height: 512 });
    expect(largeRes.status).toBe(400);
    expect(largeRes.body.error).toContain('700 КБ');
  });

  it('should support idempotent deletion', async () => {
    // 1. Upload first
    await request(app)
      .put(`/api/players/${playerId}/avatar`)
      .set('Cookie', organizerCookie)
      .send({ data_url: tinyJpegBase64, width: 512, height: 512 });

    // 2. Delete first time
    const deleteRes1 = await request(app)
      .delete(`/api/players/${playerId}/avatar`)
      .set('Cookie', organizerCookie);
    expect(deleteRes1.status).toBe(200);

    const row = db.sqlite.prepare('SELECT 1 FROM player_avatars WHERE player_id = ?').get(playerId);
    expect(row).toBeUndefined();

    // 3. Delete second time (idempotent)
    const deleteRes2 = await request(app)
      .delete(`/api/players/${playerId}/avatar`)
      .set('Cookie', organizerCookie);
    expect(deleteRes2.status).toBe(200);
  });

  it('should delete associated avatar on player cascade deletion', async () => {
    // 1. Upload first
    await request(app)
      .put(`/api/players/${playerId}/avatar`)
      .set('Cookie', organizerCookie)
      .send({ data_url: tinyJpegBase64, width: 512, height: 512 });

    // 2. Cascade delete player from table
    await db.run('DELETE FROM players WHERE id = ?', [playerId]);

    // 3. Verify avatar is deleted
    const row = db.sqlite.prepare('SELECT 1 FROM player_avatars WHERE player_id = ?').get(playerId);
    expect(row).toBeUndefined();
  });
});
