import { createGoMafiaPublicSnapshot, type GoMafiaPublicSnapshot, type GoMafiaPlayerReference } from '../../lib/gomafiaExternalProfile.ts';

/** Parse only visibly published stats; missing or changed markup fails closed. */
export function parsePublicGoMafiaStats(page: string, reference: GoMafiaPlayerReference, now: string): GoMafiaPublicSnapshot {
  // Extract visible text without executing or decoding page HTML.
  // Script/style contents are skipped by tag boundaries, not HTML-filtering regex.
  const lower = page.toLowerCase();
  let decoded = '';
  let cursor = 0;
  while (cursor < page.length) {
    const open = page.indexOf('<', cursor);
    if (open < 0) { decoded += page.slice(cursor); break; }
    decoded += page.slice(cursor, open) + '\\n';
    const close = page.indexOf('>', open + 1);
    if (close < 0) throw new Error('Malformed GoMafia HTML');
    const tag = lower.slice(open + 1, close).trim().split(/\\s/)[0];
    if (tag === 'script' || tag === 'style') {
      const closingStart = lower.indexOf('</' + tag, close + 1);
      if (closingStart < 0) throw new Error('Malformed GoMafia HTML');
      const closingEnd = lower.indexOf('>', closingStart);
      if (closingEnd < 0) throw new Error('Malformed GoMafia HTML');
      cursor = closingEnd + 1;
    } else {
      cursor = close + 1;
    }
  }
  decoded = decoded.replace(/&nbsp;|&#160;/gi, ' ');
  const tokens = decoded.split(/\n/).map(s => s.replace(/[\u00a0\u202f]/g, ' ').trim()).filter(Boolean);
  const section = tokens.indexOf('Основная статистика');
  if (section < 0) throw new Error('GoMafia did not return a recognized public statistics section');
  const end = tokens.indexOf('Дополнительные баллы', section);
  const values = tokens.slice(section + 1, end > section ? end : section + 90);
  const toNumber = (v: string | undefined): number | null => {
    const normalized = String(v || '').replace(/\s/g, '').replace(',', '.').replace(/%$/, '');
    return /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : null;
  };
  const findBefore = (labels: string[], maxBack = 1) => {
    const idx = values.findIndex(x => labels.includes(x));
    if (idx < 1) return null;
    for (let offset = 1; offset <= maxBack; offset++) {
      const n = toNumber(values[idx - offset]);
      if (n !== null) return n;
    }
    return null;
  };
  const roleCount = (labels: string[]): number | null => {
    const idx = values.findIndex(x => labels.includes(x));
    if (idx < 1) return null;
    const m = /^(\d+)\s*\(\d+%\)$/.exec(values[idx - 1]);
    return m ? Number(m[1]) : null;
  };
  const wrSection = values.indexOf('Винрейт (WR)');
  const wr = wrSection >= 0 ? values.slice(wrSection) : [];
  const findRate = (label: string) => {
    const idx = wr.indexOf(label);
    return idx > 0 ? toNumber(wr[idx - 1]) : null;
  };
  const totalGames = findBefore(['Сыграно игр']);
  const overallElo = findBefore(['Общий ELO']);
  if (totalGames === null || overallElo === null) throw new Error('GoMafia public statistics are incomplete or layout changed');
  return createGoMafiaPublicSnapshot(reference, {
    year: null,
    totalGames,
    overallElo,
    tableElo: findBefore(['ELO столов']),
    averageScore: findBefore(['Средний балл']),
    overallWinRatePercent: findRate('Общий винрейт'),
    roleGames: {
      citizen: roleCount(['Игр за мирного', 'Игры за мирного', 'Игра за мирного']),
      sheriff: roleCount(['Игр за шерифа', 'Игры за шерифа', 'Игра за шерифа']),
      mafia: roleCount(['Игр за мафию', 'Игры за мафию', 'Игра за мафию']),
      don: roleCount(['Игр за дона', 'Игры за дона', 'Игра за дона']),
    },
    roleWinRatePercent: {
      citizen: findRate('Мирный'), sheriff: findRate('Шериф'),
      mafia: findRate('Мафия'), don: findRate('Дон'),
    },
  }, now);
}

/** Single fixed provider host, bounded response size, timeout and no redirects. */
export async function fetchPublicGoMafiaStats(reference: GoMafiaPlayerReference): Promise<GoMafiaPublicSnapshot> {
  const response = await fetch(reference.profileUrl, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(9000),
    headers: { Accept: 'text/html', 'User-Agent': '2LA-Noire-player-career/1.0' },
  });
  if (!response.ok || response.status >= 300) throw new Error('GoMafia public page unavailable');
  if (!String(response.headers.get('content-type') || '').includes('text/html'))
    throw new Error('Unexpected GoMafia response type');
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 1024 * 1024) throw new Error('GoMafia public page too large');
  const body = await response.text();
  if (body.length > 1024 * 1024) throw new Error('GoMafia public page too large');
  return parsePublicGoMafiaStats(body, reference, new Date().toISOString());
}
