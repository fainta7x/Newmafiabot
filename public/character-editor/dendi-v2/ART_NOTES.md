# Dendi fitting fixture, v2

Draft art for one silhouette, not a released collection or an approved likeness.
Generated with the built-in image tool. The central existing `public/player-avatars/dendi.jpg` is the identity reference. No source avatar was overwritten.

Final prompt directions:
- Base: preserve the central woman's facial features, blonde waves and frontal gaze; refined realistic painterly noir head/hair/neck only, genuinely transparent canvas, no outfit, hands, background or lettering.
- Shirt: match the final aligned blazer and head; ivory fully buttoned shirt, opaque central collar opening, continuous torso and sleeves slightly inside blazer silhouette, preserve sleeve/torso separation, no face/hair/body.
- Burgundy jacket: tailored pinstripe burgundy wool blazer, relaxed symmetrical sleeves, transparent neckline for a separate shirt, antique gold buttons; no hands, shirt, head, jewelry or background.
- Black jacket: preserve the burgundy layer geometry; replace styling with matte midnight wool and pewter buttons, no gold stripes.
- Hat: detailed burgundy felt fedora, restrained bronze leaf, positioned over the top of the fixed head, no face/hair or background.

Generated art is normalized/exported to the common 512x640 canvas. Source checksums and export transforms are in manifest.json. Alpha was retained; no checkerboard background, SVG face replacement or production inventory grant. Minor sleeve fitting differences remain subject to art review.

This fixture does not implement variable body proportions, hairBack/hairFront, hat hairstyle variants, a deformable mesh, or 3D. Architecture discussion and release limits are owned by `docs/COSMETIC_WARDROBE_ARCHITECTURE.md` sections 10–12.


## Three-character mesh test

Two added head-only layers were generated with the built-in image tool. Identity references: the central figures from `java.jpg` and `fandorin.jpg`; Dendi's new head was a style/lighting reference only. Prompts: preserve Java's brown eyes, smiling mouth, side-part shoulder-length blonde hair; preserve Fandorin's broad face, short swept brown hair and dark square glasses. Render only recognizable head/hair/neck, frontal painterly noir, real alpha, no costume, hands, text or background. Match the canonical bust framing. Export transforms and source hashes are recorded in manifest.json. These drawings remain unapproved individual bases; no garments were redrawn for either person.

The editor now supplies an explicit 2D fitting mesh for the same shirt/jacket texture on all three heads. Hair remains one fixed front layer per person; arbitrary hairstyle/hat compatibility is still a release limit. The corrupted Chagin file was not used or replaced.
