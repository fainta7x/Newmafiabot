# 2LA Noire — Design System

This file owns the **durable visual contract only**. It does not own rollout status, release history or current work queue; those belong in `docs/PROJECT_STATE.md` and Git history.

## Canonical visual source

The established Player Cabinet is the visual source of truth for the entire product: Player, Organizer CRM and Live Game.

Primary references:

- `src/components/player/PlayerHomeDashboard.tsx` — card/material hierarchy and semantic accents;
- `src/components/player/PlayerGamesHub.tsx` — tabs/segmented controls/page hierarchy;
- current `PlayerCabinetShell` chrome/navigation geometry;
- approved Telegram WebApp screenshots of Home/Games and current Playwright mobile evidence.

Do not use generic shadcn-dark, old Organizer CRM or rejected faux-premium experiments as global inspiration.

## Colour and material

Canonical base:

- app background: `#090a0d`;
- top chrome: about `rgba(11,12,16,.92)` with blur;
- bottom chrome: about `rgba(11,12,16,.95)` with blur;
- ordinary surface: `white/3.5–4.5%`;
- selected/strong surface: `white/7–9%`;
- inset tile: `black/20%`;
- ordinary border: `white/7–10%`;
- stronger border: about `white/16%`;
- primary text: white;
- secondary text: normally `white/35–45%`;
- tertiary text: `white/20–30%`.

Generic primary actions are **white with dark text**. Colour is semantic, not universal decoration.

Semantic examples:

- Cherry/rose — nomination/voting/critical game identity where appropriate;
- amber — day/speech/judge-work/warning;
- violet — night;
- sky — informational state where explicitly used;
- green — success/positive confirmation;
- danger red — destructive/error.

## Geometry

- feature card: ~`28px` radius;
- ordinary card/sheet grouping: ~`24px`;
- compact control: ~`12px`;
- softer/larger action: ~`16px`;
- approved top quick-access controls: `40px` visible geometry;
- approved bottom-nav item: `52px`;
- new ordinary mobile interaction targets: normally at least `44px` unless an approved reference intentionally differs;
- Telegram stable viewport and safe-area geometry are mandatory.

## Typography

Global UI sans is Roboto-first with platform/system fallbacks.

Typical hierarchy:

- page title: ~`24px`, semibold;
- content title: semibold;
- section eyebrow: ~`10px`, semibold, uppercase with restrained tracking;
- secondary/supporting copy: smaller and lower contrast.

Avoid decorative fonts, blanket bold, excessive uppercase and arbitrary negative letter-spacing.

## Depth

The product is restrained, not flat and not faux-3D.

Allowed:

- very soft depth on large surfaces;
- stronger elevation for real floating Dialog/Sheet/Popover layers;
- subtle hierarchy gradients on approved feature cards.

Do not use:

- bevels;
- ornamental inset highlights;
- glow-heavy controls;
- decorative gradients on generic buttons/inputs;
- arbitrary per-screen shadows.

## Organizer CRM contract

Organizer CRM uses the same product language, but on mobile it must behave like a work tool rather than a dashboard catalogue.

Always prioritize:

1. what requires action now;
2. the nearest event or player context;
3. common one-tap actions;
4. compact operational status;
5. history, analytics and rare administration on a secondary level.

Durable mobile rules:

- `Сегодня` starts with the current/nearest evening and blockers; branding/explanatory copy must not push work below the fold;
- `События` keeps the nearest events and creation actions readily visible; the full month calendar may expand on demand rather than occupying the initial mobile viewport;
- `Игроки` is action-first: search/list -> next context -> contact/task/communication actions -> essential status/notes; long history, detailed statistics and internal CRM data remain available but collapsed by default;
- `Состав` inside an evening starts with a short action queue built from factual attendance and payment state; announcement/registration tools and the full CRM roster stay available on a secondary level, and tapping a participant opens the evening-specific card before any global player profile;
- `Ещё` separates frequent organizer tools from game/admin tools and keeps rare maintenance controls collapsed by default;
- preserving functionality does not require giving every function equal visual weight;
- do not remove advanced functionality merely to simplify the first mobile screen; move it behind a clear secondary disclosure instead.

## Unified mode navigation

