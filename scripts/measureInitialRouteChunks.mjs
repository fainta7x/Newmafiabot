import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
const root = path.resolve(process.argv[2] || 'dist');
const manifest = JSON.parse(readFileSync(path.join(root, '.vite/manifest.json'), 'utf8'));
const seen = new Set();
function visit(key) {
  if (seen.has(key)) return;
  if (!manifest[key]) throw new Error(`Missing manifest entry: ${key}`);
  seen.add(key);
  for (const dependency of manifest[key].imports || []) visit(dependency);
}
visit('index.html');
const files = [...seen].map(key => manifest[key].file).filter(file => file.endsWith('.js')).sort();
const measurement = files.map(file => ({ file, bytes: statSync(path.join(root, file)).size, gzip_bytes: gzipSync(readFileSync(path.join(root, file)), { level: 6 }).length }));
console.log(JSON.stringify({ files: measurement, bytes: measurement.reduce((n, f) => n + f.bytes, 0), gzip_bytes: measurement.reduce((n, f) => n + f.gzip_bytes, 0) }, null, 2));
