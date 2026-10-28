import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { deliverPublication } from '../server/services/publicationDeliveryService.ts';
const databases:DatabaseWrapper[]=[];
afterEach(()=>databases.splice(0).forEach(db=>db.sqlite.close()));
async function setup(){const db=createDatabaseConnection(':memory:');databases.push(db);const app=await createApp(db);return {db,app,cookie:`organizer_token=${generateOrganizerToken()}`};}
describe('public publication recovery authorization',()=>{
  it('denies anonymous reads and decisions',async()=>{
    const {app}=await setup();expect((await request(app).get('/api/crm/publications/held')).status).toBe(401);
    expect((await request(app).post('/api/crm/publications/reconcile').send({})).status).toBe(401);
  });
  it('shows only readable metadata and records an organizer decision with stale-version protection',async()=>{
    const {app,db,cookie}=await setup();
    await deliverPublication(db,{key:'route:test',kind:'test'},'telegram','chat A',{method:'sendPhoto',fields:{caption:'Original'},photos:[{data:'do-not-expose',name:'x'}]},async()=>({ok:false,certainty:'uncertain'}));
    const list=await request(app).get('/api/crm/publications/held').set('Cookie',cookie);
    expect(list.status).toBe(200);expect(list.text).not.toContain('do-not-expose');expect(list.body.items[0].text).toBe('Original');
    const item=list.body.items[0];const body={key:item.key,attempt_id:item.attempt_id,decision:'accepted',evidence:'manual check'};
    expect((await request(app).post('/api/crm/publications/reconcile').set('Cookie',cookie).send(body)).status).toBe(200);
    expect((await request(app).post('/api/crm/publications/reconcile').set('Cookie',cookie).send(body)).status).toBe(409);
    expect((await request(app).get('/api/crm/publications/held').set('Cookie',cookie)).body.items).toHaveLength(0);
    expect((await db.get<any>('SELECT actor FROM publication_delivery_decisions')).actor).toBeTruthy();
  });
  it('does not permit absence without explicit confirmation',async()=>{
    const {app,db,cookie}=await setup();await deliverPublication(db,{key:'route:test',kind:'test'},'telegram','A',{},async()=>({ok:false,certainty:'uncertain'}));
    const {items}= (await request(app).get('/api/crm/publications/held').set('Cookie',cookie)).body;
    expect((await request(app).post('/api/crm/publications/reconcile').set('Cookie',cookie).send({key:items[0].key,attempt_id:items[0].attempt_id,decision:'absent'})).status).toBe(400);
  });
});
