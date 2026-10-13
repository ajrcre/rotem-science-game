"use strict";

// ---------- Sound effects (ElevenLabs, shipped by tools/fetch_sounds.py promote) ----------
// Web Audio so overlapping effects never cut each other off. Browsers only let sound start after a
// tap/click/key, so the context is created (suspended) and every effect is decoded at page load,
// and the first gesture resumes it; anything played before that is skipped.
// Each sound has a few recorded variants (assets/sfx/variants.json); every play picks one
// at random and nudges the pitch, so repeated sounds don't feel copy-pasted.
const Sfx = {
  dir: "../assets/sfx/",
  key: "energy-defenders-muted",
  names: ["click", "iris", "card_right", "card_wrong", "alien_laugh", "alien_scared", "energy_flow",
          "lever_ready", "lever_pull", "ufo_arrive", "charge", "fire_laser", "fire_sonic", "fire_wind",
          "fire_water", "fire_flame", "fire_sling", "boom", "victory", "star", "quiz_right", "quiz_wrong",
          "step", "door_open", "pee", "fart", "door_close",
          "amb_bubbles", "amb_zap", "amb_tesla", "amb_steam", "amb_gears", "amb_clink",
          "amb_beeps", "amb_boil", "amb_whirr", "amb_pop", "amb_drip",
          "m_drip", "m_sizzle", "m_hiss", "m_fan", "m_chill", "m_creak", "m_thud",
          "m_squeak", "m_scared", "m_sad", "m_scurry", "m_munch", "m_burp", "m_pop"],
  pitchJitter: 0.04,
  buffers: {},
  ctx: null,
  unlocked: false,
  muted: false,

  init() {
    try { this.muted = localStorage.getItem(this.key) === "1"; } catch { /* storage blocked: start unmuted */ }
    this.renderButton();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = this.muted ? 0 : 0.8;
      this.out.connect(this.ctx.destination);
    }
    // Safari only counts touchend/click as a gesture for audio; Chrome is happy with pointerdown.
    const unlock = () => this.unlock();
    for (const type of ["pointerdown", "touchend", "click", "keydown"]) addEventListener(type, unlock, { capture: true });
    this.stopListening = () => {
      for (const type of ["pointerdown", "touchend", "click", "keydown"]) removeEventListener(type, unlock, { capture: true });
    };
    document.addEventListener("click", (e) => {
      if (e.target.closest(".btn, .hud-btn, .level-card")) this.play("click");
    });
  },

  // Started once the splash is up (lab.js): nothing can play before the first tap anyway,
  // and on a slow phone the splash's painting should not wait behind ~100 sound files.
  preload() {
    if (!this.ctx || this.preloaded) return;
    this.preloaded = true;
    fetch(`${this.dir}variants.json`)
      .then((r) => r.json())
      .then((variants) => {
        for (const name of this.names) {
          for (const file of variants[name] || []) this.load(name, file);
        }
      })
      .catch(() => { /* no list: the game just stays silent */ });
  },

  // Called inside the user's gesture: that is the only moment a browser lets audio start.
  unlock() {
    if (!this.ctx) return;
    this.unlocked = true;                       // resuming inside a gesture succeeds; sounds may start now
    Music.resume();
    this.ctx.resume().then(() => {
      if (this.ctx.state === "running") this.stopListening();
    }).catch(() => { /* still suspended: the next gesture tries again */ });
  },

  load(name, file) {
    fetch(this.dir + file)
      .then((r) => { if (!r.ok) throw new Error(file); return r.arrayBuffer(); })
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buf) => { (this.buffers[name] ||= []).push(buf); })
      .catch(() => { /* a missing variant is skipped */ });
  },

  // Pass `rate` to pin the pitch (e.g. the rising star chimes); otherwise it varies a little.
  // `pan` (-1 left … 1 right) places a sound, e.g. bubbling from the chemistry corner.
  play(name, { volume = 1, rate, pan = 0 } = {}) {
    const bufs = this.buffers[name];
    if (!bufs?.length || this.muted || !this.unlocked) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = bufs[Math.floor(Math.random() * bufs.length)];
    src.playbackRate.value = rate ?? 1 + (Math.random() * 2 - 1) * this.pitchJitter;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    let node = src.connect(gain);
    if (pan && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = pan;
      node = node.connect(panner);
    }
    node.connect(this.out);
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

// ---------- Background music: seamless loops made by tools/prepare_music.py ----------
// One track at a time, looped, cross-faded when it changes. It goes through Sfx.out so the mute
// button silences it too, and dips while the professor talks. Asked for before the first gesture,
// it starts as soon as the sound is unlocked.
const Music = {
  dir: "../assets/music/",
  level: 0.55,
  duckLevel: 0.35,           // share of the level kept while narration plays
  fade: 1.2,
  tracks: new Map(),
  current: null,             // name of the wanted track (null = silence)
  playing: null,             // { name, src, gain } actually sounding

  load(name) {
    if (!this.tracks.has(name)) {
      this.tracks.set(name, fetch(`${this.dir}${name}.mp3`)
        .then((r) => { if (!r.ok) throw new Error(name); return r.arrayBuffer(); })
        .then((data) => Sfx.ctx.decodeAudioData(data))
        .catch(() => null));
    }
    return this.tracks.get(name);
  },

  play(name) {
    if (!Sfx.ctx) return;
    this.current = name;
    if (this.playing?.name === name) return;
    this.load(name);
    if (Sfx.unlocked) this.start(name);
  },

  stop() {
    this.current = null;
    this.release(this.playing);
    this.playing = null;
  },

  resume() {                 // the first gesture: start whatever was asked for
    if (this.current && this.playing?.name !== this.current) this.start(this.current);
  },

  async start(name) {
    if (this.starting === name) return;        // already on its way (play() and resume() can both ask)
    this.starting = name;
    const buf = await this.load(name);
    this.starting = null;
    if (!buf || this.current !== name || this.playing?.name === name) return;
    const ctx = Sfx.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(this.target(), ctx.currentTime + this.fade);
    src.connect(gain).connect(Sfx.out);
    src.start();
    this.release(this.playing);
    this.playing = { name, src, gain };
  },

  release(track) {
    if (!track) return;
    const t = Sfx.ctx.currentTime;
    track.gain.gain.cancelScheduledValues(t);
    track.gain.gain.setValueAtTime(track.gain.gain.value, t);
    track.gain.gain.linearRampToValueAtTime(0, t + this.fade);
    track.src.stop(t + this.fade + 0.05);
  },

  target() { return this.level * (Narrator.src ? this.duckLevel : 1); },

  duck() {                   // follow the narration: dip while a clip plays, come back after
    if (!this.playing) return;
    const g = this.playing.gain.gain, t = Sfx.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(this.target(), t + 0.3);
  },
};

// ---------- Narration: the professor's recorded lines (made by tools/generate_voice.py) ----------
// One line at a time: a new line cuts off the old one. A list of keys plays back to back,
// and a missing clip is simply skipped, so the game still works without recordings.
// Clips play through the same Web Audio context as the effects (HTML <audio> started after a delay
// is blocked by Safari), are fetched on demand and cached.
// speak() returns a promise that settles when the lines are over (finished, cut off, or silent).
const Narrator = {
  dir: "../assets/voice/",
  queue: [],
  clips: new Map(),
  src: null,
  turn: 0,                   // bumps on every stop, so a clip still loading knows it was cancelled

  // onClip(ms) fires as each clip starts, with its length, so a mouth can flap for exactly that long.
  speak(keys, onClip = null) {
    this.stop();
    this.onClip = onClip;
    const done = new Promise((resolve) => { this.resolve = resolve; });
    if (Sfx.muted || !Sfx.unlocked) { this.finish(); return done; }   // muted, or no gesture yet (browser blocks audio)
    this.queue = [...keys];
    this.next();
    return done;
  },

  finish() {
    this.resolve?.();
    this.resolve = null;
  },

  clip(key) {
    if (!this.clips.has(key)) {
      this.clips.set(key, fetch(`${this.dir}${key}.mp3`)
        .then((r) => { if (!r.ok) throw new Error(key); return r.arrayBuffer(); })
        .then((data) => Sfx.ctx.decodeAudioData(data))
        .catch(() => null));
    }
    return this.clips.get(key);
  },

  next() {
    const key = this.queue.shift();
    if (!key) { this.finish(); return; }
    const turn = this.turn;
    this.clip(key).then((buf) => {
      if (turn !== this.turn) return;
      if (!buf) { this.next(); return; }
      const src = Sfx.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(Sfx.out);
      src.onended = () => { if (this.src === src) { this.src = null; Music.duck(); this.next(); } };
      this.src = src;
      src.start();
      Music.duck();
      this.onClip?.(buf.duration * 1000);
    });
  },

  stop() {
    this.queue = [];
    this.turn += 1;
    if (this.src) {
      const src = this.src;
      this.src = null;
      src.onended = null;
      try { src.stop(); } catch { /* already stopped */ }
      Music.duck();
    }
    this.finish();
  },
};
