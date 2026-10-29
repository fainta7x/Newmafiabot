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
    expect(text).toContain('28 октября — день рождения! Дина, поздравляем!');
    expect(text).toContain('Дина, желаем');
    expect(text).not.toMatch(/мафи/i);
    expect(text).toContain('пятница, 30 октября, в 20:00 («Суп с Котом»)');
    expect(text).toContain('Запись на вечер: https://x/e');
  });

  it('uses the first name from the canonical profile instead of a nickname', async () => {
    await db.run("UPDATE players SET nickname='Dissonance', full_name='Дина Иванова' WHERE id='d'");
    const preview = await previewBirthdayPost(db, 'd', null);
    expect(preview.text).toContain('Дина, поздравляем!');
    expect(preview.text).not.toContain('Dissonance,');
  });

  it('renders a card without an avatar and refuses a hidden birthday', async () => {
    const preview = await previewBirthdayPost(db, 'd', null, { genitive: 'Дины' });
    expect(preview.has_avatar).toBe(false);
    expect(Buffer.from(preview.card_png_base64, 'base64').subarray(1, 4).toString()).toBe('PNG');
    await expect(previewBirthdayPost(db, 'h', null)).rejects.toBeInstanceOf(BirthdayPostError);
  });
});

describe('birthday post publication', () => {
  it('goes to every active Telegram destination once, keyed per destination', async () => {
    const db = createDatabaseConnection(':memory:');
    await ensurePlayerProfileIntegritySchema(db);
    await db.run("INSERT INTO players(id,nickname,birth_day,birth_month,birthday_visibility,tokens,created_at,updated_at) VALUES ('d','Дина',28,10,'full',0,'2026-10-01','2026-10-01')");
    await db.run("CREATE TABLE IF NOT EXISTS telegram_destinations (id TEXT PRIMARY KEY, chat_id TEXT, topic_id INTEGER, active INTEGER DEFAULT 1)");
    await db.run("INSERT INTO telegram_destinations(id,chat_id,topic_id,active) VALUES ('public','@c',NULL,1),('club','-1',5,1),('off','-2',NULL,0)");
    process.env.TELEGRAM_BOT_TOKEN = 't';
    const calls: any[] = [];
    const fetchImpl = (async (_url: string, init: any) => { calls.push(init.body.get('chat_id')); return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 }); }) as any;
    const { publishBirthdayPost } = await import('../server/services/birthdayPostService.ts');
    const first = await publishBirthdayPost(db, 'd', null, {}, fetchImpl, 'Наш согласованный текст');
    expect(first.telegram.map((t) => [t.destination, t.ok])).toEqual([['club', true], ['public', true]]);
    expect(calls.sort()).toEqual(['-1', '@c']);
    await publishBirthdayPost(db, 'd', null, {}, fetchImpl);
    expect(calls).toHaveLength(2);
    db.sqlite.close();
  });
});
