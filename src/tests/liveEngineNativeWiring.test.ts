import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('live engine native wiring', () => {
  it('does not replace live engine components through Vite source transforms', () => {
    const vite = read('vite.config.js');
    expect(vite).not.toContain('CenterPanelNightMusic');
    expect(vite).not.toContain('SeatCardFarewell');
  });

  it('keeps voting UI declarative instead of mutating the rendered table DOM', () => {
    const center = read('src/components/LiveGameEngine/CenterPanel.tsx');
    expect(center).not.toContain('querySelector');
    expect(center).not.toContain('tableVoteSelected');
    expect(center).toContain('tableVoterSlots');
  });

  it('passes the real post-night stage directly to seat cards for farewell fouls', () => {
    const engine = read('src/components/LiveGameEngine.tsx');
    const seat = read('src/components/LiveGameEngine/SeatCard.tsx');
    expect(engine).toContain('postNightStage={postNightStage}');
    expect(seat).toContain('postNightStage === "farewell"');
  });

  it('renders exact voter-to-nominee state and prevents moving a cast vote forward', () => {
    const seat = read('src/components/LiveGameEngine/SeatCard.tsx');
    expect(seat).toContain('canToggleVoteAssignment');
    expect(seat).toContain('`#${slotNum}→#${target}${automatic ? "*" : ""}`');
    expect(seat).toContain('Вернитесь к этой кандидатуре, чтобы снять голос.');
  });
});
