"""Crop generated card art to the card's 12:5 shape and save as WebP.

Usage: python3 scripts/process_card_art.py [SRC_DIR]  (default /tmp/claude-501/gptart)
Writes assets/cards-gpt/<id>.webp (1536x640, quality 80, about 40 KB each).
"""
import sys
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parent.parent
src = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/claude-501/gptart")
out = root / "assets" / "cards-gpt"
out.mkdir(parents=True, exist_ok=True)
for png in sorted(src.glob("*.png")):
    im = Image.open(png).convert("RGB")
    w, h = im.size
    ch = round(w * 5 / 12)
    top = (h - ch) // 2
    im.crop((0, top, w, top + ch)).save(out / f"{png.stem}.webp", "WEBP", quality=80, method=6)
    print(png.stem, (out / f"{png.stem}.webp").stat().st_size // 1024, "KB")
