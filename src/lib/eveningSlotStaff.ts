/**
 * Every game of an evening needs 1 judge («ведущий») and its players — 10, novices 8 (owner, 2026-11-16: «везде в
 * регистрации нужно указывать что есть 1 судья/ведущий и его ник. И набор игроков»). One wording for every registration.
 */
export type EveningJudge = { id: string; nickname: string } | null | undefined;
export const judgeLine = (judge: EveningJudge) => judge ? `Ведущий: ${judge.nickname}` : 'Ведущий: пока не назначен';
export const playersLine = (registered: number, needed: number) => `Игроки: ${registered} из ${needed}`;
/** A game is gathered when it has its judge and all its players. */
export const slotGathered = (registered: number, needed: number, judge: EveningJudge) => Boolean(judge) && needed > 0 && registered >= needed;
