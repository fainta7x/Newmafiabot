"""Draws the announcement covers in public/announce/ (owner request 2026-09-29).

Run: python3 scripts/generateAnnouncementCovers.py
Needs Chromium (CHROMIUM, default /opt/pw-browsers/chromium) and Pillow. After changing the pictures,
bump COVER_VERSION in handlers/announcement_cover.py so Telegram does not keep the old preview.
"""
import os
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "announce"
CHROMIUM = os.environ.get("CHROMIUM", "/opt/pw-browsers/chromium")

import random
random.seed(7)
VARIANTS = {
  'novice': ('Вечер для новичков', 'Объясним правила с нуля — просто приходи', '#e8b563'),
  'club':   ('Клубный вечер', 'Город засыпает. Просыпается мафия', '#c23a4b'),
  'rating': ('Рейтинговый вечер', 'Каждая игра — в зачёт рейтинга', '#8f7ae6'),
}
def svg(kind):
    title, tagline, accent = VARIANTS[kind]
    W,H=1280,720
    rain = ''.join(f'<line x1="{x}" y1="{y}" x2="{x-14}" y2="{y+46}" />' for x,y in ((random.randint(0,W+60),random.randint(-40,H)) for _ in range(170)))
    # skyline
    bld=[]; x=-10
    while x<W:
        w=random.randint(50,120); h=random.randint(120,300)
        bld.append((x,w,h)); x+=w+random.randint(-8,6)
    sky=''.join(f'<rect x="{x}" y="{600-h}" width="{w}" height="{h+20}"/>' for x,w,h in bld)
    wins=[]
    for x,w,h in bld:
        for wy in range(600-h+18, 590, 22):
            for wx in range(x+10, x+w-12, 18):
                if random.random()<0.13: wins.append(f'<rect x="{wx}" y="{wy}" width="7" height="10"/>')
    wins=''.join(wins)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<defs>
 <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0d13"/><stop offset=".62" stop-color="#171a24"/><stop offset="1" stop-color="#07080b"/></linearGradient>
 <radialGradient id="moon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f4efe2"/><stop offset=".7" stop-color="#d9d2c0"/><stop offset="1" stop-color="#bfb7a3"/></radialGradient>
 <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f4efe2" stop-opacity=".22"/><stop offset="1" stop-color="#f4efe2" stop-opacity="0"/></radialGradient>
 <linearGradient id="cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7cf7c" stop-opacity=".42"/><stop offset="1" stop-color="#f7cf7c" stop-opacity="0.02"/></linearGradient>
 <radialGradient id="pool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f7cf7c" stop-opacity=".30"/><stop offset="1" stop-color="#f7cf7c" stop-opacity="0"/></radialGradient>
 <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#07080b" stop-opacity=".92"/><stop offset=".55" stop-color="#07080b" stop-opacity=".35"/><stop offset="1" stop-color="#07080b" stop-opacity="0"/></linearGradient>
 <filter id="blur"><feGaussianBlur stdDeviation="3"/></filter>
</defs>
<rect width="{W}" height="{H}" fill="url(#bg)"/>
<circle cx="760" cy="150" r="190" fill="url(#glow)"/>
<circle cx="760" cy="150" r="78" fill="url(#moon)"/>
<ellipse cx="730" cy="205" rx="170" ry="16" fill="#12151d" opacity=".7" filter="url(#blur)"/>
<g fill="#0c0e14">{sky}</g>
<g fill="#e8b563" opacity=".55">{wins}</g>
<rect y="600" width="{W}" height="120" fill="#08090d"/>
<ellipse cx="1010" cy="662" rx="230" ry="34" fill="url(#pool)"/>
<polygon points="1040,206 1072,206 1190,662 830,662" fill="url(#cone)"/>
<g stroke="#15171e" stroke-width="10" fill="none" stroke-linecap="round"><path d="M1150 664 L1150 240 C1150 190 1110 176 1070 190"/></g>
<path d="M1034 190 L1080 190 L1070 210 L1044 210 Z" fill="#1a1c24"/>
<ellipse cx="1057" cy="211" rx="14" ry="5" fill="#fff4d6"/>
<circle cx="1057" cy="213" r="26" fill="#f7cf7c" opacity=".35" filter="url(#blur)"/>
<g transform="translate(985 318) scale(0.92)">
 <g fill="#050608">
  <path d="M-16 8 C-18 30 -10 40 0 40 C10 40 18 30 16 8 Z"/>
  <path d="M-30 30 L-12 26 L0 52 L12 26 L30 30 L34 58 C56 62 66 74 68 96 L74 200 L64 206 L62 232 L78 338 L22 338 L20 380 L4 380 L3 338 L-3 338 L-4 380 L-20 380 L-22 338 L-78 338 L-62 232 L-64 206 L-74 200 L-68 96 C-66 74 -56 62 -34 58 Z"/>
  <ellipse cx="0" cy="0" rx="58" ry="10"/>
  <path d="M-33 1 C-34 -34 -20 -48 -2 -41 C4 -46 11 -46 16 -42 C30 -46 36 -31 33 1 Z"/>
 </g>
 <path d="M-33 -2 L33 -2 L31 -9 L-31 -9 Z" fill="{accent}"/>
 <path d="M34 58 C56 62 66 74 68 96 L74 200 M62 232 L78 338" stroke="#f7cf7c" stroke-opacity=".45" stroke-width="2.5" fill="none"/>
 <path d="M33 1 C36 -31 30 -46 16 -42 M58 0" stroke="#f7cf7c" stroke-opacity=".35" stroke-width="2" fill="none"/>
 <path d="M-4 380 L-20 380 M4 380 L20 380" stroke="#050608" stroke-width="4"/>
</g>
<ellipse cx="985" cy="668" rx="90" ry="10" fill="#000" opacity=".6"/>
<g stroke="#dfe6f2" stroke-opacity=".08" stroke-width="1.4">{rain}</g>
<rect width="760" height="{H}" fill="url(#shade)"/>
<g font-family="Liberation Serif, DejaVu Serif, serif">
 <rect x="92" y="196" width="56" height="3" fill="{accent}"/>
 <text x="162" y="206" font-size="22" letter-spacing="7" fill="{accent}" font-family="Liberation Sans, DejaVu Sans, sans-serif" font-weight="bold">ИГРА В МАФИЮ</text>
 <text x="86" y="330" font-size="124" font-weight="bold" letter-spacing="10" fill="#f3efe6">2LA NOIRE</text>
 <text x="92" y="420" font-size="60" font-style="italic" fill="#f3efe6">{title}</text>
 <text x="94" y="478" font-size="28" fill="#f3efe6" fill-opacity=".62" font-family="Liberation Sans, DejaVu Sans, sans-serif">{tagline}</text>
</g>
</svg>'''


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for kind in VARIANTS:
            svg_path = Path(tmp) / f"{kind}.svg"
            png_path = Path(tmp) / f"{kind}.png"
            svg_path.write_text(svg(kind), encoding="utf-8")
            # A taller window avoids the headless viewport strip; the image is cropped to 1280x720.
            subprocess.run([
                CHROMIUM, "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
                "--window-size=1280,900", f"--screenshot={png_path}", svg_path.as_uri(),
            ], check=True, capture_output=True)
            Image.open(png_path).crop((0, 0, 1280, 720)).convert("RGB").save(OUT / f"{kind}.jpg", quality=88)
            print(f"{OUT / kind}.jpg")


if __name__ == "__main__":
    main()
