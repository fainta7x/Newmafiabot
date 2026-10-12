import { describe, expect, it } from 'vitest';
import { normalizeStoredTournamentAppearance, parseGoMafiaTournamentReference } from '../lib/goMafiaTournaments.ts';
import { parsePublicTournamentStandings } from '../server/services/goMafiaTournamentService.ts';

const url = 'https://gomafia.pro/tournament/2634';
const ref = parseGoMafiaTournamentReference(url)!;
const fixture = `<!doctype html><html><head><title>GoMafia</title></head><body>
<header>Турниры</header><main><h1>1604 MAFIA TOUR 2026</h1>
<div>Даты проведения турнира</div><div>18.04.2026 – 19.04.2026</div>
<h2>Результаты турнира</h2><table><thead><tr><th>№</th><th>Игрок</th><th>Σ</th><th>Доп.баллы</th></tr></thead>
<tbody><tr><td>1</td><td><span>Бонавентура</span></td><td>12.56</td><td>3.5</td></tr>
<tr><td>2</td><td>Matis</td><td>12</td><td>4</td></tr>
<tr><td>3</td><td>Mickey</td><td>11,73</td><td>3.6</td></tr></tbody></table></main></body></html>`;

describe('public GoMafia tournament standings', () => {
  it('accepts only a fixed official tournament source', () => {
    expect(ref).toEqual({ tournamentId: '2634', sourceUrl: url });
    for (const bad of ['https://evil.com/tournament/2634', 'http://gomafia.pro/tournament/2634',
      'https://gomafia.pro/tournament/2634?redirect=evil', 'https://gomafia.pro.evil.com/tournament/2634',
      'https://gomafia.pro/stats/2634', 'https://gomafia.pro/tournament/0']) {
      expect(parseGoMafiaTournamentReference(bad), bad).toBeNull();
    }
  });
  it('reads published place, player nickname and score with provenance', () => {
    const parsed = parsePublicTournamentStandings(fixture, ref);
    expect(parsed).toMatchObject({
      tournamentId: '2634', tournamentName: '1604 MAFIA TOUR 2026',
      dateRange: '18.04.2026 – 19.04.2026', sourceUrl: url,
      standings: [
        { place: 1, nickname: 'Бонавентура', totalScore: 12.56 },
        { place: 2, nickname: 'Matis', totalScore: 12 },
        { place: 3, nickname: 'Mickey', totalScore: 11.73 },
      ],
    });
  });
  it('never guesses from a page without the official results table', () => {
    expect(() => parsePublicTournamentStandings('<h1>Unknown</h1>', ref)).toThrow();
    expect(() => parsePublicTournamentStandings(fixture.replace('<th>Игрок</th>', '<th>Команда</th>'), ref)).toThrow();
  });
  it('fails closed on duplicate exact standings', () => {
    const duplicate = fixture.replace('<tr><td>3</td>',
      '<tr><td>1</td><td>Бонавентура</td><td>12.56</td></tr><tr><td>3</td>');
    expect(() => parsePublicTournamentStandings(duplicate, ref)).toThrow();
  });
  it('validates saved tournament appearances without affecting club games', () => {
    const row = { tournament_id: '2634', tournament_name: '1604 MAFIA TOUR 2026',
      date_range: '18.04.2026 – 19.04.2026', place: 3, total_score: 11.73,
      external_nickname: 'Mickey', source_url: url, confirmed_at: '2026-10-12T10:00:00Z' };
    expect(normalizeStoredTournamentAppearance(row)).toMatchObject({
      source: 'gomafia', place: 3, totalScore: 11.73, externalNickname: 'Mickey',
    });
    expect(normalizeStoredTournamentAppearance({ ...row, source_url: 'https://evil.test/tournament/2634' })).toBeNull();
  });
});
