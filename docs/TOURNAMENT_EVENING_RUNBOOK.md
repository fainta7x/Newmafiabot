# Tournament Evening Operator Runbook

Scope: `TOURNAMENT-EVENING-001` organizer/player registration, reserve and manual payment workflow. This workflow feeds the existing canonical tournament engine; it does not replace seating, protocols, standings, compensation scoring, awards, result publication, Elo or token settlement.

## Before publication

1. Open Organizer CRM → Evenings → Tournaments and create a tournament evening.
2. Set title, date/start time, venue, canonical judge, 10-player capacity, entry fee, prize fund/allocation and optional rules.
3. Resolve the readiness summary. Prize allocations must equal the configured prize fund before publication.
4. Publication is explicit. Draft creation alone does not notify players or expose a registration link.

## Publication and shared registration link

- Press **Опубликовать и открыть запись** once the draft is ready.
- Publication queues one channel-neutral personal notification for tournament-eligible players except the assigned judge. The personal notification router selects at most one linked external channel (Telegram or VK) according to the canonical player preference.
- Use **Скопировать ссылку записи** for the stable player route `/player/events/<tournamentId>`. The same route works after Telegram or VK authentication because both resolve to the canonical `player_id`.
- Reopening/closing registration does not create a second tournament entity.

## Registration and reserve

- Server capacity is exactly 10 players; judge is outside capacity and cannot register as a player for the same tournament.
- First eligible registrations occupy canonical slots 1–10. Further registrations enter the FIFO reserve with explicit queue numbers.
- If a confirmed player cancels before tournament start, the first reserve is promoted atomically into the freed slot and both player/organizer notification paths are used.
- Organizer manual add/remove/promote/reorder actions require an auditable reason.
- Never edit `tournament_participants` manually. The registration service synchronizes the confirmed roster into the canonical tournament participant list while the tournament is still in draft/pre-start state.

## Entry fee

- Tournament entry fee is independent of regular-evening CASUAL pricing, debt, wallet tokens and bets.
- **Я оплатил взнос** means only “player reported payment”; it creates a pending claim and does not charge a card or mark the fee paid.
- Organizer explicitly changes the payment to confirmed/rejected/waived/refunded/unpaid. Only `confirmed` is counted as confirmed money; `waived` removes the unpaid blocker but is not revenue.
- Organizer payment changes remain correctable and are stored with audit timestamps/actor context.

## Before starting the tournament

Confirm all of the following in the tournament workspace:

- readiness summary has no tournament-evening blockers;
- confirmed roster is exactly 10 players;
- assigned judge is correct and not among the ten players;
- fee/prize values are correct;
- pending payment claims have been reviewed as appropriate;
- reserve order reflects the intended FIFO/manual audited order.

Then continue through the existing tournament preparation/conducting module. Do not create another roster or copy the tournament into a second system.

## Historical safety / Bogdan regression reference

`Турнир Богдана 1.08` is historical data. Adding the registration schema/workflow must not recalculate, rewrite or reseat it. Its stored participants, games, protocols, standings/tie-breaks, shot/kill compensation, penalties/bonuses, judge correction flow, awards, three logical publication outputs, public results/image export and existing Elo/token settlement remain owned by the pre-existing tournament domain.

Do not run a production reset, checkpoint restore, manual SQL rewrite or synthetic history generation to validate this feature. Repository tests verify additive schema preservation; real historical runtime verification is read-only.

## Verification before merge

Required repository gate:

```text
npm run release:audit
npm run typecheck
npm run lint
npm test
npm run build
```

The pull-request CI additionally checks Python bot syntax and the combined production container. CodeQL and Gitleaks are independent security gates.

## After merge / deploy

Git merge, Amvera deployment and real Telegram/VK runtime verification are separate states. Record them separately. Do not claim the feature is live only because CI is green.

After Amvera deploy, verify read-only/normal product flows:

1. deployed SHA corresponds to the merged commit;
2. one real Telegram tournament player opens the shared link and sees the correct tournament;
3. one real VK-linked canonical player opens the same route;
4. one registration and cancellation/reserve promotion behave as expected on a safe test tournament, not historical data;
5. one payment report reaches organizer pending state and organizer correction works;
6. no duplicate external personal notification is sent when both Telegram and VK are linked;
7. capture mobile WebView screenshots for tournament detail, confirmed player, reserve player and organizer payment queue.
