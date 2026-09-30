"""Scene 1 — hero phone reveal. Run inside Blender:
exec(open('C:/Users/User/Desktop/VAYA/apps/website/blender/scene_hero_phone.py').read())
"""
import sys, math, importlib, bpy

sys.path.insert(0, "C:/Users/User/Desktop/VAYA/apps/website/blender")
import lib
importlib.reload(lib)
from lib import srgb, rounded_rect, principled, area_light, smooth_keys, ROOT

SCREEN_IMG = ROOT + "/blender/tex/find_ride.png"
FRAMES = 150

lib.reset_scene()
lib.setup_render()
scn = bpy.context.scene
scn.frame_start, scn.frame_end = 1, FRAMES
scn.view_settings.view_transform = "Standard"
scn.view_settings.look = "None"

W, H, T, R = 0.715, 1.47, 0.078, 0.115

# ---------- materials
m_frame = principled("Titanium", srgb("#3A3F3D"), metallic=1.0, rough=0.22)
m_glass = principled("FrontGlass", srgb("#050807"), rough=0.04, coat=1.0)
m_back = principled("BackGlass", srgb("#10201A"), rough=0.5, coat=0.0)
_bb = next(n for n in m_back.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
_bb.inputs["Specular IOR Level"].default_value = 0.12
m_island = principled("Island", srgb("#000000"), rough=0.15)
m_lens = principled("Lens", srgb("#020303"), rough=0.02, coat=1.0)
m_ring = principled("LensRing", srgb("#6E7571"), metallic=1.0, rough=0.18)
m_plateau = principled("Plateau", srgb("#0F1C17"), rough=0.1, coat=0.6)

m_screen = bpy.data.materials.new("Screen")
m_screen.use_nodes = True
nt = m_screen.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
bsdf.inputs["Base Color"].default_value = (0, 0, 0, 1)
bsdf.inputs["Roughness"].default_value = 0.05
bsdf.inputs["Coat Weight"].default_value = 1.0
tex = nt.nodes.new("ShaderNodeTexImage")
try:
    tex.image = bpy.data.images.load(SCREEN_IMG, check_existing=True)
except RuntimeError:
    print("screen texture missing:", SCREEN_IMG)
nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
emis = bsdf.inputs["Emission Strength"]

# ---------- geometry (built facing +Z, parented to a rig)
rig = bpy.data.objects.new("Phone", None)
bpy.context.collection.objects.link(rig)


def part(ob, mat):
    ob.data.materials.append(mat)
    ob.parent = rig
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


body = part(rounded_rect("Body", W, H, R, segs=14, z=T / 2, depth=T), m_frame)
bev = body.modifiers.new("Bevel", "BEVEL")
bev.width, bev.segments, bev.limit_method = 0.02, 8, "ANGLE"
bev.angle_limit = math.radians(40)
body.modifiers.new("WN", "WEIGHTED_NORMAL")

part(rounded_rect("Glass", W - 0.03, H - 0.03, R - 0.015, segs=14, z=T / 2 + 0.0005), m_glass)
part(rounded_rect("Screen", W - 0.06, H - 0.06, R - 0.03, segs=14, z=T / 2 + 0.001), m_screen)
part(rounded_rect("Island", 0.2, 0.058, 0.029, segs=8, z=T / 2 + 0.0015), m_island).location.y = H / 2 - 0.085

back = part(rounded_rect("Back", W - 0.03, H - 0.03, R - 0.015, segs=14, z=0), m_back)
back.rotation_euler.y = math.pi
back.location.z = -T / 2 - 0.0005

plat = part(rounded_rect("Plateau", 0.3, 0.31, 0.075, segs=10, z=0, depth=0.012), m_plateau)
plat.rotation_euler.y = math.pi
plat.location = (0.155, H / 2 - 0.19, -T / 2 - 0.001)
pb = plat.modifiers.new("Bevel", "BEVEL")
pb.width, pb.segments, pb.limit_method = 0.005, 4, "ANGLE"

for i, (x, y) in enumerate([(0.085, 0.075), (0.085, -0.075), (-0.07, 0.0)]):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.058, depth=0.016)
    ring = bpy.context.active_object
    ring.name = f"LensRing{i}"
    part(ring, m_ring)
    ring.location = (0.155 + x, H / 2 - 0.19 + y, -T / 2 - 0.02)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.044, depth=0.004)
    lens = bpy.context.active_object
    lens.name = f"Lens{i}"
    part(lens, m_lens)
    lens.location = (0.155 + x, H / 2 - 0.19 + y, -T / 2 - 0.0285)

