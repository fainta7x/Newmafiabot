import { describe, expect, it } from 'vitest';
import { needsCurrentCommunicationAttention } from '../server/routes/tableScoutingRoutes';

describe('command center communication attention', () => {
  it('ignores stale tracked players who are no longer in the current evening audience', () => {
    expect(needsCurrentCommunicationAttention({ eligible_now: false, attention_status: 'failed' })).toBe(false);
    expect(needsCurrentCommunicationAttention({ eligible_now: false, attention_status: 'not_sent' })).toBe(false);
    expect(needsCurrentCommunicationAttention({ eligible_now: false, attention_status: 'unanswered' })).toBe(false);
  });

  it('keeps only current eligible players who still need communication attention', () => {
    expect(needsCurrentCommunicationAttention({ eligible_now: true, attention_status: 'failed' })).toBe(true);
    expect(needsCurrentCommunicationAttention({ eligible_now: true, attention_status: 'not_sent' })).toBe(true);
    expect(needsCurrentCommunicationAttention({ eligible_now: true, attention_status: 'unanswered' })).toBe(true);
    expect(needsCurrentCommunicationAttention({ eligible_now: true, attention_status: 'answered' })).toBe(false);
  });

  it('a draft evening is not announced yet: no «Анонс не отправлен» before publication (owner, 2026-11-16)', () => {
    expect(needsCurrentCommunicationAttention({ eligible_now: true, attention_status: 'not_published' })).toBe(false);
  });
});

import { createDatabaseConnection } from '../db/index.ts';
import { loadAnnouncementOverview } from '../server/services/eveningAnnouncementTrackingService.ts';

describe('announcement overview before publication (owner, 2026-11-16)', () => {
  it('a draft evening (any format) counts nobody as «Анонс не отправлен»; after publication the unsent are counted again', async () => {
    const db = createDatabaseConnection(':memory:');
    try {
      // The columns other schema guards add in the running app.
      for (const column of ['game_level TEXT', 'from_other_city INTEGER', 'contact_status TEXT', 'lifecycle_status TEXT', 'do_not_invite_until TEXT', 'telegram_username TEXT', 'phone TEXT']) await db.run(`ALTER TABLE players ADD COLUMN ${column}`).catch(() => undefined);
      for (const column of ['registration_status TEXT', 'response_status TEXT']) await db.run(`ALTER TABLE evening_participants ADD COLUMN ${column}`).catch(() => undefined);
      await db.run("INSERT INTO players(id,nickname,tokens,telegram_user_id,created_at,updated_at) VALUES ('p1','Алоэ',0,'101','x','x')");
      await db.run("INSERT INTO game_evenings(id,title,starts_at,format,status,created_at,updated_at) VALUES ('e1','Клубный','2099-01-01T16:00:00Z','CASUAL','draft','x','x')");
      const draft = await loadAnnouncementOverview(db, 'e1');
      expect(draft!.summary.not_sent).toBe(0);
      expect(draft!.players.filter(needsCurrentCommunicationAttention)).toEqual([]);
      await db.run("UPDATE game_evenings SET status='published' WHERE id='e1'");
      const published = await loadAnnouncementOverview(db, 'e1');
      expect(published!.summary.not_sent).toBe(1);
      expect(published!.players.filter(needsCurrentCommunicationAttention).map((p: any) => p.attention_status)).toEqual(['not_sent']);
    } finally { db.sqlite.close(); }
  });
});
