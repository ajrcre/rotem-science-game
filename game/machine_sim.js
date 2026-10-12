"use strict";

// ---------- The rat and the cheese: the machine's simulation (no DOM) ----------
// A deterministic tick loop over a few parts. Parts talk through an event bus (Observer), and the run
// is recorded as frames (the state at every tick) plus events (drops, a doused flame, the bridge
// landing). machine.js only replays the recording, so what you see is exactly what was computed, and
// pytest can check every combination with node (tests/test_mouse_machine.py).

const SIM = {
  dt: 1 / 30,
  melt: 0.6,          // ice mass per second at full heat
  warmUp: 0.8,        // seconds before the ice starts to drip
  dropMass: 0.1,      // one drop of meltwater
  fall: 0.4,          // seconds from the sieve to whatever is below it
  tiltSpan: 1.5,      // mass difference that tips the scale all the way
  raised: 48,         // the bridge's raised angle (degrees)
  minRun: 2.6,        // even a machine that does nothing runs this long
  settle: 1.0,        // stop after this long without change
  maxRun: 20,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

class EventBus {
  constructor() { this.handlers = {}; }
  on(type, fn) { (this.handlers[type] ??= []).push(fn); }
  emit(type, data) { (this.handlers[type] || []).forEach((fn) => fn(data)); }
}

// ---------- Parts ----------
class Part {
  constructor(sim, key) {
    this.sim = sim;
    this.key = key || null;
    this.spec = key ? PARTS[key] : {};
  }
  step() {}
}

// The heat slot: a candle's flame can be put out; an ice pack is a negative heat source.
class HeatSource extends Part {
  constructor(sim, key) {
    super(sim, key);
    this.power = this.spec.power || 0;
    this.lit = this.power > 0;
    sim.bus.on("impact", (drop) => { if (drop.to === "flame" && this.lit) this.douse(); });
  }
  get output() { return this.power > 0 ? (this.lit ? this.power : 0) : this.power; }
  douse() {
    this.lit = false;
    this.sim.record("doused", {});
  }
}

// Between the heat and the sieve: lets some heat through, and decides where each drip goes.
class Guard extends Part {
  constructor(sim, key) {
    super(sim, key);
    this.heatPass = key ? this.spec.heatPass : 1;
    this.drips = key ? this.spec.drips : "through";
    this.held = 0;
  }
  // Where a drop ends up: the bucket, inside the sponge, or straight down.
  catchDrop() {
    if (this.drips === "aside") return "bucket";
    if (this.drips === "soak" && this.held < this.spec.soak) { this.held += 1; return "sponge"; }
    return "through";
  }
}

class Ice extends Part {
  constructor(sim, mass) {
    super(sim, "ice");
    this.mass = mass;
    this.start = mass;
    this.warm = 0;                        // 0..1: how far it has warmed up to melting
    this.pending = 0;                     // melted mass not yet dripped
  }
  step(dt) {
    const heat = this.sim.heat.output * this.sim.guard.heatPass;
    if (heat <= 0 || this.mass <= 0) return;
    this.warm = Math.min(1, this.warm + dt / SIM.warmUp);
    if (this.warm < 1) return;
    const melted = Math.min(this.mass, SIM.melt * heat * dt);
    this.mass -= melted;
    this.pending += melted;
    while (this.pending >= SIM.dropMass - 1e-9 || (this.mass <= 1e-6 && this.pending > 1e-6)) {
      this.pending = Math.max(0, this.pending - SIM.dropMass);
      this.sim.drip();
    }
    if (this.mass <= 1e-6) { this.mass = 0; this.sim.record("melted", {}); }
  }
}

// Sieve pan (the ice) on the left, the weight slot on the right. Water drips out through the sieve,
// so only the ice still in the pan counts.
class Scale extends Part {
  constructor(sim, weightKey) {
    super(sim, weightKey);
    this.right = weightKey ? this.spec.mass : 0;
    this.tilt = this.target();            // + = right pan down
  }
  target() { return clamp((this.right - this.sim.ice.mass) / SIM.tiltSpan, -1, 1); }
  step(dt) { this.tilt += (this.target() - this.tilt) * Math.min(1, dt * 2.5); }
}

// The bridge hangs on a rope from the left end of the beam: it can only fall when that end rises.
class Bridge extends Part {
  constructor(sim) {
    super(sim, "bridge");
    this.angle = this.target();
    this.down = false;
  }
  target() { return SIM.raised * (1 - clamp(this.sim.scale.tilt / 0.9, 0, 1)); }
  step(dt) {
    if (this.down) return;
    this.angle += (this.target() - this.angle) * Math.min(1, dt * 4);
    if (this.angle < 1.5) {
      this.angle = 0;
      this.down = true;
      this.sim.record("bridge_down", {});
    }
  }
}

// ---------- The simulator ----------
class Simulator {
  // `placed` maps slot → part key (or null), e.g. { heat: "candle", guard: "tray", weight: "metal" }.
  constructor(level, placed) {
    this.level = level;
    this.placed = placed;
    this.bus = new EventBus();
    this.t = 0;
    this.events = [];
    this.flying = [];                     // drops in the air: { id, to, at }
    this.dropCount = 0;
    this.bucket = 0;
    this.seed = 7;
    this.heat = new HeatSource(this, placed.heat);
    this.guard = new Guard(this, placed.guard);
    this.ice = new Ice(this, level.iceMass);
    this.scale = new Scale(this, placed.weight);
    this.bridge = new Bridge(this);
    this.parts = [this.ice, this.scale, this.bridge];
    this.bus.on("impact", (drop) => { if (drop.to === "bucket") this.bucket += SIM.dropMass; });
  }

  random() {                              // deterministic, so a replay matches its test
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  record(type, data) {
    this.events.push({ t: this.t, type, ...data });
    this.bus.emit(type, data);
  }

  // A drop leaves the sieve; where it lands is decided now, and it lands SIM.fall later.
  drip() {
    let to = this.guard.catchDrop();
    if (to === "through") to = this.heat.lit ? "flame" : "floor";
    const drop = { id: this.dropCount++, to, x: this.random(), at: this.t + SIM.fall };
    this.flying.push(drop);
    this.record("drop", { id: drop.id, to, x: drop.x });
  }

  snapshot() {
    return {
      t: this.t,
      ice: this.ice.mass,
      warm: this.ice.warm,
      lit: this.heat.lit,
      tilt: this.scale.tilt,
      bridge: this.bridge.angle,
      bucket: this.bucket,
      soaked: this.guard.held,
    };
  }

  run() {
    const frames = [this.snapshot()];
    let still = 0;
    while (this.t < SIM.maxRun) {
      const before = frames[frames.length - 1];
      this.t += SIM.dt;
      for (const p of this.parts) p.step(SIM.dt);
      for (const drop of this.flying.filter((d) => d.at <= this.t)) {
        this.flying.splice(this.flying.indexOf(drop), 1);
        this.record("impact", { id: drop.id, to: drop.to });
      }
      const now = this.snapshot();
      frames.push(now);
      const moved = Math.abs(now.ice - before.ice) + Math.abs(now.tilt - before.tilt) + Math.abs(now.bridge - before.bridge);
      still = moved < 5e-4 && !this.flying.length ? still + SIM.dt : 0;
      const settled = still >= SIM.settle || (this.bridge.down && still >= 0.3);
      if (settled && this.t >= SIM.minRun) break;
    }
    return { frames, events: this.events, outcome: this.outcome(), dt: SIM.dt };
  }

  // Which line the professor says: the first broken link in the chain heat → guard → water → weight.
  outcome() {
    if (this.bridge.down) return "win";
    const { heat, guard, weight } = this.placed;
    if (heat !== "candle") return { fan: "fan", icepack: "cold" }[heat] || "empty_heat";
    if (guard === "board") return "blocked";
    if (!this.heat.lit) return guard === "sponge" ? "soaked" : "doused";
    if (!weight) return "no_weight";
    return weight;                         // too light: "cotton" or "feather"
  }
}

// The scene before the lever is pulled (the scale already leans under whatever is on it).
const machineAt = (level, placed) => new Simulator(level, placed).snapshot();
const runMachine = (level, placed) => new Simulator(level, placed).run();

// After a run in stage `stage` (0-based): a win, a discovery that opens the next stage (not counted as a
// mistake), or a mistake to explain.
function judgeRun(level, stage, outcome) {
  if (outcome === "win") return { kind: "win", stage };
  const st = level.stages[stage];
  if (st.discover === outcome && stage + 1 < level.stages.length) return { kind: "discover", stage: stage + 1 };
  return { kind: "mistake", stage };
}
