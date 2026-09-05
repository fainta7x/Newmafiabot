import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const modalSource = readFileSync('src/components/crm/EveningLiveGameModal.tsx', 'utf8');
const seatSource = readFileSync('src/components/LiveGameEngine/SeatCard.tsx', 'utf8');
const centerSource = readFileSync('src/components/LiveGameEngine/CenterPanel.tsx', 'utf8');
const liveCss = readFileSync('src/components/crm/liveGameEveningBugfixes.css', 'utf8');

describe('real-table live evening regression gate', () => {
  it('keeps roles hidden by default in the club live game launcher', () => {
    expect(modalSource).toContain('const [rolesHidden, setRolesHidden] = useState(true);');
  });

  it('keeps night target markers scoped to their own night sub-phase', () => {
    expect(seatSource).toContain('nightSubPhase === "shooting" && shotPlayerSlot === slotNum');
    expect(seatSource).toContain('nightSubPhase === "don" && donCheckSlot === slotNum');
    expect(seatSource).toContain('nightSubPhase === "sheriff" && sheriffCheckSlot === slotNum');
  });

  it('keeps regular foul controls available during 30-second revote speeches', () => {
    expect(seatSource).toContain('votingSubPhase === "revote_speeches"');
    expect(seatSource).toContain('{showSplitSpeechFouls && (');
    expect(seatSource).toContain('{renderRegularFoulControls()}');
  });

  it('keeps voting order visible and highlights the correct context', () => {
    expect(centerSource).toContain('renderVotingOrder(currentRound.nominated_seats, currentVotingNomineeIndex)');
    expect(centerSource).toContain('renderVotingOrder(participants, revoteSpeakerIndex)');
    expect(centerSource).toContain('renderVotingOrder(result.winners)');
  });

  it('keeps voting in the fixed center cell and nomination priority inverted for judge scanning', () => {
    expect(liveCss).toContain('.live-judge-hud__stack--voting-scroll');
    expect(liveCss).toMatch(/\.live-judge-hud__stack--voting-scroll\s*\{[\s\S]*?overflow: hidden;/);
    expect(liveCss).toContain('.live-judge-hud__stack--revote-speech');
    expect(liveCss).toContain('.live-seat-quick-action--nomination {');
    expect(liveCss).toContain('.live-seat-quick-action--nomination-active {');
    expect(liveCss).toContain('color: #ffe0e7 !important;');
    expect(liveCss).toContain('color: rgba(255, 255, 255, 0.42) !important;');
  });
});
