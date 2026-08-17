import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const readText = (relativePath: string): string => {
  try {
    return readFileSync(path.join(root, relativePath), 'utf8');
  } catch {
    return '';
  }
};

const runGit = (...args: string[]): string | null => {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
};

const capture = (text: string, expression: RegExp): string | null => {
  const match = text.match(expression);
  return match?.[1]?.trim() || null;
};

const packageJsonText = readText('package.json');
const packageJson = packageJsonText ? JSON.parse(packageJsonText) as { name?: string; version?: string } : {};
const projectState = readText('docs/PROJECT_STATE.md');
const renderYaml = readText('render.yaml');

const branch = runGit('rev-parse', '--abbrev-ref', 'HEAD');
const commit = runGit('rev-parse', 'HEAD');
const shortCommit = commit?.slice(0, 8) || null;
const statusOutput = runGit('status', '--porcelain');
const dirtyEntries = statusOutput ? statusOutput.split('\n').filter(Boolean) : [];
const verifiedMain = capture(projectState, /\*\*Last verified main:\*\*\s*`([0-9a-f]{7,40})`/i);

const docs = [
  'AGENTS.md',
  'docs/PROJECT_STATE.md',
  'docs/ARCHITECTURE.md',
  'docs/BUSINESS_RULES.md',
  'docs/RUNBOOK.md',
].map((file) => ({ file, present: existsSync(path.join(root, file)) }));

const info = {
  project: packageJson.name || 'Newmafiabot',
  version: packageJson.version || null,
  node: process.version,
  git: {
    branch,
    commit,
    shortCommit,
    clean: statusOutput === null ? null : dirtyEntries.length === 0,
    changedEntries: dirtyEntries.length,
  },
  handoff: {
    verifiedMain,
    currentCommitMatchesVerifiedMain: Boolean(commit && verifiedMain && commit === verifiedMain),
    docs,
  },
  render: {
    service: capture(renderYaml, /(?:^|\n)\s*name:\s*([^\n#]+)/),
    branch: capture(renderYaml, /(?:^|\n)\s*branch:\s*([^\n#]+)/),
    autoDeployTrigger: capture(renderYaml, /(?:^|\n)\s*autoDeployTrigger:\s*([^\n#]+)/),
    healthCheckPath: capture(renderYaml, /(?:^|\n)\s*healthCheckPath:\s*([^\n#]+)/),
    databasePath: capture(renderYaml, /DATABASE_PATH[\s\S]*?\n\s*value:\s*([^\n#]+)/),
  },
  note: 'This command is read-only and does not query GitHub Actions or live Render runtime.',
};

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
  process.exit(0);
}

const yesNo = (value: boolean | null): string => value === null ? 'unknown' : value ? 'yes' : 'no';
const verifiedState = info.handoff.currentCommitMatchesVerifiedMain
  ? 'matches current commit'
  : verifiedMain
    ? 'different from current commit (normal on a feature/docs branch; reconcile before claiming main verification)'
    : 'not recorded';

console.log('2LA Noire project context');
console.log('-------------------------');
console.log(`Package: ${info.project}${info.version ? ` ${info.version}` : ''}`);
console.log(`Node: ${info.node}`);
console.log(`Git branch: ${branch || 'unavailable'}`);
console.log(`Git commit: ${commit || 'unavailable'}`);
console.log(`Working tree clean: ${yesNo(info.git.clean)}${dirtyEntries.length ? ` (${dirtyEntries.length} changed entries)` : ''}`);
console.log(`PROJECT_STATE verified main: ${verifiedMain || 'not recorded'} — ${verifiedState}`);
console.log('');
console.log('Handoff docs:');
for (const doc of docs) console.log(`  ${doc.present ? 'OK ' : 'MISS'} ${doc.file}`);
console.log('');
console.log('Render config:');
console.log(`  service: ${info.render.service || 'not found'}`);
console.log(`  branch: ${info.render.branch || 'not found'}`);
console.log(`  auto deploy: ${info.render.autoDeployTrigger || 'not found'}`);
console.log(`  health: ${info.render.healthCheckPath || 'not found'}`);
console.log(`  database: ${info.render.databasePath || 'not found'}`);
console.log('');
console.log('Read next: docs/PROJECT_STATE.md -> docs/ARCHITECTURE.md -> only files relevant to the requested task.');
console.log('Note: this command is read-only and does not prove GitHub CI or live Render status.');
