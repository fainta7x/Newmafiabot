# Wardrobe template contract · draft v1

One new person requires one prepared, recognizable identity. Clothing is authored for **body families**, never for a player ID. Existing JPEG portraits cannot become layered, universally fitted characters without preparation. This pilot does not publish inventory, replace real avatars or approve likenesses.

## Canvas and attachments

All textures are transparent RGBA PNG, 512×640, one front-facing chest-up pose. No crossed hands, text or costume baked into the head. Canonical eyes sit at y215; eye separation is capped at 86px and eye-to-chin distance at 132px. The entire face receives one uniform transform. Only the lower neck behind the collar changes length to meet y400; the face is never stretched. Head normalization uses two eyes, chin and the two neck landmarks measured once during identity preparation. A prepared jaw contour separates a short-haired face from the rear neck along its actual anatomy.

Body templates and their numeric presets live in `src/lib/wardrobeTemplates.ts`, not in each person's settings. There are two painted construction families, straight and curved, with four initial sizes/shapes: straight regular/broad and curved slim/full. A curved garment has its own bust volume and cloth shading; changing widths in the mesh does not manufacture those features from a straight male torso. Each item keeps one itemId and has a URL per family. Small size differences within a family use the shared UV mesh. The lower torso and sleeves have separate fitting influence, so shaping the waist does not collapse the arms. Closed coats reveal a neckline/V-front mask applied in source UV space, preventing white cloth in their armholes. A missing family variant is visibly incompatible and must not silently use the straight garment.

| Component | Authoring / attachment | Compositing |
| --- | --- | --- |
| Shirt / blouse | Two construction variants; collar inside the coat opening | Behind neck/front hair; sleeves concealed under a closed coat |
| Vest / outerwear | Same body family and pose; transparent neckline, no baked shirt or skin | Above shirt, below front hair |
| Neckwear | Canonical collar seat | Above shirt; must be reviewed with both collars before release |
| Glasses | Transparent lenses, two eye attachment points on the item | Separate eyewear slot above face, below hat |
| Hat | Two inner-brim contact points; shared eye-relative temple seat | Above head, with tapered hair occlusion under the brim |
| Other jewelry | Explicit attachment and compatible garment/hair combinations required | No automatic universal compatibility declaration |
| Hairstyle | Identity-owned short / bob / long occlusion policy | Hair stays in front; lower neck stays behind clothes |

Short, bob and long are reusable **occlusion policies**, not a hairstyle shop or a way to change another person's face. Current hair and face still share one bitmap; the renderer splits their visibility with masks. New poses, afro/high bun/ponytail, detachable reusable hairstyles and hat-specific painted hair alternatives require additional art and review. They are not claimed as solved by these three policies.

## Current art and provenance

Built-in image generation edited the existing v4 shirt/burgundy/charcoal blazers to the curved family, preserving the same framing, collar seat, material, light and modest everyday styling; no head, skin, shirt baked into coats, mannequin or opaque background. The Fandorin edit removed only sunglasses, reconstructing visible eyes while preserving the reference identity/style. An independent extraction supplies black square frames with translucent smoky lenses and no baked face. `manifest.json` records source SHA256 and the resize-to-canvas transform. Originals remain under their prior immutable URLs.

## Acceptance before another item is added

Run `node scripts/validateWardrobeTemplates.mjs`. Inspect the same item on all four body templates, and on short/bob/long hair, with shirt only, both coats, hat on/off and glasses on/off. Check collar contact, shoulder/bust shading, hat brim, eye attachment and removed accessories. Check mobile 360/390px, persistence and frozen looks in the real shared renderer. Correct the template/item once; do not add a per-person clothing URL or a new player-specific scale to hide an error. Green geometry tests alone are not artistic approval.
