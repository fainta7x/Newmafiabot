import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { listLeads, loadLeadsToRecall, markLeadRecalled, setLeadStatus } from '../server/services/newcomerFunnelService.ts';

// Owner, 2026-11-16: the «Лиды» tab — quick form, stages, «Позвать снова» with two invitations, archive, «Сделать игроком».
describe('«Лиды» in «Игроки»', () => {
  let db: DatabaseWrapper; let app: any;
  const cookie = () => `organizer_token=${generateOrganizerToken()}`;
  const evening = async (id: string, daysAhead: number) => {
    const stamp = new Date().toISOString();
    const starts = new Date(Date.now() + daysAhead * 86_400_000).toISOString();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES (?,?,?,'Europe/Moscow','NOVICE','published',20,200,?,?)`, [id, id, starts, stamp, stamp]);
  };
  beforeEach(async () => { db = createDatabaseConnection(':memory:'); app = await createApp(db); });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('adds a lead from the CRM with the contact type found by itself and books the novice evening', async () => {
    await evening('n1', 3);
    const created = await request(app).post('/api/crm/leads').set('Cookie', cookie()).send({ name: 'Иван', contact: 'vk.com/ivan_k', evening_id: 'n1' });
    expect(created.status).toBe(201);
    const list = await request(app).get('/api/crm/leads').set('Cookie', cookie());
    expect(list.status).toBe(200);
    const lead = list.body.leads[0];
    expect(lead).toMatchObject({ nickname: 'Иван', contact_kind: 'vk', contact_value: 'https://vk.com/ivan_k', source: 'vk', added_by: 'crm', status: 'active', stage: 'booked' });
    expect(lead.evening.id).toBe('n1');
    expect(lead.message).toBeTruthy();
    expect(list.body.evenings.map((item: any) => item.id)).toEqual(['n1']);
  });

  it('refuses a lead without an evening choice or with an unreadable contact', async () => {
    expect((await request(app).post('/api/crm/leads').set('Cookie', cookie()).send({ name: 'Иван', contact: 'vk.com/ivan_k' })).status).toBe(400);
    expect((await request(app).post('/api/crm/leads').set('Cookie', cookie()).send({ name: 'Иван', contact: 'привет', no_evening: true })).status).toBe(400);
    expect((await request(app).post('/api/crm/leads').set('Cookie', cookie()).send({ name: 'Иван', contact: '@ivan_tg', no_evening: true })).status).toBe(201);
  });

  it('«Позвать снова» drops the seat, invites before the next novice evening, and archives after two invitations', async () => {
    await evening('n1', 2);
    const created = await request(app).post('/api/crm/leads').set('Cookie', cookie()).send({ name: 'Марина', contact: '@marina_s', evening_id: 'n1' });
    const id = created.body.playerId;
    await setLeadStatus(db, id, 'recall');
    let [lead] = await listLeads(db);
    expect(lead).toMatchObject({ status: 'recall', evening: null });
    expect((await loadLeadsToRecall(db)).leads.map((item) => item.player_id)).toEqual([id]);
    // Invited to n1: not listed again for n1.
    await markLeadRecalled(db, id);
    expect((await loadLeadsToRecall(db)).leads).toEqual([]);
    // The next novice evening comes; n1 is over.
    await db.run("UPDATE game_evenings SET status = 'completed' WHERE id = 'n1'");
    await evening('n2', 9);
    expect((await loadLeadsToRecall(db)).leads.map((item) => item.player_id)).toEqual([id]);
    await markLeadRecalled(db, id);
    await db.run("UPDATE game_evenings SET status = 'completed' WHERE id = 'n2'");
    await evening('n3', 16);
    // Two invitations without a sign-up: archived by itself, not invited a third time.
    expect((await loadLeadsToRecall(db)).leads).toEqual([]);
    [lead] = await listLeads(db);
    expect(lead.status).toBe('archived');
    // Back from the archive and booked: active again.
    await request(app).post(`/api/crm/leads/${id}/book`).set('Cookie', cookie()).send({ evening_id: 'n3' }).expect(200);
    [lead] = await listLeads(db);
    expect(lead).toMatchObject({ status: 'active', recall_count: 0, stage: 'booked' });
  });

  it('«Сделать игроком» keeps the person and his seat and takes him out of the leads', async () => {
    await evening('n1', 2);
    const created = await request(app).post('/api/crm/leads').set('Cookie', cookie()).send({ name: 'Олег', contact: '+7 910 111-22-33', evening_id: 'n1' });
    await request(app).post(`/api/crm/leads/${created.body.playerId}/status`).set('Cookie', cookie()).send({ status: 'converted' }).expect(200);
    const [lead] = await listLeads(db);
    expect(lead).toMatchObject({ status: 'converted', evening: { id: 'n1' } });
    expect(await db.get("SELECT id FROM players WHERE id = ? AND lifecycle_status <> 'archived'", [created.body.playerId])).toBeTruthy();
  });

  it('«Написал» on the card moves the stage to «написали»', async () => {
    const created = await request(app).post('/api/crm/leads').set('Cookie', cookie()).send({ name: 'Анна', contact: '@anna_one', no_evening: true });
    await request(app).post(`/api/crm/leads/${created.body.playerId}/written`).set('Cookie', cookie()).expect(200);
    const [lead] = await listLeads(db);
    expect(lead.stage).toBe('written');
  });
});
