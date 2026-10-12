import os, sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, "/home/user/rotem-science-game/tools")
from generate_assets import GeminiImageClient, ChromaKeyCutout, SPRITE_BG

OUT = Path("art2")
REFS = [Path("rat3_3.jpg"), Path("art/rat_sad_raw.jpg")]
STYLE = ("Draw exactly ONE rat: the SAME character as in the two reference images. Copy its design exactly: "
         "light warm-grey scruffy fur, cream belly and chest, PINK segmented tail, pink nose, pink inner ears, rosy cheeks, "
         "two white buck teeth, big black pie-cut eyes, thick bold black ink outlines, flat cel colors with soft watercolor shading, "
         "1930s Fleischer / Cuphead cartoon style, same line weight and proportions. "
         "It is a real rat: four short legs with small rat paws, NO hands, NO fingers, NO gloves, NO clothes, not humanoid. "
         "Side view, facing right. No text. ")
RAT = {
  "rat_idle":   "Standing calmly on all four legs, nose raised sniffing the air, eyes half closed in delight, whiskers twitching.",
  "rat_walk_a": "Running to the right in a fast scurry: front legs stretched far forward, back legs stretched far back, body long and low, ears swept back, happy determined face.",
  "rat_walk_b": "Running to the right, mid-stride: all four little legs gathered together under the body, back arched up in a hump, tail streaming behind.",
  "rat_scared": "Startled: grey fur puffed out in spikes, eyes huge and round, mouth open in a gasp, tail stiff, standing on all four legs leaning backward.",
  "rat_eat":    "Eating cheese happily: crouched on all four legs, cheeks stuffed round and full, munching with its buck teeth, eyes closed in bliss, a few yellow crumbs flying.",
  "rat_full":   "Stuffed after a big meal: flopped down on its side on the floor, round bulging belly, four short legs sticking out, tail curled, dizzy happy smile with tongue out.",
}
client = GeminiImageClient(os.environ["GEMINI_API_KEY"])
cut = ChromaKeyCutout()
def make(item):
    name, desc = item
    out = OUT / f"{name}.png"
    if out.exists(): return name
    img = client.generate(STYLE + desc + " " + SPRITE_BG, "1:1", REFS)
    img.convert("RGB").save(OUT / f"{name}_raw.jpg", quality=90)
    cut.process(img).save(out)
    return name
with ThreadPoolExecutor(3) as ex:
    for n in ex.map(make, RAT.items()): print("done", n, flush=True)
