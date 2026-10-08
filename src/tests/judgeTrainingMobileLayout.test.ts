import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('guided judge training mobile table', () => {
  it('mounts the coach and Live Game as siblings so Telegram viewport rules apply', () => {
    const modal = read('src/components/crm/EveningLiveGameModal.tsx');
    expect(modal).toContain('{trainingMode && <JudgeConductCoach />}\n      <div className="evening-live-engine-shell');
    expect(modal).not.toContain("h-[calc(100dvh-34px)] overflow-y-auto overscroll-contain");
    expect(modal).toContain('data-training-input-gate={trainingMode ? "active" : undefined}');
  });

  it('does not render independently positioned duplicate player identities for training', () => {
    const modal = read('src/components/crm/EveningLiveGameModal.tsx');
    expect(modal).toContain("{!trainingMode && livePhase !== 'setup' && (");
    expect(modal).toContain('className="evening-live-identity-layer"');
    expect(modal).toContain('title="Закрыть движок"');
  });

  it('keeps all ten seat identities inside their tap targets in the single training scroll area', () => {
    const css = read('src/components/crm/liveGameTelegram.css');
    const styleStart = css.indexOf('/* Guided judge practice:');
    expect(styleStart).toBeGreaterThan(-1);
    const trainingStyle = css.slice(styleStart);
    expect(trainingStyle).toContain('.evening-live-engine-shell[data-training-input-gate="active"]');
    expect(trainingStyle).toContain('overflow-y: auto !important');
    expect(trainingStyle).toContain('height: auto !important');
    expect(trainingStyle).toContain('.live-seat-footer__name');
    expect(trainingStyle).toContain('display: block !important');
    expect(trainingStyle).toContain('.live-seat-card--voting .live-seat-footer__name');
    expect(trainingStyle).toContain('display: none !important');
  });
});
