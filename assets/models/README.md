# Animal Models

Drop GLB files here to replace the procedural meshes automatically.
Any species without a matching file continues to use the built-in procedural mesh — no errors shown.
Rare variants (Ghost Rhino, Shadow Lion, Titan Elephant) always use procedural geometry.

## Required filenames

| Species  | File           |
|----------|----------------|
| Lion     | `lion.glb`     |
| Elephant | `elephant.glb` |
| Rhino    | `rhino.glb`    |
| Buffalo  | `buffalo.glb`  |
| Leopard  | `leopard.glb`  |
| Giraffe  | `giraffe.glb`  |
| Zebra    | `zebra.glb`    |
| Warthog  | `warthog.glb`  |

You don't need all eight — drop in whichever you have and the rest stay procedural.

## Where to get free GLB models

### Sketchfab (best selection)
1. Create a free account at sketchfab.com
2. Search for the species name + "low poly" (e.g. "low poly lion")
3. Filter by **Downloadable** and **Free**
4. Download in **glTF** format — this gives you a `.glb` file
5. Rename to match the table above

Good search terms: `"low poly lion glb"`, `"stylized elephant free"`, `"african animals low poly"`

### Poly Pizza (poly.pizza)
Aggregates CC0 low-poly models from multiple sources.
Search each species name and download the GLB directly — no account needed for most models.

### Fab.com (Epic Games)
Has stylized animal packs in the free tier.
Models are in FBX format so you'll need to convert to GLB via Blender:
File → Import FBX → File → Export → glTF 2.0 (set format to GLB).

## Notes on scale
Models are auto-scaled to `def.scale × 2.5` on load, so exact source scale doesn't matter.
If a model appears too large or small after dropping it in, adjust the multiplier in
`js/animals.js` → `placeAnimal()` → `mesh.scale.setScalar(def.scale * 2.5)`.

## Notes on animations
The loader plays the first animation clip found in the GLB (`animations[0]`).
Most downloaded models include a walk or idle cycle as the first clip, which works well.
Animation playback speed scales up automatically when an animal is fleeing.
