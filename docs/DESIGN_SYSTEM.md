# 2LA Noire Design System

This document is the durable visual contract for the whole application.

The design-system migration must preserve product logic, sports-Mafia rules, Telegram/VK integrations and data flows. Base UI and shared React components own interaction behavior; **the established player cabinet owns the visual language**.

## Canonical visual source of truth

As of 2026-08-19 the user explicitly chose the current player cabinet as the design reference for **all** application surfaces: player cabinet, organizer CRM and Live Game.

Primary code references:

- `src/components/player/PlayerHomeDashboard.tsx` — canonical cards, hierarchy, actions and semantic accent use;
- `src/components/player/PlayerGamesHub.tsx` — canonical tabs / segmented controls and page header;
- the player shell immediately before Stage 4.1 (`a4c53b34446c617b76ac6b90b02c4c760ff45638`) — canonical top quick-access bar and bottom navigation geometry.

The user's production Telegram WebApp screenshots of **Главная** and **Игры** are the visual approval reference. Do not use Organizer CRM, generic shadcn examples or the rejected Stage 4.4 experiment as visual inspiration.

## Canonical visual language

### Colour and material

- app background: `#090a0d`;
- top chrome: approximately `rgba(11, 12, 16, 0.92)` with strong blur;
- bottom chrome: approximately `rgba(11, 12, 16, 0.95)` with strong blur;
- ordinary card surface: about `rgba(255,255,255,0.035–0.045)`;
- stronger/selected neutral surface: about `rgba(255,255,255,0.07–0.09)`;
- inset/content tile: about `rgba(0,0,0,0.20)`;
- ordinary border: `white/7–10%`;
- stronger border: around `white/16%`;
- primary text: white;
- secondary copy: normally `white/35–45%`;
- tertiary/supporting text may drop to `white/20–30%`.

**Generic primary actions are white with dark text.** Cherry, amber, green and other colours are semantic accents, not the universal primary fill. Examples: LIVE uses Cherry; judge/work tooling may use amber; errors/destructive actions use danger.

### Geometry

- large feature/card radius: `28px`;
- ordinary card/sheet grouping: around `24px`;
- compact controls: normally `12px` radius; softer/larger actions may use `16px`;
- the approved top quick-access wallet/profile controls are **40px visible controls**; do not enlarge them just to satisfy a generic component rule;
- the approved bottom-nav item height is **52px**;
- normal new mobile interaction targets should be at least `44px` unless the approved player-cabinet reference intentionally uses a smaller visible control;
- Telegram stable viewport and safe-area geometry are mandatory.

### Typography

Use the same platform/system font behaviour as the approved player cabinet. Hierarchy is created mostly with size, weight, opacity and spacing — not decorative fonts.

- page title: about `24px`, `font-semibold`;
- normal content title: `font-semibold`, not blanket `font-bold`;
- secondary copy: small and low-contrast;
- section eyebrow: about `10px`, `font-semibold`, uppercase, tracking around `0.16–0.18em`;
- avoid unnecessary negative letter-spacing and excessive uppercase.

Browser evidence must render with the same `font-sans antialiased` body treatment as production and should use an Android-like device pixel ratio when visually comparing against the approved phone screenshots. Do not judge typography from a DPR-1 CI screenshot as if it were the production phone rendering.

### Depth

The approved player cabinet is modern and restrained, not flat white/black and not faux-3D.

- ordinary large cards may use the existing very soft `0 18px 60px rgba(0,0,0,.22)` depth;
- normal buttons, inputs and tabs do not use bevels, inset highlights or ornamental shadows;
- Dialog/Sheet/Popover may use stronger real floating elevation;
- subtle gradients already present in approved player-cabinet feature cards are allowed when they serve hierarchy, but **do not create decorative bevel gradients in shared controls**.

## Explicit anti-patterns

Do not reintroduce:

- the rejected Stage 4.4 faux-premium treatment (bevels, inset highlights, glow-heavy controls, ornamental gradients);
- a grayscale black/white reinterpretation that removes the cabinet's semantic Cherry/amber/etc. accents;
- CRM-specific styling as the global visual source;
- generic shadcn-dark appearance;
- a different visual language for Live Game;
- arbitrary new radii, shadows or z-index values per screen;
- Cherry as the fill for every primary action;
- accessibility-driven visible-size inflation that changes an already approved reference control without a product reason.

## Technical stack

Keep the current stack:

- React 19 + TypeScript + Vite;
- Tailwind CSS 4;
- source-owned 2LA Noire semantic tokens and UI primitives;
- Base UI for headless Dialog / Sheet / Popover / Menu behaviour;
- Lucide where a neutral icon is appropriate, but existing player-cabinet glyph/icon choices may remain when they are part of the approved reference;
- Motion only for meaningful transitions.

The technical work from Stages 1–4.3 remains useful: semantic tokens, canonical layers, Base UI portal/focus behaviour, shared forms, async states, confirmation flow and common controls are retained. **Only the visual direction introduced in Stage 4.4 is rejected.**

## Current app-wide rollout

Work in short, separately verified PRs.

### 1. Canonical player-cabinet foundation

Status: **in progress**.

- make shared tokens and primitives reproduce the approved Home/Games language;
- restore player shell chrome/navigation to that same language while retaining canonical layers and the approved reference geometry;
- update browser guards so tests protect the approved visual contract instead of Stage 4.4;
- do not redesign CRM or Live Game yet.

Exit gate: green CI + fresh Telegram-sized screenshot review.

### 2. Remaining player cabinet

Migrate `События`, `Рейтинг`, `Клуб`, `Профиль`, wallet/economy and related player surfaces to the same Home/Games language. Do not redesign Home/Games merely for consistency — they are the reference.

### 3. Organizer CRM

Restyle organizer shell, navigation, cards, forms, tables and dialogs in the **same** player-cabinet language. CRM may be denser because the task is administrative, but density is not permission to use a separate visual system.

### 4. Live Game — shell and center

Rebuild the judge workspace shell and center HUD using the approved visual language, while prioritizing Telegram WebApp usable height and judge speed. Preserve the game engine and all sports-Mafia mechanics.

### 5. Live Game — seats and fast judge actions

Unify player seats, fouls, nominations, status information, night actions and one-tap judge controls. Judge information must be immediately readable and actions must remain fast.

### 6. Live Game overlays + final cleanup

Unify confirmations/overlays, verify all phases in Telegram-sized browser evidence, then remove superseded visual CSS and duplicate implementations only after callers are proven migrated.

## Layering contract

Use the canonical conceptual order:

1. page;
2. sticky app navigation;
3. Live Game work surface;
4. popover/menu;
5. modal/dialog/sheet;
6. critical game/protocol overlay;
7. toast.

Do not solve stacking by inventing a larger arbitrary z-index. Fix layer ownership or portal placement.

## Telegram WebApp contract

- use stable viewport / safe-area values when provided;
- never assume browser `100dvh` equals the usable Telegram area;
- fixed app chrome must not cover the active work surface;
- important screens and every Live Game phase require reduced-height Telegram-like browser evidence;
- new controls normally target at least 44px, but approved reference controls keep their exact visible geometry unless there is a concrete usability problem.

## Verification policy

For each visual stage:

1. branch from fresh `main`;
2. make only the scoped visual migration;
3. use focused checks while iterating;
4. open a draft PR if iteration continues;
5. run one full CI once coherent;
6. inspect fresh browser screenshots;
7. for major visual-direction changes, get explicit user approval before merge;
8. merge and stop before beginning the next stage.

Do not combine player-cabinet rollout, CRM migration and Live Game redesign into one giant PR.