import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureEloSeedSchema } from '../db/ensureEloSeedSchema.ts';
import { ensureJudgeAuthoritySchema } from '../db/ensureJudgeAuthoritySchema.ts';
import { registerNewPlayer } from '../server/services/playerRegistrationService.ts';

let db: DatabaseWrapper | null = null;

const createDb = async () => {
  db = createDatabaseConnection(':memory:');
  await ensureJudgeAuthoritySchema(db);
  await ensureEloSeedSchema(db);
  return db;
};

afterEach(() => {
  try { db?.sqlite.close(); } catch {}
  db = null;
});

describe('canonical Telegram player registration', () => {
  it('creates a novice profile linked to Telegram', async () => {
    const database = await createDb();
    const result = await registerNewPlayer(database, {
      telegramUserId: 123456,
      telegramUsername: '@new_player',
      fullName: 'Новый Игрок',
      nickname: 'Новичок',
    });

    expect(result.created).toBe(true);
    expect(result.player.nickname).toBe('Новичок');
    expect(result.player.telegram_user_id).toBe('123456');
    expect(result.player.telegram_username).toBe('new_player');
    expect(result.player.game_level).toBe('novice');
    expect(result.player.judge_level).toBe('none');
    expect(result.player.elo).toBe(1000);
    expect(result.player.elo_seed).toBe(1000);
    expect(result.player.tokens).toBe(0);
  });

  it('is idempotent for the same Telegram account', async () => {
    const database = await createDb();
    const first = await registerNewPlayer(database, {
      telegramUserId: 777,
      nickname: 'Первый ник',
    });
    const second = await registerNewPlayer(database, {
      telegramUserId: 777,
      nickname: 'Другой ник',
    });

    expect(second.created).toBe(false);
    expect(second.player.id).toBe(first.player.id);
    expect(second.player.nickname).toBe('Первый ник');

    const rows = await database.all('SELECT id FROM players WHERE telegram_user_id = ?', ['777']);
    expect(rows).toHaveLength(1);
  });

  it('refuses to create a duplicate nickname for another Telegram account', async () => {
    const database = await createDb();
    await registerNewPlayer(database, {
      telegramUserId: 111,
      nickname: 'Матроскина',
    });

    await expect(registerNewPlayer(database, {
      telegramUserId: 222,
      nickname: 'матроскина',
    })).rejects.toMatchObject({
      code: 'nickname_taken',
      status: 409,
    });
  });
});
