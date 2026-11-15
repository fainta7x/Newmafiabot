import { oncePerDatabase } from '../db/oncePerDatabase.ts';
import { afterEach, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';

const opened: DatabaseWrapper[]=[];
afterEach(()=>opened.splice(0).forEach(db=>db.sqlite.close()));
const nextTurn=()=>new Promise<void>(resolve=>{setImmediate(resolve);});
async function setup(commit=false) {
  const db=createDatabaseConnection(':memory:');opened.push(db);
  await db.exec("CREATE TABLE request_probe (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO request_probe VALUES (1,'original')");
  let entered!:()=>void;let release!:()=>void;
  const ready=new Promise<void>(resolve=>{entered=resolve;});
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const transaction=db.transaction(async tx=>{
    await tx.run("UPDATE request_probe SET value='uncommitted' WHERE id=1");
    entered();await gate;
    if(!commit) throw new Error('request A failed');
    await tx.run("UPDATE request_probe SET value='committed' WHERE id=1");
  }).catch(error=>error);
  await ready;
  return {db,release,transaction};
}

it.each(['run','exec'] as const)('an independent %s write survives another request rollback',async method=>{
  const {db,release,transaction}=await setup();
  const write=method==='run'?db.run("UPDATE request_probe SET value='request B' WHERE id=1"):db.exec("UPDATE request_probe SET value='request B' WHERE id=1");
  await nextTurn();release();
  expect(await transaction).toBeInstanceOf(Error);
  await write;
  expect((await db.get<any>('SELECT value FROM request_probe WHERE id=1'))?.value).toBe('request B');
});

it.each(['get','all'] as const)('an independent %s read cannot observe another request uncommitted data',async method=>{
  const {db,release,transaction}=await setup();
  const read=method==='get'?db.get<any>('SELECT value FROM request_probe WHERE id=1'):db.all<any>('SELECT value FROM request_probe WHERE id=1');
  await nextTurn();release();
  expect(await transaction).toBeInstanceOf(Error);
  const result=await read;
  expect(Array.isArray(result)?result[0].value:result?.value).toBe('original');
});

it('a committed transaction cannot overwrite an independent write that already reported success',async()=>{
  const {db,release,transaction}=await setup(true);
  const write=db.run("UPDATE request_probe SET value='request B' WHERE id=1");
  await nextTurn();release();
  expect(await transaction).toBeUndefined();await write;
  expect((await db.get<any>('SELECT value FROM request_probe WHERE id=1'))?.value).toBe('request B');
});

it.each(['statement','transaction'] as const)('a late %s callback cannot join a later request transaction',async method=>{
  const db=createDatabaseConnection(':memory:');opened.push(db);
  await db.exec("CREATE TABLE request_probe (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO request_probe VALUES (1,'original')");
  let runLate!:()=>void;let release!:()=>void;let entered!:()=>void;
  const signal=new Promise<void>(resolve=>{runLate=resolve;});
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const ready=new Promise<void>(resolve=>{entered=resolve;});
  let late!:Promise<unknown>;
  await db.transaction(async()=>{ late=signal.then(async()=>{
    if(method==='statement') await db.run("UPDATE request_probe SET value='late callback' WHERE id=1");
    else await db.transaction(async tx=>{await tx.run("UPDATE request_probe SET value='late callback' WHERE id=1");});
  }); });
  const other=db.transaction(async tx=>{
    await tx.run("UPDATE request_probe SET value='uncommitted' WHERE id=1");
    entered();await gate;throw new Error('other failed');
  }).catch(error=>error);
  await ready;runLate();await nextTurn();release();
  expect(await other).toBeInstanceOf(Error);await late;
  expect((await db.get<any>('SELECT value FROM request_probe WHERE id=1'))?.value).toBe('late callback');
});


it('a failed standalone statement releases the queue for the next request',async()=>{
  const db=createDatabaseConnection(':memory:');opened.push(db);
  await db.exec("CREATE TABLE request_probe (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO request_probe VALUES (1,'original')");
  const failed=db.run('INSERT INTO missing_request_table VALUES (1)').catch(error=>error);
  const next=db.run("UPDATE request_probe SET value='next request' WHERE id=1");
  expect(await failed).toBeInstanceOf(Error);await next;
  expect((await db.get<any>('SELECT value FROM request_probe WHERE id=1'))?.value).toBe('next request');
});

it('schema initialization from another request cannot deadlock the transaction owner',async()=>{
  const db=createDatabaseConnection(':memory:');opened.push(db);
  let firstReady!:()=>void;let resume!:()=>void;let entered!:()=>void;
  const ready=new Promise<void>(resolve=>{firstReady=resolve;});
  const gate=new Promise<void>(resolve=>{resume=resolve;});
  const inside=new Promise<void>(resolve=>{entered=resolve;});
  let calls=0;
  const ensure=oncePerDatabase(async connection=>{
    await connection.exec('CREATE TABLE IF NOT EXISTS request_guard_probe (id INTEGER)');
    if(++calls===1) {firstReady();await gate;}
    await connection.exec('CREATE INDEX IF NOT EXISTS request_guard_index ON request_guard_probe(id)');
  });
  const outside=ensure(db);await ready;
  const transaction=db.transaction(async tx=>{entered();await ensure(tx);await tx.run('INSERT INTO request_guard_probe VALUES (1)');});
  await inside;resume();await Promise.all([outside,transaction]);
  expect(calls).toBe(2);
  expect(await db.all('SELECT id FROM request_guard_probe')).toEqual([{id:1}]);
});
