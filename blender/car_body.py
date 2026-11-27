import math

import bmesh
import bpy
from mathutils import Vector

from car_shape import ARCH_CLEARANCE, ARCH_INNER_FRONT, ARCH_INNER_REAR, ARCH_RADIUS, ARCH_SIDES, CAP_COLUMNS, CAP_CREASE, FLARE_OUT, FRONT_AXLE, FRONT_CAP, FRONT_LEAN, LENGTH_CREASES, NOSE, REAR_AXLE, REAR_CAP, REAR_LEAN, RING_CREASES, SEGMENT_MATERIALS, STATIONS, WHEEL_RADIUS, WIDTH, at, lin, section
from car_parts import slab
from car_surface import apply_modifiers, object_from, smooth_by_angle

BODY_SMOOTH_ANGLE = math.radians(14)
SUBDIVISION_LEVELS = 2
NO_LEAN = (0.0,) * 9
FLARE_START = math.radians(-12.0)
FLARE_END = math.radians(192.0)
FLARE_STEPS = 24
FLARE_REACH = 0.038
FLARE_BACK = 0.05
CUT_SUBDIVISIONS = 3
FLARE_LIP = 0.004
ARCH_OUTSET = 0.3
GRILLE_SLOT: list[tuple[float, float]] = [(-0.42, 0.548), (0.42, 0.548), (0.44, 0.528), (0.42, 0.508), (-0.42, 0.508), (-0.44, 0.528)]
LOWER_INTAKE: list[tuple[float, float]] = [(-0.46, 0.33), (0.46, 0.33), (0.44, 0.285), (-0.44, 0.285)]
FRONT_CUT_START = NOSE - 0.03
FRONT_CUT_DEPTH = 0.4


def ring_for(bm: bmesh.types.BMesh, u: float, lean: tuple[float, ...]) -> list[bmesh.types.BMVert]:
    half = section(u)
    points = half + [(-x, z) for x, z in reversed(half[1:-1])]
    roles = list(range(len(half))) + list(range(len(half) - 2, 0, -1))
    return [bm.verts.new(at(x, u + lean[role], z)) for (x, z), role in zip(points, roles)]


