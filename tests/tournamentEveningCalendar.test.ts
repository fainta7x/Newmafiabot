import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabaseConnection, type DatabaseWrapper } from '../src/db/index.ts';
import { createApp } from '../src/app.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../src/server/auth.ts';

describe('TOURNAMENT-EVENING-001 player calendar isolation', () => {
  let db: DatabaseWrapper;
  let app: Awaited<ReturnType<typeof createApp>>;
  let organizerToken: string;

  beforeEach(async () => {
    process.env.ORGANIZER_NOTIFICATION_IDS = '';
    process.env.ORGANIZER_CHAT_ID = '';
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    organizerToken = generateOrganizerToken();
  });

  afterEach(() => db.sqlite.close());

  const addPlayer = async (id: string, judge = false) => {
    const now = new Date().toISOString();
    await db.run(`INSERT INTO players
      (id,nickname,contact_status,lifecycle_status,elo,tokens,created_at,updated_at,game_level,judge_level)
      VALUES (?,?,'normal','normal',1000,0,?,?,'tournament',?)`, [id, id, now, now, judge ? 'judge' : 'none']);
  };

  const createManagedTournament = async () => {
    await addPlayer('calendar-judge', true);
    const response = await request(app)
      .post('/api/tournaments/evenings')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Календарный турнир',
        date: '2026-10-12T17:00:00.000Z',
        venue: 'Суп с котом',
        judge_player_id: 'calendar-judge',
        player_capacity: 10,
        entry_fee_rub: 500,
        prize_fund_rub: 1000,
        prize_allocations: [{ place: '1', amount_rub: 1000 }],
      });
    expect(response.status).toBe(201);
    await request(app)
      .post(`/api/tournaments/evenings/${response.body.id}/publish`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(200);
    return String(response.body.id);
  };

  it('shows managed tournament evenings but never exposes a published legacy canonical tournament', async () => {
    await addPlayer('calendar-player');
    const managedId = await createManagedTournament();
    const now = new Date().toISOString();
    await db.run(`INSERT INTO tournaments
      (id,title,date,venue,stage,status,chief_judge_name,notes,game_count,created_at,updated_at,published_at)
      VALUES ('legacy-calendar','Legacy published tournament','2026-10-13T17:00:00.000Z','legacy','final','draft','Legacy judge','historical',10,?,?,?)`, [now, now, now]);

    const cookie = `player_token=${generatePlayerSessionToken('calendar-player')}`;
    const response = await request(app).get('/api/player/calendar?month=2026-10').set('Cookie', cookie);
    expect(response.status).toBe(200);
    const tournaments = response.body.events.filter((event: any) => event.event_type === 'tournament');
    expect(tournaments.map((event: any) => event.id)).toContain(managedId);
    expect(tournaments.map((event: any) => event.id)).not.toContain('legacy-calendar');
    expect(tournaments.find((event: any) => event.id === managedId)?.registration_open).toBe(true);
  });

  it('reports registration_open only while the managed tournament is still draft and not closed', async () => {
    await addPlayer('calendar-player');
    const managedId = await createManagedTournament();
    const cookie = `player_token=${generatePlayerSessionToken('calendar-player')}`;

    await request(app)
      .post(`/api/tournaments/evenings/${managedId}/registration/close`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(200);
    let response = await request(app).get('/api/player/calendar?month=2026-10').set('Cookie', cookie);
    expect(response.body.events.find((event: any) => event.id === managedId)?.registration_open).toBe(false);

    await db.run("UPDATE tournaments SET registration_closed_at=NULL,status='active' WHERE id=?", [managedId]);
    response = await request(app).get('/api/player/calendar?month=2026-10').set('Cookie', cookie);
    expect(response.body.events.find((event: any) => event.id === managedId)?.registration_open).toBe(false);
  });

  it('uses one canonical personal-notification delivery when a tournament player has both Telegram and VK identities', async () => {
    await addPlayer('dual-channel-player');
    await db.run('UPDATE players SET telegram_user_id=? WHERE id=?', ['7001', 'dual-channel-player']);
    const now = new Date().toISOString();
    await db.run(`INSERT INTO player_external_identities
      (platform,external_user_id,player_id,screen_name,display_name,linked_at,updated_at)
      VALUES ('vk','8001','dual-channel-player','dual','Dual channel',?,?)`, [now, now]);

    const managedId = await createManagedTournament();
    const deliveries = await db.all<any>(
      "SELECT notification_key,selected_channel,channel_target FROM personal_notification_deliveries WHERE player_id=? AND event_type='tournament_published' AND entity_id=?",
      ['dual-channel-player', managedId],
    );
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ selected_channel: 'telegram', channel_target: '7001' });
  });
});