for name, x, y, h in [("BtnPower", W / 2, 0.28, 0.2), ("BtnVolUp", -W / 2, 0.36, 0.12), ("BtnVolDn", -W / 2, 0.2, 0.12), ("BtnAction", -W / 2, 0.52, 0.07)]:
    b = part(rounded_rect(name, 0.014, h, 0.006, segs=4, z=0.011, depth=0.022), m_frame)
    b.location = (x + (0.004 if x > 0 else -0.004), y, 0)

# ---------- lighting
area_light("Key", (-2.6, -3.2, 3.2), (55, 0, -35), 3.0, 280, (1.0, 0.96, 0.9))
area_light("RimAccent", (-1.6, 3.4, 0.4), (90, 0, -155), 0.25, 1400, (0.35, 0.95, 0.65), size_y=4.0)
area_light("RimWarm", (1.8, 3.2, 1.0), (90, 0, 150), 0.25, 1100, (1.0, 0.9, 0.75), size_y=4.0)
area_light("Card", (0.0, -4.0, 4.2), (45, 0, 0), 5.0, 55, (1, 1, 1), size_y=0.8)

world = scn.world or bpy.data.worlds.new("World")
scn.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = srgb("#0D1512")
bg.inputs["Strength"].default_value = 0.35

# ---------- camera
cam_data = bpy.data.cameras.new("Cam")
cam_data.lens = 50
cam_data.dof.use_dof = True
cam_data.dof.aperture_fstop = 2.8
cam = bpy.data.objects.new("Cam", cam_data)
bpy.context.collection.objects.link(cam)
scn.camera = cam
target = bpy.data.objects.new("CamTarget", None)
bpy.context.collection.objects.link(target)
tc = cam.constraints.new("TRACK_TO")
tc.target = target
tc.track_axis, tc.up_axis = "TRACK_NEGATIVE_Z", "UP_Y"
cam_data.dof.focus_object = rig

# ---------- animation
def key(ob, f, loc=None, rot=None):
    if loc is not None:
        ob.location = loc
        ob.keyframe_insert("location", frame=f)
    if rot is not None:
        ob.rotation_euler = [math.radians(a) for a in rot]
        ob.keyframe_insert("rotation_euler", frame=f)

# phone: back-facing silhouette -> spins round -> settles front-on
key(rig, 1, (0.35, 0, -0.1), (90 + 22, -18, 158))
key(rig, 55, (0.15, 0, 0.0), (90 + 14, -10, 70))
key(rig, 115, (0.0, 0, 0.02), (90 + 4, -2, 6))
key(rig, 150, (0.0, 0, 0.0), (90 + 2, 0, -3))

key(cam, 1, (0.5, -7.0, 0.9))
key(cam, 70, (0.2, -5.8, 0.45))
key(cam, 150, (0.0, -5.0, 0.12))
key(target, 1, (0.1, 0, 0.1))
key(target, 150, (0.0, 0, 0.0))

for f, v in [(1, 0.0), (52, 0.0), (100, 1.0), (150, 1.0)]:
    emis.default_value = v
    emis.keyframe_insert("default_value", frame=f)

for ob in (rig, cam, target):
    smooth_keys(ob)

scn.frame_set(1)
print("hero phone scene built")
