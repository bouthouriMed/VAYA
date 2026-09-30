"""Shared helpers for VAYA website Blender scenes (run inside Blender)."""
import bpy
import bmesh
import math

ROOT = "C:/Users/User/Desktop/VAYA/apps/website"


def srgb(h, a=1.0):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, a)


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.curves, bpy.data.images):
        for b in list(coll):
            if b.users == 0:
                coll.remove(b)


def rounded_rect(name, w, h, r, segs=10, z=0.0, depth=0.0):
    """Flat rounded rectangle (or extruded slab when depth>0), centered, in XY."""
    bm = bmesh.new()
    pts = []
    corners = [(w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)]
    for cx, cy, a0 in corners:
        for i in range(segs + 1):
            a = math.radians(a0 + 90 * i / segs)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a), z))
    verts = [bm.verts.new(p) for p in pts]
    face = bm.faces.new(verts)
    if depth:
        ext = bmesh.ops.extrude_face_region(bm, geom=[face])
        for v in [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]:
            v.co.z -= depth
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # planar UV from bounds
    uv = bm.loops.layers.uv.new()
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = ((l.vert.co.x + w / 2) / w, (l.vert.co.y + h / 2) / h)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def principled(name, base, metallic=0.0, rough=0.5, coat=0.0, emission=None, estrength=0.0, alpha=1.0, transmission=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = base
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = rough
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Transmission Weight"].default_value = transmission
    b.inputs["Alpha"].default_value = alpha
    if emission:
        b.inputs["Emission Color"].default_value = emission
        b.inputs["Emission Strength"].default_value = estrength
    return m


def area_light(name, loc, rot, size, energy, color=(1, 1, 1), shape="RECTANGLE", size_y=None):
    ld = bpy.data.lights.new(name, "AREA")
    ld.shape = shape
    ld.size = size
    if size_y:
        ld.size_y = size_y
    ld.energy = energy
    ld.color = color
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot]
    bpy.context.collection.objects.link(ob)
    return ob


def smooth_keys(ob, path=None):
    ad = ob.animation_data
    if not ad or not ad.action:
        return
    try:
        fcs = ad.action.fcurves
    except AttributeError:  # Blender 4.4+ layered actions
        fcs = [fc for layer in ad.action.layers for strip in layer.strips for cb in strip.channelbags for fc in cb.fcurves]
    for fc in fcs:
        for k in fc.keyframe_points:
            k.interpolation = "BEZIER"
            k.easing = "AUTO"
            k.handle_left_type = k.handle_right_type = "AUTO_CLAMPED"


def setup_render(res=(1600, 900), samples=32, transparent=True):
    s = bpy.context.scene
    s.render.engine = "BLENDER_EEVEE"
    s.render.resolution_x, s.render.resolution_y = res
    s.render.resolution_percentage = 100
    s.eevee.taa_render_samples = samples
    s.eevee.use_raytracing = True
    s.render.film_transparent = transparent
    s.view_settings.view_transform = "AgX"
    try:
        s.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
