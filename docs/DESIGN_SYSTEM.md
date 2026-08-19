# 2LA Noire Design System

This document is the durable plan and contract for modernizing the application's UI without rewriting product logic or destabilizing Live Game.

## Goal

Move from screen-specific Tailwind/CSS styling to a small shared design system built on the existing React 19 + Tailwind CSS 4 stack, then add shadcn-style components backed by Base UI for interactive primitives.

The migration is evolutionary. Existing product behavior, Telegram/VK integrations, game rules and data flows must not be rewritten merely to adopt the design system.

## Target stack

- React 19 + TypeScript + Vite — unchanged.
- Tailwind CSS 4 — unchanged; remains the styling engine.
- 2LA Noire semantic design tokens — canonical color/surface/type/geometry/layer vocabulary.
- shadcn-style local components — source-owned component layer rather than a black-box visual framework.
- Base UI — headless behavior for Dialog, Sheet, Popover, Menu, Select and related interactive primitives.
- Lucide — canonical general-purpose icon set.
- Motion — reserved for meaningful transitions, not decorative animation everywhere.

Do not replace React, Vite or Tailwind as part of this migration.

## Migration stages

### Stage 1 — Foundation

**Status: complete.**

Scope:

- semantic design tokens over the existing Noir theme variables;
- canonical geometry, focus, touch-size and elevation/layer tokens;
- first source-owned primitives: `Button`, `Card`, `Badge`;
- isolate the application root in preparation for portaled headless UI;
- no production screen migration.

Exit condition: full CI green with no intentional visual change to existing screens.

### Stage 2 — Headless interaction layer

**Status: complete.**

Delivered scope:

- pin `@base-ui/react` as the headless interaction dependency;
- configure `components.json` plus package-import aliases for shadcn-style source-owned components;
- implement canonical `Dialog`, `Sheet`, `Popover` and `Menu` primitives;
- use the Stage 1 portal/layer contract instead of per-screen z-index escalation;
- cover opening, dismissal, focus restoration and portaled behavior with focused component tests.

`Select` remains intentionally deferred until a real migrated screen needs it; do not add primitives only to make the component list look complete.

No production screen and no Live Game UI was migrated in Stage 2.

### Stage 3 — Pilot screen

**Status: complete.**

Pilot: **Player app → Club → Players** (`PlayerClubHub` + `PlayerClubDirectory`).

Delivered scope:

- migrate the Club shell and Players directory to semantic design tokens;
- use the canonical `Button`, `Card` and `Badge` primitives on a real player-facing screen;
- open player details in the canonical Base UI-backed bottom `Sheet` instead of replacing the directory view;
- preserve the existing player-directory/profile API contracts and read-only behavior;
- validate search, focus return, 44px+ tab touch targets and horizontal geometry;
- add browser evidence in a 390×620 Telegram-sized viewport.

`Club → Activity` and `Club → Connections` remain on their existing content implementation in Stage 3. Do not widen the pilot into a full Club redesign before the pilot is reviewed.

### Stage 4 — Shared application shell

**Status: in progress.** Stage 4 is intentionally split into short mergeable sub-stages.

#### Stage 4.1 — Player shell chrome

**Status: complete when the Stage 4.1 PR containing this document is merged to `main`.**

Scope:

- extract the five-item player bottom navigation from `PlayerCabinetShell` into `PlayerBottomNavigation`;
- replace symbol/emoji navigation chrome with canonical Lucide icons;
- migrate the fixed top quick-access bar and bottom navigation to semantic design tokens;
- use the canonical sticky layer instead of screen-specific z-index escalation;
- preserve all existing player section routing, aliases and product content;
- validate top/bottom geometry, active states and 44px+ touch targets in a 390×620 Telegram-sized viewport.

Not included in 4.1: product-screen content migration, shared form fields, confirmation dialogs, screen-specific sheets, loading/empty/error primitives, CRM or Live Game.

#### Remaining Stage 4 work

After 4.1 is merged, continue in separate PRs with reusable application patterns:

- confirmation dialogs and mobile sheets at real active callers;
- common form/input/field primitives;
- loading, empty and error states;
- shared filters and segmented controls;
- migrate additional ordinary screens only as needed to validate those patterns.

Legacy components are removed only after their active callers have migrated.

### Stage 5 — Live Game

Live Game moves last because it is a judge console with domain-specific density and Telegram viewport constraints.

Rules:

- preserve the existing game engine and sports-Mafia mechanics;
- reuse the shared primitives only where they improve judge speed and reliability;
- keep the Telegram stable viewport test;
- preserve direct one-tap judge actions;
- require browser evidence for key phases before merge.

Do not force generic dashboard components into the table geometry if they make judging slower.

### Stage 6 — Cleanup

After migrated screens are verified:

- remove superseded screen-local CSS;
- collapse duplicate button/card/dialog implementations;
- replace ad-hoc z-index values with canonical layers;
- keep only domain-specific CSS that has a real layout purpose.

Cleanup follows migration; it does not lead it.

## Semantic token rules

New/migrated components should use semantic intent rather than palette names.

Prefer:

- `background`, `surface`, `surface-raised`;
- `foreground`, `muted-foreground`;
- `primary`;
- `success`, `warning`, `danger`;
- `border`, `focus-ring`.

Avoid introducing new product UI with literal `slate-*`, `rose-*`, `emerald-*`, etc. A domain visualization may use a specific color when that color itself carries game meaning.

The existing Noir Cherry/Cyan/Violet/Emerald theme variables remain the palette source during migration. Semantic tokens alias those themes instead of replacing them.

## Geometry and touch rules

- Normal mobile controls target at least 44px touch height/width.
- Compact controls below 44px require a surrounding hit area or a domain-specific reason.
- Radius, shadow and border strength should come from design-system tokens rather than being invented per screen.
- Dense data is allowed; cramped interaction is not.

## Layering contract

New UI uses this conceptual order:

1. page;
2. sticky navigation;
3. Live Game work surface;
4. popover/menu;
5. modal/dialog/sheet;
6. critical protocol overlay;
7. toast.

Portaled `Popover`/`Menu` content uses the popover layer; portaled `Dialog`/`Sheet` content uses the modal layer. The application root remains isolated so unrelated page stacking contexts do not compete with portaled interaction surfaces.

Do not solve a stacking bug by picking an arbitrary larger z-index. Fix the layer ownership or portal placement.

## Telegram WebApp contract

- Use Telegram stable viewport/safe-area data when the host provides it.
- Do not assume `100dvh` equals usable game space.
- App navigation must not overlap a full-screen work surface.
- Test important mobile work surfaces in a Telegram-like reduced stable viewport, not only a generic browser viewport.

## Component ownership

The application owns the source code of its UI components. shadcn is a component-generation/style approach, not a runtime visual dependency that controls the product look.

Base UI owns headless interaction behavior where appropriate; 2LA Noire tokens and component source own presentation.

## Verification policy

During each stage:

1. work on one branch/PR;
2. use focused tests while iterating;
3. keep active iteration PRs draft when practical;
4. run full CI once the stage is coherent;
5. visually inspect browser evidence for UI-heavy changes;
6. merge and stop before beginning the next stage.

Do not combine multiple migration stages into one large PR.
