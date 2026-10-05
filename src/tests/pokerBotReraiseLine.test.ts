import { beforeEach, describe, expect, it } from 'vitest';
import { applyPokerAction, createPokerHand, type PokerState } from '../server/services/pokerEngine.ts';
import { opponentRanges, resetPokerBotMemoryForTests } from '../server/services/pokerBot.ts';

const table = () => createPokerHand({ id: 'h', dealer_seat: 1, players: Array.from({ length: 6 }, (_, i) => ({ id: `p${i + 1}`, nickname: `P${i + 1}`, seat: i + 1, chips: 5000 })) });
const current = (hand: PokerState) => hand.players.find((player) => player.seat === hand.current_seat)!;

/** The range the bot assigns to the 3-bettor after an open to 2 bb and a re-raise to `threeBetBb` big blinds. */
const threeBettorRange = (threeBetBb: number) => {
  const hand = table();
  const bb = hand.big_blind;
  applyPokerAction(hand, { type: 'bet', amount: bb * 2 });
  const opener = current(hand);
  void opener;
  applyPokerAction(hand, { type: 'bet', amount: bb * threeBetBb });
  const threeBettor = hand.action_log.at(-1)!.player_id;
  const observer = hand.players.find((player) => ![...hand.action_log.map((entry) => entry.player_id)].includes(player.id) && !player.folded)!;
  const ranges = opponentRanges(hand, observer);
  const index = hand.players.filter((player) => player.id !== observer.id && !player.folded).findIndex((player) => player.id === threeBettor);
  return ranges[index].range;
};

describe('bots read a 3-bet by its size and position', () => {
  beforeEach(() => resetPokerBotMemoryForTests());
  it('treats a small 3-bet as a wider range than a standard one', () => {
    expect(threeBettorRange(4)).toBeGreaterThan(threeBettorRange(7));
  });
});
