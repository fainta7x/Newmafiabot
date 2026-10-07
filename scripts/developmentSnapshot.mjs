import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const TABLES = new Set(['players','game_evenings','evening_tables','evening_participants','games','tournaments','tournament_participants','tournament_games','tournament_game_seats','tournament_game_player_results','tournament_game_best_moves','rating_periods']);
export const MAGIC = Buffer.from('2LADEV01');
export function encryptSnapshot(gzip, hexKey) {
  if (!/^[a-fA-F0-9]{64}$/.test(hexKey || '')) throw new Error('A 64-character hexadecimal encryption key is required');
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(hexKey, 'hex'), nonce);
  cipher.setAAD(MAGIC);
  const ciphertext = Buffer.concat([cipher.update(gzip), cipher.final()]);
  return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), ciphertext]);
}
export function decryptSnapshot(encrypted, hexKey) {
  if (!/^[a-fA-F0-9]{64}$/.test(hexKey || '') || encrypted.length < 36 || !encrypted.subarray(0, 8).equals(MAGIC)) throw new Error('Invalid encrypted snapshot');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(hexKey, 'hex'), encrypted.subarray(8, 20));
  decipher.setAAD(MAGIC); decipher.setAuthTag(encrypted.subarray(20, 36));
  return Buffer.concat([decipher.update(encrypted.subarray(36)), decipher.final()]);
}

export async function downloadSnapshot({ baseUrl, authKey, encryptionKey, outputDir, fetcher = fetch }) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Use an HTTPS application URL without credentials or query');
  // Validate encryption before requesting any data.
  encryptSnapshot(Buffer.alloc(0), encryptionKey);
  if (!authKey || authKey.length < 32) throw new Error('Snapshot export credential is missing');
  const response = await fetcher(new URL('/__developer-read/snapshot', base), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120_000),
    headers: { 'X-Development-Snapshot-Key': authKey },
  });
  if (!response.ok) throw new Error(`Snapshot export failed (HTTP ${response.status})`);
  if (!response.headers.get('content-type')?.startsWith('application/gzip')) throw new Error('Unexpected snapshot content type');
  const metadata = JSON.parse(response.headers.get('x-snapshot-metadata') || '{}');
  if (metadata.version !== 1 || !/^[a-f0-9]{64}$/.test(metadata.sha256 || '') || !Number.isInteger(metadata.bytes) || metadata.bytes < 100 || metadata.bytes > 256 * 1024 * 1024 || (!Array.isArray(metadata.retainedTables) || metadata.retainedTables.some(t => !TABLES.has(t))) || !Number.isInteger(metadata.rows) || !Number.isInteger(metadata.wipedTables) || !Number.isFinite(Date.parse(metadata.generatedAt))) throw new Error('Invalid snapshot metadata');
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 32 * 1024 * 1024) throw new Error('Snapshot download exceeds size limit');
    chunks.push(chunk);
  }
  const gzip = Buffer.concat(chunks);
  if (crypto.createHash('sha256').update(gzip).digest('hex') !== metadata.sha256) throw new Error('Snapshot checksum mismatch');
  const sqlite = zlib.gunzipSync(gzip, { maxOutputLength: 256 * 1024 * 1024 });
  if (sqlite.length !== metadata.bytes || !sqlite.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) throw new Error('Invalid SQLite snapshot');
  const encrypted = encryptSnapshot(gzip, encryptionKey);
  // Exporter strings/headers are untrusted: never mirror arbitrary metadata into an artifact.
  const manifest = { version: 1, generatedAt: new Date(metadata.generatedAt).toISOString(), sqliteBytes: sqlite.length, encryptedBytes: encrypted.length, encryptedSha256: crypto.createHash('sha256').update(encrypted).digest('hex'), rows: metadata.rows, retainedTables: metadata.retainedTables, wipedTables: metadata.wipedTables };
  await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
  const encryptedPath = path.join(outputDir, 'development.sqlite.gz.enc');
  // No plaintext file is ever written by the downloader.
  await fs.writeFile(encryptedPath, encrypted, { mode: 0o600, flag: 'wx' });
  await fs.writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  return manifest;
}

async function main() {
  if (process.argv[2] === 'decrypt') {
    const source = process.argv[3], target = process.argv[4];
    if (!source || !target || !target.endsWith('.sqlite') || /(?:^|\/)mafia_crm(?:\.test|\.runtime)?\.sqlite$/.test(target)) throw new Error('Choose a NEW development-only .sqlite path');
    const gzip = decryptSnapshot(await fs.readFile(source), process.env.DEVELOPMENT_SNAPSHOT_ENCRYPTION_KEY);
    const raw = zlib.gunzipSync(gzip, { maxOutputLength: 256 * 1024 * 1024 });
    if (!raw.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) throw new Error('Invalid SQLite snapshot');
    await fs.writeFile(target, raw, { mode: 0o600, flag: 'wx' });
    console.log('Development snapshot decrypted into a new file.');
    return;
  }
  const manifest = await downloadSnapshot({ baseUrl: process.env.DEVELOPMENT_SNAPSHOT_URL, authKey: process.env.DEVELOPMENT_SNAPSHOT_KEY, encryptionKey: process.env.DEVELOPMENT_SNAPSHOT_ENCRYPTION_KEY, outputDir: process.env.DEVELOPMENT_SNAPSHOT_OUTPUT || 'temp/development-snapshot' });
  console.log(`Encrypted development snapshot verified (${manifest.rows} rows).`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Development snapshot failed. Check configuration, exporter status and schema policy; no payload or credential is logged.'); process.exitCode = 1; });
