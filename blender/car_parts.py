import math

import bmesh
import bpy
from mathutils import Vector

from car_surface import Vec3, object_from, select_only, smooth_by_angle


def cylinder(name: str, radius: float, depth: float, location: Vec3, mat: bpy.types.Material, rotation: Vec3 = (math.pi / 2, 0.0, 0.0), vertices: int = 24) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    smooth_by_angle(obj)
    return obj


def join(objects: list[bpy.types.Object], name: str) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    joined.data.name = name
    return joined


def hull(name: str, points: list[Vec3] | list[Vector], mat: bpy.types.Material, angle: float = math.radians(20)) -> bpy.types.Object:
    bm = bmesh.new()
    for p in points:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts[:])
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    obj = object_from(bm, name, [mat])
    smooth_by_angle(obj, angle)
    select_only(obj)
    return obj


def quad_object(name: str, mat: bpy.types.Material, corners: list[Vec3], facing: Vec3) -> bpy.types.Object:
    bm = bmesh.new()
    verts = [bm.verts.new(c) for c in corners]
    normal = (Vector(corners[1]) - Vector(corners[0])).cross(Vector(corners[3]) - Vector(corners[0]))
    bm.faces.new(verts if normal.dot(Vector(facing)) >= 0.0 else list(reversed(verts)))
    return object_from(bm, name, [mat], recalc=False)


def slab(name: str, mat: bpy.types.Material, ring: list[Vec3] | list[Vector], depth: Vec3 | Vector, cuts: int = 0) -> bpy.types.Object:
    bm = bmesh.new()
    offset = Vector(depth)
    low = [bm.verts.new(p) for p in ring]
    high = [bm.verts.new(Vector(p) + offset) for p in ring]
    bm.faces.new(low)
    bm.faces.new(list(reversed(high)))
    n = len(ring)
    for i in range(n):
        k = (i + 1) % n
        bm.faces.new((low[i], low[k], high[k], high[i]))
    if cuts > 0:
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    return object_from(bm, name, [mat])


def empty(name: str, location: Vec3) -> bpy.types.Object:
    node = bpy.data.objects.new(name, None)
    node.empty_display_type = "PLAIN_AXES"
    node.empty_display_size = 0.05
    node.location = location
    bpy.context.collection.objects.link(node)
    return node
