"""Stamp a fresh asset version into index.html so browsers skip stale caches.

GitHub Pages serves files with max-age=600, so after a push browsers can keep
old copies of model.js and friends for up to ten minutes. Every local asset is
referenced as name.js?v=VERSION; this rewrites VERSION to the current time.
Usage: python3 scripts/stamp_version.py
"""
import re
import time
from pathlib import Path

page = Path(__file__).resolve().parent.parent / "index.html"
version = time.strftime("%Y%m%d%H%M%S")
s = page.read_text()
s, n = re.subn(r"(\.js\?v=)[0-9a-z]+", r"\g<1>" + version, s)
s, m = re.subn(r"(const ASSET_VERSION = ')[0-9a-z]+(')", r"\g<1>" + version + r"\g<2>", s)
assert n >= 4 and m == 1, (n, m)
page.write_text(s)
print("stamped", version, "into", n, "script tags")
