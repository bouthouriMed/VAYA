"""Scene 4 — trust: identity / licence / vehicle cards take turns, then lock into a shield.
blender -b -P blender/render_scene.py -- blender/scene_trust.py <out> all
"""
import sys, math, importlib, bpy, bmesh
from mathutils import Vector

sys.path.insert(0, "C:/Users/User/Desktop/VAYA/apps/website/blender")
import lib
importlib.reload(lib)
from lib import srgb, rounded_rect, principled, area_light, smooth_keys, ROOT

FRAMES = 160
lib.reset_scene()
lib.setup_render()
scn = bpy.context.scene
scn.frame_start, scn.frame_end = 1, FRAMES
scn.view_settings.view_transform = "Standard"
scn.view_settings.look = "None"


def key(ob, f, loc=None, rot=None, scale=None):
    if loc is not None:
        ob.location = loc
        ob.keyframe_insert("location", frame=f)
    if rot is not None:
        ob.rotation_euler = [math.radians(a) for a in rot]
        ob.keyframe_insert("rotation_euler", frame=f)
    if scale is not None:
        ob.scale = (scale, scale, scale)
        ob.keyframe_insert("scale", frame=f)


# ---------- cards
CW, CH, CD, CR = 1.6, 1.008, 0.022, 0.075


