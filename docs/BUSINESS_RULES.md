# 2LA Noire — Canonical Business Rules

This file contains user-approved product and sports-Mafia rules that must not be silently reinterpreted during refactors.

If implementation/tests conflict with this document, stop and investigate the conflict. Do not “simplify” the rule to make code easier.

## Authority

For sports-Mafia rules in this project, the user’s explicitly approved rules are authoritative.

When a future conversation introduces a new explicit rule, update this document in the same PR as the implementation when practical.

## Fouls and disciplinary penalties

### Ordinary fouls

- The **3rd foul** gives the player a **30-second speech penalty**.

### Technical fouls

- Small technical foul: **−0.3**.
- Big technical foul: **−0.6**.
- **2 technical fouls = removal**.

### Removal

- Removal penalty: **−1**.
- Removal **cancels the nearest voting action** for the removed player as defined by the active game workflow.

### PPK

- PPK penalty: **−1**.
- PPK **immediately ends the game** with victory for the opposite team.

### Nominations / disciplinary penalties

- Disciplinary penalties do **not** affect nominations.

### Team victory

- Team victory gives **+1** under the approved scoring model.

## Voting model

These distinctions are fundamental and must remain explicit in UI/state/tests.

### Nominations are not voting

- A nomination/exposure (“выставление”) is **not a vote**.
- Nominations are a tool that determines which candidates may be voted on.
- Do not infer a player’s final vote from whom they nominated.

### Zero round

- The zero round happens **after the agreement** with **10 alive players**.

### Revotes

- Revotes are **phases of one voting process**, not separate unrelated votes.
- **3, 4 or more revotes are valid** when the game state requires them.
- Never hard-limit the workflow to one or two revotes merely for UI convenience.

### “Raise / leave” decision

- The special “raise / leave” step is allowed **only after two identical splits in a row**.
- Example: `5/5`, then again `5/5`.
- It must not appear after only one tied split.
- It must not allow raising **more than 50% of alive players**.

### Mandatory voting

- Voting is mandatory when the rules require a vote.
- A player who does not vote has their vote assigned to the **last candidate**.

### Decided vote

- Once the result is mathematically **decided**, it cannot be rescued by later votes.
- UI logic must not offer impossible “save” outcomes after the threshold is already fixed.

### Seven alive: all 1–1–1–1–1–1–1

With seven alive players:

1. first `1-1-1-1-1-1-1` -> revote between **all seven**;
2. repeated `1-1-1-1-1-1-1` -> **night**, no elimination from that vote.

## Live Game judge UI semantics

The conducted-game interface is a judge protocol surface, not a generic game UI. Its wording and visual metaphors must match the sports-Mafia mechanics.

- The first daytime cycle after zero night is shown to the judge as **«Нулевой круг»**, not «День 1». After the first night, the next daytime cycle is **«День 1»**; subsequent displayed day numbers follow the protocol day number rather than the engine’s internal round counter.
- Prefer the actual protocol terms **«речь»**, **«выставление / выставлен»**, **«голосование»**, **«переголосование»** and **«поднять / оставить»**. Do not invent substitute stage names such as **«спорные»**, **«спорная речь»** or **«круг обсуждения»**.
- A daytime **выставление** must not use a kill/target/crosshair metaphor. A pistol/shot marker belongs only to the night **отстрел** flow.
- Judge-facing seat numbers `1–10` must remain visually distinct from one another so a number can be identified at a glance; adjacent seats must not collapse to effectively the same color.
- The center of Live Game should prioritize the current protocol step, information required for that step and the next judge action. Do not duplicate the same voting/seat information in multiple miniature panels when the table itself already carries it.
- Fouls, technical fouls, nominations/voting state and the current game step must stay quickly readable during play; rare/dangerous actions may stay behind a player action sheet, but routine judge actions should not require hunting through decorative UI.

## Player status terminology

Automatic final statuses should use the approved semantics:

- PPK / ЛХ / shot -> **«убит»** where that status family is used.
- eliminated by voting -> **«заголосован»**.

Do not collapse these into one generic “out” status when the distinction is visible to players, results or protocol history.

## Corrections and completed games

- Organizer/judge correction workflows may edit completed game/tournament protocol data where the application explicitly supports correction mode.
- Corrections must preserve auditability/business invariants and must not reset unrelated data.

## Evening registration

### Current club focus

The current operating default is the established main club and its regular CASUAL evenings. Existing players belong to the club path, not the novice path. NOVICE and TOURNAMENT remain supported, separate product contours; do not expose their extra workflow in the default regular-evening workspace.

Approved response model for an announced evening includes:

- **Иду**
- **Не иду**
- **Приду позже**
- **Пока думаю**

