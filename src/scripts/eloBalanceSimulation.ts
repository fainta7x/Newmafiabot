import { calculateCanonicalEloGame } from '../server/services/eloRatingService.ts';

/**
 * Elo balance simulation (owner, 2026-11-01): one player with a fixed play profile at an equal-level table, run through the real
 * `calculateCanonicalEloGame`. `npx tsx src/scripts/eloBalanceSimulation.ts`. Read-only; changes nothing.
 * Personal-contribution levels are quantiles (p10/p50/p90, in Elo) of `eloContribution` over 255 player rows of the 26 completed
 * club games on 2026-11-01; refresh them when more games exist. Winning chances are assumptions printed in the output.
 */
const Q = {
  red: { p10: -12, p50: 0, p90: 16 },
  black: { p10: -4, p50: 0, p90: 16 },
} as const;
type Team = 'red' | 'black';
const quality = { bad: 'p10', avg: 'p50', good: 'p90' } as const;
// One focal player at a table of equal level (everyone 1000 Elo), the other nine play an average personal game.
const delta = (team: Team, q: keyof typeof quality, won: boolean, others = 1000) => {
  const players = Array.from({ length: 10 }, (_, i) => ({ playerId: `p${i}`, team: (i < 7 ? 'red' : 'black') as Team, elo: others, canonicalPersonalGamePoints: 0, contributionPoints: 0 }));
  // seat 0..6 red, 7..9 black
  const idx = team === 'red' ? 0 : 7;
  players[idx].contributionPoints = Q[team][quality[q]] / 40;
  const res = calculateCanonicalEloGame(players as any, won ? team : (team === 'red' ? 'black' : 'red'));
  return Math.round(res[idx].totalDelta * 10) / 10;
};
console.log('MATRIX: Elo per game for one player at an equal-level table (others play an average game)');
console.log('team  play   win     lose');
for (const t of ['red', 'black'] as Team[]) for (const q of ['bad', 'avg', 'good'] as const) console.log(`${t.padEnd(6)}${q.padEnd(6)} ${String(delta(t, q, true)).padEnd(7)} ${delta(t, q, false)}`);

// Long-run drift: P(red wins) at a level table = pRedBase; own play shifts the own team's win chance by ±shift.
const drift = (roleSkill: { red: keyof typeof quality; black: keyof typeof quality }, pRedBase: number, shift: number, games = 100000, seed = 7) => {
  let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  let total = 0, red = 0, black = 0, nr = 0, nb = 0;
  for (let g = 0; g < games; g += 1) {
    const team: Team = rnd() < 0.7 ? 'red' : 'black';
    const q = roleSkill[team];
    const s2 = q === 'good' ? shift : q === 'bad' ? -shift : 0;
    // contribution varies a little around its level: pick a random quantile near the profile level
    const pTeamWin = team === 'red' ? pRedBase + s2 : (1 - pRedBase) + s2;
    const won = rnd() < Math.min(0.97, Math.max(0.03, pTeamWin));
    const d = delta(team, q, won);
    total += d; if (team === 'red') { red += d; nr += 1; } else { black += d; nb += 1; }
  }
  return { perGame: total / games, red: red / nr, black: black / nb };
};
const profiles: Array<[string, { red: keyof typeof quality; black: keyof typeof quality }]> = [
  ['good red / bad black', { red: 'good', black: 'bad' }],
  ['bad red / good black', { red: 'bad', black: 'good' }],
  ['good in both roles', { red: 'good', black: 'good' }],
  ['bad in both roles', { red: 'bad', black: 'bad' }],
  ['average in both', { red: 'avg', black: 'avg' }],
];
for (const [label, pRed] of [['design (reds win 30% at equal level)', 0.30], ['club data (reds win 38.5%)', 0.385]] as Array<[string, number]>) {
  console.log(`\nDRIFT per 100 games, ${label}; good play adds +8 points to the own team's win chance, bad −8`);
  for (const [name, sk] of profiles) { const r = drift(sk, pRed, 0.08); console.log(`${name.padEnd(24)} total ${(r.perGame * 100).toFixed(0).padStart(5)}   as red ${r.red.toFixed(1).padStart(6)}/game   as black ${r.black.toFixed(1).padStart(6)}/game`); }
  // balance check: same quality "avg" but the win chance equals the design expectation
}
console.log('\nBREAK-EVEN: win rate each team needs for 0 Elo per game with an average personal game');
for (const t of ['red', 'black'] as Team[]) {
  const w = delta(t, 'avg', true), l = delta(t, 'avg', false);
  console.log(`${t}: win +${w}, loss ${l} -> break-even win rate ${(-l / (w - l) * 100).toFixed(1)}%`);
}
