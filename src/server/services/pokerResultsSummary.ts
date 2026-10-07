import type { StoredPokerHand } from './pokerLobbyService.ts';

/**
 * How each person does against the bots, counted from the stored hands (read-only diagnostics for tuning the bots):
 * results by day and the spots where the chips change hands. No cards are returned.
 */
type Spot = { faced: number; botsFolded: number };
type PersonSummary = {
  player_id: string;
  hands: number;
  net: number;
  net_bb: number;
  by_day: Record<string, { hands: number; net: number; net_bb: number }>;
  /** Hands he won without a showdown, and how many chips that brought. */
  won_without_showdown: { hands: number; net: number };
  showdowns: { hands: number; won: number; net: number };
  /** Bots facing his preflop raise: the first raise (open) and a re-raise over a bot's raise (3-bet or more). */
  preflop_open: Spot;
  preflop_reraise: Spot;
  /** Bots facing his bet or raise after the flop. */
  postflop_bet: Spot;
  /** His answers to a bot's bet after the flop. */
  facing_bot_bet: { faced: number; folded: number; called: number; raised: number };
};

const moscowDay = (at: number) => new Date(at + 3 * 3600 * 1000).toISOString().slice(0, 10);
const isBot = (id: string) => id.startsWith('bot-');
const AGGRESSIVE = new Set(['bet', 'raise']);

/**
 * Which actions raise the stake. An `all_in` counts only when it puts in more than the current bet: a short stack that
 * calls with its last chips is stored as `all_in` too, and that is a call.
 */
const aggressiveFlags = (actions: StoredPokerHand['actions']) => {
  const flags: boolean[] = [];
  let street = '';
  let committed = new Map<string, number>();
  let currentBet = 0;
  for (const [actionStreet, playerId, type, amount] of actions) {
    if (actionStreet !== street) { street = actionStreet; committed = new Map(); currentBet = 0; }
    const total = (committed.get(playerId) || 0) + (Number(amount) || 0);
    committed.set(playerId, total);
    flags.push(AGGRESSIVE.has(type) || (type === 'all_in' && total > currentBet));
    currentBet = Math.max(currentBet, total);
  }
  return flags;
};

const blank = (playerId: string): PersonSummary => ({
  player_id: playerId, hands: 0, net: 0, net_bb: 0, by_day: {},
  won_without_showdown: { hands: 0, net: 0 }, showdowns: { hands: 0, won: 0, net: 0 },
  preflop_open: { faced: 0, botsFolded: 0 }, preflop_reraise: { faced: 0, botsFolded: 0 },
  postflop_bet: { faced: 0, botsFolded: 0 }, facing_bot_bet: { faced: 0, folded: 0, called: 0, raised: 0 },
});

/** After an aggressive action by `actorId`, did every bot that answered it fold? Counts one spot per action. */
const botAnswers = (actions: StoredPokerHand['actions'], aggressive: boolean[], from: number, actorId: string) => {
  let answered = 0;
  let folded = 0;
  for (let index = from + 1; index < actions.length; index += 1) {
    const [street, playerId, type] = actions[index];
    if (street !== actions[from][0]) break;
    if (playerId === actorId) break;
    if (aggressive[index] && !isBot(playerId)) break;
    if (!isBot(playerId)) continue;
    answered += 1;
    if (type === 'fold') folded += 1;
    if (aggressive[index]) break;
  }
  return { answered, folded };
};

export const summarizePokerResults = (hands: StoredPokerHand[]) => {
  const people = new Map<string, PersonSummary>();
  const bots = { hands: 0, net: 0, net_bb: 0, by_day: {} as Record<string, { hands: number; net: number; net_bb: number }> };
  for (const hand of hands) {
    const bb = hand.big_blind || 1;
    const day = moscowDay(hand.at);
    const botNet = hand.players.filter((player) => isBot(player.id)).reduce((sum, player) => sum + player.net, 0);
    if (hand.players.some((player) => isBot(player.id))) {
      bots.hands += 1; bots.net += botNet; bots.net_bb += botNet / bb;
      const entry = (bots.by_day[day] ||= { hands: 0, net: 0, net_bb: 0 });
      entry.hands += 1; entry.net += botNet; entry.net_bb += botNet / bb;
    }
    const aggressive = aggressiveFlags(hand.actions);
    const folded = new Set(hand.actions.filter(([, , type]) => type === 'fold').map(([, playerId]) => playerId));
    const showdown = hand.players.filter((player) => !folded.has(player.id)).length >= 2;
    for (const player of hand.players) {
      if (isBot(player.id)) continue;
      const person = people.get(player.id) || blank(player.id);
      people.set(player.id, person);
      person.hands += 1; person.net += player.net; person.net_bb += player.net / bb;
      const daily = (person.by_day[day] ||= { hands: 0, net: 0, net_bb: 0 });
      daily.hands += 1; daily.net += player.net; daily.net_bb += player.net / bb;
      if (showdown && !folded.has(player.id)) {
        person.showdowns.hands += 1; person.showdowns.net += player.net;
        if (player.net > 0) person.showdowns.won += 1;
      } else if (!showdown && player.net > 0) {
        person.won_without_showdown.hands += 1; person.won_without_showdown.net += player.net;
      }
      let preflopRaises = 0;
      hand.actions.forEach(([street, actorId], index) => {
        const raises = aggressive[index];
        if (street === 'preflop' && raises) preflopRaises += 1;
        if (actorId === player.id && raises) {
          const { answered, folded: botsFolded } = botAnswers(hand.actions, aggressive, index, player.id);
          if (!answered) return;
          const spot = street === 'preflop' ? (preflopRaises <= 1 ? person.preflop_open : person.preflop_reraise) : person.postflop_bet;
          spot.faced += 1;
          if (botsFolded === answered) spot.botsFolded += 1;
          return;
        }
        if (street !== 'preflop' && isBot(actorId) && raises) {
          // His next action on this street answers this bet only when nobody raised in between (then he faced that raise).
          let answerAt = -1;
          for (let next = index + 1; next < hand.actions.length && hand.actions[next][0] === street; next += 1) {
            if (hand.actions[next][1] === player.id) { answerAt = next; break; }
            if (aggressive[next]) break;
          }
          if (answerAt < 0) return;
          person.facing_bot_bet.faced += 1;
          if (hand.actions[answerAt][2] === 'fold') person.facing_bot_bet.folded += 1;
          else if (aggressive[answerAt]) person.facing_bot_bet.raised += 1;
          else person.facing_bot_bet.called += 1;
        }
      });
    }
  }
  const round = (value: number) => Math.round(value * 10) / 10;
  const roundDays = (days: Record<string, { hands: number; net: number; net_bb: number }>) =>
    Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).map(([day, entry]) => [day, { ...entry, net_bb: round(entry.net_bb) }]));
  return {
    hands: hands.length,
    bots: { ...bots, net_bb: round(bots.net_bb), by_day: roundDays(bots.by_day) },
    people: [...people.values()].sort((a, b) => b.hands - a.hands).map((person) => ({ ...person, net_bb: round(person.net_bb), by_day: roundDays(person.by_day) })),
  };
};
