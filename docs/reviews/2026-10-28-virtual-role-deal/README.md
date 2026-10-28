# Virtual role deck: finishing #1081

Baseline: existing PR head7ad07485. Owner explicitly requests completion. The latest owner comments override the older cap proposal: persistent toggleable personal preferences, own-card-only effects, manually configured personal limit, strength/frequency/global limits and conflicts require modelling. No VIP probability effect is included in this base change.

Implemented: correct next-seat field, canonical10/9/8 composition, one horizontal scrolling row with renumbering, separate reveal/confirm, manual seat order, last-card undo, confirmed redeal/close, explicit music lifecycle and preserved completed assignments after save errors. Club/novice/rating, ordinary setup and tournament paths are wired; tournament saves the existing protected roles API and reads back before continuing, rejecting a changed roster. Physical dealing and synthetic training remain.

Verification:

- Connected setup/role/training and style guards:7 files/32 cases. Unit cases include arbitrary card/seat choice, exact composition, undo/redeal, close confirmation, failed-save retry with identical assignments.
- Real engine browser flows: six club cases at360×640,390×844,1366×768,1440×900 and wider phone fonts; four tournament cases verify ten saved roles and exact composition. Each new state uses the shared layout/text audit. Virtual cases join the existing live-game audit route.
- Production preview revealed a real picker-error drawer covering deal controls, unlike the empty-music dev fixture. Virtual dealing now requests a full modal music decision; ordinary callers retain their existing presentation. Its scroll viewport also leaves space for the collapsed player. No detector exceptions/thresholds changed. Tests exercise the explicit continue-without-music decision.
- TypeScript, ESLint, dependency boundaries, release safety audit, app build and isolated production-preview build pass. Required remote exact-head CI/merge is still the release gate.

Actual screenshots: baseline detached7ad07485 and candidate, same390px harness/styles. Images were inspected: [before](before-390.png), [horizontal deck and manual seat](after-390.png), [completed deal](complete-390.png).

No production data or real messages were changed, and no deployment was started. This is a fair virtual deck; do not describe unimplemented VIP processing as released. The fair browser shuffle does not claim server-side authority for future VIP effects.
