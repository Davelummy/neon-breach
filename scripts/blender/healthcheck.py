import json
from pathlib import Path

import bpy


OBJECT_NAME = "NEON_BREACH_HEALTHCHECK"
MATERIAL_NAME = "NEON_BREACH_HEALTHCHECK_MATERIAL"
OUTPUT_RELATIVE = Path(".codex/artifacts/blender/healthcheck.glb")
REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_ROOT = REPOSITORY_ROOT / ".codex" / "artifacts"
OUTPUT_DIRECTORY = ARTIFACT_ROOT / "blender"


def prepare_output_path():
    for directory in (REPOSITORY_ROOT / ".codex", ARTIFACT_ROOT, OUTPUT_DIRECTORY):
        if directory.is_symlink():
            raise RuntimeError(f"Refusing symlinked artifact directory: {directory.name}")

    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)

    resolved_artifact_root = ARTIFACT_ROOT.resolve(strict=True)
    resolved_output_directory = OUTPUT_DIRECTORY.resolve(strict=True)
    if not resolved_output_directory.is_relative_to(resolved_artifact_root):
        raise RuntimeError("Artifact output escaped the approved directory")

    output_path = resolved_output_directory / "healthcheck.glb"
    if output_path.is_symlink():
        raise RuntimeError("Refusing to overwrite a symlinked artifact")
    return output_path


def create_healthcheck_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.0))

    test_object = bpy.context.active_object
    test_object.name = OBJECT_NAME

    material = bpy.data.materials.new(name=MATERIAL_NAME)
    material.diffuse_color = (0.02, 0.85, 0.72, 1.0)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is not None:
        principled.inputs["Base Color"].default_value = (0.02, 0.85, 0.72, 1.0)
        principled.inputs["Roughness"].default_value = 0.35
        principled.inputs["Metallic"].default_value = 0.15
    test_object.data.materials.append(material)

    bpy.ops.object.select_all(action="DESELECT")
    test_object.select_set(True)
    bpy.context.view_layer.objects.active = test_object
    return test_object


def export_healthcheck(test_object, output_path):
    result = bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_cameras=False,
        export_lights=False,
    )
    if result != {"FINISHED"}:
        raise RuntimeError(f"GLB export failed: {sorted(result)}")

    return {
        "bytes": output_path.stat().st_size,
        "object": test_object.name,
        "ok": True,
        "output": OUTPUT_RELATIVE.as_posix(),
    }


def main():
    output_path = prepare_output_path()
    test_object = create_healthcheck_scene()
    return export_healthcheck(test_object, output_path)


try:
    print(json.dumps(main(), separators=(",", ":"), sort_keys=True))
except Exception as error:
    print(
        json.dumps(
            {"error": type(error).__name__, "ok": False},
            separators=(",", ":"),
            sort_keys=True,
        )
    )
    raise