The event/announcement model is centered on an evening with linked player contacts/statuses. Avoid introducing a CRM model that requires a separate sales “deal” for every player/evening unless explicitly requested.

Evening restrictions are product-level event restrictions (for example newcomer/rating/tournament type), not an invitation-reservation system by default.

## Recurring Friday evenings

The regular club cadence is automatic rather than organizer-maintained by hand.

- The player calendar should continuously expose regular **Friday 20:00 Moscow** club evenings roughly **35 days ahead**, so players can register several weeks in advance.
- Calendar visibility and external announcement are separate states: making a future evening available for registration must **not** immediately publish a Telegram/VK post.
- For the upcoming Friday, the weekly external announcement becomes due on **Monday at 19:00 Moscow**.
- That weekly announcement should use the existing connected flow: Telegram channel/group publication, VK publication, and the initial eligible personal Telegram invitations.
- The automation must be idempotent: refreshes, retries, restarts or delayed wake-ups must not create duplicate posts or duplicate personal invitations.
- If the service was asleep at the exact due time, the next safe reconciliation should catch up the still-upcoming Friday instead of silently skipping the week.
- Existing manually created Friday drafts inside the rolling window may be promoted to registration-open/published state rather than duplicated.

## Evening close-out

Closing a club evening should be **fast, flexible and fact-based**, not a rigid admin checklist.

- Every regular Friday evening gets a high-priority organizer task due **Saturday at 19:00 Moscow** to finish the evening.
- Before final close, the organizer must resolve the factual attendance of players who answered **«Иду»** or **«Приду позже»**: attended or no-show.
- The close-out UI should support bulk attendance actions as well as per-player correction so the organizer is not forced through every row one by one.
- A player who arrived without registration can be added or found quickly during close-out and marked as attended without fabricating a prior «Иду» response. Planned response and factual attendance remain separate facts.
- Payment does **not** block closing. For an attended player, the recorded paid amount is income and any remaining amount becomes debt at settlement.
- Before final close/settlement, a manually confirmed payment must remain correctable: an accidental full-payment mark can be removed and returned to unpaid so the organizer is never trapped by one mistaken tap.
- If all game protocols are present and completed, close normally.
- If games were not entered or unfinished drafts remain, the organizer may explicitly choose **«закрыть без полной игровой статистики»**. Unfinished drafts must be excluded from active statistics rather than silently treated as completed games.
- Closing the evening completes its organizer close-out task.
- The UI should optimize for a short flow: **attendance → walk-ins → payment/debt → games → close**.

## Announcements

The intended flow is:

`organizer creates/publishes evening -> connected channels/bot notify players -> players respond -> statuses appear in the application`

Runtime smoke tests should prefer:

1. read-only integration health checks;
2. a single targeted/test recipient;
3. only then a real limited announcement when explicitly intended.

Do not use a club-wide production announcement as a generic health check.

## Tournament publication

Approved high-level publication format for tournament summary graphics is three logical outputs:

1. winners;
2. table/results;
3. nominations.

Historical UI/visual requirements may evolve, so inspect current publication components before changing visuals. The three-part information model should not be collapsed without an explicit redesign decision.

## Player economy / payments

- Wallet/tokens, shop, betting, manual evening accounting and free-evening credits are active product areas.
- External online acquiring/SBP is **intentionally paused/disabled** in the current implementation.
- `online_payment_available: false` is a product state, not automatically a bug.
- Do not fabricate or enable a payment provider without an explicit provider/setup decision.

## Elo / rating principles

The rating model is intended to account for table/team strength rather than act as a naive win/loss counter.

Historical approved direction:

- actual Mafia/Red win probabilities may be asymmetric in practice;
- stronger players should receive some protection from weak-team composition effects;
- protection may increase as team imbalance grows;
- protection should diminish at stronger overall tables;
- weaker players can gain more for winning in a strong composition.

Do not replace the current Elo implementation with a standard off-the-shelf formula merely because it is simpler. Any formula change needs explicit product review and comparison against known tournament/player outcomes.

## Data preservation is a business rule

Past accidental data reversions are treated as a product-critical failure mode.

Therefore:

- player/tournament/runtime data must not be reset as a side effect of code work;
- a non-empty runtime DB wins over repository bootstrap data;
- old backup snapshots must not overwrite newer verified state;
- avatar/tournament/result corrections must not be lost through imports or deploys;
- destructive migration/restore operations require explicit, verified intent.

See `AGENTS.md` and `docs/RUNBOOK.md` for the operational safeguards.

## Rule-change workflow

When a requested change touches any rule above:

1. quote/paraphrase the exact rule being changed in the PR description;
2. update focused tests first or alongside the implementation;
3. avoid unrelated cleanup in the same change;
4. run the full CI before merge;
5. update this file if the approved rule itself changed.
