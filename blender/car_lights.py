import bpy

import car_textures
from car_materials import Mats
from car_shape import NOSE, TAIL, Vec3, at
from car_surface import Frame, Surface, decal, flat_quad, frame_on, prism, rounded_rect

FRONT: Vec3 = (0.0, 1.0, 0.0)
BACK: Vec3 = (0.0, -1.0, 0.0)
UP: Vec3 = (0.0, 0.0, 1.0)
DOWN: Vec3 = (0.0, 0.0, -1.0)
POD_X = (0.35, 0.69)
POD_FACE_U = 1.965
POD_DEPTH = 0.15
POD_BOTTOM = 0.62
POD_TOP = 0.865
POD_ROUND = 0.012
LAMP_SIZE = (0.27, 0.105)
LAMP_Z = 0.79
LAMP_PROUD = 0.004
LAMP_BEZEL = 0.016
INDICATOR = (0.6, 0.528, 0.2, 0.034)
SIDE_MARKER = (1.98, 0.5, 0.075, 0.03)
TAIL_LAMP_X = (0.29, 0.75)
TAIL_LAMP_Z = (0.645, 0.8)
TAIL_LAMP_ROUND = 0.01
TAIL_AMBER_WIDTH = 0.12
TAIL_DIVIDER = 0.014
TAIL_RIB_COUNT = 3
TAIL_PANEL_INSET = 0.008
LAMP_HEIGHT = 0.006
PLATE_BORDER = 0.016
FRONT_PLATE = (0.0, 0.42, car_textures.PLATE_SIZE[0], car_textures.PLATE_SIZE[1])
REAR_PLATE = (0.0, 0.54, car_textures.PLATE_SIZE[0], car_textures.PLATE_SIZE[1])
NOSE_BADGE = (0.0, 2.07, 0.075)
WORDMARK_Z = 0.7225


def uv_rect(key: str) -> tuple[float, float, float, float]:
    x, y, w, h = car_textures.ATLAS[key]
    size = car_textures.ATLAS_SIZE
    return (x / size, 1.0 - (y + h) / size, (x + w) / size, 1.0 - y / size)


def put_decal(s: Surface, name: str, m: Mats, key: str, origin: Vec3, direction: Vec3, up: Vec3, width: float, nu: int = 14, nv: int = 3, offset: float = 0.003) -> list[bpy.types.Object]:
    frame = frame_on(s, origin, direction, up)
    if frame is None:
        return []
    height = width * car_textures.ATLAS[key][3] / car_textures.ATLAS[key][2]
    made = decal(s, name, [m.decal], frame, width, height, uv_rect(key), nu, nv, offset)
    return [made] if made is not None else []


def badge(s: Surface, m: Mats, origin: Vec3, direction: Vec3, up: Vec3, height: float) -> list[bpy.types.Object]:
    frame = frame_on(s, origin, direction, up)
    if frame is None:
        return []
    k = height / 2.0 / car_textures.EMBLEM_EXTENT
    outline = [(a * k, b * k) for a, b in car_textures.emblem_outline()]
    return [prism(frame, "Badge", [m.chrome, m.emblem], outline, -0.004, 0.006, 0, 1, inset=0.05, uv_scale=k)]


def licence_plate(s: Surface, m: Mats, spec: tuple[float, float, float, float], direction: Vec3, front: bool) -> list[bpy.types.Object]:
    x, z, width, height = spec
    origin = (x, -3.5 if front else 3.5, z)
    base = frame_on(s, origin, direction, UP)
    if base is None:
        return []
    lift = 0.0
    for da in (-width / 2, 0.0, width / 2):
        for db in (-height / 2, 0.0, height / 2):
            hit = s.cast(base.pt(da, db, 0.3), -base.n)
            if hit is not None:
                lift = max(lift, (hit[0] - base.o).dot(base.n))
    frame = Frame(base.o + base.n * (lift + 0.004), base.n, UP)
    back = -(lift + 0.004) - 0.02
    slab = prism(frame, "PlateFrame", [m.trim], rounded_rect(width + 2.0 * PLATE_BORDER, height + 2.0 * PLATE_BORDER, 0.012), back, 0.007, 0, 0, inset=0.02)
    face = flat_quad(frame, "Plate", [m.plate_front if front else m.plate_rear], width, height, 0.0074, (0.0, 0.0, 1.0, 1.0))
    return [slab, face]


def popup_lamp(s: Surface, m: Mats, side: float) -> list[bpy.types.Object]:
    centre_x = side * (POD_X[0] + POD_X[1]) / 2.0
    width = POD_X[1] - POD_X[0]
    height = POD_TOP - POD_BOTTOM
    face = Frame(at(centre_x, POD_FACE_U, (POD_TOP + POD_BOTTOM) / 2.0), (0.0, -1.0, 0.0), UP)
    pod = prism(face, "PopupPod", [m.paint, m.trim], rounded_rect(width, height, POD_ROUND, steps=2), -POD_DEPTH, 0.0, 0, 1)
    lamp_frame = Frame(at(centre_x, POD_FACE_U, LAMP_Z), (0.0, -1.0, 0.0), UP)
    bezel = prism(lamp_frame, "LampBezel", [m.chrome], rounded_rect(LAMP_SIZE[0] + LAMP_BEZEL * 2.0, LAMP_SIZE[1] + LAMP_BEZEL * 2.0, 0.012, steps=2), -0.01, LAMP_PROUD * 0.5, 0, 0)
    lamp = prism(lamp_frame, "Headlamp", [m.headlight], rounded_rect(LAMP_SIZE[0], LAMP_SIZE[1], 0.008, steps=2), -0.01, LAMP_PROUD, 0, 0)
    return [pod, bezel, lamp]


