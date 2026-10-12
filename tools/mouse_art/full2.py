import os, sys
from pathlib import Path
sys.path.insert(0, "/home/user/rotem-science-game/tools")
from generate_assets import GeminiImageClient
exec(open("style_text.py").read())
K = Path("art2")
BG = (" Flat solid pure magenta (#FF00FF) background, no shadows, no floor, no other objects.")
desc = ("An animation SPRITE SHEET: the same rat drawn TWO times side by side, same size, both in side view: the rat has eaten too much and "
        "has flopped down lying on its SIDE on the floor, a big round bulging cream belly, its four short legs sticking out sideways "
        "(small rat feet, no hands, nothing held), tail lying on the floor, head resting on the floor with a dizzy happy smile and tongue out. "
        "Frame 1: belly big (breathing in). Frame 2: belly a little smaller (breathing out), eyes closed contentedly.")
c = GeminiImageClient(os.environ["GEMINI_API_KEY"])
for n in ("full_sheet2", "full_sheet3"):
    c.generate(STYLE + desc + BG, "16:9", [K / "rat_idle_raw.jpg"]).convert("RGB").save(f"sheets_raw/{n}.jpg", quality=92)
    print("done", n, flush=True)
