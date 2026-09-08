# Player profile + Telegram Mini App completion contract

Status: implementation contract for PR 3/3 of the premium player-profile / Telegram WebApp completion work.

## Canonical player profile

- Self and public player views use the same canonical premium profile implementation.
- Entry points from player-facing directory/rating/history surfaces must open that profile without mutating the underlying screen state.
- Back navigation returns to the prior screen rather than creating a second profile implementation.
- Profile privacy remains owner-controlled for birthday, game statistics and player connections, with organizer access preserved where explicitly authorized.

## Factual connection analytics

Player-to-player connections are derived only from completed club/tournament games. The analytics surface may expose:

- shared games;
- same-team games;
- opponent games;
- same-team wins and same-team win rate;
- last shared-game date;
- recent shared games;
- a best-partnership highlight only when the sample threshold is sufficient.

These metrics do not modify Elo, ratings, standings, achievements, betting or game history.

Connection analytics use a revision-based cache. Database triggers advance the revision when canonical completed-game source rows change, so corrections invalidate cached aggregates automatically. TTL-only freshness is intentionally not the source of truth.

## Social evening invitations

This feature is separate from historical club referrals.

Historical referral means: "who originally brought whom into the club" and is organizer-curated only.

Social evening invitation means: an existing club player invites another existing club player to a specific upcoming evening because that player has not registered yet.

Rules:

- inviter must already be going/late to the evening;
- the evening must be open for player registration and compatible with both players;
- an already registered player is not offered an invite CTA;
- a reserve/wait-list player is not offered a duplicate invite CTA;
- existing invitations are idempotent;
- self-invites are rejected;
- unavailable/blocked/inactive recipients are rejected;
- sender limit is enforced per evening;
- accepting an invitation never books the player automatically;
- the recipient must still confirm the evening through the canonical registration flow.

Smart friend suggestions use frequent completed-game connections and a bounded batch eligibility lookup. They must not issue one independent eligibility query chain per candidate.

If Telegram is linked, the durable outbox message contains a direct link to the specific evening when `PLAYER_APP_URL` is configured. The message explicitly states that the invitation itself does not create a booking.

## Telegram Mini App viewport contract

The application uses Telegram WebApp viewport values when available:

- `viewportHeight`;
- `viewportStableHeight`;
- `safeAreaInset`;
- `contentSafeAreaInset`.

They are exposed to CSS through the `--tg-*` variables owned by `src/lib/telegramWebAppViewport.ts` and `src/styles/telegram-viewport.css`.

The controller listens for `viewportChanged`, `safeAreaChanged` and `contentSafeAreaChanged`. Browser/desktop fallbacks use modern viewport units and `visualViewport` without pretending that Telegram values exist.

Player Cabinet and Organizer CRM must remain horizontally contained and usable at the verified narrow widths of 360 px and 390 px. Bottom navigation, sticky headers, fullscreen overlays and profile tabs must respect Telegram content-safe insets rather than assuming the entire device viewport is available to the WebApp.

## Visual evidence

`e2e/tests/telegram-webapp-viewport.spec.mjs` is part of the isolated UI Preview suite. It runs a realistic Telegram WebApp mock for:

- Player Cabinet at 360×640;
- Player Cabinet at 390×713;
- Organizer CRM at 360×640;
- Organizer CRM at 390×713.

For every surface it captures an initial screenshot and a second screenshot after a simulated `viewportChanged` / content-safe-area change. The test asserts the production viewport controller updated CSS variables and that the document did not acquire horizontal overflow.

The isolated preview bundles the real production viewport controller through `src/lib/uiPreviewProductionBootstrap.ts`; the test does not maintain a second implementation of the geometry logic.

## Release gate

This work is complete only when:

1. focused invitation/analytics tests pass;
2. full TypeScript, ESLint, test and production build checks pass;
3. combined web+bot production container check passes;
4. Gitleaks and CodeQL pass;
5. UI Preview including the Telegram viewport matrix passes;
6. fresh Telegram-size screenshot evidence is manually inspected;
7. PR is merged to `main`;
8. Git merge, deployment and runtime verification are reported as separate states.

A green GitHub build does not by itself prove that Amvera is running the merged SHA or that live Telegram credentials/runtime delivery are healthy.
