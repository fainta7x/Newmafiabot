import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptSnapshot, decryptSnapshot, downloadSnapshot } from '../../scripts/developmentSnapshot.mjs';
const encryptionKey = 'a'.repeat(64), authKey = 'scoped-snapshot-key-'.repeat(3);
const dirs=[];
afterEach(async()=>{for(const dir of dirs.splice(0))await fs.rm(dir,{recursive:true,force:true});});
const directory=async()=>{const d=await fs.mkdtemp(path.join(os.tmpdir(),'encrypted-copy-test-'));dirs.push(d);return d;};
function fixture() {
  const sqlite=Buffer.concat([Buffer.from('SQLite format 3\0'),Buffer.alloc(4000),Buffer.from('synthetic-gameplay')]);
  const gzip=zlib.gzipSync(sqlite);
  const metadata={version:1,bytes:sqlite.length,sha256:crypto.createHash('sha256').update(gzip).digest('hex'),generatedAt:'2026-10-07T00:00:00Z',rows:12,wipedTables:20,retainedTables:['players','games'],untrusted:'private-secret'};
  const response=()=>new Response(gzip,{headers:{'content-type':'application/gzip','x-snapshot-metadata':JSON.stringify(metadata)}});
  return {sqlite,gzip,metadata,response};
}
describe('encrypted development snapshot downloader',()=>{
  it('authenticates encryption and detects tampering and wrong keys',()=>{
    const payload=Buffer.from('private test payload');const encrypted=encryptSnapshot(payload,encryptionKey);
    expect(decryptSnapshot(encrypted,encryptionKey)).toEqual(payload);expect(encrypted.includes(payload)).toBe(false);
    const changed=Buffer.from(encrypted);changed[changed.length-1]^=1;
    expect(()=>decryptSnapshot(changed,encryptionKey)).toThrow();expect(()=>decryptSnapshot(encrypted,'b'.repeat(64))).toThrow();
  });
  it('writes only encrypted bytes and bounded metadata, with redirects disabled',async()=>{
    const {sqlite,gzip,response}=fixture(),outputDir=await directory(),fetcher=vi.fn(async()=>response());
    await downloadSnapshot({baseUrl:'https://app.example/cabinet',authKey,encryptionKey,outputDir,fetcher});
    const [url,options]=fetcher.mock.calls[0];expect(url.href).toBe('https://app.example/__developer-read/snapshot');expect(options.redirect).toBe('error');expect(options.headers['X-Development-Snapshot-Key']).toBe(authKey);
    const files=await fs.readdir(outputDir);expect(files.sort()).toEqual(['development.sqlite.gz.enc','manifest.json']);
    const encrypted=await fs.readFile(path.join(outputDir,files[0]));expect(decryptSnapshot(encrypted,encryptionKey)).toEqual(gzip);expect(encrypted.includes(sqlite)).toBe(false);
    const manifest=await fs.readFile(path.join(outputDir,'manifest.json'),'utf8');expect(manifest).not.toContain('private-secret');expect(manifest).not.toContain(authKey);
  });
  it('rejects checksums and HTML responses without persisting artifacts',async()=>{
    const {response,metadata}=fixture();metadata.sha256='0'.repeat(64);const outputDir=await directory();
    await expect(downloadSnapshot({baseUrl:'https://app.example',authKey,encryptionKey,outputDir,fetcher:async()=>response()})).rejects.toThrow('checksum');expect(await fs.readdir(outputDir)).toEqual([]);
    await expect(downloadSnapshot({baseUrl:'https://app.example',authKey,encryptionKey,outputDir,fetcher:async()=>new Response('<html>',{headers:{'content-type':'text/html'}})})).rejects.toThrow('content type');
  });
  it('rejects configuration before requesting and never overwrites a previous artifact',async()=>{
    const outputDir=await directory(),fetcher=vi.fn(async()=>fixture().response());
    await expect(downloadSnapshot({baseUrl:'http://app.example',authKey,encryptionKey,outputDir,fetcher})).rejects.toThrow('HTTPS');
    await expect(downloadSnapshot({baseUrl:'https://app.example',authKey,encryptionKey:'bad',outputDir,fetcher})).rejects.toThrow('encryption key');expect(fetcher).not.toHaveBeenCalled();
    await downloadSnapshot({baseUrl:'https://app.example',authKey,encryptionKey,outputDir,fetcher});
    const before=await fs.readFile(path.join(outputDir,'development.sqlite.gz.enc'));
    await expect(downloadSnapshot({baseUrl:'https://app.example',authKey,encryptionKey,outputDir,fetcher})).rejects.toThrow();expect(await fs.readFile(path.join(outputDir,'development.sqlite.gz.enc'))).toEqual(before);
  });
});
