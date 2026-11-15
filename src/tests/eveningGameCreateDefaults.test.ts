import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Owner, 2026-11-15: a new game opens filled — the evening judge and the next planned game's seating —
// one «Подобрать» instead of three pickers, the judge changed in its own window; the first table is the evening's.
const sheet = readFileSync('src/components/crm/EveningGameCreateSheet.tsx', 'utf8');
const tablesView = readFileSync('src/components/crm/EveningTablesView.tsx', 'utf8');
const routes = readFileSync('src/server/routes/eveningsRoutesBase.ts', 'utf8');

describe('new evening game defaults', () => {
  it('picks the next planned game and loads its seating without a click', () => {
    expect(sheet).toContain('autoPlanned.current = true');
    expect(sheet).toContain('loadPlannedSeats(next.id)');
    expect(sheet).not.toContain('Загрузить рассадку из плана');
  });
  it('suggests the evening judge and changes it in a separate window', () => {
    expect(sheet).toContain('setJudgePlayerId((current) => current || judgeId)');
    expect(sheet).toContain('data-testid="change-judge"');
    expect(sheet).toContain('aria-label="Судья игры"');
  });
  it('keeps one lineup picker', () => {
    expect(sheet).not.toContain('Прошлая десятка');
    expect(sheet).not.toContain('Перемешать');
    expect(sheet).toContain('data-testid="auto-select"');
  });
  it('the first table uses the evening judge and cannot be deleted', () => {
    expect(tablesView).toContain("table.id === primaryId ? (eveningJudge || 'Не назначен')");
    expect(routes).toContain('Основной стол вечера удалить нельзя');
    expect(routes).toContain('host_player_id');
  });
});
