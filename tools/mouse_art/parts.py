"""Painted machine parts for the Chemistry corner, in the style of the approved cheese and ice.

Run from a work dir that holds art3/cheese_0_raw.jpg and art3/ice_0_raw.jpg (the style references).
Writes parts_raw/<name>.jpg on magenta; split.py / ChromaKeyCutout turn them into sprites.
"""
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from generate_assets import GeminiImageClient  # noqa: E402

OUT = Path("parts_raw")
REFS = [Path("art3/cheese_0_raw.jpg"), Path("art3/ice_0_raw.jpg")]
STYLE = ("A hand-painted 1930s cartoon prop in EXACTLY the same style as the reference images: bold slightly wobbly black ink "
         "outline, rich watercolor and gouache texture, imperfect organic hand-painted shapes, realistic material detail "
         "(scratches, wear, grain, shine) but drawn like a vintage Fleischer / Cuphead background prop, faded warm palette. "
         "Plain side view unless told otherwise. No text, no characters, no hands. "
         "Flat solid pure magenta (#FF00FF) background, no shadow, no floor, nothing else in the picture; "
         "never use magenta or pink on the object. ")
STRIP = "Several separate pieces side by side in one row, evenly spaced with clear magenta gaps, same scale, not touching: "
PARTS = {
    "candle": "A short thick white wax candle with a few wax drips, UNLIT, black wick with no flame, standing in a small round brass candle-holder dish with a finger loop.",
    "flames": STRIP + "THREE candle flames only (no candle, no wick): teardrop flames with an orange-red rim, yellow body and a pale white-yellow core, each slightly different (leaning left, upright, leaning right), like frames of a flicker.",
    "fan": STRIP + "TWO pieces of the same 1930s brass desk fan, front view, same scale. LEFT: the fan WITHOUT its blades: round brass wire cage, central motor hub, stand and round heavy base. RIGHT: ONLY the fan's three-blade brass propeller rotor, front view.",
    "icepack": "A light-blue rubber ice-pack bag with a metal screw cap, a bit lumpy, frosty white patches, front view.",
    "tray": "A long thin tin sheet-metal drip tray seen exactly from the side, perfectly horizontal, about eight times longer than it is tall, a small raised rim at both ends, a few rivets, scratches and shine.",
    "board": "A long THIN wooden lath / plank seen exactly from the side (only its thin edge), perfectly horizontal, about TEN times longer than it is tall, like a ruler, visible wood grain and a dark knot, rough sawn ends.",
    "sponge": STRIP + "TWO kitchen sponges of the same shape, side view. LEFT: dry, bright yellow with holes. RIGHT: the same sponge soaked with water: darker ochre, glistening wet, drops dripping from its bottom.",
    "metal": "A heavy old cast-iron scale weight, dark grey, trapezoid shape with a thick ring handle on top, scuffed edges.",
    "cotton": "A single fluffy ball of white cotton wool, soft wispy edges.",
    "feather": "A single light white feather with a curved quill, soft barbs, lying diagonally.",
    "sieve": "A wide shallow round metal sieve pan seen from the side: a shallow tin dish with rows of small holes in its bottom and a rolled rim, two small hanging rings on the rim. About four times wider than tall.",
    "pan": "A wide shallow round brass balance-scale pan seen from the side: a shallow polished brass dish with a rolled rim and two small hanging rings on the rim. About four times wider than tall.",
    "scale": STRIP + "TWO pieces of the same vintage brass balance scale. LEFT: only the stand: a round heavy base and a tall straight vertical post with a round pivot knob at the top, NO beam. RIGHT: only the long straight horizontal brass beam, much wider than tall, with a pivot hole in the middle and small rings at both ends.",
    "bucket": "A small old tin bucket seen from the front, slightly dented, with a wire handle standing up, the open top rim drawn as a thin ellipse, empty.",
    "plank": "A long narrow wooden drawbridge plank seen from the side, perfectly horizontal, about ten times longer than it is tall, with two dark iron bands and rivets.",
    "pulley": "A small iron pulley wheel with a groove and spokes, hanging from a short iron bracket, front view.",
    "rope": "A straight piece of thick twisted hemp rope, perfectly horizontal, seen from the side, about twenty times longer than it is thick, clear twisted strands, frayed fibres, warm tan colour.",
    "hinge": "A small black iron strap hinge with a round knuckle and two big rivets, front view, slightly rusty.",
    "fly": STRIP + "TWO frames of the same small cartoon housefly seen from the side, flying to the right: dark round body, big red-brown eyes, thin legs, translucent veined wings. LEFT: wings raised up. RIGHT: wings pushed down.",
    "stink": STRIP + "THREE separate wavy curls of cartoon stink smell, each a tall vertical squiggly ribbon of sickly yellow-green vapour with a darker green ink outline, slightly different shapes, like a 1930s cartoon smell line.",
    "drop": "A single clear water droplet, teardrop shape pointing up, pale blue with a bright white highlight and a thin dark ink outline.",
    "shelf": "A long wooden wall shelf seen EXACTLY from the front, perfectly straight and level, NO perspective, top surface not visible: a thick horizontal board about eight times longer than tall, with two carved wooden support brackets underneath near its ends, mirror-symmetric.",
}
ASPECT = {"rope": "16:9", "fly": "16:9", "stink": "16:9", "flames": "16:9", "fan": "16:9", "sponge": "16:9", "scale": "16:9", "tray": "16:9", "board": "16:9",
          "plank": "16:9", "shelf": "16:9", "sieve": "16:9", "pan": "16:9"}


def main() -> None:
    OUT.mkdir(exist_ok=True)
    client = GeminiImageClient(os.environ["GEMINI_API_KEY"])
    names = sys.argv[1:] or list(PARTS)

    def make(name: str) -> str:
        out = OUT / f"{name}.jpg"
        if not out.exists():
            client.generate(STYLE + PARTS[name], ASPECT.get(name, "1:1"), REFS).convert("RGB").save(out, quality=92)
        return name

    with ThreadPoolExecutor(4) as ex:
        for n in ex.map(make, names):
            print("done", n, flush=True)


if __name__ == "__main__":
    main()
