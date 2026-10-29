# Direct player-avatar image audit — 2026-10-29

The original #1085 fixed the shared PlayerAvatar, but direct `<img>` renderers still loaded full-size avatar URLs into small frames. The owner asked to include these places. The affected paths are player directory, profiles and settings, ratings, social connections, voting, game details and stories, poker, CRM table scouting, and public broadcast. The live rendering source was confirmed by source imports and avatar URL producers; no private production data was read.

A shared AvatarImage measures its displayed size, prepares a physical-pixel raster with the same downsampling helper and preserves the existing image shape, crop and error handler. Only image data URLs and two known same-origin avatar route families are eligible. Unversioned HTTP routes do not retain converted bitmaps across mounts. ResizeObserver prepares images revealed later in a hidden panel. Repository originals, uploads, storage and server output remain unchanged.

Validation: four helper cases, six actual browser quality cases including the real `nason.jpg` served through an HTTP route, Retina and four screen sizes; 49 selected app layout/text audits across 360/390/1366/1440 plus wide-font phones; TypeScript, lint, release audit, dependency guard and Vite build. Original screenshot before/after of the shared component in #1085 and the newly inspected HTTP rendering use the same repository photo. Browser screenshots remain in local/CI test output; no private upload is copied into a static preview. Full CI and merge are recorded on the PR.

A small source image cannot gain missing detail through display resampling. No Amvera deployment or live runtime verification in this workstream.
