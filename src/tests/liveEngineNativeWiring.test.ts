import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('live engine native wiring', () => {
  it('does not replace live engine components through Vite source transforms', () => {
    const vite = read('vite.config.ts');
    expect(vite).not.toContain('CenterPanelNightMusic');
    expect(vite).not.toContain('SeatCardFarewell');
  });

  it('keeps voting UI declarative instead of mutating the rendered table DOM', () => {
    const center = read('src/components/LiveGameEngine/CenterPanel.tsx');
    const seat = read('src/components/LiveGameEngine/SeatCard.tsx');
    expect(center).not.toContain('querySelector');
    expect(center).not.toContain('tableVoteSelected');
    expect(center).toContain('useTableDecisionSelection');
    expect(seat).toContain('toggleTableDecisionVoter');
  });

  it('passes the real post-night stage directly to seat cards for farewell fouls', () => {
    const engine = read('src/components/LiveGameEngine.tsx');
    const seat = read('src/components/LiveGameEngine/SeatCard.tsx');
    expect(engine).toContain('postNightStage={postNightStage}');
    expect(seat).toContain('postNightStage === "farewell"');
  });

  it('hides roles by default when the engine is rendered without controlled role visibility', () => {
    const engine = read('src/components/LiveGameEngine.tsx');
    expect(engine).toContain('const [showRolesOnTable, setShowRolesOnTable] = useState(false);');
    expect(engine).toContain('rolesHidden === undefined ? showRolesOnTable : !rolesHidden');
  });

  it('does not keep retired best-move setter shims on seat cards', () => {
    const engine = read('src/components/LiveGameEngine.tsx');
    const seat = read('src/components/LiveGameEngine/SeatCard.tsx');
    expect(engine).not.toContain('deprecatedNoop');
    expect(engine).not.toContain('setBestMovePlayerSlot=');
    expect(engine).not.toContain('setBestMoveGuesses=');
    expect(seat).not.toContain('setBestMovePlayerSlot:');
    expect(seat).not.toContain('setBestMoveGuesses:');
  });

  it('limits the third-foul 30-second penalty to live speeches and keeps guessing/farewell speeches at 60 seconds', () => {
    const engine = read('src/components/LiveGameEngine.tsx');
    expect(engine).not.toContain('const startPlayerSpeechTimer =');
    expect(engine).toContain("const isGuessingDaySpeech = phase === 'day_speeches' && (aliveCount === 3 || aliveCount === 4);");
    expect(engine).toContain('const consumed = isGuessingDaySpeech');
    expect(engine).toContain('const actual = isGuessingDaySpeech ? 60 : (consumed.duration ?? duration);');
    const farewellLabels = engine.match(/setCustomTimerLabel\(`Прощальная речь #\$\{slot\}`\);/g) || [];
    expect(farewellLabels).toHaveLength(2);
  });

  it('renders exact voter-to-nominee state and prevents moving a cast vote forward', () => {
    const seat = read('src/components/LiveGameEngine/SeatCard.tsx');
    expect(seat).toContain('canToggleVoteAssignment');
    expect(seat).toContain('buildSeatVoteStatusPresentation');
    expect(seat).toContain('presentation.target === undefined');
    expect(seat).toContain('Вернитесь к этой кандидатуре, чтобы снять голос.');
  });

  it('keeps the selectable table visible while seat cards are the voting input', () => {
    const engine = read('src/components/LiveGameEngine.tsx');
    expect(engine).toContain("votingStage === 'collecting' || votingStage === 'table_decision'");
    expect(engine).toContain("const effectiveViewMode = requiresTableSeatVoting ? 'table' : viewMode");
    expect(engine).toContain('disabled={requiresTableSeatVoting}');
    expect(engine).toContain("effectiveViewMode === 'table' ? renderTable()");
  });
});
