import math

Curve = list[tuple[float, float]]
Point = tuple[float, float]
Vec3 = tuple[float, float, float]

NOSE = 2.15
TAIL = -2.15
COWL = 0.62
HEADER = 0.0
ROOF_END = -0.72
DECK = -1.74

TOP: Curve = [(TAIL, 0.94), (-2.12, 0.942), (-2.06, 0.94), (-1.9, 0.94), (DECK, 0.945), (-1.2, 1.115), (ROOF_END, 1.238), (-0.4, 1.274), (-0.15, 1.277), (HEADER, 1.262), (0.32, 1.075), (COWL, 0.885), (0.8, 0.856), (1.4, 0.79), (1.95, 0.712), (2.08, 0.672), (NOSE, 0.62)]
EDGE: Curve = [(TAIL, 0.7), (DECK, 0.72), (-1.2, 0.66), (ROOF_END, 0.6), (HEADER, 0.6), (COWL, 0.715), (0.8, 0.735), (1.7, 0.735), (2.0, 0.71), (NOSE, 0.66)]
CROWN_CURVE: Curve = [(TAIL, 0.018), (DECK, 0.022), (ROOF_END, 0.034), (HEADER, 0.034), (COWL, 0.026), (NOSE, 0.02)]
SHOULDER: Curve = [(TAIL, 0.925), (-2.06, 0.924), (DECK, 0.922), (-1.2, 0.91), (COWL, 0.876), (0.8, 0.852), (1.4, 0.785), (1.95, 0.704), (2.08, 0.664), (NOSE, 0.612)]
TUMBLE: Curve = [(TAIL, 0.05), (DECK, 0.045), (NOSE, 0.042)]
WIDTH: Curve = [(TAIL, 0.795), (-2.06, 0.818), (-1.86, 0.83), (1.7, 0.83), (2.0, 0.815), (NOSE, 0.79)]
CREASE: Curve = [(TAIL, 0.742), (-1.0, 0.728), (1.0, 0.716), (1.7, 0.7), (2.0, 0.64), (NOSE, 0.56)]
ROCKER: Curve = [(TAIL, 0.27), (-1.95, 0.235), (-1.7, 0.225), (1.75, 0.225), (2.0, 0.24), (NOSE, 0.27)]
FLOOR: Curve = [(TAIL, 0.215), (-1.95, 0.175), (-1.75, 0.145), (1.85, 0.145), (NOSE, 0.19)]

STATIONS = [TAIL, -2.12, -2.08, -2.02, -1.9, DECK, -1.6, -1.45, -1.3, -1.14, -0.98, -0.84, ROOF_END, -0.56, -0.4, -0.2, HEADER, 0.16, 0.32, 0.48, COWL, 0.78, 0.95, 1.12, 1.29, 1.46, 1.62, 1.78, 1.92, 2.04, 2.1, NOSE]
TOP_RING = (0, 1, 2)
RING_CREASES: dict[float, tuple[tuple[int, ...], float]] = {
    DECK: (TOP_RING, 0.9),
    ROOF_END: (TOP_RING, 0.8),
    HEADER: (TOP_RING, 0.8),
    COWL: (TOP_RING, 0.9),
}
LENGTH_CREASES = {2: 0.75, 3: 1.0, 4: 1.0, 5: 0.7, 6: 1.0}
CAP_CREASE = 0.9
FRONT_LEAN = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -0.06, -0.06, -0.06)
REAR_LEAN = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.06, 0.06, 0.06)
CAP_COLUMNS = 8

PAINT, GLASS, TRIM, HEAD, TAIL_LAMP = 0, 1, 2, 3, 4
SEGMENT_MATERIALS = (PAINT, PAINT, PAINT, PAINT, PAINT, TRIM, TRIM, TRIM)
FRONT_CAP = (PAINT, PAINT, PAINT, PAINT, PAINT, TRIM, TRIM, TRIM)
REAR_CAP = (PAINT, PAINT, PAINT, PAINT, PAINT, TRIM, TRIM, TRIM)

SILL_INSET = 0.035
FLOOR_INSET = 0.2

WHEEL_RADIUS = 0.31
FRONT_AXLE = 1.29
REAR_AXLE = FRONT_AXLE - 2.43
TYRE_HALF_FRONT = 0.0975
TYRE_HALF_REAR = 0.0975
FLARE_OUT = 0.018
WHEEL_PROUD = -0.012
ARCH_SIDES = 24
ARCH_CLEARANCE = 0.026
ARCH_RADIUS = (WHEEL_RADIUS + ARCH_CLEARANCE) / math.cos(math.pi / ARCH_SIDES)
ARCH_INNER_FRONT = 0.56
ARCH_INNER_REAR = 0.56


def lin(curve: Curve, u: float) -> float:
    if u <= curve[0][0]:
        return curve[0][1]
    for (u0, v0), (u1, v1) in zip(curve, curve[1:]):
        if u <= u1:
            return v0 + (v1 - v0) * (u - u0) / (u1 - u0)
    return curve[-1][1]


def crown(u: float) -> float:
    return lin(CROWN_CURVE, u)


def section(u: float) -> list[Point]:
    zc, zs, xe, ws, z0 = lin(TOP, u), lin(SHOULDER, u), lin(EDGE, u), lin(WIDTH, u), lin(FLOOR, u)
    c = crown(u)
    xs = ws - lin(TUMBLE, u)
    floor_edge = ws - FLOOR_INSET
    return [
        (0.0, zc),
        (0.5 * xe, zc - 0.25 * c),
        (xe, zc - c),
        (xs, zs),
        (ws, lin(CREASE, u)),
        (ws - SILL_INSET, lin(ROCKER, u)),
        (floor_edge, z0),
        (0.5 * floor_edge, z0 - 0.008),
        (0.0, z0 - 0.008),
    ]


def tyre_half(axle: float) -> float:
    return TYRE_HALF_FRONT if axle > 0.0 else TYRE_HALF_REAR


def wheel_x(axle: float) -> float:
    return lin(WIDTH, axle) + FLARE_OUT + WHEEL_PROUD - tyre_half(axle)


def at(x: float, u: float, z: float) -> Vec3:
    return (x, -u, z)