def flat_lamp(s: Surface, name: str, mat: bpy.types.Material, origin: Vec3, direction: Vec3, width: float, height: float, radius: float, proud: float = LAMP_HEIGHT) -> list[bpy.types.Object]:
    frame = frame_on(s, origin, direction, UP)
    if frame is None:
        return []
    return [prism(frame, name, [mat], rounded_rect(width, height, radius, steps=2), -0.012, proud, 0, 0)]


def side_marker(s: Surface, m: Mats, side: float) -> list[bpy.types.Object]:
    u, z, width, height = SIDE_MARKER
    frame = frame_on(s, at(side * 3.0, u, z), (-side, 0.0, 0.0), UP)
    if frame is None:
        return []
    return [prism(frame, "SideMarker", [m.marker], rounded_rect(width, height, 0.008, steps=2), -0.008, 0.004, 0, 0)]


def nose_details(s: Surface, m: Mats) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    x, u, height = NOSE_BADGE
    parts += badge(s, m, at(x, u, 3.0), DOWN, (0.0, -1.0, 0.0), height)
    parts += licence_plate(s, m, FRONT_PLATE, FRONT, True)
    for side in (-1.0, 1.0):
        parts += popup_lamp(s, m, side)
        ix, iz, iw, ih = INDICATOR
        parts += flat_lamp(s, "Indicator", m.marker, at(side * ix, NOSE + 1.0, iz), FRONT, iw, ih, 0.008)
        parts += side_marker(s, m, side)
    return parts


def tail_lamp(s: Surface, m: Mats, side: float) -> list[bpy.types.Object]:
    x0, x1 = TAIL_LAMP_X
    z0, z1 = TAIL_LAMP_Z
    zc, h = (z0 + z1) / 2.0, z1 - z0
    parts: list[bpy.types.Object] = []
    parts += flat_lamp(s, "TailHousing", m.trim, at(side * (x0 + x1) / 2.0, TAIL - 1.0, zc), BACK, x1 - x0, h, TAIL_LAMP_ROUND, proud=0.004)
    inner_x = x0 + TAIL_DIVIDER + TAIL_AMBER_WIDTH / 2.0
    parts += flat_lamp(s, "TailAmber", m.marker, at(side * inner_x, TAIL - 1.0, zc + h / 4.0 - TAIL_DIVIDER / 4.0), BACK, TAIL_AMBER_WIDTH, h / 2.0 - TAIL_DIVIDER * 1.5, 0.006, proud=0.008)
    parts += flat_lamp(s, "TailReverse", m.chrome, at(side * inner_x, TAIL - 1.0, zc - h / 4.0 + TAIL_DIVIDER / 4.0), BACK, TAIL_AMBER_WIDTH, h / 2.0 - TAIL_DIVIDER * 1.5, 0.006, proud=0.008)
    red_x0 = x0 + 2.0 * TAIL_DIVIDER + TAIL_AMBER_WIDTH
    red_w = x1 - TAIL_DIVIDER - red_x0
    rib = (h - TAIL_DIVIDER * (TAIL_RIB_COUNT + 1)) / TAIL_RIB_COUNT
    for k in range(TAIL_RIB_COUNT):
        rz = z0 + TAIL_DIVIDER + rib / 2.0 + k * (rib + TAIL_DIVIDER)
        parts += flat_lamp(s, "TailLamp", m.taillight, at(side * (red_x0 + red_w / 2.0), TAIL - 1.0, rz), BACK, red_w, rib, 0.005, proud=0.008)
    return parts


def tail_details(s: Surface, m: Mats) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    z0, z1 = TAIL_LAMP_Z
    panel_w = 2.0 * (TAIL_LAMP_X[0] - TAIL_PANEL_INSET)
    parts += flat_lamp(s, "TailPanel", m.trim, at(0.0, TAIL - 1.0, (z0 + z1) / 2.0), BACK, panel_w, z1 - z0, 0.006, proud=0.004)
    parts += put_decal(s, "Wordmark", m, "wordmark", at(0.0, TAIL - 1.0, WORDMARK_Z), BACK, UP, car_textures.WORDMARK_WIDTH, nu=20, nv=2, offset=0.0055)
    parts += licence_plate(s, m, REAR_PLATE, BACK, False)
    for side in (-1.0, 1.0):
        parts += tail_lamp(s, m, side)
    return parts


def badge_peak(height: float) -> float:
    return car_textures.EMBLEM_PEAK_TOP * height / 2.0 / car_textures.EMBLEM_EXTENT


def light_features() -> list[tuple[str, float]]:
    return [
        ("popupLampBezel", LAMP_BEZEL),
        ("indicator", INDICATOR[3]),
        ("tailDivider", TAIL_DIVIDER),
        ("tailRib", (TAIL_LAMP_Z[1] - TAIL_LAMP_Z[0] - TAIL_DIVIDER * (TAIL_RIB_COUNT + 1)) / TAIL_RIB_COUNT),
        ("sideMarker", min(SIDE_MARKER[2:])),
        ("plateFrame", PLATE_BORDER),
        ("noseBadgePeak", badge_peak(NOSE_BADGE[2])),
    ]


def lights(s: Surface, m: Mats) -> list[bpy.types.Object]:
    return nose_details(s, m) + tail_details(s, m)
