# Model Pipeline: `cat.glb`

This document records how `src/assets/models/cat.glb` was produced so the
pipeline is reproducible and the rig facts are known to future editors.

## Source

- Authoring format: FBX (`*.fbx`, Blender exports).
- Input file: `luna/source/9409f7dcb2ba4d02be17641635224200.fbx.fbx`
  (uncommitted scratch copy under `luna/`).

## Conversion

FBX2glTF v0.9.7 (Linux binary) was used because assimp's GLB export produced
no animation data and left uncompressed external TGA texture paths.

```bash
# Convert with baked 60 fps animation, GL coordinates + PBR metallic-roughness
FBX2glTF --anim-framerate bake60 --flip-v --pbr-metallic-roughness \
  --input luna/source/9409f7dcb2ba4d02be17641635224200.fbx.fbx \
  --output out/cat.glb
```

FBX2glTF could not resolve the source textures: the FBX stores absolute
Windows paths (e.g. `C:\Users\...\aomapbody COLORED.tga`) and FBX2glTF does not
rewrite them, even when the files are placed next to the FBX. It embedded a
1×1 placeholder image instead and logged:

```
Warning: could not find a image file for texture: Texture.
Warning: Couldn't open file , skipping file.
```

## Texture patch

A small Python/PIL post-process fixed the placeholder by rewriting the GLB:

- Appends the real base-color PNG (1024×1024) and spec/roughness PNG (512×512)
  as embedded `image/png` buffer views.
- Sets the material to `pbrMetallicRoughness` with:
  - `baseColorTexture`   → index 0
  - `metallicRoughnessTexture` → index 1
  - `metallicFactor = 1.0`, `roughnessFactor = 1.0`

The equivalent patching logic (kept for reference):

```python
import json, struct, zlib
from PIL import Image

def patch_glb(src: str, dst: str, base_png: str, spec_png: str) -> None:
    with open(src, "rb") as f:
        data = f.read()
    magic, version, length = struct.unpack_from("<III", data, 0)
    json_len = struct.unpack_from("<I", data, 12)[0]
    json_start = 20
    json_end = json_start + json_len
    gltf = json.loads(data[json_start:json_end])
    bin_start = json_end + 8  # skip BIN chunk header (chunkLength + 'BIN\0')

    def add_image(path: str) -> int:
        blob = Image.open(path)
        with open(path, "rb") as f:
            png = f.read()
        view = gltf["bufferViews"][-1]
        offset = (view.get("byteOffset", 0) + view["byteLength"])
        # align to 4 bytes
        offset = (offset + 3) & ~3
        buffer_views = gltf["bufferViews"]
        buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(png)})
        images = gltf.get("images", [])
        images.append({"bufferView": len(buffer_views) - 1, "mimeType": "image/png"})
        gltf["images"] = images
        # pad buffer with png bytes
        gltf["buffers"][0]["byteLength"] = offset + len(png)
        padded = png + b"\x00" * ((4 - len(png) % 4) % 4)
        blob_bytes[0].extend(padded)
        return len(images) - 1

    blob_bytes = [bytearray(data[bin_start:bin_start + gltf["buffers"][0]["byteLength"]])]

    base_idx = add_image(base_png)
    spec_idx = add_image(spec_png)

    for mat in gltf.get("materials", []):
        if "pbrMetallicRoughness" in mat:
            mat["pbrMetallicRoughness"]["baseColorTexture"] = {"index": base_idx}
            mat["pbrMetallicRoughness"]["metallicRoughnessTexture"] = {"index": spec_idx}

    # Reassemble GLB (this is a reference sketch; production script aligned offsets).
    ...
```

## Resulting asset facts

- `src/assets/models/cat.glb` ≈ 993 KB, embedded textures, single `image/png`
  pair, one skin, one skinned mesh (4780 vertices).
- 67 nodes. Mesh owner: node `6 RootNode`. Skeleton root: node `1 Armature`.
- Exactly **one** animation clip: `Armature|ArmatureAction` (47 frames, baked
  at 60 fps).
- 19 animated channel targets (all bones; **the scene/skeleton root is not
  animated**, so `transformToUnitCube` on the root is safe):
  `Bone.023` (translation), `Bone.024/025/026/028/029/030`, `Bone.008`,
  `tailik Bone` (translation), `Bone.004`, `Bone.011`, `Bone.014`,
  `neck bone ik` (translation), `Bone.016/017/018`, `Bone.020/021/022`.

## Bone map (used by `TalkingCat.tsx`)

Candidates are matched by name (first hit wins); unmatched roles degrade
gracefully to no-ops (`-1`):

| Role | Candidates (first match used) |
|------|-------------------------------|
| head | `neck bone ik`, `Bone.009`, `Bone.008`, `Bone.006` |
| tail | `tailik Bone`, `Bone.018`, `Bone.017`, `Bone.016` |
| earL | `earL ik`, `Earik R..001` |
| earR | `Earik R.`, `Earik R..001` |
| jaw  | `jaw`, `Jaw`, `mouth`, `Bone.031`, `Bone.007` (absent → no-op) |
| eyeL | `eyeL`, `eye_l`, `Eye.L` (absent → no-op) |
| eyeR | `eyeR`, `eye_r`, `Eye.R` (absent → no-op) |

The current rig has **no jaw or eyelid bones**, so lip-sync (jaw) and blink
intents are no-ops visually. A rigged replacement model with `jaw`, `eyeL`,
`eyeR` (or equivalently named) bones will light these up without code changes.

## Adding gesture/idle clips

The asset ships a single baked idle clip. Future gesture clips (`idle.glb`,
`talk.glb`, `wave.glb`, …) can be added as separate files and blended with the
`Animator`'s `transitionDuration`/`applyCrossFade`; `TalkingCat.tsx` already
isolates the clip selection (prefers a clip whose name contains
`idle`/`breath`/`armature`).
