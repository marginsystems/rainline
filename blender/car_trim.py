import math

import bpy
from mathutils import Vector

from car_lights import FRONT_PLATE, PLATE_BORDER, UP
from car_materials import Mats
from car_parts import cylinder, empty, hull
from car_shape import ARCH_RADIUS, COWL, FRONT_AXLE, NOSE, REAR_AXLE, SHOULDER, TAIL, TOP, WHEEL_RADIUS, WIDTH, at, lin
from car_surface import Surface, frame_on, prism, project, rounded_rect, strip

RUB_Z = 0.42
RUB_WIDTH = 0.045
RUB_HEIGHT = 0.013
RUB_ARCH_GAP = 0.06
RUB_SAMPLES = 44
RUB_DOOR_SAMPLES = 24
NOSE_CENTRE = 1.4
TAIL_CENTRE = -1.3
ARCH_REACH_AT_RUB = math.sqrt(ARCH_RADIUS ** 2 - (RUB_Z - WHEEL_RADIUS) ** 2)
DOOR_FRONT = ((0.885, 0.25), (0.865, 0.87))
DOOR_REAR = ((-0.52, 0.25), (-0.5, 0.89))
DOOR_LINE_WIDTH = 0.013
HOOD_LINE_X = 0.705
HOOD_LINE_SPAN = (COWL + 0.03, 1.86)
HOOD_LINE_WIDTH = 0.012
HANDLE = (-0.34, 0.8, 0.13, 0.03)
BELT_SPAN = (COWL - 0.03, -1.3)
BELT_DROP = 0.012
BELT_WIDTH = 0.014
EXHAUST_X = 0.44
EXHAUST_Z = 0.19
EXHAUST_TIP = -2.2
EXHAUST_LENGTH = 0.2
EXHAUST_RADIUS = 0.034
EXHAUST_WALL = 0.012
FLAP = (-1.68, 0.82, 0.15, 0.11)
FLAP_SEAM_WIDTH = 0.012
LIP_HALF = (0.66, 0.7)
LIP_FRONT = TAIL + 0.17
LIP_SINK = 0.02
LIP_RISE = 0.035
LIP_BACK = 0.012


def contour(s: Surface, centre_u: float, z: float, start: float, end: float, count: int) -> list[Vector]:
    out: list[Vector] = []
    for k in range(count):
        angle = start + (end - start) * k / (count - 1)
        dx, du = math.sin(angle), math.cos(angle)
        origin = Vector(at(3.0 * dx, centre_u + 3.0 * du, z))
        hit = s.cast(origin, Vector(at(-dx, -du, 0.0)))
        if hit is not None:
            out.append(hit[0])
    return out


def end_angle(centre_u: float, edge_u: float, x: float) -> float:
    return math.atan2(x, edge_u - centre_u)


