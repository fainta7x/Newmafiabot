import { readdirSync } from 'node:fs';
import path from 'node:path';

const TEST_DIR = path.resolve('src/tests');

export const RELEASE_TEST_GROUPS = [
  'smoke',
  'crm',
  'live-game',
  'telegram',
  'vk',
  'regression',
] as const;

export const GROUP_PATTERNS: Record<string, RegExp[]> = {
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

export function listTests(): string[] {
  return readdirSync(TEST_DIR)
    .filter((name) => /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/.test(name))
    .map((name) => path.join('src/tests', name))
    .sort();
}

export function filesForGroup(group: string): string[] {
  const patterns = GROUP_PATTERNS[group];
  if (!patterns) {
    throw new Error(`Unknown test group: ${group}. Available: ${Object.keys(GROUP_PATTERNS).join(', ')}`);
  }
  return listTests().filter((file) => patterns.some((pattern) => pattern.test(path.basename(file))));
}

export function releaseGroupManifest(): Record<string, string[]> {
  return Object.fromEntries(
    RELEASE_TEST_GROUPS.map((group) => [group, filesForGroup(group)]),
  );
}
