"""Crop generated card and ending art to the 12:5 shape and save as WebP.

Usage: python3 scripts/process_card_art.py [CARDS_SRC [ENDINGS_SRC]]
  (defaults /tmp/claude-501/pencil/cards and /tmp/claude-501/pencil/endings)
Writes assets/cards-gpt/<id>.webp and assets/endings-gpt/<key>.webp (1200x500, quality 72,
about 90 KB each). Each strip is centred on the image's focal point (FOCUS, the focal height as
a fraction of the raw image), and the focal point's position inside the strip is written to
the ART_FOCUS line in index.html, so the thin header slice (object-position) shows it too.
Blank letterbox bands that the model sometimes adds are trimmed first.
The images that show the US president (SPLIT_IDS) are used only as split Vance | Democrat
versions (<id>-vance-newsom, <id>-vance-aoc, in /tmp/claude-501/split/raw/{cards,endings}), so
their single-president files are skipped.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageChops

root = Path(__file__).resolve().parent.parent
srcs = [Path(a) for a in sys.argv[1:3]] or []
srcs += [Path(p) for p in ("/tmp/claude-501/pencil/cards", "/tmp/claude-501/pencil/endings")[len(srcs):]]
outs = [root / "assets" / "cards-gpt", root / "assets" / "endings-gpt"]

# Focal height (0 = top, 1 = bottom of the raw image): the most recognizable face, or the
# heart of the scene when no face matters most.
FOCUS = {
    # cards
    "posture": 0.40, "openweights": 0.22, "neuralink": 0.28, "export": 0.37, "whistle": 0.42,
    "iaea": 0.45, "internal": 0.42, "publish": 0.42, "sleeper": 0.40, "nearmiss": 0.28,
    "hotline": 0.36, "automate": 0.45, "jobs": 0.50, "neurohack": 0.40, "taiwan": 0.45,
    "sabotage": 0.27, "deal": 0.30, "gap": 0.40, "covert": 0.45, "collapse": 0.40,
    "fund": 0.47, "pledge": 0.42, "cern": 0.45, "agents": 0.45, "threshold": 0.46,
    # endings
    "flourish": 0.45, "pause": 0.40, "muddle": 0.55, "benevolent": 0.50,
    "lockin": 0.66, "war": 0.45, "bio": 0.32, "misalign": 0.50,
}


def trim_bands(im):
    """Drop uniform near-white or near-black rows at the top and bottom."""
    g = im.convert("L")
    w, h = g.size
    def blank(y):
        row = g.crop((0, y, w, y + 1))
        lo, hi = row.getextrema()
        return hi - lo < 12 and (lo > 235 or hi < 20)
    top, bot = 0, h
    while top < h // 3 and blank(top):
        top += 1
    while bot > h - h // 3 and blank(bot - 1):
        bot -= 1
    return im.crop((0, top, w, bot)), top / h, (bot - top) / h


SPLIT_IDS = {"sabotage", "deal", "threshold", "pause"}
positions = {}
for src, out in zip(srcs, outs):
    out.mkdir(parents=True, exist_ok=True)
    for png in sorted(src.glob("*.png")):
        if png.stem.split("-")[0] in SPLIT_IDS and "-vance-" not in png.stem:
            continue
        im, t0, frac = trim_bands(Image.open(png).convert("RGB"))
        w, h = im.size
        # A split president image (<id>-vance-newsom, <id>-vance-aoc) is cropped by <id>'s FOCUS and sets its ART_FOCUS.
        base = png.stem.split("-")[0]
        fy = min(max((FOCUS.get(base, 0.5) - t0) / frac, 0), 1)  # focal height after trimming
        cw, ch = w, round(w * 5 / 12)
        if ch > h:  # trimmed image is wider than 12:5: crop the sides instead
            cw, ch = round(h * 12 / 5), h
        left = (w - cw) // 2
        top = min(max(round(fy * h - ch / 2), 0), h - ch)
        strip = im.crop((left, top, left + cw, top + ch)).resize((1200, 500), Image.LANCZOS)
        strip.save(out / f"{png.stem}.webp", "WEBP", quality=72, method=6)
        pos = round((fy * h - top) / ch * 100)
        if base == png.stem or base not in positions:
            positions[base] = pos
        print(png.stem, (out / f"{png.stem}.webp").stat().st_size // 1024, "KB", f"focus {pos}%")

# Keep ids that were processed earlier but not in this run.
html = root / "index.html"
s = html.read_text()
m = re.search(r"const ART_FOCUS = (\{.*?\});", s)
old = json.loads(m.group(1)) if m else {}
merged = {k: (positions.get(k, old.get(k))) for k in FOCUS if k in positions or k in old}
line = f"const ART_FOCUS = {json.dumps(merged, separators=(',', ':'))};"
if m:
    html.write_text(s[:m.start()] + line + s[m.end():])
    print("index.html ART_FOCUS updated")
else:
    print("ART_FOCUS line not found in index.html; add:", line)
