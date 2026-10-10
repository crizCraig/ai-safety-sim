"""Build a claude.ai Artifact copy of the game into OUT_DIR.

The Artifact viewer wraps the page in its own <html>/<head>/<body>, so this strips
those, pins the page to dark mode and turns off auto-rotation for reduced motion.
Usage: python3 scripts/build_artifact.py OUT_DIR
"""
import re
import shutil
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
for name in ("model.js", "events.js", "landmask.js", "presets.js", "trees.js"):
    shutil.copy(root / name, out / name)

s = (root / "index.html").read_text()
s = re.sub(r"<!doctype html>\s*<html[^>]*>\s*<head>\s*<meta charset[^>]*>\s*<meta name=\"viewport\"[^>]*>\s*", "", s)
s = re.sub(r'<meta name="description"[^>]*>\n', "", s)
s = re.sub(r'<link rel="icon"[^>]*>\n', "", s)
s = re.sub(r"</head>\s*<body[^>]*>\n", "", s)
s = s.replace("</body>\n</html>\n", "")
s = s.replace("    --sans: 'Space Grotesk', system-ui, sans-serif;\n  }",
              "    --sans: 'Space Grotesk', system-ui, sans-serif;\n    color-scheme: dark;\n  }")
s = s.replace("controls.autoRotateSpeed = 0.35;",
              "controls.autoRotateSpeed = 0.35;\nconst reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;")
s = s.replace("controls.target.set(0, 0, 0); controls.autoRotate = true;",
              "controls.target.set(0, 0, 0); controls.autoRotate = !reduceMotion;")
assert "<html" not in s and "<body" not in s and s.count("reduceMotion") == 2
(out / "index.html").write_text(s)
print("built", out / "index.html")
