# Art for the Chemistry corner (the rat and the cheese)

The scripts that made the approved art, kept so it can be regenerated or extended.
They run from a scratch work directory (paths are relative), with `GEMINI_API_KEY` set,
and reuse `GeminiImageClient`, `ChromaKeyCutout` and `PoseAligner` from `tools/generate_assets.py`.

| Script | Makes |
|---|---|
| `art3.py` | painted cheese (4 bite stages) and ice cube (4 melt stages) |
| `art2.py` | the rat's key poses, from the chosen concept (`docs/mouse_game/rat_reference.webp` as `rat3_3.jpg`) |
| `frames.py` | single animation frames (idle, scared, sad) from the key poses |
| `sheets_gen.py`, `full2.py` | run / eat / full-belly frames drawn as one strip (more consistent than single frames) |
| `split.py` | cuts a magenta strip into frames (each rat keeps only its own pixels) |
| `previews2.py` | aligns every frame to `idle_1`, writes contact sheets and looping GIF previews for approval |

Approved results live in `assets/art/frames/rat/` and `assets/art/machine/`; run `tools/optimize_images.py` after any change.
Every picture is approved by the user before it goes into the game.
