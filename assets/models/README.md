# Animal Models

Drop GLB files here to replace the procedural meshes automatically.
Any species without a matching file (or whose file 404s) continues to use the
built-in procedural mesh — no error shown to the player.

## Current filename mapping

| Species        | Rarity | File                               | Notes                                    |
|----------------|--------|------------------------------------|------------------------------------------|
| Elephant       | common | `asian_elephant.glb`               |                                          |
| Giraffe        | common | `download_low_poly_giraffe.glb`    |                                          |
| Buffalo        | common | `low_poly_bison.glb`               |                                          |
| Rhino          | common | `low_poly_angry_looking_hippo.glb` |                                          |
| Leopard        | common | `low_poly_gazelle.glb`             |                                          |
| Zebra          | common | `sable_antelope_low_poly.glb`      |                                          |
| Lion           | common | `ibex.glb`                         |                                          |
| Warthog        | common | `low_poly_camel.glb`               |                                          |
| Titan Elephant | rare   | `low_poly_elephant.glb`            | Giant variant — second elephant model    |
| Ghost Rhino    | rare   | `low_poly_angry_looking_hippo.glb` | Same model as Rhino, scaled 1.3× larger  |
| Shadow Lion    | rare   | `8th_dec_reindeer.glb`             | Yes, it's a reindeer. It's funny. Keep it. |

## Scale

Models are auto-scaled to `def.scale × 2.8` on load (up from 2.5 in earlier builds).
Ghost Rhino gets an additional 1.3× on top of that to distinguish the rare giant variant.
To tune per-species, adjust `MODEL_FILES` scale logic in `js/animals.js → placeAnimal()`.

## Diagnostics

On load, each successfully loaded model logs to the browser console:

```
[Model] Elephant: meshes=4, anims=1, bbox=1.23×0.94×0.61
```

This shows mesh count, animation count, and pre-scale bounding box dimensions — useful
for deciding whether to adjust the scale multiplier per species.

## Animation behaviour

- If the GLB contains animation clips, the first clip (`animations[0]`) plays on loop.
  Playback speed scales up automatically when the animal is fleeing.
- If the GLB has no animations, the root mesh bobs vertically using the procedural system.
- Procedural fallback meshes always use the full leg-swing / body-bob system.

## Where to get free GLB models

### Sketchfab
1. Create a free account at sketchfab.com
2. Search for the species name + "low poly" (e.g. "low poly lion")
3. Filter by **Downloadable** and **Free**
4. Download in **glTF** format — this gives you a `.glb` file
5. Rename to match the table above and drop it into this folder

### Poly Pizza (poly.pizza)
Aggregates CC0 low-poly models — no account needed for most models.

### Fab.com (Epic Games)
Free-tier stylized animal packs. Models are in FBX format; convert to GLB via Blender:
File → Import FBX → File → Export → glTF 2.0 (set format to GLB).
