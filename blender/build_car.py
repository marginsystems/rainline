import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

import car_textures
from car_glass import glass, mirrors
from car_lights import lights
from car_features import write_features
from car_body import BODY_SMOOTH_ANGLE, arch_flare, build_shell, cut_arches, cut_openings
from car_materials import make_materials, material
from car_parts import join
from car_shape import FRONT_AXLE, REAR_AXLE, Vec3
from car_surface import Surface, smooth_by_angle
from car_trim import trim
from car_wheels import build_wheel

VIEWS: dict[str, tuple[Vec3, Vec3, float]] = {
    "front": ((3.9, -6.0, 1.45), (0.0, 0.0, 0.6), 55.0),
    "rear": ((-4.2, 6.0, 1.9), (0.0, 0.0, 0.6), 55.0),
    "side": ((8.0, -0.2, 0.9), (0.0, 0.0, 0.6), 55.0),
    "chase": ((0.8, 8.0, 2.7), (0.0, 0.0, 0.6), 55.0),
    "nose": ((1.9, -5.0, 0.95), (0.0, -2.2, 0.5), 50.0),
    "nosetop": ((-1.2, -4.2, 2.3), (0.0, -1.9, 0.7), 45.0),
    "tail": ((-1.9, 5.0, 1.0), (0.0, 2.2, 0.6), 50.0),
    "tailtop": ((1.3, 4.6, 2.4), (0.0, 1.8, 0.8), 45.0),
    "quarter": ((3.6, 3.4, 1.1), (0.9, 1.6, 0.65), 50.0),
    "door": ((3.6, -0.2, 0.95), (0.9, -0.1, 0.65), 55.0),
    "wheel": ((3.0, -2.2, 0.5), (1.0, -1.4, 0.37), 50.0),
    "wheelrear": ((3.0, 2.2, 0.5), (1.0, 1.36, 0.37), 50.0),
    "chase7": ((2.8, 6.4, 2.3), (0.0, 0.0, 0.55), 50.0),
    "chase7front": ((-2.8, -6.4, 2.3), (0.0, 0.0, 0.55), 50.0),
    "roof": ((-3.0, -2.2, 2.6), (0.0, 0.2, 0.9), 50.0),
    "mirror": ((2.4, 1.3, 1.25), (1.05, -0.6, 0.95), 60.0),
    "scoop": ((3.4, 1.6, 0.95), (1.0, 0.8, 0.55), 55.0),
    "frontr": ((-3.9, -6.0, 1.45), (0.0, 0.0, 0.6), 55.0),
    "rearl": ((4.2, 6.0, 1.9), (0.0, 0.0, 0.6), 55.0),
    "low": ((2.6, -3.4, 0.35), (0.2, -1.2, 0.5), 55.0),
    "flat": ((28.0, 0.0, 0.57), (0.0, 0.0, 0.57), 200.0),
    "flatfront": ((0.0, -28.0, 0.57), (0.0, 0.0, 0.57), 200.0),
    "flatrear": ((0.0, 28.0, 0.57), (0.0, 0.0, 0.57), 200.0),
    "top": ((0.0, 0.0, 50.0), (0.0, 0.0, 0.0), 200.0),
}
DEFAULT_VIEWS = ("front", "rear", "side", "chase")
NIGHT_FLAG = "night"
GREY_FLAG = "grey"
OVERCAST = (0.42, 0.44, 0.47)
LOW_FLAG = "lo"
LOW_RESOLUTION = (500, 280)
TOPDOWN = ("top",)
PREVIEW_SIZE = (1000, 560)


def build_car() -> dict[str, float]:
    files, strokes = car_textures.build_textures(Path(__file__).resolve().parent / "textures")
    m = make_materials(files)
    body = build_shell([m.paint, m.glass, m.trim, m.headlight, m.taillight])
    cut_arches(body, m.trim)
    cut_openings(body, m.trim)
    smooth_by_angle(body, BODY_SMOOTH_ANGLE)
    surface = Surface(body)
    parts = [body] + glass(surface, m) + mirrors(m) + lights(surface, m) + trim(surface, m)
    for side in (-1.0, 1.0):
        parts += [arch_flare(FRONT_AXLE, side, m.paint, m.trim), arch_flare(REAR_AXLE, side, m.paint, m.trim)]
    join(parts, "Body")
    for name, side, axle in (("WheelFL", -1.0, FRONT_AXLE), ("WheelFR", 1.0, FRONT_AXLE), ("WheelRL", -1.0, REAR_AXLE), ("WheelRR", 1.0, REAR_AXLE)):
        build_wheel(name, side, axle, m)
    return strokes


