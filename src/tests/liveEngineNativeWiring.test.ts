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

  it('consumes a pending third-foul penalty for every active revote speaker', () => {
    const engine = read('src/components/LiveGameEngine.tsx');
    expect(engine).toContain("phase !== 'day_voting' || votingStage !== 'revote_speeches'");
    expect(engine).toContain('const consumed = consumeNextSpeech(discipline, String(activeSpeakerSlot));');
    expect(engine).toContain('syncDisciplinePlayer(consumed.newState, activeSpeakerSlot);');
    expect(engine).toContain('[phase, votingStage, revoteSpeakerIndex, activeSpeakerSlot, discipline]');
    expect(engine).toContain('handleStartTimer(winners[0], 30);');
  });

  it('shows the 30-second seat warning only while the penalty is pending and applicable', () => {
    const seat = read('src/components/LiveGameEngine/SeatCard.tsx');
    expect(seat).toContain('const aliveCount = activePlayers.filter((item) => item.alive).length;');
    expect(seat).toContain('const isGuessingDay = phase === "day_speeches" && (aliveCount === 3 || aliveCount === 4);');
    expect(seat).toContain('if (player.has_foul_penalty && !isGuessingDay)');
    expect(seat).not.toContain('player.has_foul_penalty || regularFouls === 3');
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

  it('keeps first-killed best move before night resolution and returns to the night result after confirmation', () => {
    const engine = read('src/components/LiveGameEngine.tsx');
    expect(engine).toContain("if (targetCanGiveFirstKilledBestMove()) return { label: 'ЛХ первого убитого', onClick: handleStartFirstKilledBestMove };");
    expect(engine).toContain("setNightSubPhase('best_move');");
    expect(engine).toContain("openBestMoveProtocol('first_killed', target.slot_num, savedSeats);");
    expect(engine).toContain("phase === 'night' && nightSubPhase === 'best_move' && source === 'first_killed'");
    expect(engine).toContain("setNightSubPhase('morning');");
  });

  it('forces a killed player through farewell and death protocol before day transition or game finish', () => {
    const engine = read('src/components/LiveGameEngine.tsx');
    expect(engine).toContain('if (killedSlot !== null) {');
    expect(engine).toContain('startFarewellSpeech(killedSlot);');
    expect(engine).toContain("if (postNightStage === 'farewell') return { label: 'Протокол убитого · 15с', onClick: startDeathProtocol };");
    expect(engine).toContain("if (postNightStage === 'death_protocol') {");
    expect(engine).toContain("return { label: 'Завершить игру', onClick: () => handleEndGameWithWinner(winnerAfterNight) };");
    expect(engine).toContain("return { label: 'К дневным речам', onClick: finishNightToDay };");
  });

  it('defers automatic winner completion while mandatory final actions are active', () => {
    const engine = read('src/components/LiveGameEngine.tsx');
    expect(engine).toContain('const requiredFinalActionInProgress =');
    expect(engine).toContain('activeBestMoveSource !== null ||');
    expect(engine).toContain('votingFarewellQueue.length > 0 ||');
    expect(engine).toContain("postNightStage !== 'none';");
    expect(engine).toContain('if (requiredFinalActionInProgress) return;');
  });

  it('restores the complete night-finalization state needed by Undo and interrupted-game recovery', () => {
    const engine = read('src/components/LiveGameEngine.tsx');
    expect(engine).toContain('setPostNightStage(restored.postNightStage);');
    expect(engine).toContain('setActiveBestMoveSource(restored.activeBestMoveSource);');
    expect(engine).toContain('setActiveBestMoveSlot(restored.activeBestMoveSlot);');
    expect(engine).toContain('setPendingBestMoveSeats(restored.pendingBestMoveSeats);');
    expect(engine).toContain('setShotPlayerSlot(restored.shotPlayerSlot);');
    expect(engine).toContain('setNightLogs(restored.nightLogs);');
  });
});
