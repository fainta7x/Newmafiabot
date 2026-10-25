import { round2 } from '../shared/numbers.ts';

export interface ExplainedEloDelta {
  won: boolean; expectedTeamResult: number; modifiedResultDelta: number; resultDelta: number;
  carryModifier: number; personalDelta: number; contributionDelta?: number;
  personalCapDelta?: number; disciplinaryDelta?: number; totalDelta: number;
}

/** One additive explanation shared by the player journey and read-only comparison reports. */
export function explainEloDelta(row: ExplainedEloDelta) {
  const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(round2(value))}`;
  const outcome = row.won ? 'Победа' : 'Поражение';
  const terms = [
    { label: 'командная часть', value: row.modifiedResultDelta },
    { label: 'личные бонусы', value: row.personalDelta },
    { label: 'действия в игре', value: row.contributionDelta ?? 0 },
    { label: 'ограничение личной части', value: row.personalCapDelta ?? 0 },
    { label: 'дисциплина', value: row.disciplinaryDelta ?? 0 },
  ];
  const kept = terms.filter((term, index) => index === 0 || Math.abs(term.value) >= 0.005);
  const details = [`${outcome} при расчётной вероятности команды ${Math.round(row.expectedTeamResult * 100)}%`,
    ...kept.map((term) => `${term.label} ${signed(term.value)}`)];
  if (Math.abs(row.modifiedResultDelta - row.resultDelta) >= 0.005) details.push(`поправка за состав своей команды ×${round2(row.carryModifier)}`);
  const roundedSum = round2(kept.reduce((sum, term) => sum + round2(term.value), 0));
  const formula = kept.map((term, index) => index === 0 ? String(round2(term.value)) : `${term.value < 0 ? '−' : '+'} ${Math.abs(round2(term.value))}`).join(' ');
  return {
    headline: `${outcome}: ${signed(row.totalDelta)} Elo`, details,
    formula: `${formula} ${roundedSum === round2(row.totalDelta) ? '=' : '≈'} ${round2(row.totalDelta)}`,
  };
}
