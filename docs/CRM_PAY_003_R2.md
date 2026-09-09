# CRM-PAY-003-R2 — follow-up invariants and verification

This follow-up tightens the factual CASUAL pricing policy introduced by CRM-PAY-003 without reverting PR #292.

## Canonical regular-evening writes

For regular `CASUAL` evenings (including legacy `STANDARD` input normalized to CASUAL semantics), every mounted create/update/duplicate path must persist the canonical per-game price before returning data:

- `game_evenings.default_price = 100`;
- `evening_slot_settings.price_per_game = 100`;
- duplicated regular-evening table defaults must not inherit legacy 400/500/600 ₽ values;
- `create-next-friday` must not inherit a previous evening price;
- NOVICE, RATING and TOURNAMENT pricing remain independent.

RSVP and planned slots remain planning facts and must not create regular-evening debt.

## Evening-specific fee exemptions

Historical CASUAL charging must be based on facts attached to the specific evening. A player's current global `club_role` or `judge_level` must never retroactively waive a past regular-evening fee.

Regular-evening exemptions are supported only by evening-specific evidence:

- the player is the organizer recorded in `evening_staff_assignments` for that evening; or
- the participant has an explicit row in `evening_fee_waivers`.

Changing a global player role/qualification after an evening must not rewrite historical CASUAL charges. Changing the factual staff assignment or explicit waiver for a regular evening triggers reconciliation of that evening.

Recorded payments remain factual: reconciliation may reduce canonical `amount_due`, but must not erase `amount_paid` or synthesize a refund.

## Historical reconciliation

CRM-PAY-003-R2 uses a distinct durable application migration marker so deployments where the original CRM-PAY-003 scan already completed receive one corrected historical CASUAL reconciliation pass. Completed markers prevent repeated rescans; failed/interrupted markers retain diagnostics and block unsafe automatic full rescans.

No production rows are to be edited manually for this task.

## Regression and safety scope

Verification must cover:

- canonical 100 ₽ creation/update/duplication paths;
- legacy `STANDARD` compatibility;
- evening-specific staff and explicit fee-waiver evidence;
- no retroactive use of current global `club_role` / `judge_level`;
- 100 ₽ per actually completed game, capped at 400 ₽;
- preservation of recorded payments and no synthetic refunds;
- debt eligibility and CRM/Player Cabinet agreement;
- idempotent reconciliation and ledger effects;
- historical migration marker behavior;
- NOVICE/RATING/TOURNAMENT isolation;
- TypeScript, ESLint, full Vitest, production build/start, combined web+bot container, Python syntax, CodeQL and Gitleaks.

Repository checks are not deployment/runtime verification. The PR must remain unmerged until independent review is complete; production data must remain untouched manually.
