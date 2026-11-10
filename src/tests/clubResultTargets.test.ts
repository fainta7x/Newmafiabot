import { describe, expect, it } from 'vitest';
import { clubPostKind, clubResultTargets } from '../server/services/clubResultPostService.ts';

describe('where Telegram result posts go (owner, 2026-11-10)', () => {
  it('classifies posts by their delivery key', () => {
    expect(clubPostKind('club:vote-prompt:e1')).toBe('vote');
    expect(clubPostKind('club:mvp-runoff:e1')).toBe('vote');
    expect(clubPostKind('club:mvp-result:e1')).toBe('mvp-result');
    expect(clubPostKind('club:game:g1')).toBe('other');
  });
  it('club MVP: «Новости» topic of the main group; the result also to the entry channel', () => {
    expect(clubResultTargets('CASUAL', 'vote')).toEqual(['club_mvp']);
    expect(clubResultTargets('CASUAL', 'mvp-result')).toEqual(['club_mvp', 'public']);
  });
  it('novice MVP: «История» topic of the novice group; the result also to the entry channel', () => {
    expect(clubResultTargets('NOVICE', 'vote')).toEqual(['novice_mvp']);
    expect(clubResultTargets('NOVICE', 'mvp-result')).toEqual(['novice_mvp', 'public']);
  });
  it('rating and tournament: results to rating channel, entry channel and «Новости»; the vote only to the rating channel', () => {
    for (const format of ['RATING', 'TOURNAMENT']) {
      expect(clubResultTargets(format, 'vote')).toEqual(['rating']);
      expect(clubResultTargets(format, 'mvp-result')).toEqual(['rating', 'public', 'club_mvp']);
      expect(clubResultTargets(format, 'other')).toEqual(['rating', 'public', 'club_mvp']);
    }
  });
});

describe('MVP topic destinations are bootstrapped once', () => {
  it('club_mvp → «Новости», novice_mvp → «История», and a later CRM change is kept', async () => {
    const { createDatabaseConnection } = await import('../db/index.ts');
    const { ensureTelegramPublishingSchema } = await import('../db/ensureTelegramPublishingSchema.ts');
    const db = createDatabaseConnection(':memory:');
    await ensureTelegramPublishingSchema(db);
    expect(await db.get("SELECT chat_id, topic_id, active FROM telegram_destinations WHERE id='club_mvp'")).toMatchObject({ chat_id: '-1001628595679', topic_id: 5925, active: 1 });
    expect(await db.get("SELECT chat_id, topic_id, active FROM telegram_destinations WHERE id='novice_mvp'")).toMatchObject({ chat_id: '-1003925510303', topic_id: 134, active: 1 });
    await db.run("UPDATE telegram_destinations SET topic_id=999 WHERE id='club_mvp'");
    await ensureTelegramPublishingSchema(db);
    expect(await db.get("SELECT topic_id FROM telegram_destinations WHERE id='club_mvp'")).toMatchObject({ topic_id: 999 });
    db.sqlite.close();
  });
});
