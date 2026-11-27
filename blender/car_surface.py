import math

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

Vec3 = tuple[float, float, float]
Point = tuple[float, float]
Materials = list[bpy.types.Material]
SMOOTH_ANGLE = math.radians(36)


def object_from(bm: bmesh.types.BMesh, name: str, materials: Materials, recalc: bool = True) -> bpy.types.Object:
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new(name)
    for mat in materials:
        mesh.materials.append(mat)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def select_only(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_modifiers(obj: bpy.types.Object) -> None:
    select_only(obj)
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def smooth_by_angle(obj: bpy.types.Object, angle: float = SMOOTH_ANGLE) -> None:
    select_only(obj)
    bpy.ops.object.shade_smooth_by_angle(angle=angle, keep_sharp_edges=False)


class Surface:
    def __init__(self, obj: bpy.types.Object) -> None:
        self.tree = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())

    def cast(self, origin: Vec3 | Vector, direction: Vec3 | Vector) -> tuple[Vector, Vector] | None:
        ray = Vector(direction).normalized()
        location, normal, _, _ = self.tree.ray_cast(Vector(origin), ray)
        if location is None:
            return None
        return location, (-normal if normal.dot(ray) > 0.0 else normal.copy())

    def nearest(self, point: Vec3 | Vector) -> tuple[Vector, Vector]:
        location, normal, _, _ = self.tree.find_nearest(Vector(point))
        return location, normal.copy()


class Frame:
    def __init__(self, origin: Vec3 | Vector, normal: Vec3 | Vector, up: Vec3 | Vector) -> None:
        self.o = Vector(origin)
        self.n = Vector(normal).normalized()
        lift = Vector(up)
        self.b = (lift - self.n * lift.dot(self.n)).normalized()
        self.t = self.b.cross(self.n)

    def pt(self, a: float, b: float, h: float = 0.0) -> Vector:
        return self.o + self.t * a + self.b * b + self.n * h


def frame_on(surface: Surface, origin: Vec3, direction: Vec3, up: Vec3) -> Frame | None:
    hit = surface.cast(origin, direction)
    if hit is None:
        return None
    return Frame(hit[0], hit[1], up)


def rounded_rect(width: float, height: float, radius: float, steps: int = 4) -> list[Point]:
    out: list[Point] = []
    corners = ((1.0, 1.0, 0.0), (-1.0, 1.0, 90.0), (-1.0, -1.0, 180.0), (1.0, -1.0, 270.0))
    for sx, sy, start in corners:
        cx, cy = sx * (width / 2 - radius), sy * (height / 2 - radius)
        for k in range(steps + 1):
            a = math.radians(start + 90.0 * k / steps)
            out.append((cx + radius * math.cos(a), cy + radius * math.sin(a)))
    return out


def ellipse_points(rx: float, ry: float, count: int, power: float = 2.0) -> list[Point]:
    out: list[Point] = []
    for k in range(count):
        a = math.tau * k / count
        c, s = math.cos(a), math.sin(a)
        out.append((rx * math.copysign(abs(c) ** (2.0 / power), c), ry * math.copysign(abs(s) ** (2.0 / power), s)))
    return out


