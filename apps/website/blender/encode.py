"""PNG frame dir -> numbered WebP sequence in public/sequences/<name>.
python blender/encode.py <png_dir> <name> [width=1920] [quality=72]
"""
import sys, glob, os
from PIL import Image

src, name = sys.argv[1], sys.argv[2]
width = int(sys.argv[3]) if len(sys.argv) > 3 else 1920
q = int(sys.argv[4]) if len(sys.argv) > 4 else 72
out = os.path.join(os.path.dirname(__file__), "..", "public", "sequences", name)
os.makedirs(out, exist_ok=True)
total = 0
for i, f in enumerate(sorted(glob.glob(os.path.join(src, "*.png"))), start=1):
    im = Image.open(f)
    if im.width != width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    p = os.path.join(out, f"{i:04d}.webp")
    im.save(p, "WEBP", quality=q, method=6, alpha_quality=80)
    total += os.path.getsize(p)
print(f"{i} frames -> {out}  {total / 1e6:.1f} MB")
