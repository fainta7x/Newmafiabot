// Synthetic, internally consistent examples for result presentation; no real game records.
const date = (day: number) => `2026-10-${String(day).padStart(2, '0')}T18:00:00Z`;
const deltas = [12, -8, 20, 5, -14, 10, 8, -6, 13];
let rating = 1500;
const selected = deltas.map((delta, index) => {
  if (index === 3) rating += 10; // A casual game omitted by the rating-format filter.
  const before = rating;
  rating += delta;
  const won = delta > 0 && index !== 3;
  const teamDelta = won ? 10 : -10;
  return {
    id: `club:context-${index + 1}`, source: 'club' as const, date: date(index * 2 + 1),
    title: 'Октябрьский вечер', game_number: index + 1, team: index % 2 ? 'black' : 'red', won,
    elo_before: before, elo_after: rating, elo_delta: delta, expected_percent: 40,
    team_delta: teamDelta, personal_delta: delta - teamDelta,
    explanation: { headline: won ? 'Победа команды' : 'Поражение команды', details: ['Синтетический сохранённый пример'], formula: `${teamDelta} + (${delta - teamDelta}) = ${delta}` },
  };
});
const outcome = { expected_percent: 40, elo_delta: 10, team_delta: 10, carry_modifier: 1 };
export function resultsContextJourney(format: string | null) {
  const events = format === 'RATING' ? selected : [
    ...selected.slice(0, 3),
    { ...selected[2], id: 'club:omitted-1', date: date(6), elo_before: 1524, elo_after: 1534, elo_delta: 10, personal_delta: 0, explanation: {headline:'Победа команды',details:[],formula:'10 + 0 = 10'} },
    ...selected.slice(3),
    { ...selected[8], id: 'club:omitted-2', date: date(20), elo_before: 1550, elo_after: 1562, elo_delta: 12, personal_delta: 2, explanation: {headline:'Победа команды',details:[],formula:'10 + 2 = 12'} },
  ];
  return {
    player: { id: 'preview-player', nickname: 'Чагин', elo: 1562, seed: 1500 },
    scope: { period: 'all', period_label: 'Всё время', format: format === 'RATING' ? 'RATING' : 'all', format_label: format === 'RATING' ? 'Рейтинговый' : 'Все форматы' },
    summary: { games: events.length, current: 1562, computed_current: 1562, chart_start: 1500, peak: format === 'RATING' ? 1550 : 1562, floor: 1500, net: format === 'RATING' ? 40 : 62, last_delta: events.at(-1)!.elo_delta },
    preview: { basis: 'Синтетический пример', red: { win: outcome, loss: { ...outcome, elo_delta: -10 } }, black: { win: outcome, loss: { ...outcome, elo_delta: -10 } } },
    events,
  };
}
export const resultsContextGames = Array.from({ length: 18 }, (_, index) => ({
  id: `club:history-${18 - index}`, title: 'Октябрьский вечер', date: date(24 - index), game_number: 18 - index,
  role: index % 2 ? 'citizen' : 'sheriff', team: 'red', won: index % 3 !== 0, elo_delta: index % 3 === 0 ? -8 : 12,
}));
export const resultsContextSeason = (key: string, label: string, unranked = false) => {
  const ranking = Array.from({ length: 15 }, (_, index) => ({
    place: index + 1, player_id: index === 7 ? 'preview-player' : `context-player-${index}`, nickname: index === 7 ? 'Чагин' : index === 0 ? 'Очень длинный игровой псевдоним' : `Игрок ${index + 1}`,
    games: index === 7 ? 12 : 20, wins: 15 - index, win_rate: Math.round((15 - index) / (index === 7 ? 12 : 20) * 100), avatar_url: null,
  }));
  if (unranked) ranking[7] = { ...ranking[7], player_id: 'another-player', nickname: 'Другой игрок' };
  return {
    key, label, start: Date.parse(unranked ? '2026-04-01' : '2026-07-01'), end: Date.parse(unranked ? '2026-07-01' : '2026-10-01'), games: 48, players: 21, ranking, champion: ranking[0],
    viewer: unranked ? { games: 3, wins: 2, win_rate: 67, place: null } : { games: 12, wins: 8, win_rate: 67, place: 8 },
  };
};