def flat_world(color: tuple[float, float, float], strength: float) -> bpy.types.World:
    world = bpy.data.worlds.new("Overcast")
    world.use_nodes = True
    background = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    background.inputs["Color"].default_value = (*color, 1.0)
    background.inputs["Strength"].default_value = strength
    return world


def dusk_world(hdr: Path | None, strength: float = 1.6) -> bpy.types.World:
    world = bpy.data.worlds.new("Dusk")
    world.use_nodes = True
    background = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    if hdr is not None:
        env = world.node_tree.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(hdr))
        world.node_tree.links.new(env.outputs["Color"], background.inputs["Color"])
        background.inputs["Strength"].default_value = strength
    else:
        background.inputs["Color"].default_value = (0.012, 0.018, 0.045, 1.0)
    return world


def add_light(kind: str, energy: float, color: tuple[float, float, float], location: Vec3, rotation: Vec3, size: float = 1.0) -> bpy.types.Object:
    bpy.ops.object.light_add(type=kind, location=location, rotation=rotation)
    light = bpy.context.active_object
    light.data.energy = energy
    light.data.color = color
    if kind == "AREA":
        light.data.size = size
    return light


def render_preview(path: Path, hdr: Path | None, names: list[str]) -> None:
    scene = bpy.context.scene
    worlds = {"dusk": dusk_world(hdr), "night": dusk_world(hdr, 0.05), "grey": flat_world(OVERCAST, 1.0)}
    sun = add_light("SUN", 2.5, (1.0, 1.0, 1.0), (0.0, 0.0, 0.0), (math.radians(58), 0.0, math.radians(140)))
    moon = add_light("SUN", 2.4, (0.55, 0.68, 1.0), (0.0, 0.0, 0.0), (math.radians(48), 0.0, math.radians(200)))
    neon_pink = add_light("AREA", 4000.0, (1.0, 0.1, 0.55), (-6.0, -4.0, 2.2), (math.radians(80), 0.0, math.radians(-55)), size=4.0)
    neon_cyan = add_light("AREA", 4000.0, (0.05, 0.8, 1.0), (6.0, 5.0, 2.2), (math.radians(80), 0.0, math.radians(125)), size=4.0)
    haze = add_light("SUN", 0.8, (0.9, 0.93, 1.0), (0.0, 0.0, 0.0), (math.radians(35), 0.0, math.radians(120)))
    lights = {"dusk": [sun], "night": [moon, neon_pink, neon_cyan], "grey": [haze]}
    bpy.ops.mesh.primitive_plane_add(size=200)
    bpy.context.active_object.data.materials.append(material("Ground", (0.02, 0.022, 0.026), 0.0, 0.22))
    bpy.ops.object.camera_add()
    camera = bpy.context.active_object
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = PREVIEW_SIZE
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
        scene.eevee.use_raytracing = True
        scene.eevee.taa_render_samples = 48
    except (TypeError, AttributeError):
        scene.render.engine = "BLENDER_WORKBENCH"
    for entry in names:
        name, *flags = entry.split("@")
        mode = "night" if NIGHT_FLAG in flags else "grey" if GREY_FLAG in flags else "dusk"
        scene.render.resolution_x, scene.render.resolution_y = LOW_RESOLUTION if LOW_FLAG in flags else PREVIEW_SIZE
        scene.world = worlds[mode]
        for key, group in lights.items():
            for light in group:
                light.hide_render = key != mode
        eye, target, lens = VIEWS[name]
        camera.data.lens = lens
        camera.location = eye
        camera.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat("-Z", "X" if name in TOPDOWN else "Y").to_euler()
        scene.render.filepath = str(path / f"car-{entry.replace('@', '-')}.png")
        bpy.ops.render.render(write_still=True)


def main() -> None:
    args = sys.argv[sys.argv.index("--") + 1:]
    out = Path(args[0])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    strokes = build_car()
    features = write_features(out.with_name("car.features.json"), strokes)
    print("FEATURE count", len(features), "thinnest", min(float(item["minWidthMetres"]) for item in features))
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", export_apply=True, export_yup=True, use_selection=True)
    if len(args) > 1:
        names = args[3].split(",") if len(args) > 3 else list(DEFAULT_VIEWS)
        render_preview(Path(args[1]), Path(args[2]) if len(args) > 2 and args[2] != "-" else None, names)


main()
