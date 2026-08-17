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
  'docs/FEATURE_MAP.md',
  'docs/ERROR_PLAYBOOK.md',
  'docs/ARCHITECTURE.md',
  'docs/BUSINESS_RULES.md',
  'docs/RUNBOOK.md',
].map((file) => ({ file, present: existsSync(path.join(root, file)) }));

const navigationTools = [
  'src/scripts/projectNavigate.ts',
  'src/scripts/projectAffected.ts',
].map((file) => ({ file, present: existsSync(path.join(root, file)) }));

const render = {
  service: capture(renderYaml, /(?:^|\n)\s*name:\s*([^\n#]+)/),
  branch: capture(renderYaml, /(?:^|\n)\s*branch:\s*([^\n#]+)/),
  autoDeployTrigger: capture(renderYaml, /(?:^|\n)\s*autoDeployTrigger:\s*([^\n#]+)/),
  healthCheckPath: capture(renderYaml, /(?:^|\n)\s*healthCheckPath:\s*([^\n#]+)/),
  databasePath: capture(renderYaml, /DATABASE_PATH[\s\S]*?\n\s*value:\s*([^\n#]+)/),
};

const checkFailures: string[] = [];
for (const doc of docs) {
  if (!doc.present) checkFailures.push(`Missing handoff document: ${doc.file}`);
}
for (const tool of navigationTools) {
  if (!tool.present) checkFailures.push(`Missing navigation tool: ${tool.file}`);
}
if (!verifiedMain) checkFailures.push('docs/PROJECT_STATE.md has no Last verified main marker');
if (!render.service) checkFailures.push('render.yaml service name was not detected');
if (!render.branch) checkFailures.push('render.yaml branch was not detected');
if (!render.autoDeployTrigger) checkFailures.push('render.yaml autoDeployTrigger was not detected');
if (!render.healthCheckPath) checkFailures.push('render.yaml healthCheckPath was not detected');

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
    navigationTools,
  },
  render,
  check: {
    ok: checkFailures.length === 0,
    failures: checkFailures,
  },
  note: 'This command is read-only and does not query GitHub Actions or live Render runtime.',
};

const jsonMode = process.argv.includes('--json');
const checkMode = process.argv.includes('--check');

if (jsonMode) {
  process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
} else {
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
  console.log('Navigation tools:');
  for (const tool of navigationTools) console.log(`  ${tool.present ? 'OK ' : 'MISS'} ${tool.file}`);
  console.log('');
  console.log('Render config:');
  console.log(`  service: ${info.render.service || 'not found'}`);
  console.log(`  branch: ${info.render.branch || 'not found'}`);
  console.log(`  auto deploy: ${info.render.autoDeployTrigger || 'not found'}`);
  console.log(`  health: ${info.render.healthCheckPath || 'not found'}`);
  console.log(`  database: ${info.render.databasePath || 'not found'}`);
  console.log('');
  console.log(`Handoff integrity: ${info.check.ok ? 'OK' : 'FAILED'}`);
  for (const failure of checkFailures) console.log(`  - ${failure}`);
  console.log('');
  console.log('Navigate: known feature -> FEATURE_MAP; symptom -> ERROR_PLAYBOOK; fuzzy term -> npm run project:find.');
  console.log('After edits: npm run project:affected -- <changed files>.');
  console.log('Note: this command is read-only and does not prove GitHub CI or live Render status.');
}

if (checkMode && !info.check.ok) process.exitCode = 1;
