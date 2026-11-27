import math
import struct
import zlib
from pathlib import Path

import bmesh
import bpy
import numpy as np
from numpy.typing import NDArray

Pixels = NDArray[np.float32]
Field = NDArray[np.float32]
Color = tuple[float, float, float]
Point = tuple[float, float]
Rect = tuple[int, int, int, int]

EMBLEM_INNER = 0.8
EMBLEM_ROUND = 0.12
EMBLEM_EXTENT = EMBLEM_INNER + EMBLEM_ROUND
SUPERSAMPLE = 4

ATLAS_SIZE = 1024
ATLAS: dict[str, Rect] = {
    "wordmark": (0, 0, 1024, 128),
    "model": (0, 128, 512, 128),
}
WORDMARK_WIDTH = 0.5
MODEL_WIDTH = 0.32
PLATE_SIZE = (0.56, 0.14)
PLATE_PIXELS = (1024, 256)
PLATE_TEXT = "FABLE 5"
WORDMARK_BOLD = 0.13
MODEL_BOLD = 0.09
PLATE_BOLD = 0.05
EMBLEM_PEAK_TOP = 0.4
STROKE_KEEP = 0.97
STROKE_SEARCH = 40


def write_png(path: Path, rgba: Pixels) -> None:
    data = (np.clip(rgba, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)
    height, width = data.shape[:2]
    raw = b"".join(b"\x00" + data[row].tobytes() for row in range(height))

    def chunk(tag: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def blank(width: int, height: int) -> Pixels:
    return np.zeros((height, width, 4), dtype=np.float32)


def coords(width: int, height: int) -> tuple[Field, Field]:
    ys, xs = np.mgrid[0:height, 0:width]
    return xs.astype(np.float32) + 0.5, ys.astype(np.float32) + 0.5


def coverage(distance: Field) -> Field:
    return np.clip(0.5 - distance, 0.0, 1.0).astype(np.float32)


def paint(img: Pixels, mask: Field, color: Color | Field, alpha: float = 1.0) -> None:
    src = (mask * alpha)[..., None]
    rgb = np.broadcast_to(np.asarray(color, dtype=np.float32), img[..., :3].shape)
    dst = img[..., 3:4]
    out = src + dst * (1.0 - src)
    img[..., :3] = np.where(out > 1e-6, (rgb * src + img[..., :3] * dst * (1.0 - src)) / np.maximum(out, 1e-6), rgb)
    img[..., 3:4] = out


def bleed(img: Pixels, color: Color) -> None:
    clear = img[..., 3] < 1e-4
    img[..., :3][clear] = color


def sd_box(x: Field, y: Field, cx: float, cy: float, hw: float, hh: float, radius: float = 0.0) -> Field:
    qx = np.abs(x - cx) - (hw - radius)
    qy = np.abs(y - cy) - (hh - radius)
    outside = np.hypot(np.maximum(qx, 0.0), np.maximum(qy, 0.0))
    return outside + np.minimum(np.maximum(qx, qy), 0.0) - radius


def sd_segment(x: Field, y: Field, a: Point, b: Point, radius: float = 0.0) -> Field:
    ex, ey = b[0] - a[0], b[1] - a[1]
    t = np.clip(((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey), 0.0, 1.0)
    return np.hypot(x - a[0] - t * ex, y - a[1] - t * ey) - radius


def sd_polygon(x: Field, y: Field, pts: list[Point]) -> Field:
    n = len(pts)
    best = np.full(x.shape, 1e9, dtype=np.float32)
    inside = np.zeros(x.shape, dtype=bool)
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        best = np.minimum(best, sd_segment(x, y, a, b))
        crosses = (a[1] > y) != (b[1] > y)
        slope = (b[0] - a[0]) / (b[1] - a[1] + 1e-12)
        inside ^= crosses & (x < a[0] + slope * (y - a[1]))
    return np.where(inside, -best, best).astype(np.float32)


def smooth(a: float, b: float, x: Field) -> Field:
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return (t * t * (3.0 - 2.0 * t)).astype(np.float32)


def emblem_outline(arc_steps: int = 6) -> list[Point]:
    out: list[Point] = []
    for k in range(6):
        centre = math.radians(90 + 60 * k)
        cx, cy = EMBLEM_INNER * math.cos(centre), EMBLEM_INNER * math.sin(centre)
        for s in range(arc_steps + 1):
            a = centre - math.radians(30) + math.radians(60) * s / arc_steps
            out.append((cx + EMBLEM_ROUND * math.cos(a), cy + EMBLEM_ROUND * math.sin(a)))
    return out


def dilate(mask: Field, radius: float) -> Field:
    r = int(math.ceil(radius))
    height, width = mask.shape
    padded = np.pad(mask, r)
    out = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= radius * radius + 0.25:
                out = np.maximum(out, padded[r + dy:r + dy + height, r + dx:r + dx + width])
    return out


def text_triangles(text: str, spacing: float, shear: float) -> Field:
    curve = bpy.data.curves.new("glyphs", "FONT")
    curve.body = text
    curve.size = 1.0
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.space_character = 1.0 + spacing
    curve.shear = shear
    curve.resolution_u = 8
    holder = bpy.data.objects.new("glyphs", curve)
    bpy.context.collection.objects.link(holder)
    evaluated = holder.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    tris = np.array([[(v.co.x, v.co.y) for v in face.verts] for face in bm.faces], dtype=np.float32)
    bm.free()
    evaluated.to_mesh_clear()
    bpy.data.objects.remove(holder, do_unlink=True)
    bpy.data.curves.remove(curve)
    return tris


def text_mask(text: str, width: int, height: int, pad_x: float = 0.0, pad_y: float = 0.0, bold: float = 0.03, spacing: float = 0.0, shear: float = 0.0, fill: bool = False, squeeze: float = 1.0) -> Field:
    tris = text_triangles(text, spacing, shear)
    lo = tris.reshape(-1, 2).min(axis=0) - bold
    hi = tris.reshape(-1, 2).max(axis=0) + bold
    span = hi - lo
    scale_y = (height - 2 * pad_y) / span[1]
    scale_x = scale_y * squeeze
    if fill or span[0] * scale_x > width - 2 * pad_x:
        scale_x = (width - 2 * pad_x) / span[0]
    cx, cy = (lo + hi) * 0.5
    big_w, big_h = width * SUPERSAMPLE, height * SUPERSAMPLE
    grid = np.zeros((big_h, big_w), dtype=bool)
    px = (tris[..., 0] - cx) * scale_x * SUPERSAMPLE + big_w * 0.5
    py = big_h * 0.5 - (tris[..., 1] - cy) * scale_y * SUPERSAMPLE
    for i in range(len(tris)):
        xs, ys = px[i], py[i]
        x0, x1 = max(int(xs.min()), 0), min(int(math.ceil(xs.max())) + 1, big_w)
        y0, y1 = max(int(ys.min()), 0), min(int(math.ceil(ys.max())) + 1, big_h)
        if x0 >= x1 or y0 >= y1:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        e0 = (xs[1] - xs[0]) * (gy - ys[0]) - (ys[1] - ys[0]) * (gx - xs[0])
        e1 = (xs[2] - xs[1]) * (gy - ys[1]) - (ys[2] - ys[1]) * (gx - xs[1])
        e2 = (xs[0] - xs[2]) * (gy - ys[2]) - (ys[0] - ys[2]) * (gx - xs[2])
        hit = ((e0 >= 0) & (e1 >= 0) & (e2 >= 0)) | ((e0 <= 0) & (e1 <= 0) & (e2 <= 0))
        grid[y0:y1, x0:x1] |= hit
    mask = grid.reshape(height, SUPERSAMPLE, width, SUPERSAMPLE).mean(axis=(1, 3)).astype(np.float32)
    return dilate(mask, bold * scale_y) if bold * scale_y > 0.4 else mask


def place(img: Pixels, rect: Rect, layer: Pixels) -> None:
    x, y, w, h = rect
    img[y:y + h, x:x + w] = layer


def emblem_texture(size: int = 256) -> Pixels:
    img = blank(size, size)
    x, y = coords(size, size)
    half = size / 2
    ux, uy = (x - half) / half, -(y - half) / half
    paint(img, np.ones_like(x), (0.05, 0.035, 0.12))
    top = EMBLEM_PEAK_TOP / 2.0
    peak = [(-0.62, -0.42), (-top, 0.4), (top, 0.4), (0.62, -0.42)]
    paint(img, coverage(sd_polygon(ux, uy, peak) * half), (1.0, 0.45, 0.04))
    return img


def erode(mask: Field, radius: int) -> Field:
    height, width = mask.shape
    padded = np.pad(mask, radius)
    out = mask.copy()
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx * dx + dy * dy <= radius * radius + 0.25:
                out = np.minimum(out, padded[radius + dy:radius + dy + height, radius + dx:radius + dx + width])
    return out


def stroke_pixels(mask: Field) -> int:
    solid = (mask > 0.5).astype(np.float32)
    rows, cols = np.nonzero(solid)
    solid = solid[rows.min():rows.max() + 1, cols.min():cols.max() + 1]
    total = float(solid.sum())
    low, high = 0, STROKE_SEARCH
    while low < high:
        mid = (low + high + 1) // 2
        kept = float(np.minimum(dilate(erode(solid, mid), float(mid)), solid).sum())
        if kept / total >= STROKE_KEEP:
            low = mid
        else:
            high = mid - 1
    return 2 * low + 1


def lettering(text: str, width: int, height: int, top: Color, bottom: Color, bold: float, spacing: float, shear: float = 0.0, pad_y: float = 0.1, fill: bool = True) -> tuple[Pixels, Field]:
    img = blank(width, height)
    mask = text_mask(text, width, height, pad_x=4, pad_y=height * pad_y, bold=bold, spacing=spacing, shear=shear, fill=fill)
    _, y = coords(width, height)
    t = (y / height)[..., None]
    paint(img, mask, np.array(top, dtype=np.float32) * (1 - t) + np.array(bottom, dtype=np.float32) * t)
    bleed(img, bottom)
    return img, mask


def atlas_texture() -> tuple[Pixels, dict[str, float]]:
    img = blank(ATLAS_SIZE, ATLAS_SIZE)
    silver = (0.93, 0.94, 0.96)
    steel = (0.72, 0.74, 0.8)
    word, word_mask = lettering("KALDERA", 1024, 128, silver, steel, WORDMARK_BOLD, 0.5, fill=False, pad_y=0.12)
    model, model_mask = lettering("GT-5", 512, 128, silver, steel, MODEL_BOLD, 0.3, shear=0.2, pad_y=0.12, fill=False)
    place(img, ATLAS["wordmark"], word)
    place(img, ATLAS["model"], model)
    strokes = {"wordmarkStroke": stroke_pixels(word_mask) * WORDMARK_WIDTH / 1024, "modelStroke": stroke_pixels(model_mask) * MODEL_WIDTH / 512}
    return img, strokes


def plate_texture(text: str, yellow: bool) -> tuple[Pixels, float]:
    width, height = PLATE_PIXELS
    img = blank(width, height)
    x, y = coords(width, height)
    back = (1.0, 0.8, 0.04) if yellow else (0.95, 0.95, 0.93)
    ink = (0.025, 0.025, 0.03)
    paint(img, coverage(sd_box(x, y, width / 2, height / 2, width / 2, height / 2, 20)), back)
    paint(img, coverage(sd_box(x, y, 82, height / 2, 58, height / 2 - 24, 6)), (0.04, 0.12, 0.32))
    paint(img, coverage(sd_polygon(x, y, [(48, 176), (82, 96), (116, 176)])), (0.95, 0.95, 0.97))
    letters = text_mask(text, 800, height, pad_x=0, pad_y=60, bold=PLATE_BOLD, spacing=0.12, fill=True)
    shifted = np.zeros((height, width), dtype=np.float32)
    shifted[:, 170:970] = letters
    paint(img, shifted, ink)
    return img, stroke_pixels(letters) * PLATE_SIZE[0] / width


def build_textures(directory: Path) -> tuple[dict[str, Path], dict[str, float]]:
    directory.mkdir(parents=True, exist_ok=True)
    atlas, strokes = atlas_texture()
    front, plate_stroke = plate_texture(PLATE_TEXT, False)
    rear, _ = plate_texture(PLATE_TEXT, True)
    files = {"emblem": emblem_texture(), "decals": atlas, "plate_front": front, "plate_rear": rear}
    out: dict[str, Path] = {}
    for name, pixels in files.items():
        out[name] = directory / f"{name}.png"
        write_png(out[name], pixels)
    return out, {**strokes, "plateTextStroke": plate_stroke}
