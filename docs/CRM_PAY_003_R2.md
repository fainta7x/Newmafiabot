# CRM-PAY-003-R2 — follow-up invariants and verification

This follow-up tightens the factual CASUAL pricing policy introduced by CRM-PAY-003 without reverting PR #292.

## Canonical regular-evening writes

For regular `CASUAL` evenings (including legacy `STANDARD` input normalized to CASUAL semantics), every mounted create/update/duplicate path must persist the canonical per-game price before returning data:

- `game_evenings.default_price = 100`;
- `evening_slot_settings.price_per_game = 100`;
- every `evening_tables.default_price` belonging to a regular evening is canonicalized to **100 ₽**, including mounted table create/update routes and format conversion from another evening type;
- duplicated regular-evening table defaults must not inherit legacy 400/500/600 ₽ values;
- `create-next-friday` must not inherit a previous evening price;
- NOVICE, RATING and TOURNAMENT pricing remain independent.

The application initializes the evening-slot schema before mounted evening routes are served. Fresh/legacy databases therefore support immediate CRM `GET /api/evenings`, single-evening reads and non-CASUAL updates without a missing `evening_slot_settings` failure.

RSVP and planned slots remain planning facts and must not create regular-evening debt.

## Evening-specific fee exemptions

Historical CASUAL charging must be based on facts attached to the specific evening. A player's current global `club_role` or `judge_level` must never retroactively waive a past regular-evening fee.

Regular-evening exemptions are supported by evening-specific evidence:

- the player is the organizer recorded in `evening_staff_assignments` for that evening; or
- the participant has an explicit row in `evening_fee_waivers`.

`PATCH /api/evenings/:id/staff` supports factual assignment, replacement and explicit removal with `organizer_player_id: null`. Every such change immediately reconciles a regular evening. After removal, a player who actually played is charged normally unless an explicit participant waiver remains.

Changing a global player role/qualification after an evening must not rewrite historical CASUAL charges. Changing the factual staff assignment or explicit waiver for a regular evening triggers reconciliation of that evening.

Recorded payments remain factual: reconciliation may reduce canonical `amount_due`, but must not erase `amount_paid` or synthesize a refund.

## Historical reconciliation and legacy waivers

CRM-PAY-003-R2 uses a distinct durable application migration marker so deployments where the original CRM-PAY-003 scan already completed receive one corrected historical CASUAL reconciliation pass. Completed markers prevent repeated rescans; failed/interrupted markers retain diagnostics and block unsafe automatic full rescans.

Legacy `payment_status='waived'` / `amount_due=0` rows require special care because older code could have produced that state from the player's then-current organizer/judge role. Before the R2 historical pass:

- reliably identifiable explicit legacy waivers are converted to durable `evening_fee_waivers` evidence;
- rows already protected by factual evening staff assignment or an existing waiver remain protected;
- ambiguous legacy waived rows are **not automatically charged** and are recorded in `evening_fee_waiver_migration_diagnostics` with `needs_review` status;
- an explicit organizer waiver decision resolves/supersedes that review hold;
- migration/reconciliation is idempotent and recorded payments remain untouched.

No production rows are to be edited manually for this task.

## Regression and safety scope

Verification must cover:

- canonical 100 ₽ creation/update/duplication/table-write paths;
- slot-schema initialization before immediate CRM evening reads;
- format conversion normalizing all regular-evening table prices;
- legacy `STANDARD` compatibility;
- evening-specific staff assignment, replacement/removal and explicit fee-waiver evidence;
- safe explicit/ambiguous/already-migrated legacy-waiver handling and repeated startup;
- no retroactive use of current global `club_role` / `judge_level`;
- 0/1/2/3/4/5+ completed games = 0/100/200/300/400/400 ₽;
- preservation of recorded payments and no negative income or synthetic refunds;
- debt eligibility and CRM/Player Cabinet agreement;
- idempotent reconciliation, closeout and ledger effects;
- separate v1/R2 historical migration marker behavior;
- NOVICE/RATING/TOURNAMENT isolation;
- no mounted regular-evening API/UI path exposing a legacy 600 ₽ price;
- TypeScript, ESLint, full Vitest, production build/start, combined web+bot container, Python syntax, CodeQL and Gitleaks.

Repository checks are not deployment/runtime verification. The PR must remain unmerged until independent review is complete; production data must remain untouched manually.
