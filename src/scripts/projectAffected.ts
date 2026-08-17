import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const checkMode = args.includes('--check');
const baseArg = args.find((arg) => arg.startsWith('--base='));
const explicitFiles = args.filter((arg) => !arg.startsWith('--'));

const runGit = (...gitArgs: string[]): string => {
  try {
    return execFileSync('git', gitArgs, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

const readText = (file: string): string => {
  try {
    return readFileSync(path.join(root, file), 'utf8');
  } catch {
    return '';
  }
};

const tracked = runGit('ls-files').split('\n').filter(Boolean);
const trackedSet = new Set(tracked);
const testFiles = tracked.filter((file) => /\.(test|spec)\.[jt]sx?$/.test(file) || /^tests\/.*\.test\.[jt]sx?$/.test(file));

const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const collectChangedFiles = (): string[] => {
  if (explicitFiles.length) return unique(explicitFiles);

  const working = unique([
    ...runGit('diff', '--name-only').split('\n'),
    ...runGit('diff', '--cached', '--name-only').split('\n'),
  ]);
  if (working.length) return working;

  const requestedBase = baseArg?.split('=')[1];
  const branch = runGit('rev-parse', '--abbrev-ref', 'HEAD');
  const base = requestedBase || (branch && branch !== 'main' && runGit('rev-parse', '--verify', 'main') ? 'main' : 'HEAD~1');
  const mergeBase = base !== 'HEAD~1' ? runGit('merge-base', 'HEAD', base) : '';
  const range = mergeBase ? `${mergeBase}...HEAD` : `${base}...HEAD`;
  return unique(runGit('diff', '--name-only', range).split('\n'));
};

const splitIdentifier = (value: string): string[] => value
  .replace(/\.(test|spec)$/i, '')
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .toLowerCase()
  .split(/[^a-z0-9а-яё]+/i)
  .filter((token) => token.length >= 3);

const changedFiles = collectChangedFiles();

const scoreTest = (testFile: string): { score: number; reasons: string[] } => {
  const testLower = testFile.toLowerCase();
  const testBase = path.basename(testFile).replace(/\.(test|spec)\.[^.]+$/i, '').toLowerCase();
  const content = readText(testFile).toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  for (const changed of changedFiles) {
    const sourceBase = path.basename(changed, path.extname(changed)).toLowerCase();
    const sourceTokens = splitIdentifier(sourceBase);
    const sourceSegments = changed.toLowerCase().split('/').filter((segment) => !['src', 'components', 'server', 'routes', 'services', 'lib'].includes(segment));

    if (testBase === sourceBase || testBase.includes(sourceBase) || sourceBase.includes(testBase)) {
      score += 55;
      reasons.push(`${sourceBase}: filename match`);
    }
    if (content && (content.includes(sourceBase) || content.includes(changed.toLowerCase()))) {
      score += 35;
      reasons.push(`${sourceBase}: referenced by test`);
    }

    for (const token of sourceTokens) {
      if (testLower.includes(token)) score += 8;
      else if (content.includes(token)) score += 3;
    }

    for (const segment of sourceSegments) {
      if (segment.length >= 4 && testLower.includes(segment)) score += 2;
    }
  }

  return { score, reasons: unique(reasons) };
};

const recommendedTests = testFiles
  .map((file) => ({ file, ...scoreTest(file) }))
  .filter((item) => item.score > 0)
  .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
  .slice(0, 12);

const riskFlags: string[] = [];
const has = (pattern: RegExp) => changedFiles.some((file) => pattern.test(file));

if (has(/^(src\/db\/|drizzle\/|database\.py$|mafia_crm\.checkpoint|src\/scripts\/(create|import).*Checkpoint)/)) {
  riskFlags.push('DATA_SAFETY: database/schema/checkpoint change — run release audit and inspect bootstrap/overwrite behavior.');
}
if (has(/^src\/server\/routes\//) || has(/^src\/app\.ts$/)) {
  riskFlags.push('API: route or mount change — verify auth, status codes, request validation and integration tests.');
}
if (has(/^src\/components\/player\//)) {
  riskFlags.push('PLAYER_UI: verify mobile navigation, refresh/state persistence and relevant component tests.');
}
if (has(/^src\/components\/(crm\/|OrganizerCRM\.tsx)/)) {
  riskFlags.push('CRM_UI: verify organizer auth, route restoration, mobile keyboard/scroll and evening refresh behavior.');
}
if (has(/^src\/components\/LiveGameEngine/) || has(/tournamentProtocol|gamesRoutes|playerLiveRoutes/i)) {
  riskFlags.push('GAME_RULES: cross-check docs/BUSINESS_RULES.md before changing voting/fouls/removal/PPK behavior.');
}
if (has(/telegram|bot_/i)) {
  riskFlags.push('TELEGRAM: distinguish repository tests from live token/webhook/runtime verification.');
}
if (has(/(^|\/)vk|integrationRoutes|vkJoin/i)) {
  riskFlags.push('VK: distinguish OAuth/callback/database state from live community/API verification.');
}
if (has(/package(-lock)?\.json$|\.github\/workflows\/|render\.yaml$/)) {
  riskFlags.push('INFRA: inspect dependency/CI/deploy impact; green code tests alone may be insufficient.');
}

const quotedTests = recommendedTests.map((item) => JSON.stringify(item.file)).join(' ');
const focusedCommand = quotedTests ? `npx vitest run ${quotedTests}` : null;
const sourceNames = changedFiles.map((file) => path.basename(file, path.extname(file))).filter(Boolean).slice(0, 4).join(' ');

const output = {
  changedFiles,
  trackedChangedFiles: changedFiles.filter((file) => trackedSet.has(file)),
  unknownFiles: changedFiles.filter((file) => !trackedSet.has(file)),
  riskFlags,
  recommendedTests,
  commands: {
    dataSafety: riskFlags.some((flag) => flag.startsWith('DATA_SAFETY')) ? 'npm run release:audit' : null,
    focused: focusedCommand,
    findMore: sourceNames ? `npm run project:find -- ${JSON.stringify(sourceNames)}` : null,
    final: 'npm run project:verify',
  },
  note: 'Recommendations are heuristic. Full CI remains authoritative before merge.',
};

if (jsonMode) {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} else {
  console.log('Affected-check recommendation');
  console.log('-----------------------------');
  console.log('Changed files:');
  for (const file of changedFiles) console.log(`  - ${file}`);
  console.log('');
  console.log('Risk flags:');
  if (!riskFlags.length) console.log('  - none detected');
  for (const flag of riskFlags) console.log(`  - ${flag}`);
  console.log('');
  console.log('Focused tests:');
  if (!recommendedTests.length) console.log('  - no high-confidence test match; use project:find, then full verification');
  for (const item of recommendedTests) console.log(`  ${String(item.score).padStart(3)}  ${item.file}`);
  console.log('');
  if (output.commands.dataSafety) console.log(`First: ${output.commands.dataSafety}`);
  if (focusedCommand) console.log(`Focused: ${focusedCommand}`);
  if (output.commands.findMore) console.log(`Find more: ${output.commands.findMore}`);
  console.log(`Before merge: ${output.commands.final}`);
}

if (checkMode) {
  const invalidExplicit = explicitFiles.filter((file) => !trackedSet.has(file));
  if (!tracked.length || !testFiles.length || !changedFiles.length || invalidExplicit.length) {
    if (invalidExplicit.length) console.error(`Unknown tracked file(s): ${invalidExplicit.join(', ')}`);
    process.exitCode = 1;
  }
}