def decal(surface: Surface, name: str, mats: Materials, frame: Frame, width: float, height: float, uv: tuple[float, float, float, float], nu: int = 12, nv: int = 4, offset: float = 0.003, material: int = 0) -> bpy.types.Object | None:
    bm = bmesh.new()
    layer = bm.loops.layers.uv.new("UVMap")
    verts: dict[tuple[int, int], bmesh.types.BMVert] = {}
    coords: dict[bmesh.types.BMVert, Point] = {}
    for j in range(nv + 1):
        for i in range(nu + 1):
            a = (i / nu - 0.5) * width
            b = (j / nv - 0.5) * height
            hit = surface.cast(frame.pt(a, b, 0.25), -frame.n)
            if hit is None:
                continue
            vert = bm.verts.new(hit[0] + hit[1] * offset)
            verts[(i, j)] = vert
            coords[vert] = (uv[0] + (uv[2] - uv[0]) * i / nu, uv[1] + (uv[3] - uv[1]) * j / nv)
    for j in range(nv):
        for i in range(nu):
            quad = [verts.get((i, j)), verts.get((i + 1, j)), verts.get((i + 1, j + 1)), verts.get((i, j + 1))]
            if any(v is None for v in quad):
                continue
            face = bm.faces.new(quad)
            face.material_index = material
            face.smooth = True
            for loop in face.loops:
                loop[layer].uv = coords[loop.vert]
    if not bm.faces:
        bm.free()
        return None
    return object_from(bm, name, mats, recalc=False)


def patch(surface: Surface, name: str, mats: Materials, bottom: list[Vector], top: list[Vector], direction: Vec3 | Vector, rows: int = 4, offset: float = 0.003, material: int = 0, uv: tuple[float, float, float, float] | None = None) -> bpy.types.Object | None:
    ray = Vector(direction).normalized()
    bm = bmesh.new()
    layer = bm.loops.layers.uv.new("UVMap")
    count = len(bottom)
    grid: list[list[bmesh.types.BMVert | None]] = []
    outward: dict[bmesh.types.BMVert, Vector] = {}
    for j in range(rows + 1):
        row: list[bmesh.types.BMVert | None] = []
        for i in range(count):
            point = bottom[i].lerp(top[i], j / rows)
            hit = surface.cast(point - ray * 0.6, ray)
            if hit is None:
                row.append(None)
                continue
            vert = bm.verts.new(hit[0] + hit[1] * offset)
            outward[vert] = hit[1]
            row.append(vert)
        grid.append(row)
    quads: list[list[tuple[bmesh.types.BMVert, int, int]]] = []
    for j in range(rows):
        for i in range(count - 1):
            corners = [(grid[j][i], i, j), (grid[j][i + 1], i + 1, j), (grid[j + 1][i + 1], i + 1, j + 1), (grid[j + 1][i], i, j + 1)]
            if all(vert is not None for vert, _, _ in corners):
                quads.append([(vert, a, b) for vert, a, b in corners if vert is not None])
    if not quads:
        bm.free()
        return None
    first = quads[0]
    turn = (first[1][0].co - first[0][0].co).cross(first[3][0].co - first[0][0].co)
    flip = turn.dot(outward[first[0][0]]) < 0.0
    for quad in quads:
        ordered = list(reversed(quad)) if flip else quad
        face = bm.faces.new([vert for vert, _, _ in ordered])
        face.material_index = material
        face.smooth = True
        if uv is not None:
            for loop, (_, a, b) in zip(face.loops, ordered):
                loop[layer].uv = (uv[0] + (uv[2] - uv[0]) * a / (count - 1), uv[1] + (uv[3] - uv[1]) * b / rows)
    return object_from(bm, name, mats, recalc=False)


def fill(surface: Surface, name: str, mats: Materials, outline: list[Vector], direction: Vec3 | Vector, offset: float = 0.003, cuts: int = 3, material: int = 0, tile: float = 0.0) -> bpy.types.Object | None:
    ray = Vector(direction).normalized()
    bm = bmesh.new()
    layer = bm.loops.layers.uv.new("UVMap")
    bm.faces.new([bm.verts.new(p) for p in outline])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    outward: dict[bmesh.types.BMVert, Vector] = {}
    lift = Vector((0.0, 0.0, 1.0)) if abs(ray.z) < 0.9 else Vector((0.0, 1.0, 0.0))
    up = (lift - ray * lift.dot(ray)).normalized()
    right = up.cross(ray)
    planar = {vert: (vert.co.dot(right), vert.co.dot(up)) for vert in bm.verts}
    for vert in bm.verts:
        hit = surface.cast(vert.co - ray * 0.6, ray)
        if hit is None:
            bm.free()
            return None
        vert.co = hit[0] + hit[1] * offset
        outward[vert] = hit[1]
    for face in bm.faces:
        if tile > 0.0:
            for loop in face.loops:
                loop[layer].uv = (planar[loop.vert][0] / tile, planar[loop.vert][1] / tile)
        average = sum((outward[v] for v in face.verts), Vector())
        face.normal_update()
        if face.normal.dot(average) < 0.0:
            face.normal_flip()
        face.material_index = material
        face.smooth = True
    return object_from(bm, name, mats, recalc=False)


