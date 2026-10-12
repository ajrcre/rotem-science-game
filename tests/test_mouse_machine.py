"""The rat-and-cheese machine (game/machine_sim.js): every slot combination, run in node."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

GAME = Path(__file__).resolve().parent.parent / "game"
needs_node = pytest.mark.skipif(shutil.which("node") is None, reason="node is needed to run machine_sim.js")

# Runs every combination of the level's slots (each slot: empty or one of its parts) and reports a summary.
RUN_ALL = """
const vm = require('vm'); const fs = require('fs'); const ctx = {};
const src = process.argv.slice(1).map((f) => fs.readFileSync(f, 'utf8')).join(';\\n');
vm.runInNewContext(src + ';this.api = {runMachine, MOUSE_LEVELS, PARTS};', ctx);
const {runMachine, MOUSE_LEVELS, PARTS} = ctx.api;
const level = MOUSE_LEVELS[0];
const options = (slot) => [null, ...Object.keys(PARTS).filter((k) => PARTS[k].slot === slot)];
const runs = [];
const combos = level.slots.reduce((acc, slot) => acc.flatMap((c) => options(slot).map((k) => ({...c, [slot]: k}))), [{}]);
for (const placed of combos) {
  const r = runMachine(level, placed);
  const last = r.frames[r.frames.length - 1];
  const drops = r.events.filter((e) => e.type === 'drop');
  runs.push({placed, outcome: r.outcome, frames: r.frames.length, duration: last.t, ice: last.ice,
             bridge: last.bridge, lit: last.lit, bucket: last.bucket,
             to: [...new Set(drops.map((d) => d.to))].sort(), types: [...new Set(r.events.map((e) => e.type))].sort()});
}
process.stdout.write(JSON.stringify({level, parts: PARTS, runs}));
"""


@pytest.fixture(scope="module")
def machine() -> dict:
    files = [GAME / "mouse_levels.js", GAME / "machine_sim.js"]
    out = subprocess.run(["node", "-e", RUN_ALL, *map(str, files)], check=True, capture_output=True, text=True)
    return json.loads(out.stdout)


def run_for(machine: dict, heat, guard, weight) -> dict:
    want = {"heat": heat, "guard": guard, "weight": weight}
    return next(r for r in machine["runs"] if r["placed"] == want)


@needs_node
def test_every_combination_is_run(machine):
    per_slot = {slot: 1 + sum(p["slot"] == slot for p in machine["parts"].values()) for slot in machine["level"]["slots"]}
    assert len(machine["runs"]) == per_slot["heat"] * per_slot["guard"] * per_slot["weight"]


@needs_node
def test_only_candle_tray_metal_wins(machine):
    winners = [r["placed"] for r in machine["runs"] if r["outcome"] == "win"]
    assert winners == [{"heat": "candle", "guard": "tray", "weight": "metal"}]


@needs_node
def test_the_win_melts_all_the_ice_into_the_bucket_and_lowers_the_bridge(machine):
    win = run_for(machine, "candle", "tray", "metal")
    assert win["ice"] == 0
    assert win["bridge"] == 0
    assert win["lit"] is True
    assert win["to"] == ["bucket"]
    assert win["bucket"] == pytest.approx(machine["level"]["iceMass"])
    assert "bridge_down" in win["types"]


@pytest.mark.parametrize(("heat", "guard", "weight", "outcome"), [
    (None, "tray", "metal", "empty_heat"),
    ("fan", "tray", "metal", "fan"),
    ("icepack", "tray", "metal", "cold"),
    ("candle", "board", "metal", "blocked"),
    ("candle", None, "metal", "doused"),
    ("candle", "sponge", "metal", "soaked"),
    ("candle", "tray", None, "no_weight"),
    ("candle", "tray", "cotton", "cotton"),
    ("candle", "tray", "feather", "feather"),
])
@needs_node
def test_each_mistake_gets_its_own_explanation(machine, heat, guard, weight, outcome):
    assert run_for(machine, heat, guard, weight)["outcome"] == outcome


@needs_node
def test_the_first_broken_link_is_explained(machine):
    # No heat and a board: the missing heat is the first thing to fix, not the board.
    assert run_for(machine, None, "board", None)["outcome"] == "empty_heat"
    # A doused candle comes before the light weight.
    assert run_for(machine, "candle", None, "feather")["outcome"] == "doused"


@needs_node
def test_dripping_on_the_candle_puts_it_out(machine):
    doused = run_for(machine, "candle", None, "metal")
    assert doused["lit"] is False
    assert "doused" in doused["types"]
    assert doused["ice"] > 2                       # it went out early, most of the ice is still there
    soaked = run_for(machine, "candle", "sponge", "metal")
    assert soaked["lit"] is False
    assert {"sponge", "flame"} <= set(soaked["to"])  # the sponge held some drops, then the rest got through


@needs_node
def test_a_light_weight_dips_the_bridge_but_does_not_lower_it(machine):
    cotton = run_for(machine, "candle", "tray", "cotton")
    assert cotton["ice"] == 0
    assert 0 < cotton["bridge"] < 60


@needs_node
def test_every_outcome_has_a_line_and_runs_end(machine):
    lines = machine["level"]["outcomes"]
    for r in machine["runs"]:
        assert r["outcome"] in lines
        assert r["duration"] < 20, r["placed"]


@needs_node
def test_the_deck_matches_the_parts_and_slots(machine):
    level, parts = machine["level"], machine["parts"]
    assert sorted(level["deck"]) == sorted(parts)
    assert {p["slot"] for p in parts.values()} == set(level["slots"])
