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

const hasEnvKey = (text: string, key: string): boolean => new RegExp(`(?:^|\\n)\\s*-?\\s*key:\\s*${key}\\s*(?:\\n|$)|(?:^|\\n)${key}=`, 'm').test(text);

const packageJsonText = readText('package.json');
const packageJson = packageJsonText ? JSON.parse(packageJsonText) as { name?: string; version?: string } : {};
const agents = readText('AGENTS.md');
const projectState = readText('docs/PROJECT_STATE.md');
const runbook = readText('docs/RUNBOOK.md');
const renderYaml = readText('render.yaml');
const productionEnvExample = readText('.env.production.example');

const branch = runGit('rev-parse', '--abbrev-ref', 'HEAD');
const commit = runGit('rev-parse', 'HEAD');
const shortCommit = commit?.slice(0, 8) || null;
const statusOutput = runGit('status', '--porcelain');
const dirtyEntries = statusOutput ? statusOutput.split('\n').filter(Boolean) : [];
const projectStateDate = capture(projectState, /\*\*Status date:\*\*\s*([^\n]+)/i);
const latestReleaseRecord = capture(projectState, /\*\*Latest release record:\*\*\s*([^\n]+)/i);

const docs = [
  'AGENTS.md',
  'docs/PROJECT_STATE.md',
  'docs/FEATURE_MAP.md',
  'docs/ERROR_PLAYBOOK.md',
  'docs/ARCHITECTURE.md',
  'docs/BUSINESS_RULES.md',
  'docs/RUNBOOK.md',
  'docs/DESIGN_SYSTEM.md',
].map((file) => ({ file, present: existsSync(path.join(root, file)) }));

const navigationTools = [
  'src/scripts/projectNavigate.ts',
  'src/scripts/projectAffected.ts',
].map((file) => ({ file, present: existsSync(path.join(root, file)) }));

const renderTursoUrl = hasEnvKey(renderYaml, 'TURSO_DATABASE_URL');
const renderTursoToken = hasEnvKey(renderYaml, 'TURSO_AUTH_TOKEN');
const envExampleTursoUrl = /(?:^|\n)TURSO_DATABASE_URL=/m.test(productionEnvExample);
const envExampleTursoToken = /(?:^|\n)TURSO_AUTH_TOKEN=/m.test(productionEnvExample);
const agentsPrBudget = /(?:at most|maximum) \*\*3 pull requests total\*\*/i.test(agents);
const runbookPrBudget = /maximum \*\*3 PRs\*\*/i.test(runbook);
const pinnedCurrentMain = /\*\*Current main:\*\*/i.test(projectState);

