from dataclasses import dataclass
from pathlib import Path

import bpy


BRUSHED = (0.5, 0.52, 0.55)
CREAM = (0.78, 0.73, 0.6)
CALIPER_GREY = (0.07, 0.07, 0.075)
SILVER = (0.6, 0.61, 0.63)
AMBER = (1.0, 0.34, 0.02)


def material(name: str, color: tuple[float, float, float], metallic: float, roughness: float, emission: float = 0.0, coat: float = 0.0, coat_roughness: float = 0.04) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if coat > 0.0:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = coat_roughness
    if emission > 0.0:
        bsdf.inputs["Emission Color"].default_value = (*color, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


@dataclass
class Mats:
    paint: bpy.types.Material
    glass: bpy.types.Material
    trim: bpy.types.Material
    tyre: bpy.types.Material
    rim: bpy.types.Material
    disc: bpy.types.Material
    caliper: bpy.types.Material
    headlight: bpy.types.Material
    taillight: bpy.types.Material
    chrome: bpy.types.Material
    emblem: bpy.types.Material
    decal: bpy.types.Material
    plate_front: bpy.types.Material
    plate_rear: bpy.types.Material
    accent: bpy.types.Material
    marker: bpy.types.Material


def textured(name: str, path: Path, metallic: float, roughness: float, alpha: bool = False) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(str(path))
    node.image.alpha_mode = "STRAIGHT"
    node.extension = "EXTEND"
    mat.node_tree.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    if alpha:
        mat.node_tree.links.new(node.outputs["Alpha"], bsdf.inputs["Alpha"])
        mat.surface_render_method = "BLENDED"
    return mat


def make_materials(files: dict[str, Path]) -> Mats:
    return Mats(
        paint=material("Paint", CREAM, 0.0, 0.4, coat=0.5, coat_roughness=0.2),
        glass=material("Glass", (0.01, 0.012, 0.014), 0.9, 0.08, coat=1.0, coat_roughness=0.05),
        trim=material("Trim", (0.016, 0.016, 0.017), 0.0, 0.62),
        tyre=material("Tyre", (0.02, 0.02, 0.021), 0.0, 0.9),
        rim=material("Rim", SILVER, 1.0, 0.3),
        disc=material("Disc", (0.12, 0.115, 0.11), 0.8, 0.55),
        caliper=material("Caliper", CALIPER_GREY, 0.3, 0.5),
        headlight=material("Headlight", (1.0, 0.96, 0.86), 0.0, 0.2, emission=8.0),
        taillight=material("Taillight", (1.0, 0.012, 0.004), 0.0, 0.3, emission=6.0),
        chrome=material("Chrome", (0.86, 0.87, 0.9), 1.0, 0.25),
        emblem=textured("Emblem", files["emblem"], 0.35, 0.22),
        decal=textured("Decal", files["decals"], 0.0, 0.4, alpha=True),
        plate_front=textured("PlateFront", files["plate_front"], 0.0, 0.45),
        plate_rear=textured("PlateRear", files["plate_rear"], 0.0, 0.45),
        accent=material("Accent", BRUSHED, 1.0, 0.36),
        marker=material("Marker", AMBER, 0.0, 0.25),
    )