def rubbing_strips(s: Surface, m: Mats) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    half = lin(WIDTH, 0.0)
    front_edge = FRONT_AXLE + ARCH_REACH_AT_RUB + RUB_ARCH_GAP
    rear_edge = REAR_AXLE - ARCH_REACH_AT_RUB - RUB_ARCH_GAP
    nose_side = end_angle(NOSE_CENTRE, front_edge, half)
    plate_gap = math.atan2(FRONT_PLATE[2] / 2.0 + PLATE_BORDER + 0.01, NOSE - NOSE_CENTRE)
    for start, end in ((-nose_side, -plate_gap), (plate_gap, nose_side)):
        pts = contour(s, NOSE_CENTRE, RUB_Z, start, end, RUB_SAMPLES // 2)
        parts.append(strip(s, "RubStrip", [m.trim], pts, RUB_WIDTH, height=RUB_HEIGHT, offset=0.0))
    tail_side = end_angle(TAIL_CENTRE, rear_edge, half)
    pts = contour(s, TAIL_CENTRE, RUB_Z, tail_side, math.tau - tail_side, RUB_SAMPLES)
    parts.append(strip(s, "RubStrip", [m.trim], pts, RUB_WIDTH, height=RUB_HEIGHT, offset=0.0))
    door = (FRONT_AXLE - ARCH_REACH_AT_RUB - RUB_ARCH_GAP, REAR_AXLE + ARCH_REACH_AT_RUB + RUB_ARCH_GAP)
    for side in (-1.0, 1.0):
        line = [Vector(at(side * 3.0, door[0] + (door[1] - door[0]) * k / (RUB_DOOR_SAMPLES - 1), RUB_Z)) for k in range(RUB_DOOR_SAMPLES)]
        parts.append(strip(s, "RubStrip", [m.trim], project(s, line, (-side, 0.0, 0.0)), RUB_WIDTH, height=RUB_HEIGHT, offset=0.0))
    return parts


def door_lines(s: Surface, m: Mats) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    for side in (-1.0, 1.0):
        for (u0, z0), (u1, z1) in (DOOR_FRONT, DOOR_REAR):
            pts = [Vector(at(side * 3.0, u0 + (u1 - u0) * k / 11, z0 + (z1 - z0) * k / 11)) for k in range(12)]
            parts.append(strip(s, "DoorLine", [m.trim], project(s, pts, (-side, 0.0, 0.0)), DOOR_LINE_WIDTH, offset=0.0012))
        frame = frame_on(s, at(side * 3.0, HANDLE[0], HANDLE[1]), (-side, 0.0, 0.0), UP)
        if frame is not None:
            parts.append(prism(frame, "Handle", [m.trim], rounded_rect(HANDLE[2], HANDLE[3], 0.01), -0.004, 0.004, 0, 0, inset=0.06))
    return parts


def hood_lines(s: Surface, m: Mats) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    u0, u1 = HOOD_LINE_SPAN
    for side in (-1.0, 1.0):
        pts = project(s, [Vector(at(side * HOOD_LINE_X, u0 + (u1 - u0) * k / 15, 3.0)) for k in range(16)], (0.0, 0.0, -1.0))
        if len(pts) > 3:
            parts.append(strip(s, "HoodLine", [m.trim], pts, HOOD_LINE_WIDTH, offset=0.0012))
    return parts


def belt_mouldings(s: Surface, m: Mats) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    u0, u1 = BELT_SPAN
    for side in (-1.0, 1.0):
        line = [Vector(at(side * 3.0, u, lin(SHOULDER, u) - BELT_DROP)) for u in (u0 + (u1 - u0) * k / 23 for k in range(24))]
        parts.append(strip(s, "BeltMoulding", [m.accent], project(s, line, (-side, 0.0, 0.0)), BELT_WIDTH, offset=0.0022))
    return parts


def exhausts(m: Mats) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    centre_u = EXHAUST_TIP + EXHAUST_LENGTH / 2
    for side, label in ((-1.0, "ExhaustL"), (1.0, "ExhaustR")):
        parts.append(cylinder("Exhaust", EXHAUST_RADIUS, EXHAUST_LENGTH, at(side * EXHAUST_X, centre_u, EXHAUST_Z), m.chrome, vertices=24))
        parts.append(cylinder("ExhaustCore", EXHAUST_RADIUS - EXHAUST_WALL, EXHAUST_LENGTH + 0.004, at(side * EXHAUST_X, centre_u - 0.002, EXHAUST_Z), m.trim, vertices=24))
        empty(label, at(side * EXHAUST_X, EXHAUST_TIP, EXHAUST_Z))
    return parts


def fuel_flap(s: Surface, m: Mats) -> list[bpy.types.Object]:
    u, z, width, height = FLAP
    frame = frame_on(s, at(3.0, u, z), (-1.0, 0.0, 0.0), UP)
    if frame is None:
        return []
    ring = [frame.pt(a, b, 0.0) for a, b in rounded_rect(width, height, 0.018, steps=4)]
    return [strip(s, "FlapSeam", [m.trim], ring, FLAP_SEAM_WIDTH, offset=0.0014, closed=True)]


def lip_spoiler(m: Mats) -> list[bpy.types.Object]:
    deck = lin(TOP, TAIL + LIP_BACK)
    points: list[tuple[float, float, float]] = []
    for side in (-1.0, 1.0):
        points += [
            at(side * LIP_HALF[1], LIP_FRONT, lin(TOP, LIP_FRONT) - LIP_SINK),
            at(side * LIP_HALF[1], TAIL - LIP_BACK, deck - LIP_SINK),
            at(side * LIP_HALF[0], TAIL - LIP_BACK, deck + LIP_RISE),
        ]
    return [hull("LipSpoiler", points, m.trim, angle=math.radians(30))]


def trim_features() -> list[tuple[str, float]]:
    return [
        ("accentBelt", BELT_WIDTH),
        ("rubStrip", min(RUB_WIDTH, RUB_HEIGHT)),
        ("doorLine", DOOR_LINE_WIDTH),
        ("hoodLine", HOOD_LINE_WIDTH),
        ("doorHandle", HANDLE[3]),
        ("exhaustWall", EXHAUST_WALL),
        ("fuelFlapSeam", FLAP_SEAM_WIDTH),
        ("lipSpoiler", LIP_RISE),
    ]


def trim(s: Surface, m: Mats) -> list[bpy.types.Object]:
    return rubbing_strips(s, m) + door_lines(s, m) + hood_lines(s, m) + belt_mouldings(s, m) + exhausts(m) + fuel_flap(s, m) + lip_spoiler(m)
