import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensurePlayerProfileIntegritySchema } from '../db/ensurePlayerProfileIntegritySchema.ts';
import { birthdayPostText, previewBirthdayPost, BirthdayPostError } from '../server/services/birthdayPostService.ts';

describe('birthday congratulation post', () => {
  let db: DatabaseWrapper;
  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await ensurePlayerProfileIntegritySchema(db);
    await db.run("INSERT INTO players(id,nickname,birth_day,birth_month,birthday_visibility,tokens,created_at,updated_at) VALUES ('d','Дина',28,10,'full',0,'2026-10-01','2026-10-01'),('h','Скрытный',1,1,'hidden',0,'2026-10-01','2026-10-01')");
  });
  afterEach(() => db.sqlite.close());

  it('uses the approved wording and the evening invitation', () => {
    const text = birthdayPostText({ nickname: 'Дина', day: 28, month: 10, eveningStartsAt: '2026-10-30T20:00:00+03:00', venue: 'Суп с Котом', link: 'https://x/e', genitive: 'Дины', pronoun: 'её' });
    expect(text).toContain('28 октября у Дины был день рождения!');
    expect(text).not.toMatch(/мафи/i);
    expect(text).toContain('пятница, 30 октября, в 20:00 («Суп с Котом»)');
    expect(text).toContain('Запись на вечер: https://x/e');
  });

  it('renders a card without an avatar and refuses a hidden birthday', async () => {
    const preview = await previewBirthdayPost(db, 'd', null, { genitive: 'Дины' });
    expect(preview.has_avatar).toBe(false);
    expect(Buffer.from(preview.card_png_base64, 'base64').subarray(1, 4).toString()).toBe('PNG');
    await expect(previewBirthdayPost(db, 'h', null)).rejects.toBeInstanceOf(BirthdayPostError);
  });
});
