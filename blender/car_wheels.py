import math

import bmesh

import car_textures
from car_materials import Mats
from car_parts import join
from car_shape import WHEEL_RADIUS, Point, at, tyre_half, wheel_x
from car_surface import Frame, object_from, prism, smooth_by_angle

RIM_RADIUS = 0.205
BEAD_RADIUS = 0.193
LIP_INNER = 0.19
LIP_SETBACK = 0.004
LIP_DEPTH = 0.012
BARREL_WALL = 0.012
SPOKE_COUNT = 10
SPOKE_WIDTH_INNER = 0.024
SPOKE_WIDTH_OUTER = 0.034
SPOKE_DEPTH = 0.028
SPOKE_FACE_SETBACK = 0.022
SPOKE_INNER_RADIUS = 0.08
SPOKE_OUTER_RADIUS = 0.186
HUB_RADIUS = 0.08
CAP_RADIUS = 0.052
CAP_RISE = 0.012
CAP_BADGE_HEIGHT = 0.06
DISC_INNER = 0.07
DISC_OUTER = 0.162
DISC_THICKNESS = 0.016
DISC_DEPTH = 0.098
BACKING_DEPTH = 0.2
CALIPER_INNER = 0.112
CALIPER_OUTER = 0.168
CALIPER_WIDTH = 0.05
CALIPER_DEPTH = 0.137
CALIPER_START = 100.0
CALIPER_SWEEP = 60.0
TYRE_STEPS = 48
SHOULDER_INSET = 0.028
BULGE = 0.005


def tyre_profile(half: float) -> list[Point]:
    r = WHEEL_RADIUS
    outer = [(half - SHOULDER_INSET, r), (half - 0.01, r - 0.007), (half + BULGE * 0.6, r - 0.032), (half + BULGE, r - 0.06), (half + BULGE * 0.4, RIM_RADIUS + 0.03), (half - 0.006, RIM_RADIUS + 0.002), (half - 0.008, BEAD_RADIUS)]
    inner = [(-x, rr) for x, rr in reversed(outer)]
    return inner + outer


def lathe(bm: bmesh.types.BMesh, profile: list[Point], side: float, mat: int, steps: int = 48, start: float = 0.0, sweep: float = math.tau, closed: bool = False) -> None:
    full = abs(sweep - math.tau) < 1e-6
    count = steps if full else steps + 1
    rings = [[bm.verts.new((side * x, r * math.cos(start + sweep * k / steps), r * math.sin(start + sweep * k / steps))) for x, r in profile] for k in range(count)]
    n = len(profile)
    for k in range(steps):
        a, b = rings[k], rings[(k + 1) % count]
        for j in range(n if closed else n - 1):
            j2 = (j + 1) % n
            face = bm.faces.new((a[j], a[j2], b[j2], b[j]))
            face.material_index = mat
            face.smooth = True
    if closed and not full:
        bm.faces.new(rings[0]).material_index = mat
        bm.faces.new(list(reversed(rings[-1]))).material_index = mat


def spoke(bm: bmesh.types.BMesh, angle: float, side: float, x_back: float, x_front: float, mat: int) -> None:
    ends = [(SPOKE_INNER_RADIUS, SPOKE_WIDTH_INNER / 2), (SPOKE_OUTER_RADIUS, SPOKE_WIDTH_OUTER / 2)]
    corners: list[list[bmesh.types.BMVert]] = []
    for r, half in ends:
        for sign in (-1.0, 1.0):
            y = r * math.cos(angle) - sign * half * math.sin(angle)
            z = r * math.sin(angle) + sign * half * math.cos(angle)
            corners.append([bm.verts.new((side * x, y, z)) for x in (x_back, x_front)])
    (a0, a1), (b0, b1), (c0, c1), (d0, d1) = corners
    for quad in ((a0, b0, d0, c0), (a1, c1, d1, b1), (a0, c0, c1, a1), (b0, b1, d1, d0), (a0, a1, b1, b0), (c0, d0, d1, c1)):
        bm.faces.new(quad).material_index = mat


def wheel_planes(half: float) -> dict[str, float]:
    lip = half - LIP_SETBACK
    face = lip - SPOKE_FACE_SETBACK
    back = face - SPOKE_DEPTH
    return {"lip": lip, "face": face, "back": back, "disc": half - DISC_DEPTH, "backing": half - BACKING_DEPTH, "caliper": half - CALIPER_DEPTH}


