import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('judge training reuses the actual club Live Game layout', () => {
  it('mounts exactly the production game shell, without training scroll wrappers', () => {
    const modal = read('src/components/crm/EveningLiveGameModal.tsx');
    expect(modal).toContain('{trainingMode && <JudgeConductCoach />}');
    expect(modal).toContain('<div>\\n      <div className="evening-live-engine-shell');
    expect(modal).toContain('<div className="evening-live-engine-shell py-0.5 md:py-3"');
    expect(modal).not.toContain("h-[calc(100dvh-34px)] overflow-y-auto overscroll-contain");
    expect(modal).toContain("{livePhase !== 'setup' && (");
    expect(modal).not.toContain("{!trainingMode && livePhase !== 'setup' && (");
    expect(modal).toContain('className="evening-live-identity-layer"');
  });

  it('keeps canonical table CSS and puts guidance in a dismissible overlay', () => {
    const css = read('src/components/crm/liveGameTelegram.css');
    const coach = read('src/components/public/JudgeConductCoach.tsx');
    expect(css).not.toContain('Guided judge practice:');
    expect(css).not.toContain('data-training-input-gate="active"');
    expect(coach).toContain('data-testid="judge-training-task-trigger"');
    expect(coach).toContain('data-testid="judge-training-task-dialog"');
    expect(coach).toContain('className="fixed right-[62px]');
    expect(coach).toContain('aria-modal="true"');
    expect(coach).toContain('setOpen(false)');
  });
});
