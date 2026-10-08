# Dissonance: real hand audit, 2026-10-07

## Evidence and limits

The owner's authorized read-only export succeeded on the evening of October 7 (Moscow): `/poker/hands`, `/poker/results`, `/poker/stats` each returned HTTP 200. The hands endpoint returned all 250 stored hands involving Диссонанс, from 2026-10-05T21:21:39.361Z to 2026-10-07T16:51:03.751Z. The global log contains 488 hands. Raw exports are local diagnostic inputs, not committed here. No production data, configuration or deployment was changed.

Current repository bot code was compared with remote main `61b0e323`: no difference in `pokerBot.ts`. The export contains no strategy revision, opponent profile or decision equity, so its individual hands cannot be assigned to a deployed code revision. Folded cards are not exported. These are historical play-chip/training observations; they do not prove the current club-token wallet balance or cheating.

## Results

| Tables in Dissonance's export | Hands | Net chips |
| --- | ---: | ---: |
| Only Dissonance and bots | 191 | +25,560 |
| Bots and other humans | 23 | −2,320 |
| Other humans, no bots | 36 | −2,000 |
| All | 250 | +21,240 |

Bot-only result by Moscow date: October 6, 54 hands / −2,410; October 7, 137 hands / +27,970. In the 191 bot-only hands, 86 have Dissonance's shown cards and their combined net is +22,400. In 74 bot-only hands where Dissonance makes a preflop all-in, his net is +22,990. These subsets overlap and must not be added.

The results endpoint reports 118 wins without showdown (+4,300), and 121 showdowns (+17,780, 53 wins). Those categories do not partition all hands: the other hands include folds/losses without showdown. Therefore +4,300 must not be treated as the net of every non-showdown hand.

Dissonance's aggregate tendencies: VPIP 88%, PFR 76%, folded to a bet 5%. Bots folded in 49 of 73 recorded opportunities facing his preflop re-raise, but only 1 of 55 facing his postflop bet. The latter rules out a simple description that bots fold to every bet. Those opportunity counters are not independent hands or a causal profit attribution.

## Confirmed baseline-code defect: inaccessible chips in pot odds

`src/server/services/pokerBot.ts`, `preflopDecision`, all-in branch:

```ts
const price = Math.min(toCall, bot.chips);
const needed = price / (hand.pot + price) + riskPremium;
```

`hand.pot` includes the deep shover's full commitment. A short caller can win only the portion matched by its own total contribution; the excess becomes another side pot or is returned. Treating that excess as available winnings makes a larger opposing stack produce a cheaper apparent call, without changing the caller's actual stake.

A deterministic probe uses `createPokerHand`, `applyPokerAction` and `chooseStrongBotAction`, resets opponent memory, assigns the bot 7s2d, and uses seed 123. Two heads-up seats, dealer/shover at seat 1, blinds 10/20, bot starting stack 1,000:

| Shove starting stack | Bot call price | Code's raw pot-odds threshold | Eligible-pot threshold, before premium | Bot action |
| --- | ---: | ---: | ---: | --- |
| 1,000 | 980 | 49.00% | 49.00% | fold |
| 24,220 | 980 | 3.89% | 49.00% | call |

The only changed input is the shover's stack. The actual eligible contested pot and the bot's risk are identical. This is an accounting defect, not a disagreement over a GTO range.

The same all-in branch estimates equity against only `[shoveRange]`, even after other players have called all-in. It does not account for their ranges in main-pot equity. A safe correction must account for contribution layers and different contestants rather than merely replacing `hand.pot` with a flat cap or subtracting a fixed margin. Postflop EV also uses whole-pot quantities and needs the same contribution-aware audit before declaring the issue fixed globally.

## Concrete historical examples

- October 7, 15:41:33 Moscow: Dissonance shoves 24,220 with J5o; six bots call off approximately 1,000 each with K7o, Q8s, ATo, 62s, A7o and K6o. He makes trips and wins +5,990. At the first bot's decision, the deep shove supplies a massively inflated raw pot, while its own matched contribution remains about 1,000. Later callers additionally face a multiway main pot. Actual profiles/reasons were not exported, so their precise equity estimates are unknown.
- October 7, 15:36:28: Dissonance shoves 9,370 with Q7o; the blinds call with K2o and 73s, each risking 1,000. He wins +2,000. This has the same stack imbalance.
- October 7, 15:36:47: Dissonance wins +10,840 with JTs against TT and three short bots. TT is ahead of JTs preflop; this particular large result includes a favorable runout and cannot be labelled an intrinsically bad TT call from shown cards alone.

The two biggest bot-only winning hands (+10,840 and +5,990) equal 65.8% of his net bot-only profit. That concentration and only 250 observed hands mean variance matters substantially. It does not erase the independently reproduced pot-odds defect.

## Conclusion and repair scope

Real exports support the owner's concern: the profit is concentrated at bot-only tables and especially in preflop shove hands. Current code has a reproducible mechanism making deep-stack shoves attract inappropriate short-stack calls; it also evaluates that branch as heads-up when the main pot is multiway. This is stronger evidence than the earlier synthetic stress tests. It does not prove malicious intent or establish how much profit each bug caused.

Next focused repair: contribution-aware call EV/eligible pot layers, multiway showdown equity per contested layer, regressions for equal effective stakes despite larger uncallable shoves and multiway/side-pot cases. Avoid tightening every range or suppressing losing fixtures to hide an accounting error. Do not claim this historical sample validates a repaired bot until a deployed revision and new post-fix hands are available.

## Authorized repair, 2026-10-08
Implemented contribution-aware all-in and postflop EV, multiway per-layer equity and a guarded cheap-call fallback in the same workstream. Regression coverage includes engine side-pot settlement and preservation of legitimate learned/value calls. This resolves the identified decision-accounting defects in code; production deployment and post-fix profitability remain unverified. Range/realization assumptions are still heuristic; see POKER_BOTS.md.
