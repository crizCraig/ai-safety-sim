"""Crop generated card art to the card's 12:5 shape and save as WebP.

Usage: python3 scripts/process_card_art.py [SRC_DIR]  (default /tmp/claude-501/gptart2)
Writes assets/cards-gpt/<id>.webp (1200x500, quality 72, about 90 KB each; ~2.1 MB for all 24).
"""
import sys
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parent.parent
src = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/claude-501/gptart2")
out = root / "assets" / "cards-gpt"
out.mkdir(parents=True, exist_ok=True)
for png in sorted(src.glob("*.png")):
    im = Image.open(png).convert("RGB")
    w, h = im.size
    ch = round(w * 5 / 12)
    top = (h - ch) // 2
    strip = im.crop((0, top, w, top + ch)).resize((1200, 500), Image.LANCZOS)
    strip.save(out / f"{png.stem}.webp", "WEBP", quality=72, method=6)
    print(png.stem, (out / f"{png.stem}.webp").stat().st_size // 1024, "KB")
