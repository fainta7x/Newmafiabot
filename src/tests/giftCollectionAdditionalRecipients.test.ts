import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureGiftCollectionSchema } from '../db/ensureGiftCollectionSchema.ts';
import { addGiftCollectionRecipients, GiftCollectionError } from '../server/services/giftCollectionService.ts';

describe('adding participants to birthday gift collections', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await ensureGiftCollectionSchema(db);
    await db.run("INSERT INTO players(id,nickname,created_at,updated_at) VALUES ('d','Дина','2026-10-01','2026-10-01'),('p','Перец','2026-10-01','2026-10-01')");
    await db.run("INSERT INTO gift_collections(id,honoree_player_id,status,created_at) VALUES ('c','d','open','2026-10-29')");
    await db.run("INSERT INTO gift_contributions(collection_id,player_id,status,channel,created_at,updated_at) VALUES ('c','p','paid','none','2026-10-29','2026-10-29')");
  });
  afterEach(() => db.sqlite.close());

  it('refuses to re-invite an existing contributor without changing payments', async () => {
    await expect(addGiftCollectionRecipients(db, 'c', ['p'], 'organizer')).rejects.toMatchObject({ status: 409, code: 'ineligible' });
    const row = await db.get<any>("SELECT status FROM gift_contributions WHERE collection_id='c' AND player_id='p'");
    expect(row.status).toBe('paid');
  });

  it('does not allow adding the birthday person or invite after collection closure', async () => {
    await expect(addGiftCollectionRecipients(db, 'c', ['d'], 'organizer')).rejects.toBeInstanceOf(GiftCollectionError);
    await db.run("UPDATE gift_collections SET status='closed' WHERE id='c'");
    await expect(addGiftCollectionRecipients(db, 'c', ['p'], 'organizer')).rejects.toMatchObject({ code: 'closed' });
  });
});
