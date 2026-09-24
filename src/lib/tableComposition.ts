import { normalizeEveningFormat } from './eveningFormat.ts';

/**
 * Table size (user-approved 2026-09-24): a game has 10 players and a judge; novice evenings may
 * seat 8 or 9. Roles by table size:
 * - 10: Дон, 2 мафии, Шериф, 6 мирных (classic);
 * - 9: Дон, 2 мафии, Шериф, 5 мирных;
 * - 8: Дон, 1 мафия, Шериф, 5 мирных.
 */
export const CLASSIC_TABLE_SIZE = 10;
export const MIN_NOVICE_TABLE_SIZE = 8;

export type TableRoleCounts = { citizen: number; sheriff: number; mafia: number; don: number };

export const isSupportedTableSize = (size: number) => Number.isInteger(size) && size >= MIN_NOVICE_TABLE_SIZE && size <= CLASSIC_TABLE_SIZE;

/** Table sizes a game of this evening may have. */
export const allowedTableSizes = (format: unknown): number[] => (
  normalizeEveningFormat(format) === 'NOVICE' ? [8, 9, 10] : [CLASSIC_TABLE_SIZE]
);

export const minTableSize = (format: unknown) => Math.min(...allowedTableSizes(format));

export const tableRoleCounts = (size: number): TableRoleCounts => {
  if (!isSupportedTableSize(size)) throw new Error(`Неподдерживаемый размер стола: ${size}`);
  if (size === 8) return { citizen: 5, sheriff: 1, mafia: 1, don: 1 };
  if (size === 9) return { citizen: 5, sheriff: 1, mafia: 2, don: 1 };
  return { citizen: 6, sheriff: 1, mafia: 2, don: 1 };
};

const mafiaWord = (count: number) => (count === 1 ? '1 мафия' : `${count} мафии`);

/** «6 мирных, Шериф, 2 мафии и Дон» for the given table size. */
export const tableRolesLabel = (size: number) => {
  const counts = tableRoleCounts(size);
  return `${counts.citizen} мирных, Шериф, ${mafiaWord(counts.mafia)} и Дон`;
};

/** True when the counts match the composition of a table of this size. */
export const roleCountsMatchTable = (counts: Partial<TableRoleCounts>, size: number) => {
  if (!isSupportedTableSize(size)) return false;
  const expected = tableRoleCounts(size);
  return (counts.citizen || 0) === expected.citizen
    && (counts.sheriff || 0) === expected.sheriff
    && (counts.mafia || 0) === expected.mafia
    && (counts.don || 0) === expected.don;
};
