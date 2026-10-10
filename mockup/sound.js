"use strict";

// ---------- Sound effects (ElevenLabs, shipped by tools/fetch_sounds.py promote) ----------
// Web Audio so overlapping effects never cut each other off. The context can only start
// after a user gesture, so the first tap/key unlocks it; anything played before is skipped.
// Each sound has a few recorded variants (assets/sfx/variants.json); every play picks one
// at random and nudges the pitch, so repeated sounds don't feel copy-pasted.
const Sfx = {
  dir: "../assets/sfx/",
  key: "energy-defenders-muted",
  names: ["click", "iris", "card_right", "card_wrong", "alien_laugh", "alien_scared", "energy_flow",
          "lever_ready", "lever_pull", "ufo_arrive", "charge", "fire_laser", "fire_sonic", "fire_wind",
          "fire_water", "fire_flame", "fire_sling", "boom", "victory", "star", "quiz_right", "quiz_wrong"],
  pitchJitter: 0.04,
  buffers: {},
  ctx: null,
  muted: false,

  init() {
    try { this.muted = localStorage.getItem(this.key) === "1"; } catch { /* storage blocked: start unmuted */ }
    this.renderButton();
    const unlock = () => this.unlock();
    addEventListener("pointerdown", unlock, { once: true, capture: true });
    addEventListener("keydown", unlock, { once: true, capture: true });
    document.addEventListener("click", (e) => {
      if (e.target.closest(".btn, .hud-btn, .level-card")) this.play("click");
    });
  },

  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || this.ctx) return;
    this.ctx = new AC();
    this.out = this.ctx.createGain();
    this.out.gain.value = this.muted ? 0 : 0.8;
    this.out.connect(this.ctx.destination);
    fetch(`${this.dir}variants.json`)
      .then((r) => r.json())
      .then((variants) => {
        for (const name of this.names) {
          for (const file of variants[name] || []) this.load(name, file);
        }
      })
      .catch(() => { /* no list: the game just stays silent */ });
  },

  load(name, file) {
    fetch(this.dir + file)
      .then((r) => { if (!r.ok) throw new Error(file); return r.arrayBuffer(); })
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buf) => { (this.buffers[name] ||= []).push(buf); })
      .catch(() => { /* a missing variant is skipped */ });
  },

  // Pass `rate` to pin the pitch (e.g. the rising star chimes); otherwise it varies a little.
  play(name, { volume = 1, rate } = {}) {
    const bufs = this.buffers[name];
    if (!bufs?.length || this.muted) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = bufs[Math.floor(Math.random() * bufs.length)];
    src.playbackRate.value = rate ?? 1 + (Math.random() * 2 - 1) * this.pitchJitter;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.out);
    src.start();
  },

  toggle() {
    this.muted = !this.muted;
    try { localStorage.setItem(this.key, this.muted ? "1" : "0"); } catch { /* not remembered */ }
    if (this.out) this.out.gain.value = this.muted ? 0 : 0.8;
    this.renderButton();
    this.play("click");
  },

  renderButton() {
    const btn = document.getElementById("btn-sound");
    btn.textContent = this.muted ? "🔇" : "🔊";
    btn.setAttribute("aria-pressed", String(!this.muted));
    btn.onclick = () => this.toggle();
  },
};
