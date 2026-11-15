import { afterEach, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { productionStatic } from '../server/http/productionStatic.ts';
const opened: string[] = [];
afterEach(() => opened.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
it('caches fingerprinted assets while keeping HTML, worker and ordinary files revalidatable', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'noire-static-')); opened.push(dir);
  mkdirSync(path.join(dir, 'assets'));
  for (const name of ['assets/index-AbCd1234.js','assets/style-AbCd1234.css','assets/logo.svg','index.html','sw.js']) writeFileSync(path.join(dir,name),'test body');
  const app = express(); app.use(productionStatic(dir));
  for (const url of ['/assets/index-AbCd1234.js','/assets/style-AbCd1234.css']) {
    const r = await request(app).get(url);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect((await request(app).get(url).set('If-None-Match',r.headers.etag)).status).toBe(304);
  }
  for (const url of ['/index.html','/sw.js','/assets/logo.svg']) expect((await request(app).get(url)).headers['cache-control']).toBe('public, max-age=0');
  expect((await request(app).get('/assets/missing-AbCd1234.js')).status).toBe(404);
});
