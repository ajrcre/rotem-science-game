# Plan: "The Mouse's Machine" – a one-screen prototype for the Chemistry corner

## Context
The lab has one finished game (Energy corner). The user wants a second game in the spirit of *The Incredible Machine*, but simpler: a lab mouse has to reach the cheese, and the kid places objects that use properties of matter (melting, mass, later steam, floating, friction) to open the way. Professor Madani gives hints and explains both success and failure, like in the first game. We start with **one playable screen** to test the fun before making more levels. It lives in the existing "coming soon" **Chemistry corner**. When the machine is wrong, it **still runs and fails visibly**, and then the professor explains.

## The prototype puzzle (one screen)
- **Scene:** The mouse is on a ledge on the right (RTL) and the cheese is on a ledge on the left. Between them is a gap with a **raised drawbridge**. A rope ties the bridge to the **right pan of a balance scale**.
- **Left pan:** a sieve pan with holes holding a big **ice cube**. Melted water drips through into a bucket on the floor. This matters because melting alone does not change mass. The water has to leave the pan for that side to get lighter, and the professor says so.
- **Two empty slots** (click to pick, like the Energy game's cards):
  1. **Under the ice:** candle ✓, fan ✗, snowflake/ice pack ✗
  2. **Right pan:** metal block ✓, cotton ball ✗, feather ✗
  3. **Between the candle and the sieve:** slanted metal drip tray ✓, wooden board ✗, sponge ✗ (see "Water vs. fire" below)
- **Pull the lever.** The simulation computes the outcome from numbers, so every combination plays out naturally:
  - **Candle + metal:** the ice melts, the water drips away, the metal pan drops, the bridge lowers, and the mouse runs over and eats the cheese.
  - **Fan:** the ice doesn't melt and nothing tips. *"Wind moves air but doesn't heat it."*
  - **No melt + metal:** the ice is heavier and the scale stays put.
  - **Candle + cotton:** the ice melts and the pan dips a little, but the bridge stays up. *"Cotton is very light. Mass!"*
- **Scoring:** stars are 3 minus failed runs (never below 1). The professor gives a hint after 2 failures, and the victory summary says what we learned.

## Roadmap: 6 levels in total (build level 1 now, the rest after the prototype feels fun)
1. **Melting + mass** (the prototype above): candle melts ice off the scale, metal tips it, the bridge drops.
2. **Mass and density:** a seesaw bridge. A metal cube and a cotton cube of the same size don't weigh the same, and a sponge that soaks up water gets heavier.
3. **Boiling → gas:** a kettle on a burner fills a balloon with steam, and the balloon lifts the mouse's elevator. The wrong choice is a candle that is too weak, or a cold kettle.
4. **Floating:** fill a tank, and a wooden raft floats the mouse up to a ledge. A stone sinks, and ice floats.
5. **Friction:** the mouse slides down in a cart, and the ramp surface decides where it stops. Ice overshoots, sandpaper stops too early, and wood is just right.
6. **Grand finale:** a combo machine that uses melting, boiling, mass and friction together.

Each new level adds data in `mouse_levels.js` plus a few new `Part` subclasses (Kettle, Balloon, Tank/Raft, Ramp, Sponge). The engine, UI, voice and test pipeline stay the same. A level map and quizzes, like the Energy game's `LevelMap` and `Quiz`, come in when there are at least 3 levels.

## Engine design (plain JS, no physics engine, DOM-free core)
- **`game/machine.js`**
  - **`Part` base class** with subclasses `Ice`, `Candle`, `Fan`, `Weight`, `Scale`, `Bridge`, `Mouse`. Each part holds a small state (temperature, mass, state of matter, tilt) and reacts to events.
  - **`Simulator`:** a deterministic tick loop with a pub/sub event bus (Observer pattern). Parts emit events such as `heat`, `melted`, `massChanged`, `tilted` and `bridgeDown`. The output is a **timeline of events**, with no DOM involved.
  - **`MachineView`:** replays that timeline as CSS and sprite tweens.
  - **`MachineGame`:**
    - Handles slots and inventory, reusing the pick / fly-to-slot style of `Workbench` in `game.js`.
    - Uses the `Lever` class from `game.js` as is.
    - Shows the professor's lines as text in a typewriter speech bubble, like `Workbench.say`. Narration audio comes in phase 2, keyed by the same line keys.
    - Uses the existing `run` counter idiom to cancel stale steps.
  - Outcome explanations are chosen by the **first broken link** in the chain (no heat → ice too heavy → pan too light). That gives one clear sentence per failure.
- **`game/mouse_levels.js`:** declarative data, kept as node-readable globals in the same way as `levels.js`.
  - `PARTS` maps a part to `{label, mass, fact}`.
  - `MOUSE_LEVELS[0]` has `{scene parts + positions, slots:[{id, accepts}], intro, hints, outcomes:{key: lineKey}, summary}`.
  - Adding more levels later is data plus new `Part` subclasses (steam/balloon, float, friction).

## Screen mockup
A Gemini concept image of level 1 is at `docs/mouse_game/mockup.webp`. It shows:
- The professor and his speech bubble at top left, and the cheese on its ledge.
- The raised bridge, tied by a rope over a pulley to the scale.
- The ice in the sieve pan, with a bucket below it.
- Two dashed "?" slots. The right slot belongs on the right pan; the image puts it on the floor.
- The mouse on the right ledge.
- A tray of 6 item cards along the bottom, and the lever at bottom right.

## Water vs. fire: a puzzle twist in level 1
If the candle sits right under the sieve, the meltwater drips onto it and **puts the flame out** (the flame shrinks, a smoke puff rises, and the ice is left half-melted). This is a funny, visible failure. The professor explains: "water takes the heat away from the flame."
- **The fix:** a third slot between the candle and the sieve takes a **slanted metal drip tray**. Metal lets the heat through, and the water slides off into the bucket.
- **Distractors for that slot:** a wooden board (it blocks the heat, so the ice doesn't melt) and a sponge (it soaks up water for a while, then drips anyway).
- **It is easy to build:** the simulator only checks whether a drip lands on a lit flame, so it stays one extra rule. Level 1 then teaches melting, mass and that water puts out fire.

## The background
The background is a new painting of the professor's lab, made for this game: a corner of the lab with a workbench and shelves, flasks, pipes and gears, and the 1930s look of the existing art. It must not be the Energy game's workbench view. The puzzle parts are separate sprites on top of it, so the background has to be clear in the middle and at the ledge heights.

## The rat (chosen)
The user picked the **scruffy grey rat in Cuphead style** (`docs/mouse_game/rat_concept.webp`; the reference image is `docs/mouse_game/rat_reference.webp`).
- **Body:** a real rat on four legs, not humanoid, with no gloves and no clothes. Chubby, with tufty grey fur and a cream belly.
- **Face:** big pie-cut eyes, rosy cheeks, a pink nose, buck teeth, and a long curly pink tail.
- **Reference:** The reference image gets copied in as the reference image for every pose, the same way `professor` is used in `generate_assets.py`.

The poses, each shown to the user for approval before use:
- idle sniffing
- a walk/scurry cycle
- standing on its hind legs to look (still rat-like)
- a scared puff
- a sad slump when a run fails
- eating
- a full-belly flop

## Level complete animation
1. The bridge thuds down, and the rat scurries across with a few dust puffs.
2. Green **stink lines** have been wavering up from the cheese all through the level, as a sine-wave SVG path animation with a few flies circling. The rat sniffs and its nose twitches as it follows the smell.
3. It nibbles: crumbs burst out, and the cheese sprite shrinks through 3 bite stages.
4. It ends with the full-belly flop and a small burp bubble. Stars appear, then the professor's summary.

## Graphics approval gate
Every piece of art gets a sheet like the rat sheet, and the user approves it before it goes into the game:
- the rat
- the background
- the parts (candle, ice melt stages, sieve, bucket, scale, bridge, cards, drip tray)
- the cheese with its bite stages

Generation goes through `tools/generate_assets.py`. Nothing goes into `assets/` until it is approved.

## How things animate (no physics engine)
Each part is a separate cut-out sprite layered over a painted background, the same way the lab hub works. Motion is scripted tweens driven by the simulator's timeline.
- **Fire:** the candle flame is a separate sprite with a CSS flicker (scale, skew and opacity wobble at random speed) and a soft radial glow. When it heats the ice, `fx.js` canvas particles add a heat shimmer and a few sparks, reusing `WeaponFX`'s `burst()` and the `fire` tint.
- **Candle flame (detail):** a 3-frame hand-drawn flame loop with a random flicker on top, so it never looks mechanical, plus a pulsing warm glow on the ice. A wavy heat-haze distortion rises above the flame as an SVG turbulence filter. When it goes out, the flame shrinks and a grey smoke curl rises.
- **Melting ice (detail):**
  - 4 drawn melt stages: a sharp cube, softened corners, a rounded lump, a sliver.
  - Each stage crossfades into the next while the ice sinks a little.
  - A moving shiny highlight shows it is wet.
  - Sweat beads appear and run down its sides.
  - A thin puddle shimmers in the sieve under it.
- **Water drops (detail):**
  - Each drop is drawn on a canvas as a teardrop. It swells at a sieve hole, stretches, then lets go.
  - It falls with real gravity (it speeds up) and stretches a little as it falls.
  - It hits the bucket with a small splash and rings.
  - Drops come slowly at first and speed up as the melt goes on.
  - Inside the bucket, the water layer rises with a small wobbling wave.
  - The same drop system decides whether a drop hits the candle flame.
- **Scale and bridge:** CSS rotation around a pivot with an overshoot-and-settle ease. The pans stay level by counter-rotating. The rope is an SVG line whose ends follow the pan and the bridge tip, and the bridge rotates around its hinge.
- **Mouse:** pose frames (idle, walk cycle, shrug, cheer, eat) like the professor's frames, with walking done by `translateX`.
- **Later levels:** steam puffs are canvas particles with a white tint that rise and grow; a balloon inflates with a CSS scale on an ease curve; floating uses the same water-level layer plus a bobbing tween.

## Wiring into the lab
- **`game/lab.js`**
  - In `LAB_CORNERS`, the chemistry entry gets `open: "chemistry", game: "<name>"`.
  - Add `Screens.states.chemistry` with `{music, enter, leave}`, mirroring `energy`.
- **`game/index.html`:** add `<section id="chemistry">` and a `<script>` tag for both new files, loaded after `game.js` so they can reuse `Lever`.
- **`game/style.css`:** scene, slot and part styles in the existing look.
- **Progress:** stored under its own localStorage key, `mouse-machine-progress-v1`, through a small `Progress`-like object.

## Assets
- **`tools/generate_assets.py`:** add the mouse sprite with poses (idle, walk, scared, shrug, happy, eat) and the parts (candle, fan, ice, sieve pan + bucket, scale, bridge, metal block, cotton, feather, cheese, background). Then run `tools/optimize_images.py` and commit `assets/web/`.
- **Placeholder fallback:** until the art is generated, simple placeholder shapes keep the prototype playable.

## Tests (pytest)
- **`tests/test_mouse_machine.py`:** runs the DOM-free `Simulator` through node via subprocess, like the existing voice tests do with node (skipped if node is missing). It checks every slot combination and asserts the outcome key, so only candle + metal wins.

## Phase 2 (not in this plan): sound
Sound effects (drip plink, flame hiss, creak, bridge thud, squeak, munch), the professor's narration through `Narrator`, `generate_voice.py` and `Sfx.names`, and background music. Line keys and timeline events are named now so sound can be hooked onto them later. For now the screen keeps the lab's current music state and adds no new audio.

## Verification
1. Run `python3 -m pytest` from the repo root.
2. Run `python3 -m http.server 8000`, open `/game/#lab`, and click the Chemistry corner. Play every wrong combination: each one should fail visibly and get the right explanation, with a hint after 2 fails. Then play the right combination: the mouse should reach the cheese and the summary and stars should be saved.
3. Check at phone width in landscape using Playwright/Chromium screenshots.
4. Commit and push to `claude/physics-puzzle-game-plan-ip0ceq`.
