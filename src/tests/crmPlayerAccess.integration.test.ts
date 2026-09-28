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

  it('keeps the organizer role and the cabinet in step, audits changes, and protects the last access', async () => {
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

    // «Организатор клуба» and the cabinet are one setting: closing the cabinet ends the organizer role.
    const row = await db.get<any>('SELECT club_role FROM players WHERE id = ?', ['admin-two']);
    expect(row.club_role).toBe('member');
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

  it('keeps revocation persistent across another correct-password login with the same player identity', async () => {
    await insertPlayer('revoked-admin');
    await insertPlayer('backup-admin');

    expect((await request(app).patch('/api/players/revoked-admin/organizer-access').set('Cookie', organizerCookie()).send({ enabled: true })).status).toBe(200);
    expect((await request(app).patch('/api/players/backup-admin/organizer-access').set('Cookie', organizerCookie()).send({ enabled: true })).status).toBe(200);

    const playerCookie = `player_token=${generatePlayerSessionToken('revoked-admin')}`;
    const agent = request.agent(app);
    const me = await agent
      .get('/api/auth/me')
      .set('Cookie', playerCookie);
    expect(me.status, JSON.stringify(me.body)).toBe(200);
    expect(me.body.isOrganizer).toBe(true);
    expect(me.body.organizerAutoAuthorized).toBe(true);

    const beforeRevoke = await agent.patch('/api/players/revoked-admin').send({ judge_level: 'host' });
    expect(beforeRevoke.status, JSON.stringify(beforeRevoke.body)).toBe(200);

    const revoke = await request(app)
      .patch('/api/players/revoked-admin/organizer-access')
      .set('Cookie', organizerCookie())
      .send({ enabled: false });
    expect(revoke.status, JSON.stringify(revoke.body)).toBe(200);

    const afterRevoke = await agent.patch('/api/players/revoked-admin').send({ judge_level: 'judge' });
    expect(afterRevoke.status).toBe(401);

    const loginAgain = await agent
      .post('/api/auth/login')
      .set('Cookie', playerCookie)
      .send({ password: 'adminpass' });
    expect(loginAgain.status, JSON.stringify(loginAgain.body)).toBe(403);
    expect(loginAgain.body.code).toBe('organizer_player_access_required');

    const entitlement = await db.get<any>(
      'SELECT player_id FROM organizer_player_access WHERE player_id = ? LIMIT 1',
      ['revoked-admin'],
    );
    expect(entitlement).toBeFalsy();

    const afterPasswordLogin = await agent
      .patch('/api/players/revoked-admin')
      .set('Cookie', playerCookie)
      .send({ judge_level: 'judge' });
    expect(afterPasswordLogin.status).toBe(401);
  });

  it('keeps the deliberate password-only root organizer flow separate from player entitlements', async () => {
    const rootAgent = request.agent(app);
    const login = await rootAgent.post('/api/auth/login').send({ password: 'adminpass' });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    expect(login.body.organizerAccountLinked).toBe(false);

    const me = await rootAgent.get('/api/auth/me');
    expect(me.status, JSON.stringify(me.body)).toBe(200);
    expect(me.body.isOrganizer).toBe(true);
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

  it('sets level, how often players come, club role and judge level for many players at once without touching cabinet access', async () => {
    await insertPlayer('bulk-a');
    await insertPlayer('bulk-b');
    await insertPlayer('bulk-c');
    await insertPlayer('bulk-guest', 'Гость', 'legacy_guest_migrated');
    await db.run("UPDATE players SET club_role = 'team' WHERE id = 'bulk-b'");

    const unauthorized = await request(app).post('/api/players/access/bulk').send({ player_ids: ['bulk-a'], game_level: 'club' });
    expect(unauthorized.status).toBe(401);
    const nothing = await request(app).post('/api/players/access/bulk').set('Cookie', organizerCookie()).send({ player_ids: ['bulk-a'] });
    expect(nothing.status).toBe(400);
    const invalid = await request(app).post('/api/players/access/bulk').set('Cookie', organizerCookie()).send({ player_ids: ['bulk-a'], game_level: 'legend' });
    expect(invalid.status).toBe(400);

    const response = await request(app).post('/api/players/access/bulk').set('Cookie', organizerCookie())
      .send({ player_ids: ['bulk-a', 'bulk-b', 'bulk-a', 'bulk-guest', 'missing'], game_level: 'club', activity: 'sometimes' });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.updated).toBe(2);

    const rows = await db.all<any>("SELECT id, game_level, club_role, judge_level FROM players WHERE id LIKE 'bulk-%' ORDER BY id");
    expect(rows).toEqual([
      { id: 'bulk-a', game_level: 'club', club_role: 'guest', judge_level: 'none' },
      // The team role is kept when only membership changes.
      { id: 'bulk-b', game_level: 'club', club_role: 'team', judge_level: 'none' },
      { id: 'bulk-c', game_level: 'unrated', club_role: 'member', judge_level: 'none' },
      { id: 'bulk-guest', game_level: 'unrated', club_role: 'member', judge_level: 'none' },
    ]);

    const organize = await request(app).post('/api/players/access/bulk').set('Cookie', organizerCookie())
      .send({ player_ids: ['bulk-a', 'bulk-b'], organization: 'organizer', host_formats_add: ['NOVICE', 'CASUAL'] });
    expect(organize.status, JSON.stringify(organize.body)).toBe(200);
    const leave = await request(app).post('/api/players/access/bulk').set('Cookie', organizerCookie())
      .send({ player_ids: ['bulk-a'], organization: 'none' });
    expect(leave.status, JSON.stringify(leave.body)).toBe(200);
    expect(await db.all<any>("SELECT id, game_level, club_role, judge_level FROM players WHERE id IN ('bulk-a','bulk-b') ORDER BY id")).toEqual([
      { id: 'bulk-a', game_level: 'club', club_role: 'member', judge_level: 'host' },
      { id: 'bulk-b', game_level: 'club', club_role: 'organizer', judge_level: 'host' },
    ]);

    const card = await request(app).get('/api/players/bulk-a').set('Cookie', organizerCookie());
    expect(card.status, JSON.stringify(card.body)).toBe(200);
    expect(card.body.organizer_player_access).toBe(false);
  });

  it('«Перестал ходить» pauses announcements and coming back turns them on again, never unblocking', async () => {
    await insertPlayer('gone');
    await insertPlayer('blocked');
    await insertPlayer('paused-by-hand');
    await db.run("UPDATE players SET contact_status='blocked', lifecycle_status='blocked' WHERE id='blocked'");
    await db.run("UPDATE players SET contact_status='paused', lifecycle_status='paused', pause_reason='Исключён из рассылки организатором' WHERE id='paused-by-hand'");
    const post = (body: object) => request(app).post('/api/players/access/bulk').set('Cookie', organizerCookie()).send(body);
    const status = () => db.all<any>("SELECT id, club_role, contact_status, pause_reason FROM players WHERE id IN ('gone','blocked','paused-by-hand') ORDER BY id");

    expect((await post({ player_ids: ['gone', 'blocked', 'paused-by-hand'], activity: 'stopped' })).status).toBe(200);
    expect(await status()).toEqual([
      { id: 'blocked', club_role: 'member', contact_status: 'blocked', pause_reason: null },
      { id: 'gone', club_role: 'member', contact_status: 'paused', pause_reason: 'Перестал ходить' },
      { id: 'paused-by-hand', club_role: 'member', contact_status: 'paused', pause_reason: 'Исключён из рассылки организатором' },
    ]);

    expect((await post({ player_ids: ['gone', 'blocked', 'paused-by-hand'], activity: 'regular' })).status).toBe(200);
    expect(await status()).toEqual([
      { id: 'blocked', club_role: 'member', contact_status: 'blocked', pause_reason: null },
      { id: 'gone', club_role: 'member', contact_status: 'normal', pause_reason: null },
      { id: 'paused-by-hand', club_role: 'member', contact_status: 'paused', pause_reason: 'Исключён из рассылки организатором' },
    ]);
  });

  it('lets only the club owner give or take the organizer role, delete players and see club money', async () => {
    await insertPlayer('club-admin');
    await insertPlayer('target');
    // The owner (root session) makes «club-admin» an organizer through the role: the cabinet follows.
    const promote = await request(app).patch('/api/players/club-admin').set('Cookie', organizerCookie()).send({ club_role: 'organizer' });
    expect(promote.status, JSON.stringify(promote.body)).toBe(200);
    expect(promote.body.organizer_player_access).toBe(true);

    const adminCookie = `organizer_token=${generateOrganizerToken('club-admin')}`;
    const me = await request(app).get('/api/auth/me').set('Cookie', adminCookie);
    expect(me.body).toMatchObject({ isOrganizer: true, isClubOwner: false });

    const grant = await request(app).patch('/api/players/target/organizer-access').set('Cookie', adminCookie).send({ enabled: true });
    expect(grant.status).toBe(403);
    const role = await request(app).patch('/api/players/target').set('Cookie', adminCookie).send({ club_role: 'organizer' });
    expect(role.status).toBe(403);
    const bulk = await request(app).post('/api/players/access/bulk').set('Cookie', adminCookie).send({ player_ids: ['target'], organization: 'organizer' });
    expect(bulk.status).toBe(403);
    const remove = await request(app).delete('/api/players/target').set('Cookie', adminCookie);
    expect(remove.status).toBe(403);
    expect(await db.get<any>("SELECT club_role, contact_status FROM players WHERE id='target'")).toEqual({ club_role: 'member', contact_status: 'normal' });

    // Everything else in the cabinet still works for a club organizer.
    const level = await request(app).patch('/api/players/target').set('Cookie', adminCookie).send({ game_level: 'club' });
    expect(level.status, JSON.stringify(level.body)).toBe(200);

    const analyticsAdmin = await request(app).get('/api/analytics').set('Cookie', adminCookie);
    expect(analyticsAdmin.status).toBe(200);
    expect(analyticsAdmin.body.financials).toBeNull();
    const analyticsOwner = await request(app).get('/api/analytics').set('Cookie', organizerCookie());
    expect(analyticsOwner.body.financials).toMatchObject({ incomePaid: expect.any(Number) });

    // The last cabinet holder keeps it: the role comes back and the owner sees why.
    const keepLast = await request(app).post('/api/players/access/bulk').set('Cookie', organizerCookie()).send({ player_ids: ['club-admin'], organization: 'none' });
    expect(keepLast.body.warnings?.[0]).toContain('последнему');
    expect(await db.get<any>("SELECT club_role FROM players WHERE id='club-admin'")).toEqual({ club_role: 'organizer' });

    // With another organizer the owner can take the role away in bulk; the cabinet closes with it.
    expect((await request(app).patch('/api/players/target/organizer-access').set('Cookie', organizerCookie()).send({ enabled: true })).status).toBe(200);
    const demote = await request(app).post('/api/players/access/bulk').set('Cookie', organizerCookie()).send({ player_ids: ['club-admin'], organization: 'none' });
    expect(demote.status, JSON.stringify(demote.body)).toBe(200);
    const after = await request(app).get('/api/players/club-admin').set('Cookie', organizerCookie());
    expect(after.body.organizer_player_access).toBe(false);
  });
});
