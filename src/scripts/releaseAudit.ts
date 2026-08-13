import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const failures: string[] = [];
const allowedEnv = new Set(['.env.example', '.env.production.example']);
const checkpointPayload = 'mafia_crm.checkpoint.sqlite.gz.b64';
const checkpointMeta = 'mafia_crm.checkpoint.meta.json';

const rawDatabasePattern = /(?:\.db(?:-journal|-shm|-wal|\.bak.*)?|\.sqlite(?:3)?(?:-|\.bak.*)?$)/i;
const forbiddenRuntimePrefix = /^(?:uploads|backups|temp)\//i;

for (const path of tracked) {
  const basename = path.split('/').at(-1) || path;
  if ((basename === '.env' || basename.startsWith('.env.')) && !allowedEnv.has(path)) {
    failures.push(`tracked environment file: ${path}`);
  }
  if (rawDatabasePattern.test(path)) failures.push(`tracked raw database artifact: ${path}`);
  if (forbiddenRuntimePrefix.test(path)) failures.push(`tracked runtime artifact: ${path}`);
}

for (const required of [checkpointPayload, checkpointMeta]) {
  if (!tracked.includes(required) || !existsSync(required)) failures.push(`missing canonical checkpoint file: ${required}`);
}

if (existsSync(checkpointPayload) && statSync(checkpointPayload).size < 100) {
  failures.push('canonical checkpoint payload is unexpectedly small');
}

if (existsSync(checkpointMeta)) {
  try {
    const parsed = JSON.parse(readFileSync(checkpointMeta, 'utf8'));
    if (!parsed || typeof parsed !== 'object') failures.push('checkpoint metadata is not an object');
  } catch {
    failures.push('checkpoint metadata is not valid JSON');
  }
}

if (failures.length) {
  console.error('Release data-safety audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Release data-safety audit passed · ${tracked.length} tracked files checked · canonical checkpoint pair present.`);
