import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const checkMode = args.includes('--check');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const limit = Math.max(1, Math.min(50, Number(limitArg?.split('=')[1] || 20) || 20));
const queryArgs = args.filter((arg) => !arg.startsWith('--'));
const query = queryArgs.join(' ').trim() || (checkMode ? 'player' : '');

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

const splitWords = (value: string): string[] => value
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .toLowerCase()
  .split(/[^a-z0-9а-яё_-]+/i)
  .map((word) => word.trim())
  .filter((word) => word.length >= 2);

const classify = (file: string): string => {
  if (/\.(test|spec)\.[jt]sx?$/.test(file) || /^tests\//.test(file)) return 'TEST';
  if (file.startsWith('src/components/')) return 'UI';
  if (file.startsWith('src/server/routes/')) return 'API';
  if (file.startsWith('src/server/services/')) return 'SERVICE';
  if (file.startsWith('src/db/') || file.startsWith('drizzle/') || file === 'database.py') return 'DB';
  if (file.startsWith('docs/') || file === 'AGENTS.md' || file === 'README.md') return 'DOC';
  if (file.endsWith('.py') || file.startsWith('handlers/')) return 'BOT';
  if (/\.(ya?ml|json)$/.test(file) || file.startsWith('.github/')) return 'CONFIG';
  return 'CODE';
};

const searchable = (file: string): boolean => {
  if (/package-lock\.json$/.test(file)) return false;
  return /\.(ts|tsx|js|jsx|py|md|json|ya?ml|sql|css|html|txt)$/.test(file)
    || ['AGENTS.md', 'README.md'].includes(file);
};

if (!query) {
  console.error('Usage: npm run project:find -- <words> [--limit=20] [--json]');
  console.error('Example: npm run project:find -- "events calendar"');
  process.exitCode = 2;
} else {
  const files = runGit('ls-files').split('\n').filter(Boolean);
  const normalizedQuery = query.toLowerCase();
  const tokens = Array.from(new Set(splitWords(query)));

  const results = files.map((file) => {
    const lowerPath = file.toLowerCase();
    const base = path.basename(lowerPath);
    let score = 0;
    const reasons: string[] = [];

    if (lowerPath === normalizedQuery) {
      score += 100;
      reasons.push('exact path');
    } else if (lowerPath.includes(normalizedQuery)) {
      score += 35;
      reasons.push('phrase in path');
    }

    for (const token of tokens) {
      if (base.includes(token)) {
        score += 18;
        reasons.push(`${token}: filename`);
      } else if (lowerPath.includes(token)) {
        score += 9;
        reasons.push(`${token}: path`);
      }
    }

    if (searchable(file)) {
      const content = readText(file).toLowerCase();
      if (content) {
        if (normalizedQuery.length >= 3 && content.includes(normalizedQuery)) {
          score += 12;
          reasons.push('phrase in content');
        }
        for (const token of tokens) {
          const first = content.indexOf(token);
          if (first >= 0) {
            score += 3;
            if (content.indexOf(token, first + token.length) >= 0) score += 2;
            reasons.push(`${token}: content`);
          }
        }
      }
    }

    const type = classify(file);
    if (type === 'API' || type === 'SERVICE' || type === 'UI') score += 1;
    return { file, type, score, reasons: Array.from(new Set(reasons)) };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .slice(0, limit);

  const testResults = results.filter((item) => item.type === 'TEST');
  const firstHops = results.filter((item) => item.type !== 'TEST').slice(0, Math.min(12, limit));
  const output = {
    query,
    trackedFiles: files.length,
    resultCount: results.length,
    firstHops,
    tests: testResults,
    all: results,
    hints: [
      'Read docs/FEATURE_MAP.md first when the feature is known.',
      'Use docs/ERROR_PLAYBOOK.md first when starting from a symptom/error.',
      'After choosing files, use npm run project:affected -- <changed files> to select focused tests.',
    ],
  };

  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    console.log(`Project finder: ${query}`);
    console.log('------------------------------');
    if (!results.length) console.log('No matches. Try a shorter feature name, API term, UI label, table, or error fragment.');
    for (const item of results) {
      console.log(`${String(item.score).padStart(3)}  ${item.type.padEnd(7)} ${item.file}`);
    }
    console.log('');
    console.log('Next: read the highest-scoring first hops, not the whole subsystem.');
    console.log('For a known feature use docs/FEATURE_MAP.md; for a symptom use docs/ERROR_PLAYBOOK.md.');
  }

  if (checkMode && (files.length === 0 || results.length === 0)) process.exitCode = 1;
}