def project(surface: Surface, pts: list[Vec3] | list[Vector], direction: Vec3 | Vector) -> list[Vector]:
    ray = Vector(direction).normalized()
    out: list[Vector] = []
    for p in pts:
        hit = surface.cast(Vector(p) - ray * 0.6, ray)
        if hit is not None:
            out.append(hit[0])
    return out


def flat_ribbon(name: str, mats: Materials, pts: list[Vec3] | list[Vector], width: float, normal: Vec3 | Vector = (0.0, 0.0, 1.0), material: int = 0) -> bpy.types.Object:
    up = Vector(normal).normalized()
    bm = bmesh.new()
    rows: list[tuple[bmesh.types.BMVert, bmesh.types.BMVert]] = []
    for i, p in enumerate(pts):
        before = Vector(pts[max(i - 1, 0)])
        after = Vector(pts[min(i + 1, len(pts) - 1)])
        side = up.cross((after - before).normalized()).normalized()
        rows.append((bm.verts.new(Vector(p) + side * width / 2), bm.verts.new(Vector(p) - side * width / 2)))
    for (a0, b0), (a1, b1) in zip(rows, rows[1:]):
        bm.faces.new((a0, b0, b1, a1)).material_index = material
    obj = object_from(bm, name, mats, recalc=False)
    return obj


def strip(surface: Surface, name: str, mats: Materials, pts: list[Vec3] | list[Vector], width: float | list[float], height: float = 0.0, offset: float = 0.0025, closed: bool = False, material: int = 0) -> bpy.types.Object:
    samples = [surface.nearest(p) for p in pts]
    count = len(samples)
    widths = width if isinstance(width, list) else [width] * count
    bm = bmesh.new()
    rows: list[tuple[bmesh.types.BMVert, bmesh.types.BMVert, bmesh.types.BMVert, bmesh.types.BMVert]] = []
    for i in range(count):
        centre, normal = samples[i]
        before = samples[(i - 1) % count][0] if closed or i > 0 else centre
        after = samples[(i + 1) % count][0] if closed or i < count - 1 else centre
        tangent = (after - before).normalized()
        side = normal.cross(tangent).normalized()
        lp, ln = surface.nearest(centre + side * (widths[i] / 2))
        rp, rn = surface.nearest(centre - side * (widths[i] / 2))
        bl = bm.verts.new(lp + ln * offset)
        br = bm.verts.new(rp + rn * offset)
        tl = bm.verts.new(lp + ln * (offset + height)) if height > 0.0 else bl
        tr = bm.verts.new(rp + rn * (offset + height)) if height > 0.0 else br
        rows.append((bl, br, tl, tr))
    last = count if closed else count - 1
    for i in range(last):
        bl0, br0, tl0, tr0 = rows[i]
        bl1, br1, tl1, tr1 = rows[(i + 1) % count]
        quads = [(tl0, tr0, tr1, tl1)]
        if height > 0.0:
            quads += [(bl0, tl0, tl1, bl1), (br0, br1, tr1, tr0)]
        for quad in quads:
            bm.faces.new(quad).material_index = material
    if height > 0.0 and not closed:
        bl, br, tl, tr = rows[0]
        bm.faces.new((bl, br, tr, tl)).material_index = material
        bl, br, tl, tr = rows[-1]
        bm.faces.new((br, bl, tl, tr)).material_index = material
    return object_from(bm, name, mats, recalc=False)


