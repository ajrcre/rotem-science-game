import os, sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, "/home/user/rotem-science-game/tools")
from generate_assets import GeminiImageClient, ChromaKeyCutout, SPRITE_BG

OUT = Path("art3")
STYLE = ("Hand-drawn 1930s cartoon prop in the style of Cuphead / Fleischer cels: bold slightly wobbly black ink outline, "
         "rich watercolor and gouache texture, imperfect organic hand-painted shapes, faded vintage palette, "
         "realistic details but cartoon drawn. No text, no characters. ")
CHEESE = ("A big wedge of real Swiss / Emmental cheese seen from the side: a chunky triangular wedge, slightly uneven sides, "
          "rind edge a bit darker and waxy, irregular holes of many sizes (some cut open at the edges), subtle cracks, "
          "warm yellow with orange-tinted shadows and creamy highlights, a little sweaty shine. ")
ICE = ("One big real ice cube, slightly irregular and chunky, not a perfect box: clear and cloudy bluish ice, frosty white "
       "inside where air is trapped, a few cracks and bubbles, glossy highlights on the edges, faint cold blue shadow. ")
FIRST = {
  "cheese_0": CHEESE + "Whole, untouched.",
  "ice_0": ICE + "Frozen solid, sharp edges with a little frost.",
}
LATER = {
  "cheese_1": ("cheese_0", CHEESE + "The SAME wedge as the reference image, but with one round bite taken out of the thin pointed end (small tooth marks)."),
  "cheese_2": ("cheese_0", CHEESE + "The SAME wedge as the reference image, but about half of it eaten from the pointed end: big bites with tooth marks, a few crumbs."),
  "cheese_3": ("cheese_0", CHEESE + "The SAME wedge as the reference image, almost all eaten: only a small nibbled chunk of the thick end left with tooth marks and crumbs."),
  "ice_1": ("ice_0", ICE + "The SAME ice cube as the reference image, starting to melt: corners and edges softened and rounded, wet glossy surface, a few water drops running down."),
  "ice_2": ("ice_0", ICE + "The SAME ice cube as the reference image, half melted: a rounded slippery lump, wet and shiny, drops running down, smaller."),
  "ice_3": ("ice_0", ICE + "The SAME ice as the reference image, almost fully melted: a small thin rounded sliver of ice, very wet and glossy."),
}
client = GeminiImageClient(os.environ["GEMINI_API_KEY"])
cut = ChromaKeyCutout()
def make(name, desc, refs):
    out = OUT / f"{name}.png"
    if out.exists(): return name
    img = client.generate(STYLE + desc + " " + SPRITE_BG, "1:1", refs)
    img.convert("RGB").save(OUT / f"{name}_raw.jpg", quality=90)
    cut.process(img).save(out)
    return name
with ThreadPoolExecutor(2) as ex:
    for n in ex.map(lambda it: make(it[0], it[1], []), FIRST.items()): print("done", n, flush=True)
with ThreadPoolExecutor(3) as ex:
    for n in ex.map(lambda it: make(it[0], it[1][1], [OUT / f"{it[1][0]}_raw.jpg"]), LATER.items()): print("done", n, flush=True)
