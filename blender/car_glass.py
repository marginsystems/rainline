import math

import bpy
from mathutils import Vector

from car_materials import Mats
from car_parts import hull, quad_object
from car_shape import COWL, DECK, EDGE, HEADER, ROOF_END, SHOULDER, TOP, at, crown, lin, section
from car_surface import Surface, patch, strip

WindowSpan = tuple[tuple[float, float], tuple[float, float]]

DOOR_GLASS: WindowSpan = ((HEADER + 0.04, COWL - 0.07), (-0.5, -0.5))
QUARTER_GLASS: WindowSpan = ((-0.6, -0.6), (ROOF_END + 0.02, -1.26))
WINDOW_FRAME: WindowSpan = ((HEADER + 0.01, COWL - 0.03), (ROOF_END - 0.01, -1.32))
SIDE_GLASS_SAMPLES = 13
SIDE_GLASS_TOP_INSET = 0.025
SIDE_GLASS_BELT_LIFT = 0.024
FRAME_TOP_INSET = 0.004
FRAME_BELT_LIFT = 0.004
SCREEN_BASE = COWL - 0.035
SCREEN_HEADER = HEADER + 0.035
SCREEN_INSET = 0.05
SCREEN_FRAME = 0.035
HATCH_TOP = ROOF_END - 0.035
HATCH_BOTTOM = DECK + 0.06
HATCH_HALF = (0.53, 0.6)
HATCH_FRAME = 0.035
GLASS_LIFT = 0.0045
FRAME_LIFT = 0.0025
WIPER_WIDTH = 0.016
WIPER_HEIGHT = 0.014
WIPER_ROOT = (0.5, COWL + 0.06)
WIPER_TIP = (0.0, COWL - 0.03)
MIRROR_U = COWL - 0.08
MIRROR_STALK = (0.07, 0.06, 0.035)
MIRROR_SIZE = (0.1, 0.12, 0.07)
MIRROR_LIFT = 0.025


def across(u: float, half: float, z: float, count: int) -> list[Vector]:
    return [Vector(at(half * (2.0 * k / (count - 1) - 1.0), u, z)) for k in range(count)]


def side_patch(s: Surface, m: Mats, name: str, span: WindowSpan, side: float, top_inset: float, belt_lift: float, mat: bpy.types.Material, offset: float) -> bpy.types.Object | None:
    (top_front, bottom_front), (top_rear, bottom_rear) = span
    bottom: list[Vector] = []
    top: list[Vector] = []
    for k in range(SIDE_GLASS_SAMPLES):
        t = k / (SIDE_GLASS_SAMPLES - 1)
        ub = bottom_front + (bottom_rear - bottom_front) * t
        ut = top_front + (top_rear - top_front) * t
        bottom.append(Vector(at(side * 3.0, ub, lin(SHOULDER, ub) + belt_lift)))
        top.append(Vector(at(side * 3.0, ut, lin(TOP, ut) - crown(ut) - top_inset)))
    return patch(s, name, [mat], bottom, top, (-side, 0.0, 0.0), rows=5, offset=offset)


def side_windows(s: Surface, m: Mats) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    for side in (-1.0, 1.0):
        made = [
            side_patch(s, m, "WindowFrame", WINDOW_FRAME, side, FRAME_TOP_INSET, FRAME_BELT_LIFT, m.trim, FRAME_LIFT),
            side_patch(s, m, "DoorGlass", DOOR_GLASS, side, SIDE_GLASS_TOP_INSET, SIDE_GLASS_BELT_LIFT, m.glass, GLASS_LIFT),
            side_patch(s, m, "QuarterGlass", QUARTER_GLASS, side, SIDE_GLASS_TOP_INSET, SIDE_GLASS_BELT_LIFT, m.glass, GLASS_LIFT),
        ]
        parts += [obj for obj in made if obj is not None]
    return parts


def framed(s: Surface, m: Mats, name: str, u_bottom: float, u_top: float, half_bottom: float, half_top: float, border: float) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    out = border if u_bottom > u_top else -border
    frame = patch(s, f"{name}Frame", [m.trim], across(u_bottom + out, half_bottom + border, 3.0, 17), across(u_top - out, half_top + border, 3.0, 17), (0.0, 0.0, -1.0), rows=8, offset=FRAME_LIFT)
    pane = patch(s, name, [m.glass], across(u_bottom, half_bottom, 3.0, 17), across(u_top, half_top, 3.0, 17), (0.0, 0.0, -1.0), rows=8, offset=GLASS_LIFT)
    for made in (frame, pane):
        if made is not None:
            parts.append(made)
    return parts


