import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const engineSource = readFileSync('src/components/LiveGameEngine.tsx', 'utf8');
const overlaySource = readFileSync('src/components/LiveGameEngine/LiveGameOverlays.tsx', 'utf8');

describe('live best move back navigation', () => {
  it('takes a snapshot before entering first-killed best move', () => {
    const start = engineSource.indexOf('const handleStartFirstKilledBestMove = () => {');
    const end = engineSource.indexOf('const handleAdvanceNightSubPhase', start);
    const block = engineSource.slice(start, end);
    expect(block).toContain('saveSnapshot();');
    expect(block.indexOf('saveSnapshot();')).toBeLessThan(block.indexOf("setNightSubPhase('best_move')"));
  });

  it('exposes a visible back action inside the blocking best-move overlay', () => {
    expect(overlaySource).toContain('onBack: () => void;');
    expect(overlaySource).toContain('onClick={onBack}');
    expect(overlaySource).toContain('← Назад');
  });

  it('wires best-move back to the same snapshot restore used by the engine', () => {
    expect(engineSource).toContain('onBack={handleUndoAction}');
    expect(engineSource).toContain('restoreSnapshot(snapshot);');
  });

  it('already snapshots the killed-player protocol transition so its normal Back can restore farewell', () => {
    const start = engineSource.indexOf('const startDeathProtocol = () => {');
    const end = engineSource.indexOf('const handleResolveNight', start);
    const block = engineSource.slice(start, end);
    expect(block).toContain('saveSnapshot();');
    expect(block).toContain("setPostNightStage('death_protocol')");
  });
});
