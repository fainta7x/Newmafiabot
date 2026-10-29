# Avatar quality — 2026-10-29

## Reproduction and cause

Owner screenshot shows jagged Насон/Денди CRM thumbnails. Both repository originals decode correctly at2048px and match the manifest SHA. No pixelated/crisp-edge CSS exists. Actual Chromium reproduction using those exact JPEGs and the real PlayerAvatar: native images2048×1768 /2048×1381 are rendered in a48px frame (46px interior). Thin light/dark details alias during that reduction. Other stored photo dimensions could not be inspected: organizer credential absent. This finding does not claim a live production DB read.

## Change

Display-only thumbnail preparation with high-quality staged downsampling, bounded/shared promise cache, physical-pixel sizing, no enlargement and original fallback. Original photos, aspect ratio, CSS object-position, frame geometry and upload/storage/authentication remain untouched. Small source photos cannot gain missing detail.

## Evidence

- Before main26560e6c and after: same390×844 harness, sources, crop and scroll; before/after.png manually inspected, both pass unchanged auditScreen detector. New harness uses only synthetic default imagery in general preview; focused tests inject existing repo JPEGs directly without copying private uploads into preview.
-11 focused Vitest cases across thumbnail/mapping/harness owners;5 browser cases cover360/390/1366/1440 plus DPR2. Tests verify actual decoded raster sizes at every avatar size, fallback, no upscaling and shared work.
-12 app layout audit cases pass (avatar harness + CRM players × four sizes and two wider-font phone variants). New page registered in the build and all-app audit.
-TypeScript, changed-source ESLint, release safety audit, dependency guard0 and Vite build pass. Existing daily-word dynamic-import warning is unrelated.
-No production avatar/data mutation, notification or deployment. Required remote CI and merge status recorded in the PR.
