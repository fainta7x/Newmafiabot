# PROJECT-AUDIT-001 — Legacy Python DB containment inventory

Status: containment complete at current Telegram entrypoints  
Parent: #330  
Related: #335, #342

## 1. Canonical business state

Canonical product state lives in:

`/data/mafia_crm.sqlite`

The Python bot-local database remains:

`/data/mafia_crm.db`

It is retained temporarily for compatibility/read-only historical lookups and old source code, but current Telegram business entrypoints are no longer allowed to use it as a parallel source of truth.

## 2. Current router order

`legacy_retired_actions.router` is mounted before all legacy business routers.

This is the containment boundary for stale Telegram keyboards/messages.

Current canonical-first order begins with:

1. legacy retirement guard;
2. canonical CRM entrypoint;
3. old routers only after the guard.

## 3. Legacy write families now intercepted

The guard blocks stale actions for:

- booking and old announcement confirmation;
- payment/debt confirmation;
- shop and betting;
- old admin history/debt/billing/evening actions;
- judge management;
- game-history editing;
- game creation / resume / finish;
- role assignment;
- fouls / technical fouls / removal;
- PPK;
- score editing;
- nominations and voting;
- night kills;
- legacy profile nickname/payment entrypoints;
- legacy judge-panel entrypoint.

These actions redirect to the canonical WebApp/CRM instead of reaching DB-backed Python handlers.

## 4. Registration no longer creates new legacy business state

Current `handlers/registration.py`:

- creates/links canonical profiles through Node APIs;
- does **not** insert/update the legacy `users` table on `/start`;
- does **not** mirror newly registered nicknames back into the legacy DB;
- may read an existing historical legacy user only to help recover/link an old profile.

This is intentionally read-only compatibility.

## 5. Remaining legacy DB reads

Remaining accepted reads include compatibility/history helpers such as:

- historical user lookup for one-time registration linking;
- old profile/search/regulation helpers still present in source;
- judge lookup helpers used by compatibility code.

These reads are not considered canonical product ownership.

## 6. Source-retained legacy handlers

Files such as `handlers/payment.py`, `handlers/booking.py`, `handlers/shop.py`,
`admin.py`, `handlers/admin_judges.py`, `game/edit_router.py` and the old
game router still contain DB write implementations.

They are retained temporarily because deleting them before deployed verification
would make rollback/debugging harder. Their stale Telegram entrypoints are
intercepted before those handlers run.

The next cleanup phase may delete source only after deployed runtime verification proves no active dependency.

## 7. Allowed current Telegram behavior

Still-active bot behavior is limited to canonical or non-business-state flows:

- `/start` registration/linking through Node;
- `/crm` and `/admin` opening canonical CRM;
- player WebApp entrypoint;
- current canonical RSVP callbacks;
- Telegram publishing/sync bridge;
- help/regulations/read-only support;
- runtime/admin diagnostics that do not restore or mutate business data.

## 8. Closure criteria for containment

The containment task is complete when:

- current menus do not expose legacy business writes;
- stale message callbacks are intercepted before legacy routers;
- new registration does not write legacy user state;
- Telegram DB restore is disabled;
- canonical CRM/WebApp remains the destination for retired actions;
- regression tests lock router order and critical callback families.

These criteria are now satisfied in source.

## 9. Remaining work after containment

Containment is not deletion.

Remaining follow-up work:

1. deployed runtime verification of the current bot shell;
2. collect evidence that no needed user flow depends on source-retained handlers;
3. delete obsolete routers/functions one domain at a time;
4. then remove unused legacy tables and possibly `mafia_crm.db` itself;
5. never copy legacy rows into canonical product storage without an explicit migration plan.

