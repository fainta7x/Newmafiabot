import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('2LA NOIRE protocol presentation', () => {
  it('uses the canonical shell, one content scroller, stable player rows and wrapping footer', () => {
    const source = read('src/components/crm/tournaments/GameProtocolModal.tsx');
    expect(source).toContain('protocol-noir-root');
    expect(source).toContain('protocol-noir-shell');
    expect(source).toContain('protocol-noir-content flex-1 min-h-0 overflow-y-auto');
    expect(source).toContain('grid-cols-[34px_32px_minmax(0,1fr)_32px]');
    expect(source).toContain('min-[430px]:grid-cols-2');
    expect(source).not.toContain("? 'bg-amber-500 text-slate-950 font-bold shadow-md'");
    expect(source).not.toContain('overflow-y-auto overflow-x-hidden');
  });

  it('styles all protocol tabs with the same Noir primitives and no purple/indigo legacy stages', () => {
    const voting = read('src/components/crm/tournaments/protocol/ProtocolVotingTab.tsx');
    const nights = read('src/components/crm/tournaments/protocol/ProtocolNightsTab.tsx');
    const summary = read('src/components/crm/tournaments/protocol/ProtocolSummaryTab.tsx');
    expect(voting).toContain('protocol-vote-stage');
    expect(voting).not.toContain('border-purple-500');
    expect(nights).toContain('protocol-noir-section');
    expect(nights).not.toContain('bg-indigo-600');
    expect(summary).toContain('protocol-summary-mobile-row');
    expect(summary).toContain('hidden sm:block overflow-x-auto');
  });

  it('keeps score/status presentation on shared theme tokens instead of a second protocol palette', () => {
    const presentation = read('src/components/crm/tournaments/protocol/protocolPlayerPresentationUtils.ts');
    expect(presentation).toContain('text-accent');
    expect(presentation).toContain('text-success');
    expect(presentation).toContain('text-danger');
    expect(presentation).toContain('text-warning');
    expect(presentation).not.toContain('text-indigo-300');
    expect(presentation).not.toContain('text-purple-300');
  });
});
