import os, sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, "/home/user/rotem-science-game/tools")
from generate_assets import GeminiImageClient, ChromaKeyCutout, SPRITE_BG

K = Path("art2")          # approved round-2 key poses
OUT = Path("frames")
STYLE = ("Draw exactly ONE rat: the SAME character as in the reference images. Copy its design exactly: "
         "light warm-grey scruffy fur, cream belly and chest, PINK segmented tail, PINK nose, pink inner ears, rosy cheeks, "
         "two white buck teeth, big black pie-cut eyes, thick bold black ink outlines, flat cel colors with soft watercolor shading, "
         "1930s Fleischer / Cuphead cartoon style, same line weight, size and proportions as the reference. "
         "A real rat: four short legs with small rat paws, NO hands, NO fingers, NO gloves, NO clothes, exactly ONE tail. "
         "Side view, facing right. This is one frame of a hand-drawn animation, so keep everything identical to the "
         "reference except what is described. No text. ")
F = {
  # pose_frame: (key pose reference, what changes)
  "idle_1": ("rat_idle", "Standing on all four legs, nose raised sniffing the air, eyes half closed, exactly like the reference."),
  "idle_2": ("rat_idle", "Same standing pose, but the eyes are fully closed in a blink and the nose dips slightly lower."),
  "idle_3": ("rat_idle", "Same standing pose, nose pointed higher and wrinkled mid-sniff, whiskers fanned out, ears perked forward, eyes open."),
  "run_1": ("rat_walk_a", "Run cycle, REACH: front legs stretched far forward, back legs stretched far back, body long and low."),
  "run_2": ("rat_walk_a", "Run cycle, LAND: front paws touching the ground under the chin, back legs still behind, body slightly arched."),
  "run_3": ("rat_walk_b", "Run cycle, GATHER: all four legs bunched together under the belly, back arched up high in a hump, tail streaming behind. Pink tail and pink nose."),
  "run_4": ("rat_walk_b", "Run cycle, PUSH: back legs pushing off the ground behind, front legs lifting forward, body rising."),
  "run_5": ("rat_walk_a", "Run cycle, AIRBORNE: all four paws off the ground, legs tucked, body stretched in a leap, ears flapping back."),
  "run_6": ("rat_walk_b", "Run cycle, second GATHER: legs bunched under the body like a spring, back arched, the other front paw forward. Pink tail and pink nose."),
  "scared_1": ("rat_scared", "Startled jump: all four legs off the ground, fur puffed out in spikes, eyes huge, tail straight up."),
  "scared_2": ("rat_scared", "Shivering in fright on all four legs, fur puffed out in spikes, eyes huge, teeth chattering, little shake lines."),
  "sad_1": ("rat_sad", "Sad slump exactly like the reference: ears drooping, head down, tail limp."),
  "sad_2": ("rat_sad", "Same sad slump but sighing: eyes closed, shoulders sunk even lower, head hanging lower, a tiny sigh puff from the nose."),
  "eat_1": ("rat_eat", "Taking a bite of a small piece of yellow Swiss cheese held in its mouth, mouth wide open, eyes closed in bliss. Exactly one tail."),
  "eat_2": ("rat_eat", "Chewing with mouth open, cheeks stuffed round, a few yellow crumbs flying, eyes closed happily. Exactly one tail."),
  "eat_3": ("rat_eat", "Chewing with mouth closed, cheeks puffed out round and full, eyes closed blissfully, no cheese in sight. Exactly one tail."),
  "full_1": ("rat_full", "Flopped on its back with a big round belly up, four short rat legs sticking up in the air (rat paws, not hands, NOT holding the belly), tongue out, dizzy smile."),
  "full_2": ("rat_full", "Same flop on its back, the round belly slightly lower as it breathes out, eyes closed contentedly, four short rat legs relaxed (not hands)."),
}
client = GeminiImageClient(os.environ["GEMINI_API_KEY"])
cut = ChromaKeyCutout()
def make(item):
    name, (key, desc) = item
    out = OUT / f"{name}.png"
    if out.exists(): return name
    refs = [K / f"{key}_raw.jpg", K / "rat_idle_raw.jpg"] if key != "rat_idle" else [K / "rat_idle_raw.jpg"]
    img = client.generate(STYLE + desc + " " + SPRITE_BG, "1:1", refs)
    img.convert("RGB").save(OUT / f"{name}_raw.jpg", quality=90)
    cut.process(img).save(out)
    return name
with ThreadPoolExecutor(4) as ex:
    for n in ex.map(make, F.items()): print("done", n, flush=True)