const render = {
  service: capture(renderYaml, /(?:^|\n)\s*name:\s*([^\n#]+)/),
  branch: capture(renderYaml, /(?:^|\n)\s*branch:\s*([^\n#]+)/),
  autoDeployTrigger: capture(renderYaml, /(?:^|\n)\s*autoDeployTrigger:\s*([^\n#]+)/),
  healthCheckPath: capture(renderYaml, /(?:^|\n)\s*healthCheckPath:\s*([^\n#]+)/),
  databasePath: capture(renderYaml, /DATABASE_PATH[\s\S]*?\n\s*value:\s*([^\n#]+)/),
  tursoDatabaseUrlDeclared: renderTursoUrl,
  tursoAuthTokenDeclared: renderTursoToken,
};

const storage = {
  productionContract: renderTursoUrl && renderTursoToken
    ? 'turso-primary-when-secrets-configured'
    : 'INVALID-or-local-only',
  localFallbackPath: render.databasePath,
  envExampleDocumentsTurso: envExampleTursoUrl && envExampleTursoToken,
  checkpointRole: 'bootstrap/recovery only; never overwrite non-empty runtime data',
};

const workContract = {
  maxPrsPerUserRequest: agentsPrBudget && runbookPrBudget ? 3 : null,
  agentsDeclaresPrBudget: agentsPrBudget,
  runbookDeclaresPrBudget: runbookPrBudget,
};

const checkFailures: string[] = [];
for (const doc of docs) {
  if (!doc.present) checkFailures.push(`Missing canonical document: ${doc.file}`);
}
for (const tool of navigationTools) {
  if (!tool.present) checkFailures.push(`Missing navigation tool: ${tool.file}`);
}
if (!projectStateDate) checkFailures.push('docs/PROJECT_STATE.md has no Status date marker');
if (pinnedCurrentMain) checkFailures.push('docs/PROJECT_STATE.md must not pin a mutable Current main SHA; Git owns the current SHA');
if (!agentsPrBudget || !runbookPrBudget) checkFailures.push('3-PR-per-user-request work budget must be declared in both AGENTS.md and RUNBOOK.md');
if (!render.service) checkFailures.push('render.yaml service name was not detected');
if (!render.branch) checkFailures.push('render.yaml branch was not detected');
if (!render.autoDeployTrigger) checkFailures.push('render.yaml autoDeployTrigger was not detected');
if (!render.healthCheckPath) checkFailures.push('render.yaml healthCheckPath was not detected');
if (renderTursoUrl !== renderTursoToken) checkFailures.push('render.yaml must declare TURSO_DATABASE_URL and TURSO_AUTH_TOKEN together');
if (!renderTursoUrl || !renderTursoToken) checkFailures.push('render.yaml must document the current Turso production storage contract');
if (!envExampleTursoUrl || !envExampleTursoToken) checkFailures.push('.env.production.example must document both Turso production variables');
if (/\/var\/data\/mafia_crm\.sqlite/.test(productionEnvExample)) checkFailures.push('.env.production.example still contains obsolete /var/data SQLite production path');

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
    projectStateDate,
    latestReleaseRecord,
    docs,
    navigationTools,
  },
  render,
  storage,
  workContract,
  check: {
    ok: checkFailures.length === 0,
    failures: checkFailures,
  },
  note: 'Read-only repository/config snapshot. Current SHA comes from Git. This does not query GitHub Actions, Render secrets, Turso contents or live deployed runtime.',
};

const jsonMode = process.argv.includes('--json');
const checkMode = process.argv.includes('--check');

if (jsonMode) {
  process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
} else {
  const yesNo = (value: boolean | null): string => value === null ? 'unknown' : value ? 'yes' : 'no';

  console.log('2LA Noire project context');
  console.log('-------------------------');
  console.log(`Package: ${info.project}${info.version ? ` ${info.version}` : ''}`);
  console.log(`Node: ${info.node}`);
  console.log(`Git branch: ${branch || 'unavailable'}`);
  console.log(`Git commit: ${commit || 'unavailable'}`);
  console.log(`Working tree clean: ${yesNo(info.git.clean)}${dirtyEntries.length ? ` (${dirtyEntries.length} changed entries)` : ''}`);
  console.log(`PROJECT_STATE status date: ${projectStateDate || 'not recorded'}`);
  console.log(`Latest release record: ${latestReleaseRecord || 'not recorded'}`);
  console.log('');
  console.log('Canonical docs:');
  for (const doc of docs) console.log(`  ${doc.present ? 'OK ' : 'MISS'} ${doc.file}`);
  console.log('Navigation tools:');
  for (const tool of navigationTools) console.log(`  ${tool.present ? 'OK ' : 'MISS'} ${tool.file}`);
  console.log('');
  console.log('Work contract:');
  console.log(`  max PRs per user request: ${info.workContract.maxPrsPerUserRequest ?? 'not enforced'}`);
  console.log('');
  console.log('Render/storage config:');
  console.log(`  service: ${info.render.service || 'not found'}`);
  console.log(`  branch: ${info.render.branch || 'not found'}`);
  console.log(`  auto deploy: ${info.render.autoDeployTrigger || 'not found'}`);
  console.log(`  health: ${info.render.healthCheckPath || 'not found'}`);
  console.log(`  Turso URL declared: ${yesNo(info.render.tursoDatabaseUrlDeclared)}`);
  console.log(`  Turso token declared: ${yesNo(info.render.tursoAuthTokenDeclared)}`);
  console.log(`  production storage contract: ${info.storage.productionContract}`);
  console.log(`  local DB fallback: ${info.render.databasePath || 'not found'}`);
  console.log('');
  console.log(`Handoff integrity: ${info.check.ok ? 'OK' : 'FAILED'}`);
  for (const failure of checkFailures) console.log(`  - ${failure}`);
  console.log('');
  console.log('Navigate: known feature -> FEATURE_MAP; symptom -> ERROR_PLAYBOOK; fuzzy term -> npm run project:find.');
  console.log('After edits: npm run project:affected -- <changed files>.');
  console.log('Note: this command does not prove GitHub CI, live Render secrets, deployed SHA or runtime health.');
}

if (checkMode && !info.check.ok) process.exitCode = 1;