def cap(bm: bmesh.types.BMesh, ring: list[bmesh.types.BMVert], materials: tuple[int, ...]) -> list[list[bmesh.types.BMVert]]:
    n = len(ring)
    rows: list[list[bmesh.types.BMVert]] = []
    for i in range(n // 2 + 1):
        a, b = ring[i], ring[(n - i) % n]
        if a is b:
            rows.append([a])
        else:
            rows.append([a] + [bm.verts.new(a.co.lerp(b.co, m / CAP_COLUMNS)) for m in range(1, CAP_COLUMNS)] + [b])
    for i in range(len(rows) - 1):
        upper, lower = rows[i], rows[i + 1]
        if len(upper) == 1:
            faces = [(upper[0], lower[m], lower[m + 1]) for m in range(len(lower) - 1)]
        elif len(lower) == 1:
            faces = [(upper[m], upper[m + 1], lower[0]) for m in range(len(upper) - 1)]
        else:
            faces = [(upper[m], upper[m + 1], lower[m + 1], lower[m]) for m in range(len(upper) - 1)]
        for verts in faces:
            bm.faces.new(verts).material_index = materials[i]
    return rows


def harden(bm: bmesh.types.BMesh, layer: bmesh.types.BMLayerItem, a: bmesh.types.BMVert, b: bmesh.types.BMVert, weight: float) -> None:
    edge = bm.edges.get((a, b))
    if edge is not None:
        edge[layer] = weight


def build_shell(materials: list[bpy.types.Material]) -> bpy.types.Object:
    bm = bmesh.new()
    rings = [ring_for(bm, u, REAR_LEAN if i == 0 else FRONT_LEAN if i == len(STATIONS) - 1 else NO_LEAN) for i, u in enumerate(STATIONS)]
    count = len(rings[0])
    for i in range(len(rings) - 1):
        for j in range(count):
            k = (j + 1) % count
            face = bm.faces.new((rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]))
            face.material_index = SEGMENT_MATERIALS[j if j < count // 2 else count - 1 - j]
    rear_rows = cap(bm, rings[0], REAR_CAP)
    front_rows = cap(bm, rings[-1], FRONT_CAP)
    crease = bm.edges.layers.float.new("crease_edge")
    for i in range(len(rings) - 1):
        for role, weight in LENGTH_CREASES.items():
            for k in (role, count - role):
                harden(bm, crease, rings[i][k], rings[i + 1][k], weight)
    for u, (segments, weight) in RING_CREASES.items():
        ring = rings[STATIONS.index(u)]
        for s in segments:
            harden(bm, crease, ring[s], ring[s + 1], weight)
            harden(bm, crease, ring[(count - s) % count], ring[(count - s - 1) % count], weight)
    for ring, rows in ((rings[0], rear_rows), (rings[-1], front_rows)):
        for j in range(count):
            harden(bm, crease, ring[j], ring[(j + 1) % count], CAP_CREASE)
        for row in rows:
            for a, b in zip(row, row[1:]):
                harden(bm, crease, a, b, CAP_CREASE)
    shell = object_from(bm, "Body", materials)
    subsurf = shell.modifiers.new("Subsurf", "SUBSURF")
    subsurf.levels = SUBDIVISION_LEVELS
    subsurf.render_levels = SUBDIVISION_LEVELS
    apply_modifiers(shell)
    return shell


def cut_away(body: bpy.types.Object, cutter: bpy.types.Object, trim: bpy.types.Material) -> None:
    if not cutter.data.materials:
        cutter.data.materials.append(trim)
    boolean = body.modifiers.new("Cut", "BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.solver = "EXACT"
    boolean.object = cutter
    boolean.material_mode = "TRANSFER"
    apply_modifiers(body)
    bpy.data.objects.remove(cutter, do_unlink=True)


def cut_openings(body: bpy.types.Object, trim: bpy.types.Material) -> None:
    for outline in (GRILLE_SLOT, LOWER_INTAKE):
        mouth = [Vector(at(x, FRONT_CUT_START, z)) for x, z in outline]
        cut_away(body, slab("MouthCut", trim, mouth, Vector((0.0, -FRONT_CUT_DEPTH, 0.0)), cuts=CUT_SUBDIVISIONS), trim)


def cut_arches(body: bpy.types.Object, trim: bpy.types.Material) -> None:
    for axle in (FRONT_AXLE, REAR_AXLE):
        for side in (-1.0, 1.0):
            outer = lin(WIDTH, axle) + ARCH_OUTSET
            inner = ARCH_INNER_FRONT if axle > 0.0 else ARCH_INNER_REAR
            ring = [Vector(at(side * inner, axle + ARCH_RADIUS * math.cos(a), WHEEL_RADIUS + ARCH_RADIUS * math.sin(a))) for a in arch_angles(0, ARCH_SIDES)]
            cut_away(body, slab("ArchCut", trim, ring, Vector((side * (outer - inner), 0.0, 0.0)), cuts=CUT_SUBDIVISIONS), trim)


def arch_angles(first: int, count: int) -> list[float]:
    return [math.tau * (first + k) / ARCH_SIDES for k in range(count)]


def arch_flare(axle: float, side: float, paint: bpy.types.Material, trim: bpy.types.Material) -> bpy.types.Object:
    outer = lin(WIDTH, axle) + FLARE_OUT
    lip = WHEEL_RADIUS + ARCH_CLEARANCE - FLARE_LIP
    profile = [(outer - FLARE_BACK, lip), (outer, lip), (outer, lip + 0.55 * FLARE_REACH), (outer - FLARE_BACK, lip + FLARE_REACH)]
    bm = bmesh.new()
    rings: list[list[bmesh.types.BMVert]] = []
    for k in range(FLARE_STEPS + 1):
        a = FLARE_START + (FLARE_END - FLARE_START) * k / FLARE_STEPS
        rings.append([bm.verts.new(at(side * x, axle + r * math.cos(a), WHEEL_RADIUS + r * math.sin(a))) for x, r in profile])
    for k in range(FLARE_STEPS):
        for j in range(4):
            face = bm.faces.new((rings[k][j], rings[k][(j + 1) % 4], rings[k + 1][(j + 1) % 4], rings[k + 1][j]))
            face.material_index = 1 if j == 0 else 0
    bm.faces.new(rings[0]).material_index = 1
    bm.faces.new(list(reversed(rings[-1]))).material_index = 1
    flare = object_from(bm, "Flare", [paint, trim])
    smooth_by_angle(flare)
    return flare
