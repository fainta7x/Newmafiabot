# Shared wardrobe bust fixture · v4

Draft artwork, not released inventory or approved player likenesses. Original avatars are preserved. Existing identity references: `public/player-avatars/{dendi,java,fandorin}.jpg`; the prepared earlier heads were used as identity-preserving edit references. Built-in imagegen was used; source hashes and normalization are in manifest.json.

## Art direction and prompts

The owner rejected the mannequin framing, buried neck and inconsistent face/fabric rendering. One complete Fandorin bust was first drawn as the composition/style master: preserve recognizable face, swept brown hair and square sunglasses; natural anatomical neck entering a relaxed open ivory collar; warm grey undershirt; sloping shoulders and relaxed upper arms; crop at upper chest, no hands; unified painted graphic-novel contours, warm frontal-left light and restrained fabric texture; transparent background.

The shirt and both coats are SEPARATE assets referenced to that master, not a flattened costume. Shirt extraction retains cloth and grey undershirt, removes all skin/head. Burgundy and charcoal blazer prompts preserve the master's shoulder pose, chest crop, lighting, fabric volume and transparent inner V; no shirt/head/skin baked into either coat, no waist-length mannequin or corset tailoring. Head preparation preserves each identity, expression and hairstyle while matching the master's painted rendering and complete anatomical neck. Generated head exports recentered differently, so measured neck-seat and temple anchors normalize them by a uniform transform in `dendiWardrobePilot.ts`; no per-feature face warping. All six new assets use full-canvas 512×640 contain normalization with original alpha. The previous hat is reused with calibrated temple contact.

## Composition contract

Java's foreground cutout follows the flared neck/hair boundary rather than a rectangular notch. All skin below the chin stays behind the collar while both hair tips remain in front. Under a closed coat, the shirt uses an inset neck fit (−0.18 of the fitting width) so the shirt collar lies inside the coat opening instead of disappearing along an identical outer seam. Shirt-only fitting stays unchanged. The same garment texture and rule apply to every character.

The v4 clothes already share the canonical bust pose; there is no vertical torso stretching. UV fitting adjusts collar/shoulder/chest widths for three example silhouettes. Closed coats expose the shirt front while covering its sleeves; the visible collar remains intact. Neck is behind the shirt/lapels, front hair stays above clothes, hair under the hat is masked. Profile data owns the measured landmarks. Geometry and mask implementations are `portraitRig.ts` / `portraitMesh.ts`.

Old v1 fitting presets belonged to the discarded mannequin pose. The lab now uses v2 fitting storage; the four saved role outfits/item IDs and phrases are preserved. No production body-fit API or inventory grants were added. Future arbitrary poses and fully decomposed hairstyles remain outside this pilot; see `docs/COSMETIC_WARDROBE_ARCHITECTURE.md` §13.