def card(name, img):
    ob = rounded_rect(name, CW, CH, CR, segs=8, z=CD / 2, depth=CD)
    for p in ob.data.polygons:
        p.use_smooth = True
    bev = ob.modifiers.new("Bevel", "BEVEL")
    bev.width, bev.segments, bev.limit_method = 0.006, 3, "ANGLE"
    m = bpy.data.materials.new(name + "Mat")
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(ROOT + f"/blender/tex/{img}.png", check_existing=True)
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(t.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 0.55
    b.inputs["Roughness"].default_value = 0.3
    b.inputs["Coat Weight"].default_value = 1.0
    b.inputs["Coat Roughness"].default_value = 0.05
    ob.data.materials.append(m)
    return ob


# Card local +Z is its face; rotate X 90 so the face looks at -Y (camera).
A = card("CardID", "card_id")
B = card("CardLicence", "card_licence")
C = card("CardVehicle", "card_vehicle")

REST = {
    A: ((-1.0, 1.6, 0.8), (90 + 8, 14, 28)),
    B: ((1.3, 3.2, -0.15), (90 - 6, -8, -6)),
    C: ((3.2, 1.8, -0.95), (90 + 10, -12, -30)),
}
HERO = ((1.15, -1.6, 0.05), (90 + 4, 0, -14))  # right of centre, text sits left
STACK = (0.75, 1.3, 0.42)
windows = {A: (8, 22, 42, 54), B: (46, 60, 78, 90), C: (82, 96, 112, 122)}

for ob, (loc, rot) in REST.items():
    a0, a1, a2, a3 = windows[ob]
    key(ob, 1, loc, rot, 1.0)
    key(ob, a0, loc, rot, 1.0)
    key(ob, a1, HERO[0], HERO[1], 1.0)
    key(ob, a2, (HERO[0][0] - 0.05, HERO[0][1] + 0.05, HERO[0][2] + 0.03), (HERO[1][0], 0, HERO[1][2] + 4), 1.0)
    key(ob, a3, loc, rot, 1.0)
    # converge into a stack behind the shield
    i = [A, B, C].index(ob)
    key(ob, 124, loc, rot, 1.0)
    key(ob, 140, (STACK[0] + (i - 1) * 0.06, STACK[1] + i * 0.08, STACK[2] + (i - 1) * 0.05), (90, 0, -8 + (i - 1) * 7), 0.72)
    key(ob, FRAMES, (STACK[0] + (i - 1) * 0.08, STACK[1] + i * 0.1, STACK[2] + (i - 1) * 0.06), (90, 0, -10 + (i - 1) * 8), 0.7)
    smooth_keys(ob)

# gentle idle drift on the resting cards comes from the camera move below

# ---------- shield
def bez(p0, p1, p2, p3, n):
    return [((1 - t) ** 3) * p0 + 3 * ((1 - t) ** 2) * t * p1 + 3 * (1 - t) * t * t * p2 + (t ** 3) * p3 for t in [i / n for i in range(n)]]

V = Vector
right = bez(V((0.0, 0.86)), V((0.3, 0.8)), V((0.55, 0.74)), V((0.72, 0.72)), 10)
right += bez(V((0.72, 0.72)), V((0.74, 0.1)), V((0.55, -0.45)), V((0.0, -0.9)), 18)
left = [V((-p.x, p.y)) for p in reversed(right[1:])]
outline = right + [V((0.0, -0.9))] + left

bm = bmesh.new()
verts = [bm.verts.new((p.x, p.y, 0.09)) for p in outline]
face = bm.faces.new(verts)
ext = bmesh.ops.extrude_face_region(bm, geom=[face])
for v in [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]:
    v.co.z -= 0.18
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new("Shield")
bm.to_mesh(me)
bm.free()
shield = bpy.data.objects.new("Shield", me)
bpy.context.collection.objects.link(shield)
for p in me.polygons:
    p.use_smooth = True
sb = shield.modifiers.new("Bevel", "BEVEL")
sb.width, sb.segments, sb.limit_method = 0.07, 10, "ANGLE"
shield.modifiers.new("WN", "WEIGHTED_NORMAL")
m_sh = principled("ShieldMat", srgb("#3FBE85"), metallic=0.9, rough=0.13, coat=1.0)
shield.data.materials.append(m_sh)

# check mark (curve with animated reveal)
cu = bpy.data.curves.new("Check", "CURVE")
cu.dimensions = "3D"
cu.bevel_depth = 0.052
cu.bevel_resolution = 6
cu.use_fill_caps = True
sp = cu.splines.new("POLY")
pts = [(-0.3, 0.02, 0.0), (-0.08, -0.22, 0.0), (0.34, 0.3, 0.0)]
sp.points.add(len(pts) - 1)
for pt, co in zip(sp.points, pts):
    pt.co = (*co, 1)
check = bpy.data.objects.new("Check", cu)
bpy.context.collection.objects.link(check)
check.parent = shield
check.location = (0, 0.02, 0.16)
m_ck = principled("CheckMat", srgb("#F6F1E7"), rough=0.2, emission=srgb("#E9FFF4"), estrength=2.2)
cu.materials.append(m_ck)
for f, v in [(1, 0.0), (140, 0.0), (156, 1.0)]:
    cu.bevel_factor_end = v
    cu.keyframe_insert("bevel_factor_end", frame=f)

SH = (1.15, -0.6, 0.0)
key(shield, 1, SH, (90, 0, -60), 0.0)
key(shield, 118, SH, (90, 0, -60), 0.0)
key(shield, 138, SH, (90, 0, -6), 1.05)
key(shield, 146, SH, (90, 0, 4), 0.98)
key(shield, FRAMES, SH, (90, 0, -3), 1.0)
smooth_keys(shield)

# ---------- lighting
area_light("Key", (-3.0, -4.0, 3.5), (55, 0, -35), 3.0, 260, (1.0, 0.96, 0.9))
area_light("RimAccent", (-2.0, 4.0, 0.5), (90, 0, -155), 0.3, 1500, (0.35, 0.95, 0.65), size_y=5.0)
area_light("RimWarm", (3.2, 3.5, 1.2), (90, 0, 145), 0.3, 1100, (1.0, 0.88, 0.7), size_y=5.0)
area_light("Top", (1.0, -1.0, 4.0), (0, 0, 0), 3.0, 180, (1, 1, 1))

world = scn.world or bpy.data.worlds.new("World")
scn.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
env = world.node_tree.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(ROOT + "/blender/tex/studio.hdr", check_existing=True)
world.node_tree.links.new(env.outputs["Color"], bg.inputs["Color"])
bg.inputs["Strength"].default_value = 0.8  # reflections only; film is transparent

# ---------- camera: slow push + drift
cd = bpy.data.cameras.new("Cam")
cd.lens = 45
cam = bpy.data.objects.new("Cam", cd)
bpy.context.collection.objects.link(cam)
scn.camera = cam
tgt = bpy.data.objects.new("CamTarget", None)
bpy.context.collection.objects.link(tgt)
tc = cam.constraints.new("TRACK_TO")
tc.target = tgt
tc.track_axis, tc.up_axis = "TRACK_NEGATIVE_Z", "UP_Y"
key(cam, 1, (-0.6, -8.6, 1.4))
key(cam, 80, (0.1, -8.0, 0.8))
key(cam, FRAMES, (0.5, -7.4, 0.35))
key(tgt, 1, (0.3, 1.0, 0.1))
key(tgt, FRAMES, (0.2, 0.0, 0.0))
smooth_keys(cam)
smooth_keys(tgt)

scn.frame_set(1)
print("trust scene built")
