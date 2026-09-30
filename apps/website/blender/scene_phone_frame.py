"""Front-on phone frame still with a transparent screen (for HTML screen swaps).
blender -b -P blender/render_scene.py -- blender/scene_phone_frame.py <out> 1 100
Screen rect in the output (fractions): left 6.91%, top 4.22%, width 86.18%, height 91.56%, radius 13% of width.
"""
import math, bpy

exec(open("C:/Users/User/Desktop/VAYA/apps/website/blender/scene_hero_phone.py", encoding="utf8").read())

scn = bpy.context.scene
scn.frame_start = scn.frame_end = 1
# kill animation, pose front-on
for ob in (bpy.data.objects["Phone"], bpy.data.objects["Cam"], bpy.data.objects["CamTarget"]):
    ob.animation_data_clear()
rig = bpy.data.objects["Phone"]
rig.location = (0, 0, 0)
rig.rotation_euler = (math.radians(90), 0, 0)

cam = bpy.data.objects["Cam"]
cam.constraints.clear()
cam.location = (0, -6, 0)
cam.rotation_euler = (math.radians(90), 0, 0)
cam.data.type = "ORTHO"
cam.data.ortho_scale = 1.54
cam.data.dof.use_dof = False

# screen becomes a holdout -> alpha 0
m = bpy.data.materials["Screen"]
nt = m.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
mout = nt.nodes.new("ShaderNodeOutputMaterial")
hold = nt.nodes.new("ShaderNodeHoldout")
nt.links.new(hold.outputs[0], mout.inputs["Surface"])

# no lights in front of the glass: an ortho camera would see them mirrored flat
bpy.data.objects.remove(bpy.data.objects["Card"])
bpy.data.objects["Key"].location = (-3.5, -1.0, 3.5)

scn.render.film_transparent = True
scn.eevee.taa_render_samples = 64
KEEP_RES = True
scn.render.resolution_x, scn.render.resolution_y = 760, 1540
