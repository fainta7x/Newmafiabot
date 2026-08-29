import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/LiveGameEngine/CenterPanel.tsx', 'utf8');

describe('revote speech order highlight', () => {
  it('uses the voting nominee index only while collecting votes', () => {
    expect(source).toContain('renderVotingOrder(currentRound.nominated_seats, currentVotingNomineeIndex)');
  });

  it('tracks the current 30-second speaker during revote speeches', () => {
    expect(source).toContain('renderVotingOrder(participants, revoteSpeakerIndex)');
  });

  it('does not carry a stale active highlight onto the revote result screen', () => {
    expect(source).toContain('renderVotingOrder(result.winners)');
    expect(source).toContain('index === activeIndex');
    expect(source).not.toContain("index === currentVotingNomineeIndex ? 'live-judge-voting-order__seat--current'");
  });
});