- Player Cabinet and Organizer CRM are modes of one product and use one shared bidirectional switch in the top chrome.
- An authorized organizer can reach `Управление` from any Player Cabinet section and return to `Кабинет` from any CRM screen.
- The mode switch is not a sixth Player Cabinet bottom tab and does not replace logout.
- On mobile the CRM top chrome remains visible, width-bounded and secondary to the active work surface.
- Labels describe the destination (`Управление` / `Кабинет`); icon-only mode switching is not allowed.

## Live Game contract

Live Game uses the same product language but optimizes for judge speed.

Always prioritize:

1. current phase + timer + next action;
2. ten player identities;
3. foul/technical-foul/nomination/voting state;
4. fast ordinary judge actions;
5. secondary history/state/notes one tap away.

Phase semantics:

- day/speech: amber;
- night: violet;
- nomination/voting: rose/Cherry family;
- generic confirm/progress: white-on-dark unless semantic colour is necessary.

Player identity must never disappear merely because a player is dead, voted out or currently in a voting state. Status is secondary to identity.

Non-zero ordinary/technical discipline must be readable directly on the relevant seat without opening the player sheet. Zero counters stay visually absent so the table does not become a grid of empty badges.

When seat states compete for the same central status area, the judge-critical state wins. In particular, a 30-second third-foul penalty remains the central warning even if that player is also nominated; nomination remains visible through the seat treatment and nomination control.

Do not hide judge-critical copy with ellipsis just to fit a test.

### OBS spectator overlay

- Canonical canvas is transparent `1920×1080`; its central area remains available for the camera composition.
- Ten player identities stay in a stable bottom row on a 16:9 broadcast, with role and out-state readable at streaming scale.
- Killed, voted and removed states remain visually distinct without deleting the player identity.
- Current phase/game number/timer form the top chrome; nominations and fixed voting detail occupy compact secondary panels.
- Partial voting input is intentionally invisible to spectators. The fixed result must make both totals and voter seats readable.
- Connection loss uses a restrained warning and preserves the last frame instead of replacing the broadcast with an error screen.

### Setup / physical role distribution

The pre-game setup is part of the judge workflow, not a separate settings screen.

- `Раздача ролей` and its primary start action must be visible before optional settings;
- table composition remains quickly reviewable before the first card;
- music and speech recording are secondary, compact controls and must not push the primary start action below them;
- during physical dealing, the current seat/player and the four role choices are the dominant work area;
- role colours are semantic accents only; the surrounding surface remains the canonical neutral cabinet material;
- previous/next seat navigation and completion remain explicit, finger-sized controls;
- setup polish must not alter the physical-card role counts or automatic transition into the game protocol.

## Layering contract

Conceptual order:

1. page;
2. sticky app navigation;
3. Live Game work surface;
4. popover/menu;
5. modal/dialog/sheet;
6. critical game/protocol overlay;
7. toast.

Do not solve stacking by inventing arbitrary higher z-index values when ownership/portal placement is wrong.

## Telegram WebApp contract

- use stable viewport/safe-area values when available;
- mobile-first is the default: validate the first usable layout at Telegram phone width before desktop polish;
- check narrow widths, keyboard-open state, bottom safe-area insets and fixed overlays for clipping or unreachable controls;
- never assume browser `100dvh` equals Telegram usable area;
- fixed chrome must not cover the active work surface;
- important player/CRM screens and every Live Game phase require Telegram-like browser evidence;
- canonical evidence geometry is approximately `390 CSS px` width, `713 CSS px` Telegram webview height, DPR around `2.4` unless a specific test intentionally uses another stable-height case.

## Visual verification rule

For every visual PR:

1. use focused browser evidence while iterating;
2. run full CI once coherent;
3. inspect fresh screenshots after CI;
4. explicitly check clipping, overlap, identity loss, hierarchy, phase colour, viewport overflow and action target geometry;
5. fix visible bugs before starting the next stage.

**Green Playwright is execution evidence, not visual approval.**

## Current implementation status

The app-wide migration to the Player Cabinet language across Player, Organizer CRM and Live Game was integrated through release PR #118 on 2026-08-20. Do not reopen that rollout roadmap from older branches/docs.

Remaining visual work is ordinary product polish/bug fixing, not a separate global migration program. Setup and physical role distribution now follow the same cabinet/judge-first contract; future changes there should be concrete polish or bug fixes rather than another redesign stage.
