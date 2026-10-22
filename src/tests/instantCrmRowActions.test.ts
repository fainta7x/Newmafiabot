import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const sliceBetween = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
};

describe('instant CRM row actions', () => {
  it('keeps closeout payment and attendance edits local and uses the real bulk attendance field', () => {
    const source = read('src/components/crm/EveningCloseoutPanel.tsx');
    const patch = sliceBetween(source, 'const patchParticipants = async', 'const openWalkIn');

    expect(patch).toContain('reconcileCloseoutParticipants');
    expect(patch).not.toContain('load(true)');
    expect(source).toContain("attendance_status: 'attended'");
    expect(source).toContain("attendance_status: 'no_show'");
    expect(source).not.toContain('attendance_fact:');
    expect(source).toContain('disabled={busyIds.has(item.id)}');
  });

  it('does not globally lock the other quick-attendance rows while one player saves', () => {
    const activeRoster = read('src/components/crm/EveningActiveRosterView.tsx');

    expect(activeRoster).toContain('const [busyIds, setBusyIds]');
    expect(activeRoster).toContain('const rowBusy = busyIds.has(participant.id)');
  });

  it('uses action labels that match the payment mutation', () => {
    const source = read('src/components/crm/EveningPaymentsPanel.tsx');

    expect(source).toContain('onClick={() => void setPaid(participant, false)}');
    expect(source).toContain('Снять оплату');
    expect(source).toContain('onClick={() => void setPaid(participant, true)}');
    expect(source).toContain('Принять оплату');
    expect(source).not.toContain('> Оплатил</button>');
    expect(source).not.toContain('> Не оплатил</button>');
  });

  it('preserves the already-instant dedicated payment panel behavior', () => {
    const source = read('src/components/crm/EveningPaymentsPanel.tsx');
    const setPaid = sliceBetween(source, 'const setPaid = async', 'const summary');

    expect(setPaid).toContain('setData((current) => current ?');
    expect(setPaid).not.toContain('load()');
  });
});
