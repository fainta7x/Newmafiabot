#!/usr/bin/env python3
"""Prepare art from the two NEW generated Dendi PNGs.

No old JPG extraction, no artificial SVG faces and no cosmetic publication.
Usage:
  python scripts/prepareDendiPremiumArt.py \
    --portrait path/to/dendi-portrait.png \
    --sheet path/to/dendi-wardrobe-sheet.png \
    --out public/character-editor/premium-assets

Requires Pillow (pip install Pillow). Inputs are supplied outside this repo until
the owner approves the generated artwork. The original sheets are NOT committed
or overwritten. Invalid dimensions are rejected rather than silently moved.
"""
import argparse
import hashlib
import json
from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:
    raise SystemExit("Install Pillow first: python -m pip install Pillow") from exc

CANVAS = (1122, 1402)
SHEET = (1448, 1086)
SPRITES = {
    "jacket_burgundy": (44, 14, 735, 654),
    "jacket_black": (744, 14, 1433, 653),
    "bow": (24, 738, 274, 900),
    "tie": (281, 663, 402, 1065),
    "hat_burgundy": (392, 677, 792, 929),
    "hat_black": (730, 734, 1161, 1016),
    "brooch": (1138, 655, 1284, 898),
    "chain": (1168, 773, 1426, 1060),
}
# Placement coordinates are in the same ORIGINAL portrait pixel space. The
# connected source jacket sleeves and portrait crossed hands are incompatible.
# Do NOT add jackets/bow/tie to the set of wearable layers until redrawn.
ALIGNED = {
    "hat_burgundy": (336, -38, 450),
    "hat_black": (326, -58, 470),
    "brooch": (745, 860, 68),
    "chain": (745, 838, 122),
}
READY_FOR_TEST_ONLY = tuple(ALIGNED)
NOT_READY_FOR_WEAR = ("jacket_burgundy", "jacket_black", "bow", "tie")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract(sheet, name, box):
    result = sheet.crop(box)
    pix = result.load()
    for y in range(result.height):
        for x in range(result.width):
            r, g, b, a = pix[x, y]
            if a < 18:
                a = 0
            # Generated contact sheet has unrelated neighboring components
            # at the extreme corners of the hat panels.
            if name == "hat_black" and x < 93 and y < 175 and r > 75 \
                    and r > 1.35 * g and r > 1.27 * b:
                a = 0
            if name == "hat_black" and x > 370 and y < 85:
                a = 0
            if name == "hat_burgundy" and x > 352 and y > 200:
                a = 0
            pix[x, y] = (r, g, b, a)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--portrait", type=Path, required=True)
    parser.add_argument("--sheet", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    portrait = Image.open(args.portrait).convert("RGBA")
    sheet = Image.open(args.sheet).convert("RGBA")
    if portrait.size != CANVAS or sheet.size != SHEET:
        raise SystemExit(f"Wrong art sizes: {portrait.size=} {sheet.size=}; "
                         f"expected {CANVAS} and {SHEET}")
    if portrait.getextrema()[3][0] > 0 or sheet.getextrema()[3][0] > 0:
        raise SystemExit("Expected transparent RGBA PNGs, not flattened JPGs")
    args.out.mkdir(parents=True, exist_ok=True)
    portrait.save(args.out / "dendi_portrait.png")
    produced = {}
    for name, box in SPRITES.items():
        sprite = extract(sheet, name, box)
        sprite.save(args.out / f"{name}.png")
        record = {"file": f"{name}.png", "crop": box, "size": sprite.size}
        if name in ALIGNED:
            x, y, width = ALIGNED[name]
            size = (width, round(sprite.height * width / sprite.width))
            resized = sprite.resize(size, Image.Resampling.LANCZOS)
            layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
            layer.alpha_composite(resized, (x, y))
            aligned_name = f"{name}_aligned.png"
            layer.save(args.out / aligned_name)
            record["aligned_file"] = aligned_name
            record["position"] = {"x": x, "y": y, "w": size[0], "h": size[1]}
        produced[name] = record
    manifest = {
        "version": 1, "status": "VISUAL_TEST_ONLY",
        "portrait_source_sha256": sha256(args.portrait),
        "sheet_source_sha256": sha256(args.sheet),
        "canvas": CANVAS,
        "portrait": "dendi_portrait.png",
        "wearable_for_preview": READY_FOR_TEST_ONLY,
        "incompatible_pose": NOT_READY_FOR_WEAR,
        "items": produced,
        "constraints": [
            "None of the artwork is a released item, rarity or inventory grant",
            "Jackets, bow and tie are NOT wearable: the pose does not match",
            "Hat fitting and clean alpha edges still require art approval",
        ],
    }
    (args.out / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Prepared {len(produced)} separate draft sprites in {args.out}")


if __name__ == "__main__":
    main()
