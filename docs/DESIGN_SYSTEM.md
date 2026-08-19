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

**Status: complete technically; visual language is gated by Stage 4.5 approval.** Stage 4 was intentionally split into short mergeable sub-stages.

#### Stage 4.1 — Player shell chrome

**Status: complete.**

Delivered scope:

- extract the five-item player bottom navigation from `PlayerCabinetShell` into `PlayerBottomNavigation`;
- replace symbol/emoji navigation chrome with canonical Lucide icons;
- migrate the fixed top quick-access bar and bottom navigation to semantic design tokens;
- use the canonical sticky layer instead of screen-specific z-index escalation;
- preserve all existing player section routing, aliases and product content;
- validate top/bottom geometry, active states and 44px+ touch targets in a 390×620 Telegram-sized viewport.

#### Stage 4.2 — Shared forms and async states

**Status: complete.**

Delivered scope:

- add canonical `Input` and `Field` primitives only where real migrated forms need them;
- migrate `AsyncState` to semantic loading/empty/error presentation while keeping its existing public API compatible;
- migrate Player Profile → Personal data to canonical fields and shared feedback messages without changing profile API behavior;
- migrate Club → Players search and loading/empty/error presentation to the shared primitives;
- harden canonical `Button` color variants to direct semantic tokens after browser evidence exposed a transparent primary action;
- validate labels, 44px+ field geometry, save/validation behavior and horizontal geometry in a 390×620 Telegram-sized viewport.

Do not add `Textarea`, `Select` or other primitives merely for completeness. Add them when a real migrated screen needs them.

#### Stage 4.3 — Shared dialogs, sheets and repeated controls

**Status: complete.**

Delivered scope:

- rebase the legacy `ConfirmDialog` public API on the canonical Base UI-backed `Dialog`, preserving existing callers while replacing manual modal stacking/focus behavior;
- replace Player Profile avatar deletion's browser `window.confirm` with the shared confirmation flow;
- rebase the legacy `MobileSheet` public API on canonical `Sheet`, preserving header/body/footer compatibility and centered desktop presentation;
- extend canonical `SheetContent` with optional fixed header/footer/body/viewport slots needed by real compatibility callers;
- add the canonical `SegmentedControl` and migrate both Club (3 sections) and Rating (4 sections) navigation to it;
- give repeated segmented actions the canonical 44px+ touch geometry and semantic active state;
- verify confirmation geometry and behavior in the existing 390×620 profile harness and cover compatibility wrappers with focused unit tests.

`ConfirmDialog` and `MobileSheet` compatibility files stay in place through Stage 5. Remove them only during Stage 6 after exact import/caller cleanup proves the wrappers are no longer needed.

#### Stage 4.4 — Raised / faux-depth Premium Noir experiment

**Status: superseded after visual review. Do not use as the canonical visual direction.**

Stage 4.4 tried to restore perceived premium quality with gradients, inset highlights, stronger shadows and accent reflections. Although it was technically valid, visual review found that this moved the product toward a dated faux-3D / 1990s feel. Its code remains in Git history only as an experiment.

Do not restore Stage 4.4 bevels, ornamental gradients, permanent card shadows or glow-heavy controls in later work.

#### Stage 4.5 — Modern Noir reset

**Status: candidate. Must receive explicit user visual approval before merge and before Stage 5 starts.**

Visual source of truth: the player-facing UI immediately before the design-system migration, especially commit `dc30be335f37de50bad6db1acd5e3a035461d902`, while keeping the newer Base UI/accessibility/layer architecture.

Canonical visual direction:

- **modern luxury Noir, not generic shadcn dark and not faux-3D premium**;
- deep near-black app background;
- ordinary surfaces use translucent light material around 4–8% rather than opaque gray cards;
- borders are very thin and low-contrast, roughly equivalent to the earlier `white/10` treatment;
- no decorative gradients, bevels or box shadows on ordinary cards, fields, tabs or primary buttons;
- shadows are reserved for genuinely floating layers such as Dialog/Sheet/Popover;
- generic primary actions are light/white on dark, matching the earlier player UI; brand accent is reserved for focus and domain meaning rather than filling every primary action;
- hierarchy comes from typography, whitespace, opacity and grouping before decoration;
- avoid nested bordered boxes, table-like dividers and excessive pill badges when plain text communicates the same information;
- player lists should feel like airy individual rows rather than a bordered data table;
- chrome stays dark/translucent with blur and subtle active-state fill;
- maintain 44px+ touch targets and Telegram stable-viewport behavior.

Verification gate:

1. full CI must be green;
2. fresh 390×620 browser evidence must be reviewed for Club, Profile, Dialog/Sheet and shared shell;
3. **do not merge Stage 4.5 based only on automated checks**;
4. user must explicitly approve the visual direction in chat;
5. only after that approval may Stage 5 Live Game begin.

### Stage 5 — Live Game

Live Game moves last because it is a judge console with domain-specific density and Telegram viewport constraints.

**Blocked until Stage 4.5 has explicit visual approval.**

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
- remove compatibility wrappers only after all imports have moved to canonical primitives;
- keep only domain-specific CSS that has a real layout purpose.

Cleanup follows migration; it does not lead it.

## Semantic token rules

New/migrated components should use semantic intent rather than palette names.

Prefer:

- `background`, `surface`, `surface-raised`;
- `foreground`, `muted-foreground`;
- `primary` / brand accent only where accent meaning is intended;
- `action` for generic primary action fill;
- `success`, `warning`, `danger`;
- `border`, `focus-ring`.

Avoid introducing new product UI with literal `slate-*`, `rose-*`, `emerald-*`, etc. A domain visualization may use a specific color when that color itself carries game meaning.

The existing Noir Cherry/Cyan/Violet/Emerald theme variables remain the palette source during migration. Semantic tokens alias those themes instead of replacing them.

## Geometry and touch rules

- Normal mobile controls target at least 44px touch height/width.
- Compact controls below 44px require a surrounding hit area or a domain-specific reason.
- Radius and border strength should come from design-system tokens rather than being invented per screen.
- Ordinary content surfaces should not gain a shadow merely to appear premium.
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
6. for visual-direction stages, require explicit user approval before merge;
7. merge and stop before beginning the next stage.

Do not combine multiple migration stages into one large PR.