def prism(frame: Frame, name: str, mats: Materials, outline: list[Point], h0: float, h1: float, side: int, top: int, inset: float = 0.0, uv_scale: float = 0.0) -> bpy.types.Object:
    bm = bmesh.new()
    layer = bm.loops.layers.uv.new("UVMap")
    low = [bm.verts.new(frame.pt(a, b, h0)) for a, b in outline]
    mid_h = h0 + (h1 - h0) * 0.72 if inset > 0.0 else h1
    mid = [bm.verts.new(frame.pt(a, b, mid_h)) for a, b in outline]
    high = [bm.verts.new(frame.pt(a * (1.0 - inset), b * (1.0 - inset), h1)) for a, b in outline] if inset > 0.0 else mid
    n = len(outline)
    rings = [low, mid] + ([high] if inset > 0.0 else [])
    for ring_a, ring_b in zip(rings, rings[1:]):
        for i in range(n):
            k = (i + 1) % n
            bm.faces.new((ring_a[i], ring_a[k], ring_b[k], ring_b[i])).material_index = side
    centre = bm.verts.new(frame.pt(0.0, 0.0, h1))
    back = bm.verts.new(frame.pt(0.0, 0.0, h0))
    for i in range(n):
        k = (i + 1) % n
        face = bm.faces.new((centre, high[i], high[k]))
        face.material_index = top
        face.normal_flip()
        bm.faces.new((back, low[i], low[k])).material_index = side
        if uv_scale > 0.0:
            for loop in face.loops:
                p = outline[high.index(loop.vert)] if loop.vert is not centre else (0.0, 0.0)
                loop[layer].uv = (0.5 + p[0] / (2.0 * uv_scale), 0.5 + p[1] / (2.0 * uv_scale))
    obj = object_from(bm, name, mats)
    smooth_by_angle(obj)
    return obj


def flat_quad(frame: Frame, name: str, mats: Materials, width: float, height: float, h: float, uv: tuple[float, float, float, float], material: int = 0) -> bpy.types.Object:
    bm = bmesh.new()
    layer = bm.loops.layers.uv.new("UVMap")
    corners = [(-0.5, -0.5, uv[0], uv[1]), (0.5, -0.5, uv[2], uv[1]), (0.5, 0.5, uv[2], uv[3]), (-0.5, 0.5, uv[0], uv[3])]
    face = bm.faces.new([bm.verts.new(frame.pt(a * width, b * height, h)) for a, b, _, _ in corners])
    face.material_index = material
    for loop, corner in zip(face.loops, corners):
        loop[layer].uv = (corner[2], corner[3])
    return object_from(bm, name, mats, recalc=False)


def revolve(frame: Frame, name: str, mats: Materials, profile: list[Point], steps: int, material: int, phase: float = 0.0) -> bpy.types.Object:
    bm = bmesh.new()
    rings: list[list[bmesh.types.BMVert]] = []
    for r, h in profile:
        if r == 0.0:
            rings.append([bm.verts.new(frame.pt(0.0, 0.0, h))] * steps)
        else:
            rings.append([bm.verts.new(frame.pt(r * math.cos(phase + math.tau * k / steps), r * math.sin(phase + math.tau * k / steps), h)) for k in range(steps)])
    for ring_a, ring_b in zip(rings, rings[1:]):
        for k in range(steps):
            j = (k + 1) % steps
            quad = [ring_a[k], ring_a[j], ring_b[j], ring_b[k]]
            unique = [v for idx, v in enumerate(quad) if v not in quad[:idx]]
            if len(unique) >= 3:
                face = bm.faces.new(unique)
                face.material_index = material
                face.smooth = True
    obj = object_from(bm, name, mats)
    smooth_by_angle(obj)
    return obj
