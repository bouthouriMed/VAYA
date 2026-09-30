"""Headless: blender -b -P render_scene.py -- <scene_script> <out_dir> [frames e.g. 1,60 or all] [pct]"""
import sys, bpy
argv = sys.argv[sys.argv.index("--") + 1:]
script, out = argv[0], argv[1]
which = argv[2] if len(argv) > 2 else "all"
pct = int(argv[3]) if len(argv) > 3 else 100
exec(open(script, encoding="utf8").read())
s = bpy.context.scene
if not globals().get('KEEP_RES'):
    s.render.resolution_x, s.render.resolution_y = 1920, 1080
s.render.resolution_percentage = pct
frames = range(s.frame_start, s.frame_end + 1) if which == "all" else [int(f) for f in which.split(",")]
for f in frames:
    s.frame_set(f)
    s.render.filepath = f"{out}/{f:04d}.png"
    bpy.ops.render.render(write_still=True)
