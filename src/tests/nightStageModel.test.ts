import { describe, expect, it } from 'vitest';
import { nightStageView, donAtTable, sheriffAtTable } from '../components/LiveGameEngine/nightStageModel.ts';

const players = (dead: number[] = []) => ['citizen', 'citizen', 'sheriff', 'citizen', 'mafia', 'mafia', 'don', 'citizen', 'citizen', 'citizen'].map((role, index) => ({
  slot_num: index + 1, nickname: `Игрок ${index + 1}`, role, alive: !dead.includes(index + 1),
})) as any[];
const base = { players: players(), shotSlot: null, donSlot: null, donResult: false, sheriffSlot: null, sheriffResult: null };

describe('night stage view', () => {
  it('names the stage and says what to do while nobody is chosen', () => {
    const shooting = nightStageView({ ...base, subPhase: 'shooting' });
    expect([shooting.index, shooting.total, shooting.stage, shooting.tone]).toEqual([1, 5, 'Отстрел', 'shot']);
    expect(shooting.hint).toContain('Нажмите на игрока');
    expect(shooting.chosen).toBe('Цель: не выбрана');
  });
  it('shows the chosen target and check', () => {
    expect(nightStageView({ ...base, subPhase: 'shooting', shotSlot: 4 }).chosen).toBe('Цель: #4 Игрок 4');
    expect(nightStageView({ ...base, subPhase: 'don', donSlot: 3, donResult: true }).chosen).toBe('Дон проверил: #3 Игрок 3 — Шериф');
    expect(nightStageView({ ...base, subPhase: 'sheriff', sheriffSlot: 5, sheriffResult: 'ЧЁРНЫЙ!' }).chosen).toBe('Шериф проверил: #5 Игрок 5 — ЧЁРНЫЙ!');
  });
  it('says there is no check when the Don or the Sheriff is not at the table', () => {
    expect(donAtTable(players([7]))).toBe(false);
    expect(sheriffAtTable(players([3]))).toBe(false);
    expect(nightStageView({ ...base, players: players([7]), subPhase: 'don' }).hint).toContain('Дона за столом нет');
    expect(nightStageView({ ...base, players: players([3]), subPhase: 'sheriff' }).hint).toContain('Шерифа за столом нет');
  });
  it('the morning and the best move share the last stage', () => {
    expect(nightStageView({ ...base, subPhase: 'morning' }).index).toBe(4);
    expect(nightStageView({ ...base, subPhase: 'best_move' }).hint).toContain('Лучший ход');
  });
});
