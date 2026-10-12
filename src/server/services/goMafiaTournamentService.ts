import { parseGoMafiaTournamentReference, validateTournamentStanding, type GoMafiaTournamentReference, type PublicTournamentResult, type PublicTournamentStanding } from '../../lib/goMafiaTournaments.ts';

const htmlText = (part: string): string => {
  let text = '';
  let inTag = false;
  for (const char of part) {
    if (char === '<') { inTag = true; continue; }
    if (char === '>') { inTag = false; text += ' '; continue; }
    if (!inTag) text += char;
  }
  return text.replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Math.min(1114111, Number(code))))
    .replace(/\s+/g, ' ').trim();
};

const partsByTag = (markup: string, tag: string, limit: number): string[] => {
  const result: string[] = [];
  const lower = markup.toLowerCase();
  const open = '<' + tag;
  const end = '</' + tag;
  let offset = 0;
  while (result.length < limit) {
    const start = lower.indexOf(open, offset);
    if (start < 0) break;
    const boundary = lower[start + open.length];
    if (boundary && boundary !== ' ' && boundary !== '>' && boundary !== '\n') {
      offset = start + open.length; continue;
    }
    const contentStart = lower.indexOf('>', start + open.length);
    if (contentStart < 0) break;
    const endStart = lower.indexOf(end, contentStart + 1);
    if (endStart < 0) break;
    const endClose = lower.indexOf('>', endStart + end.length);
    if (endClose < 0) break;
    result.push(markup.slice(contentStart + 1, endStart));
    offset = endClose + 1;
  }
  return result;
};

/**
 * Parses only the first published tournament results table with rank, nickname and sum.
 * Never guesses per-game roles, wins, or individual game protocols from a leaderboard.
 */
export function parsePublicTournamentStandings(page: string, ref: GoMafiaTournamentReference): PublicTournamentResult {
  if (page.length > 1_000_000) throw new Error('GoMafia tournament page too large');
  const headings = partsByTag(page, 'h1', 6).map(htmlText);
  const tournamentName = headings.find(x => x.length > 3 && x.length <= 180 && !['Турниры', 'Результаты турнира'].includes(x))
    ?? '';
  const allText = htmlText(page);
  const dateRange = allText.match(/\b\d{2}\.\d{2}\.\d{4}\s*[–—-]\s*\d{2}\.\d{2}\.\d{4}\b/)?.[0] || null;
  const candidateTables = partsByTag(page, 'table', 20);
  let standings: PublicTournamentStanding[] = [];
  for (const table of candidateTables) {
    const rows = partsByTag(table, 'tr', 1500);
    const head = rows.slice(0, 3).map(htmlText).join(' ').toLocaleLowerCase('ru-RU');
    if (!head.includes('игрок') || !head.includes('σ') && !head.includes('Σ')) continue;
    const parsed: PublicTournamentStanding[] = [];
    for (const row of rows) {
      const cells = partsByTag(row, 'td', 20).map(htmlText);
      if (cells.length < 3) continue;
      const place = Number(cells[0].replace(/[\s№]/g, ''));
      const nickname = cells[1];
      const totalScore = Number(cells[2].replace(/\s/g, '').replace(',', '.'));
      const entry = { place, nickname, totalScore };
      if (validateTournamentStanding(entry)) parsed.push(entry);
    }
    if (parsed.length >= 2) { standings = parsed; break; }
  }
  if (!tournamentName || !standings.length) throw new Error('Публичная таблица турнира не распознана');
  if (new Set(standings.map(x => x.place + ':' + x.nickname)).size !== standings.length)
    throw new Error('Дубли записей турнирной таблицы');
  return { tournamentId: ref.tournamentId, tournamentName, dateRange, sourceUrl: ref.sourceUrl, standings };
}

export async function loadPublicGoMafiaTournament(input: unknown): Promise<PublicTournamentResult> {
  const ref = parseGoMafiaTournamentReference(input);
  if (!ref) throw new Error('Укажи публичную ссылку GoMafia вида https://gomafia.pro/tournament/123');
  const response = await fetch(ref.sourceUrl, {
    redirect: 'manual', signal: AbortSignal.timeout(10000),
    headers: { Accept: 'text/html', 'User-Agent': '2LA-Noire-sports-career/1.0' },
  });
  if (!response.ok || response.status >= 300 ||
      !String(response.headers.get('content-type') || '').includes('text/html'))
    throw new Error('Публичная страница турнира GoMafia недоступна');
  if (Number(response.headers.get('content-length') || 0) > 1_000_000)
    throw new Error('Страница турнира слишком большая');
  const html = await response.text();
  return parsePublicTournamentStandings(html, ref);
}
