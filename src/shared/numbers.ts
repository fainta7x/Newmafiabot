/**
 * Rounding of a score or a point value shown to people: two decimals, half away from zero, with the usual correction
 * for binary fractions (owner, 2026-10-24: `1.005` is `1.01` on every screen). Money is rounded by the payment code and
 * is not changed by this function.
 */
export const round2 = (value: unknown): number => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
