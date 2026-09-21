import { spawnSync } from 'node:child_process';
import {
  GROUP_PATTERNS,
  filesForGroup,
} from './testGroups.ts';

const [group, ...extraArgs] = process.argv.slice(2);
if (!group) {
  console.error(`Usage: tsx src/scripts/runTestGroup.ts <${Object.keys(GROUP_PATTERNS).join('|')}> [--list-only] [vitest args...]`);
  process.exit(2);
}

const files = filesForGroup(group);
if (!files.length) {
  console.error(`No tests matched group ${group}`);
  process.exit(2);
}

console.log(`[test-group] ${group}: ${files.length} file(s)`);
for (const file of files) console.log(`  - ${file}`);

const listOnly = extraArgs.includes('--list-only');
if (listOnly) {
  process.exit(0);
}

const vitestArgs = extraArgs.filter((argument) => argument !== '--list-only');
const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(executable, ['vitest', 'run', ...files, ...vitestArgs], {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
