import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../db/ensureOrganizerPlayerAccessSchema.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';

describe('CRM player access profile', () => {
  let db: DatabaseWrapper;
  let app: Awaited<ReturnType<typeof createApp>>;
  const now = '2026-09-10T06:00:00.000Z';

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
  });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  const insertPlayer = async (id: string, nickname = id, source = 'crm_manual') => {
    await db.run(`
      INSERT INTO players
        (id,nickname,telegram_user_id,lifecycle_status,source,game_level,club_role,judge_level,created_at,updated_at)
      VALUES (?, ?, ?, 'normal', ?, 'unrated', 'member', 'none', ?, ?)
    `, [id, nickname, `${id}-tg`, source, now, now]);
  };

  const organizerCookie = () => `organizer_token=${generateOrganizerToken()}`;

  it('persists each classification field independently, combined, and survives refetch', async () => {
    await insertPlayer('profile');

    for (const patch of [
      { game_level: 'tournament' },
      { club_role: 'team' },
      { judge_level: 'host' },
    ]) {
      const response = await request(app).patch('/api/players/profile').set('Cookie', organizerCookie()).send(patch);
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body).toMatchObject(patch);

      const readback = await request(app).get('/api/players/profile').set('Cookie', organizerCookie());
      expect(readback.status, JSON.stringify(readback.body)).toBe(200);
      expect(readback.body).toMatchObject(patch);
      expect(typeof readback.body.organizer_player_access).toBe('boolean');
    }

    const combined = { game_level: 'novice', club_role: 'organizer', judge_level: 'judge' } as const;
    const response = await request(app).patch('/api/players/profile').set('Cookie', organizerCookie()).send(combined);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject(combined);

    const persisted = await db.get<any>('SELECT game_level,club_role,judge_level FROM players WHERE id = ?', ['profile']);
    expect(persisted).toMatchObject(combined);
  });

  it('rejects validation failures and unauthorized classification requests', async () => {
    await insertPlayer('profile');

    const unauthorized = await request(app).patch('/api/players/profile').send({ game_level: 'novice' });
    expect(unauthorized.status).toBe(401);

    const invalid = await request(app).patch('/api/players/profile').set('Cookie', organizerCookie()).send({ game_level: 'legend' });
    expect(invalid.status).toBe(400);

    const persisted = await db.get<any>('SELECT game_level FROM players WHERE id = ?', ['profile']);
    expect(persisted.game_level).toBe('unrated');
  });

  it('manages CRM authorization separately, audits changes, and protects the last access', async () => {
    await insertPlayer('admin-one');
    await insertPlayer('admin-two');

    const grantOne = await request(app).patch('/api/players/admin-one/organizer-access').set('Cookie', organizerCookie()).send({ enabled: true });
    expect(grantOne.status, JSON.stringify(grantOne.body)).toBe(200);
    expect(grantOne.body.organizer_player_access).toBe(true);

    const grantTwo = await request(app).patch('/api/players/admin-two/organizer-access').set('Cookie', organizerCookie()).send({ enabled: true });
    expect(grantTwo.status, JSON.stringify(grantTwo.body)).toBe(200);

    const roleOnly = await request(app).patch('/api/players/admin-two').set('Cookie', organizerCookie()).send({ club_role: 'organizer' });
    expect(roleOnly.status, JSON.stringify(roleOnly.body)).toBe(200);
    expect(roleOnly.body.organizer_player_access).toBe(true);

    const revokeTwo = await request(app).patch('/api/players/admin-two/organizer-access').set('Cookie', organizerCookie()).send({ enabled: false });
    expect(revokeTwo.status, JSON.stringify(revokeTwo.body)).toBe(200);
    expect(revokeTwo.body.organizer_player_access).toBe(false);

    const lastAdmin = await request(app).patch('/api/players/admin-one/organizer-access').set('Cookie', organizerCookie()).send({ enabled: false });
    expect(lastAdmin.status).toBe(409);
    expect(lastAdmin.body.code).toBe('last_organizer_access');

    const row = await db.get<any>('SELECT club_role FROM players WHERE id = ?', ['admin-two']);
    expect(row.club_role).toBe('organizer');
    const audit = await db.all<any>('SELECT action, player_id, actor_id FROM organizer_player_access_audit ORDER BY occurred_at ASC');
    expect(audit.map((item) => [item.action, item.player_id])).toEqual([
      ['grant', 'admin-one'],
      ['grant', 'admin-two'],
      ['revoke', 'admin-two'],
    ]);
    expect(audit.every((item) => !String(item.actor_id).includes('-tg'))).toBe(true);
  });

  it('allows an entitled Telegram player session to become an organizer session and persist a role change', async () => {
    await insertPlayer('telegram-admin');

    const grant = await request(app).patch('/api/players/telegram-admin/organizer-access').set('Cookie', organizerCookie()).send({ enabled: true });
    expect(grant.status).toBe(200);

    const agent = request.agent(app);
    const me = await agent
      .get('/api/auth/me')
      .set('Cookie', `player_token=${generatePlayerSessionToken('telegram-admin')}`);
    expect(me.status, JSON.stringify(me.body)).toBe(200);
    expect(me.body.isOrganizer).toBe(true);
    expect(me.body.organizerAutoAuthorized).toBe(true);

    const update = await agent.patch('/api/players/telegram-admin').send({ judge_level: 'host' });
    expect(update.status, JSON.stringify(update.body)).toBe(200);
    expect(update.body.judge_level).toBe('host');
  });

  it('invalidates an identity-bound organizer session immediately after CRM access is revoked', async () => {
    await insertPlayer('revoked-admin');
    await insertPlayer('backup-admin');

    expect((await request(app).patch('/api/players/revoked-admin/organizer-access').set('Cookie', organizerCookie()).send({ enabled: true })).status).toBe(200);
    expect((await request(app).patch('/api/players/backup-admin/organizer-access').set('Cookie', organizerCookie()).send({ enabled: true })).status).toBe(200);

    const agent = request.agent(app);
    const me = await agent
      .get('/api/auth/me')
      .set('Cookie', `player_token=${generatePlayerSessionToken('revoked-admin')}`);
    expect(me.status, JSON.stringify(me.body)).toBe(200);
    expect(me.body.isOrganizer).toBe(true);

    const beforeRevoke = await agent.patch('/api/players/revoked-admin').send({ judge_level: 'host' });
    expect(beforeRevoke.status, JSON.stringify(beforeRevoke.body)).toBe(200);

    const revoke = await request(app)
      .patch('/api/players/revoked-admin/organizer-access')
      .set('Cookie', organizerCookie())
      .send({ enabled: false });
    expect(revoke.status, JSON.stringify(revoke.body)).toBe(200);

    const afterRevoke = await agent.patch('/api/players/revoked-admin').send({ judge_level: 'judge' });
    expect(afterRevoke.status).toBe(401);
  });

  it('rejects canonical owner revocation before mutation or audit write', async () => {
    await insertPlayer(PRIMARY_ORGANIZER_PLAYER_ID, 'Основной владелец');
    await insertPlayer('backup-admin');

    expect((await request(app).patch('/api/players/backup-admin/organizer-access').set('Cookie', organizerCookie()).send({ enabled: true })).status).toBe(200);

    const before = await db.all<any>('SELECT action, player_id FROM organizer_player_access_audit WHERE player_id = ?', [PRIMARY_ORGANIZER_PLAYER_ID]);
    expect(before).toHaveLength(0);

    const revokeOwner = await request(app)
      .patch(`/api/players/${PRIMARY_ORGANIZER_PLAYER_ID}/organizer-access`)
      .set('Cookie', organizerCookie())
      .send({ enabled: false });
    expect(revokeOwner.status).toBe(409);
    expect(revokeOwner.body.code).toBe('primary_organizer_access_required');

    const entitlement = await db.get<any>('SELECT player_id FROM organizer_player_access WHERE player_id = ?', [PRIMARY_ORGANIZER_PLAYER_ID]);
    expect(entitlement?.player_id).toBe(PRIMARY_ORGANIZER_PLAYER_ID);
    const after = await db.all<any>('SELECT action, player_id FROM organizer_player_access_audit WHERE player_id = ?', [PRIMARY_ORGANIZER_PLAYER_ID]);
    expect(after).toHaveLength(0);
  });

  it('does not change CASUAL debt or waivers when classification changes', async () => {
    await insertPlayer('payer');
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,format,status,created_at,updated_at) VALUES ('e1','Вечер',?,'CASUAL','completed',?,?)`, [now, now, now]);
    await db.run(`
      INSERT INTO evening_participants
        (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES ('ep1','e1','payer','going','going','attended','on_time','unpaid',300,0,?,?)
    `, [now, now]);

    const update = await request(app).patch('/api/players/payer').set('Cookie', organizerCookie()).send({ club_role: 'organizer', judge_level: 'judge' });
    expect(update.status, JSON.stringify(update.body)).toBe(200);

    const payment = await db.get<any>('SELECT amount_due,amount_paid,payment_status FROM evening_participants WHERE id = ?', ['ep1']);
    expect(payment).toMatchObject({ amount_due: 300, amount_paid: 0, payment_status: 'unpaid' });
  });

  it('keeps migrated guest placeholders outside editable registered-player profiles', async () => {
    await insertPlayer('guest-placeholder', 'Гость', 'legacy_guest_migrated');
    const response = await request(app).patch('/api/players/guest-placeholder').set('Cookie', organizerCookie()).send({ game_level: 'club' });
    expect(response.status).toBe(404);
  });
});