def wheel_features() -> list[tuple[str, float]]:
    return [
        ("wheelSpoke", SPOKE_WIDTH_INNER),
        ("wheelSpokeDepth", SPOKE_DEPTH),
        ("wheelSpokeGap", 0.5 * (2.0 * math.pi * SPOKE_INNER_RADIUS / SPOKE_COUNT - SPOKE_WIDTH_INNER)),
        ("accentRimLip", RIM_RADIUS - LIP_INNER),
        ("wheelHubCap", CAP_RADIUS * 2.0),
        ("brakeDisc", DISC_THICKNESS),
        ("brakeCaliper", CALIPER_OUTER - CALIPER_INNER),
        ("tyreSidewall", RIM_RADIUS - BEAD_RADIUS),
    ]


def build_wheel(name: str, side: float, axle: float, m: Mats) -> None:
    half = tyre_half(axle)
    planes = wheel_planes(half)
    static = bmesh.new()
    lathe(static, [(planes["caliper"], CALIPER_INNER), (planes["caliper"], CALIPER_OUTER), (planes["caliper"] + CALIPER_WIDTH, CALIPER_OUTER), (planes["caliper"] + CALIPER_WIDTH, CALIPER_INNER)], side, 0, steps=10, start=math.radians(CALIPER_START), sweep=math.radians(CALIPER_SWEEP), closed=True)
    pivot = object_from(static, name, [m.caliper])
    pivot.location = at(side * wheel_x(axle), axle, WHEEL_RADIUS)
    smooth_by_angle(pivot)

    bm = bmesh.new()
    lathe(bm, tyre_profile(half), side, 0, steps=TYRE_STEPS, closed=True)
    lip, face, back = planes["lip"], planes["face"], planes["back"]
    lathe(bm, [(lip - LIP_DEPTH, LIP_INNER), (lip, LIP_INNER), (lip, RIM_RADIUS), (lip - LIP_DEPTH, RIM_RADIUS)], side, 4, steps=TYRE_STEPS, closed=True)
    lathe(bm, [(-half + 0.03, LIP_INNER - BARREL_WALL), (lip - LIP_DEPTH, LIP_INNER - BARREL_WALL), (lip - LIP_DEPTH, LIP_INNER), (-half + 0.03, LIP_INNER)], side, 1, steps=TYRE_STEPS, closed=True)
    lathe(bm, [(back, 0.004), (back, HUB_RADIUS), (face, HUB_RADIUS), (face + CAP_RISE, CAP_RADIUS), (face + CAP_RISE, 0.004)], side, 1, steps=32, closed=True)
    lathe(bm, [(planes["disc"], DISC_INNER), (planes["disc"], DISC_OUTER), (planes["disc"] + DISC_THICKNESS, DISC_OUTER), (planes["disc"] + DISC_THICKNESS, DISC_INNER)], side, 3, steps=TYRE_STEPS, closed=True)
    lathe(bm, [(planes["backing"], 0.004), (planes["backing"], LIP_INNER), (planes["backing"] + 0.01, LIP_INNER), (planes["backing"] + 0.01, 0.004)], side, 2, steps=TYRE_STEPS, closed=True)
    for k in range(SPOKE_COUNT):
        spoke(bm, k * math.tau / SPOKE_COUNT, side, back, face, 1)
    spin = object_from(bm, f"{name}_Spin", [m.tyre, m.rim, m.trim, m.disc, m.accent])
    smooth_by_angle(spin)

    cap = Frame((side * (face + CAP_RISE), 0.0, 0.0), (side, 0.0, 0.0), (0.0, 0.0, 1.0))
    k = CAP_BADGE_HEIGHT / 2.0 / car_textures.EMBLEM_EXTENT
    outline = [(a * k, b * k) for a, b in car_textures.emblem_outline(4)]
    badge = prism(cap, "CapBadge", [m.chrome, m.emblem], outline, -0.003, 0.0045, 0, 1, inset=0.05, uv_scale=k)
    spin = join([spin, badge], f"{name}_Spin")
    spin.parent = pivot
