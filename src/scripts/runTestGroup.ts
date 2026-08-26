import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const TEST_DIR = path.resolve('src/tests');

const GROUP_PATTERNS: Record<string, RegExp[]> = {
  smoke: [
    /^botHealth\.test\./i,
    /^organizerRouting\.test\./i,
    /^playerCabinetNavigation\.test\./i,
    /^liveGameSetupMode\.test\./i,
  ],
  crm: [/crm/i, /organizer/i, /evening/i, /participant/i, /player.*admin/i, /admin.*player/i],
  'live-game': [/liveGame/i, /tournamentVoting/i, /ci_fsm_tie_nominations/i, /foul/i, /vot/i, /speech/i, /night/i],
  telegram: [/telegram/i, /^bot/i, /announcement/i],
  vk: [/^vk/i, /Vk/],
  visual: [/mobile/i, /layout/i, /geometry/i, /visual/i, /shell/i, /presentation/i],
  regression: [/regression/i, /reliability/i, /archive/i, /recovery/i, /legacy/i, /restore/i, /closeout/i],
};

function listTests(): string[] {
  return readdirSync(TEST_DIR)
    .filter((name) => /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/.test(name))
    .map((name) => path.join('src/tests', name))
    .sort();
}

function filesForGroup(group: string): string[] {
  const patterns = GROUP_PATTERNS[group];
  if (!patterns) {
    throw new Error(`Unknown test group: ${group}. Available: ${Object.keys(GROUP_PATTERNS).join(', ')}`);
  }
  return listTests().filter((file) => patterns.some((pattern) => pattern.test(path.basename(file))));
}

const [group, ...extraArgs] = process.argv.slice(2);
if (!group) {
  console.error(`Usage: tsx src/scripts/runTestGroup.ts <${Object.keys(GROUP_PATTERNS).join('|')}> [vitest args...]`);
  process.exit(2);
}

const files = filesForGroup(group);
if (!files.length) {
  console.error(`No tests matched group ${group}`);
  process.exit(2);
}

console.log(`[test-group] ${group}: ${files.length} file(s)`);
for (const file of files) console.log(`  - ${file}`);

const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(executable, ['vitest', 'run', ...files, ...extraArgs], {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
