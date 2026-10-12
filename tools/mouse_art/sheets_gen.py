import os, sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, "/home/user/rotem-science-game/tools")
from generate_assets import GeminiImageClient, ChromaKeyCutout
exec(open("style_text.py").read())
K = Path("art2"); OUT = Path("sheets_raw")
BG = (" Flat solid pure magenta (#FF00FF) background, no shadows, no floor, no other objects; "
      "do not use magenta or pink-magenta on the rat except its pink tail, nose and ears.")
JOBS = {
  "run_sheet_a": ([K / "rat_idle_raw.jpg", K / "rat_walk_a_raw.jpg"],
     "An animation SPRITE SHEET: the same rat drawn FOUR times in one horizontal row, evenly spaced, same size, all facing right, "
     "showing a 4-frame running gallop cycle like a real rat: 1) reach: front legs stretched forward, back legs stretched back, body long; "
     "2) contact: front paws planted under the chest, back legs coming forward; 3) gather: all four legs bunched under the belly, back arched in a hump; "
     "4) push-off: back legs pushing behind, front legs lifting, body rising. Same character, colours and line style in every frame. Pink tail in every frame."),
  "run_sheet_b": ([K / "rat_idle_raw.jpg", K / "rat_walk_a_raw.jpg"],
     "An animation SPRITE SHEET: the same rat drawn FOUR times in one horizontal row, evenly spaced, same size, all facing right, "
     "a cartoon 1930s scurry cycle: frame 1 body stretched, legs far apart front and back; frame 2 legs passing under the body; "
     "frame 3 body squashed, legs bunched, back arched; frame 4 legs passing again, body rising. Ears and tail bounce. Same character in every frame."),
  "full_sheet": ([K / "rat_idle_raw.jpg", K / "rat_full_raw.jpg"],
     "An animation SPRITE SHEET: the same rat drawn TWO times side by side, same size: lying on its BACK after a huge meal, big round cream belly "
     "pointing up, its four short rat legs sticking straight UP into the air with little rat paws (NOT hands, NOT touching the belly), head on the floor "
     "turned toward us with a dizzy happy smile and tongue out. Frame 1 belly big (breathing in), frame 2 belly a bit smaller (breathing out) with eyes closed."),
  "eat_sheet": ([K / "rat_idle_raw.jpg", K / "rat_eat_raw.jpg"],
     "An animation SPRITE SHEET: the same rat drawn THREE times in one row, same size, standing on all four legs facing right, eating: "
     "1) mouth wide open biting a small piece of yellow Swiss cheese; 2) chewing with mouth open, cheeks stuffed round, crumbs flying; "
     "3) chewing with mouth closed, cheeks puffed, eyes closed in bliss. Exactly one PINK tail on each rat."),
}
client = GeminiImageClient(os.environ["GEMINI_API_KEY"])
def make(item):
    name, (refs, desc) = item
    out = OUT / f"{name}.jpg"
    if out.exists(): return name
    client.generate(STYLE + desc + BG, "16:9", refs).convert("RGB").save(out, quality=92)
    return name
with ThreadPoolExecutor(4) as ex:
    for n in ex.map(make, JOBS.items()): print("done", n, flush=True)