def windscreen(s: Surface, m: Mats) -> list[bpy.types.Object]:
    return framed(s, m, "Windscreen", SCREEN_BASE, SCREEN_HEADER, lin(EDGE, SCREEN_BASE) - SCREEN_INSET, lin(EDGE, SCREEN_HEADER) - SCREEN_INSET, SCREEN_FRAME)


def hatch(s: Surface, m: Mats) -> list[bpy.types.Object]:
    return framed(s, m, "Hatch", HATCH_BOTTOM, HATCH_TOP, HATCH_HALF[1], HATCH_HALF[0], HATCH_FRAME)


TANDEM_WIPER_PIVOT_SHIFTS = (-0.56, 0.0)


def wipers(s: Surface, m: Mats) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    for pivot_shift in TANDEM_WIPER_PIVOT_SHIFTS:
        pts: list[Vector] = []
        for k in range(14):
            t = k / 13
            x = pivot_shift + WIPER_ROOT[0] + (WIPER_TIP[0] - WIPER_ROOT[0]) * t
            u = WIPER_ROOT[1] + (WIPER_TIP[1] - WIPER_ROOT[1]) * t
            hit = s.cast((x, -u, 3.0), (0.0, 0.0, -1.0))
            if hit is not None:
                pts.append(Vector(hit[0]))
        if len(pts) > 3:
            parts.append(strip(s, "WiperBlade", [m.trim], pts, WIPER_WIDTH, height=WIPER_HEIGHT, offset=0.006))
    return parts


def mirror(side: float, m: Mats) -> list[bpy.types.Object]:
    sx, sz = section(MIRROR_U)[3]
    x0, z0 = sx - 0.01, sz + MIRROR_LIFT
    length, reach, height = MIRROR_SIZE
    inner = [(x0, MIRROR_U - length / 2, z0), (x0, MIRROR_U + length / 2, z0), (x0, MIRROR_U + length / 2, z0 + height), (x0, MIRROR_U - length / 2, z0 + height)]
    outer = [(x0 + reach, MIRROR_U - length / 2 - 0.02, z0 + 0.01), (x0 + reach, MIRROR_U - 0.01, z0 + 0.01), (x0 + reach, MIRROR_U - 0.01, z0 + height - 0.008), (x0 + reach, MIRROR_U - length / 2 - 0.02, z0 + height - 0.008)]
    housing = hull("Mirror", [Vector(at(side * x, u, z)) for x, u, z in inner + outer], m.trim, angle=math.radians(40))
    half_x, half_u, rise = MIRROR_STALK[0], MIRROR_STALK[1] / 2, MIRROR_STALK[2]
    base = [(x0 - half_x, MIRROR_U - half_u, sz - 0.02), (x0 + 0.02, MIRROR_U - half_u, sz - 0.02), (x0 + 0.02, MIRROR_U + half_u, sz - 0.02), (x0 - half_x, MIRROR_U + half_u, sz - 0.02)]
    top = [(x, u, z0 + 0.02) for x, u, _ in base]
    stalk = hull("MirrorStalk", [Vector(at(side * x, u, z)) for x, u, z in base + top], m.trim)
    back = 0.003
    rear_u = MIRROR_U - length / 2 - back
    glass_corners = [at(side * (x0 + 0.015), rear_u, z0 + 0.012), at(side * (x0 + reach - 0.012), rear_u - 0.018, z0 + 0.018), at(side * (x0 + reach - 0.012), rear_u - 0.018, z0 + height - 0.016), at(side * (x0 + 0.015), rear_u, z0 + height - 0.012)]
    return [housing, stalk, quad_object("MirrorGlass", m.glass, glass_corners, (0.0, 1.0, 0.0))]


def glass_features() -> list[tuple[str, float]]:
    return [
        ("wiperBlade", min(WIPER_WIDTH, WIPER_HEIGHT)),
        ("mirrorStalk", min(MIRROR_STALK)),
        ("windscreenFrame", SCREEN_FRAME),
        ("hatchFrame", HATCH_FRAME),
        ("bPillar", abs(DOOR_GLASS[1][0] - QUARTER_GLASS[0][0])),
    ]


def glass(s: Surface, m: Mats) -> list[bpy.types.Object]:
    return side_windows(s, m) + windscreen(s, m) + hatch(s, m) + wipers(s, m)


def mirrors(m: Mats) -> list[bpy.types.Object]:
    return mirror(-1.0, m) + mirror(1.0, m)
