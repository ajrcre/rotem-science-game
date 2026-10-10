"use strict";

// ---------- Sound effects (made by tools/generate_sounds.py) ----------
// Web Audio so overlapping effects never cut each other off. The context can only start
// after a user gesture, so the first tap/key unlocks it; anything played before is skipped.
const Sfx = {
  dir: "../assets/sfx/",
  key: "energy-defenders-muted",
  names: ["click", "iris", "card_right", "card_wrong", "alien_laugh", "alien_scared", "energy_flow",
          "lever_ready", "lever_pull", "ufo_arrive", "charge", "fire_laser", "fire_sonic", "fire_wind",
          "fire_water", "fire_flame", "fire_sling", "boom", "victory", "star", "quiz_right", "quiz_wrong"],
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
    for (const name of this.names) {
      fetch(`${this.dir}${name}.wav`)
        .then((r) => r.arrayBuffer())
        .then((data) => this.ctx.decodeAudioData(data))
        .then((buf) => { this.buffers[name] = buf; })
        .catch(() => { /* a missing sound just stays silent */ });
    }
  },

  play(name, { volume = 1, rate = 1 } = {}) {
    const buf = this.buffers[name];
    if (!buf || this.muted) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.out);
    src.start();
  },

  toggle() {
    this.muted = !this.muted;
    try { localStorage.setItem(this.key, this.muted ? "1" : "0"); } catch { /* not remembered */ }
    if (this.out) this.out.gain.value = this.muted ? 0 : 0.8;
    if (this.muted) Narrator.stop();
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

// ---------- Narration: Professor Volt's recorded lines (made by tools/generate_voice.py) ----------
// One line at a time: a new line cuts off the old one. A list of keys plays back to back,
// and a missing clip is simply skipped, so the game still works without recordings.
const Narrator = {
  dir: "../assets/voice/",
  audio: new Audio(),
  queue: [],

  // onClip(ms) fires as each clip starts, with its length, so a mouth can flap for exactly that long.
  speak(keys, onClip = null) {
    this.stop();
    this.onClip = onClip;
    if (Sfx.muted || !Sfx.ctx) return;      // muted, or no user gesture yet (autoplay would be blocked)
    this.queue = [...keys];
    this.next();
  },

  next() {
    const key = this.queue.shift();
    if (!key) return;
    const a = new Audio(`${this.dir}${key}.mp3`);
    a.onplaying = () => { if (this.audio === a && isFinite(a.duration)) this.onClip?.(a.duration * 1000); };
    a.onended = a.onerror = () => { if (this.audio === a) this.next(); };
    this.audio = a;
    a.play().catch(() => { if (this.audio === a) this.next(); });
  },

  stop() {
    this.queue = [];
    this.audio.pause();
  },
};
