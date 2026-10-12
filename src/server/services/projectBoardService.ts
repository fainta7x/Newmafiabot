import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseProjectState, type BoardCard } from '../../lib/projectBoard.ts';

const REPO = 'fainta7x/Newmafiabot';
const STATE_FILE = path.resolve(process.cwd(), 'docs', 'PROJECT_BOARD_RU.md');
const CHECKS = ['Release gate', 'Secret scan', 'Analyze (javascript-typescript)', 'Analyze (python)'];
const CACHE_MS = 60_000;

let boardCache: { mtime: number; cards: BoardCard[] } | null = null;

/** The cards of `docs/PROJECT_STATE.md`; re-read only when the file changed. */
export async function loadProjectBoard() {
  const info = await stat(STATE_FILE);
  if (!boardCache || boardCache.mtime !== info.mtimeMs) boardCache = { mtime: info.mtimeMs, cards: parseProjectState(await readFile(STATE_FILE, 'utf8')) };
  return { cards: boardCache.cards, updated_at: new Date(info.mtimeMs).toISOString(), source: 'docs/PROJECT_BOARD_RU.md' };
}

export type PrColour = 'merged' | 'working' | 'ready' | 'failed' | 'closed';
export interface BoardPullRequest {
  number: number; title: string; url: string; colour: PrColour; author: 'claude' | 'gpt'; branch: string;
  state: 'open' | 'merged' | 'closed'; updated_at: string; merged_at: string | null; checks: { passed: number; total: number } | null;
}

const authorOf = (pr: any): 'claude' | 'gpt' => {
  const ref = String(pr?.head?.ref || '');
  const body = String(pr?.body || '');
  return ref.startsWith('claude/') || body.includes('claude.ai/code') || body.includes('Claude Code') ? 'claude' : 'gpt';
};

const headers = () => ({
  Accept: 'application/vnd.github+json', 'User-Agent': '2la-noire-crm',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
});

async function github(pathname: string) {
  const response = await fetch(`https://api.github.com/repos/${REPO}${pathname}`, { headers: headers(), signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  return response.json() as Promise<any>;
}

/** Same colour language as the bot's /prs: 🟢 merged · 🟡 working / checks running · 🔵 passed, not merged · 🔴 failed · ⚪ closed. */
export const colourOf = (pr: any, checks: any[]): { colour: PrColour; passed: number; total: number } => {
  if (pr.merged_at) return { colour: 'merged', passed: 0, total: 0 };
  if (pr.state === 'closed') return { colour: 'closed', passed: 0, total: 0 };
  const found = new Map(checks.map((check) => [check.name, check]));
  const selected = CHECKS.map((name) => found.get(name));
  const passed = selected.filter((check) => check?.status === 'completed' && check?.conclusion === 'success').length;
  if (selected.some((check) => check && ['failure', 'cancelled', 'timed_out'].includes(check.conclusion))) return { colour: 'failed', passed, total: CHECKS.length };
  return { colour: passed === CHECKS.length ? 'ready' : 'working', passed, total: CHECKS.length };
};

let prCache: { at: number; value: BoardPullRequest[] } | null = null;

export async function loadBoardPullRequests(): Promise<BoardPullRequest[]> {
  if (prCache && Date.now() - prCache.at < CACHE_MS) return prCache.value;
  const pulls = await github('/pulls?state=all&sort=updated&direction=desc&per_page=30');
  const value: BoardPullRequest[] = [];
  let looked = 0;
  for (const pr of pulls) {
    let checks: any[] = [];
    if (pr.state === 'open' && looked < 8) {
      looked += 1;
      checks = (await github(`/commits/${pr.head.sha}/check-runs?per_page=100`).catch(() => ({ check_runs: [] }))).check_runs || [];
    }
    const { colour, passed, total } = colourOf(pr, checks);
    value.push({
      number: Number(pr.number), title: String(pr.title || ''), url: String(pr.html_url || ''), colour, author: authorOf(pr), branch: String(pr.head?.ref || ''),
      state: pr.merged_at ? 'merged' : pr.state === 'closed' ? 'closed' : 'open', updated_at: String(pr.updated_at || ''), merged_at: pr.merged_at || null,
      checks: pr.state === 'open' && total ? { passed, total } : null,
    });
  }
  prCache = { at: Date.now(), value };
  return value;
}
