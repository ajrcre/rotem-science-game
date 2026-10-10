"use strict";

// ---------- Data ----------
const ART = "../assets/art/";

const CARDS = {
  sun:         { label: "שמש",       fact: "השמש היא מקור אנרגיה." },
  light:       { label: "אור",       fact: "אור הוא סוג של אנרגיה." },
  solar_panel: { label: "תא סולרי",  fact: "תא סולרי הוא ממיר: אור ← חשמל." },
  electricity: { label: "חשמל",      fact: "חשמל הוא סוג של אנרגיה." },
  battery:     { label: "סוללה",     fact: "סוללה אוגרת אנרגיה כימית והופכת אותה לחשמל." },
  speaker:     { label: "רמקול",     fact: "רמקול ממיר חשמל לקול." },
  turbine:     { label: "טורבינה",   fact: "טורבינת רוח ממירה אנרגיית תנועה לחשמל." },
  heat:        { label: "חום",       fact: "חום הוא סוג של אנרגיה." },
  laser:       { label: "לייזר",     fact: "לייזר ממיר חשמל לאור." },
};

const LEVEL = {
  intro: "הצילו! חייזר מתקרב! נבנה לייזר סולארי. קודם כול – מאיפה תגיע האנרגיה? בחרו מקור אנרגיה.",
  steps: [
    { card: "sun",         tag: "מקור",  need: "צריך מקור אנרגיה מתחדש שזורח בשמיים.",
      good: "נכון! השמש היא מקור האנרגיה שלנו – ומקור מתחדש! איזה סוג אנרגיה היא שולחת אלינו?" },
    { card: "light",       tag: "אנרגיה", need: "איזה סוג אנרגיה השמש שולחת ואנחנו רואים בעיניים?",
      good: "בדיוק! השמש שולחת אנרגיית אור (וגם חום). עכשיו – מה יהפוך את האור לחשמל?" },
    { card: "solar_panel", tag: "ממיר",  need: "צריך ממיר שהופך אנרגיית אור לחשמל.",
      good: "מעולה! התא הסולרי ממיר אנרגיית אור לאנרגיה חשמלית. ואיזו אנרגיה יוצאת ממנו?" },
    { card: "electricity", tag: "אנרגיה", need: "איזה סוג אנרגיה יוצא מהתא הסולרי וזורם בחוטים?",
      good: "נכון! אנרגיה חשמלית תזרום ללייזר, והוא ימיר אותה בחזרה לאור. הלייזר טעון!" },
  ],
  goal: "laser",
  leverLine: "הכול מחובר! עכשיו – תפסו את הידית ומשכו אותה למטה בכל הכוח!",
  deck: ["battery", "solar_panel", "speaker", "sun", "electricity", "turbine", "heat", "light"],
  summary: [["שמש"], ["אור"], ["תא סולרי", true], ["חשמל"], ["לייזר", true], ["אור"]],
};

const CHARACTERS = {
  professor: { poses: ["idle", "talk", "cheer", "worried", "point"], idle: "breathe" },
  sparky:    { poses: ["idle", "dance_a", "dance_b", "sad", "pull", "cheer"], idle: "bob" },
  alien:     { poses: ["idle", "laugh", "scared"], idle: "hover" },
};

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
const frameSrc = (actor, pose) => `${ART}frames/${actor}/${pose}.png`;
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

function fitStage() {
  const stage = $("stage");
  const scale = Math.min(innerWidth / 1600, innerHeight / 900);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  stage.dataset.scale = scale;
}

const stageScale = () => parseFloat($("stage").dataset.scale) || 1;

function stageRect(el) {
  const s = stageScale();
  const base = $("stage").getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: (r.left - base.left) / s, y: (r.top - base.top) / s, w: r.width / s, h: r.height / s };
}

// ---------- Motion: damped springs drive every reaction ----------
class Spring {
  constructor(stiffness = 170, damping = 13) {
    this.k = stiffness;
    this.c = damping;
    this.x = 0;
    this.v = 0;
    this.target = 0;
  }
  kick(velocity) { this.v += velocity; }
  step(dt) {
    const a = -this.k * (this.x - this.target) - this.c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
  }
}

// Procedural animation for one character: idle loop + spring reactions, composed at 60fps.
class Rig {
  static all = new Set();

  constructor(el, idle) {
    this.el = el;
    this.idle = idle;
    this.y = new Spring(150, 11);          // vertical hop (px)
    this.squash = new Spring(260, 14);     // + = wide & short, - = tall & thin
    this.rot = new Spring(120, 12);        // lean (deg)
    this.shakeAmp = 0;
    this.shakeHold = 0;                    // seconds left at full amplitude (Infinity = until stopped)
    this.phase = Math.random() * 10;
    this.timers = [];
    Rig.all.add(this);
  }

  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }
  later(ms, fn) { this.timers.push(setTimeout(fn, ms)); }

  reset() {
    this.clearTimers();
    for (const s of [this.y, this.squash, this.rot]) { s.x = s.v = s.target = 0; }
    this.shakeAmp = this.shakeHold = 0;
  }

  pop() { this.squash.kick(-1.1); }       // small stretch on every pose change

  jump(power = 520) {
    this.squash.kick(2.2);                 // anticipation: crouch...
    this.later(70, () => { this.y.kick(-power); this.squash.kick(-3.2); });   // ...then spring up
  }

  dance(ms = 1500) {
    let side = 1;
    const beat = () => {
      this.rot.target = 9 * side;
      this.y.kick(-260);
      this.squash.kick(1.4);
      side = -side;
    };
    beat();
    const id = setInterval(beat, 330);
    this.timers.push(id);
    this.later(ms, () => { clearInterval(id); this.rot.target = 0; });
  }

  droop(ms = 1300) {
    this.squash.target = 0.07;
    this.rot.target = -3;
    this.y.target = 6;
    this.later(ms, () => { this.squash.target = 0; this.rot.target = 0; this.y.target = 0; });
  }

  tremble(ms = 1200, amp = 4) {
    this.shakeAmp = amp;
    this.shakeHold = ms / 1000;
  }

  giggle(ms = 1200) {
    let side = 1;
    const id = setInterval(() => { this.y.kick(-140); this.rot.kick(40 * side); side = -side; }, 130);
    this.timers.push(id);
    this.later(ms, () => clearInterval(id));
  }

  strain(on) { this.shakeAmp = on ? 2.2 : 0; this.shakeHold = on ? Infinity : 0; }

  react(name, ms) {
    if (!name) return;
    const fn = { jump: () => this.jump(), dance: () => this.dance(ms), droop: () => this.droop(ms),
                 tremble: () => this.tremble(ms), giggle: () => this.giggle(ms) }[name];
    fn?.();
  }

  step(t, dt) {
    this.y.step(dt);
    this.squash.step(dt);
    this.rot.step(dt);
    if (this.shakeHold > 0) this.shakeHold -= dt;
    else this.shakeAmp *= Math.pow(0.02, dt);          // decay quickly once released

    const p = t + this.phase;
    let iy = 0, ir = 0, breathe = 0;
    if (this.idle === "breathe") {
      breathe = 0.011 * Math.sin((p * TAU) / 2.6);
      ir = 0.7 * Math.sin((p * TAU) / 5.2);
    } else if (this.idle === "bob") {
      const w = (p * TAU) / 1.1;
      iy = -7 * (1 - Math.cos(w)) / 2;
      breathe = -0.02 * Math.cos(w);
    } else if (this.idle === "hover") {
      iy = 14 * Math.sin((p * TAU) / 2.6);
      ir = 3 * Math.sin((p * TAU) / 2.6 + 1.2);
    }
    const sx = this.shakeAmp * Math.sin(p * 57) + this.shakeAmp * 0.4 * Math.sin(p * 91);
    const sy = this.shakeAmp * 0.5 * Math.sin(p * 73);
    const q = this.squash.x;
    const scaleX = 1 + q - breathe * 0.5;
    const scaleY = 1 - q + breathe;
    this.el.style.transform =
      `translate(${sx.toFixed(2)}px, ${(this.y.x + iy + sy).toFixed(2)}px) ` +
      `rotate(${(this.rot.x + ir).toFixed(2)}deg) scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})`;
  }

  static loop() {
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      for (const r of Rig.all) r.step(now / 1000, dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

// ---------- Actor: aligned pose frames with cross-fade + a Rig ----------
class Actor {
  constructor(name) {
    this.name = name;
    this.el = $(name);
    const { poses, idle } = CHARACTERS[name];
    this.rig = new Rig(this.el.querySelector(".rig"), idle);
    this.layers = [...this.el.querySelectorAll("img")];
    this.front = 0;
    this.current = null;
    this.cache = poses.map((p) => Object.assign(new Image(), { src: frameSrc(name, p) }));   // preload
    this.timer = null;
    this.pose("idle", false);
  }

  // New frame fades in on top of the old one, so there is never a see-through moment.
  pose(p, pop = true) {
    if (p === this.current) return;
    this.current = p;
    const back = this.layers[1 - this.front];
    const front = this.layers[this.front];
    back.src = frameSrc(this.name, p);
    back.style.zIndex = 2;
    front.style.zIndex = 1;
    back.classList.add("on");
    clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => front.classList.remove("on"), 75);   // old frame vanishes once covered
    this.front = 1 - this.front;
    if (pop) this.rig.pop();
  }

  stop() { clearInterval(this.timer); this.timer = null; }

  // Cycle frames at `fps` for `ms`, run a rig reaction, then settle on `end`.
  play(frames, { fps = 6, ms = 1200, end = "idle", react = null } = {}) {
    this.stop();
    clearTimeout(this.endTimer);
    let i = 0;
    this.pose(frames[0]);
    this.rig.react(react, ms);
    if (frames.length > 1) {
      this.timer = setInterval(() => { i = (i + 1) % frames.length; this.pose(frames[i]); }, 1000 / fps);
    }
    if (ms !== Infinity) {
      this.endTimer = setTimeout(() => { this.stop(); if (end) this.pose(end); }, ms);
    }
  }

  hold(p) {
    this.stop();
    clearTimeout(this.endTimer);
    this.pose(p);
  }

  reset() {
    this.stop();
    clearTimeout(this.endTimer);
    this.rig.reset();
    this.pose("idle", false);
  }
}

// ---------- Film effects ----------
const Film = {
  start() {
    const c = $("grain");
    c.width = 400; c.height = 225;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(c.width, c.height);
    const noise = $("boil-noise");
    let seed = 1;
    setInterval(() => {
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 150 + Math.random() * 105;
        img.data[i] = v; img.data[i + 1] = v * 0.96; img.data[i + 2] = v * 0.88; img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      seed = (seed % 3) + 1;               // a few seeds → subtle hand-drawn "line boil"
      noise.setAttribute("seed", seed);
    }, 1000 / 10);
  },
  async iris(close) {
    $("iris").classList.toggle("closed", close);
    await wait(850);
  },
  quake() {
    restart($("stage"), "quake");
    setTimeout(() => $("stage").classList.remove("quake"), 500);
  },
};

// ---------- Lever (drag to pull) ----------
class Lever {
  static UP = -28;
  static DOWN = 62;

  constructor(onGrab, onRelease, onPulled) {
    this.el = $("lever");
    this.handle = $("lever-handle");
    Object.assign(this, { onGrab, onRelease, onPulled });
    this.active = false;
    this.dragging = false;
    this.handle.addEventListener("pointerdown", (e) => this.grab(e));
    addEventListener("pointermove", (e) => this.drag(e));
    addEventListener("pointerup", () => this.release());
    this.handle.addEventListener("keydown", (e) => {
      if (this.active && ["ArrowDown", "Enter", " "].includes(e.key)) { e.preventDefault(); this.finish(); }
    });
  }

  reset() {
    this.active = false;
    this.dragging = false;
    this.el.classList.remove("show");
    this.handle.classList.remove("spring");
    $("lever-hint").hidden = false;
    this.set(Lever.UP);
  }

  show() {
    this.active = true;
    this.handle.setAttribute("tabindex", "0");
    this.el.classList.add("show");
  }

  set(angle) {
    this.angle = angle;
    this.handle.style.transform = `rotate(${angle}deg)`;
  }

  // Pivot = bottom-center of the handle's unrotated box (its transform-origin).
  pivot() {
    const s = stageScale();
    const box = this.el.getBoundingClientRect();
    const h = this.handle;
    return {
      x: box.left + (h.offsetLeft + h.offsetWidth / 2) * s,
      y: box.top + (h.offsetTop + h.offsetHeight * 0.98) * s,
    };
  }

  grab(e) {
    if (!this.active) return;
    e.preventDefault();
    this.dragging = true;
    this.handle.classList.add("dragging");
    this.handle.classList.remove("spring");
    $("lever-hint").hidden = true;
    this.onGrab();
  }

  drag(e) {
    if (!this.dragging) return;
    const p = this.pivot();
    // Angle from vertical: 0 = straight up, positive = leaning right (pulled down).
    const deg = (Math.atan2(e.clientX - p.x, p.y - e.clientY) * 180) / Math.PI;
    this.set(Math.max(Lever.UP, Math.min(Lever.DOWN, deg)));
    if (this.angle >= Lever.DOWN - 4) this.finish();
  }

  release() {
    if (!this.dragging) return;
    this.dragging = false;
    this.handle.classList.remove("dragging");
    this.handle.classList.add("spring");
    this.set(Lever.UP);
    $("lever-hint").hidden = false;
    this.onRelease();
  }

  finish() {
    this.dragging = false;
    this.active = false;
    this.handle.removeAttribute("tabindex");
    this.handle.classList.remove("dragging");
    this.handle.classList.add("spring");
    this.set(Lever.DOWN + 8);
    this.onPulled();
  }
}

// ---------- Laser FX: additive-blend canvas (charge, beam, sparks, shockwave) ----------
class BeamFX {
  constructor(canvas, size = 640) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.k = canvas.width / size;            // canvas pixels per scene pixel
    this.size = size;
    this.sparks = [];
    this.rings = [];
    this.charge = null;
    this.beam = null;
    this.running = false;
  }

  reset() {
    this.sparks = [];
    this.rings = [];
    this.charge = this.beam = null;
  }

  chargeAt(p, ms) { this.charge = { p, t0: performance.now(), ms }; this.run(); }

  fire(from, to, ms) {
    this.charge = null;
    this.beam = { from, to, t0: performance.now(), ms };
    this.run();
  }

  burst(p, n, { speed = [200, 800], spread = TAU, dir = 0, life = [0.5, 1.1], size = [2, 5] } = {}) {
    for (let i = 0; i < n; i++) {
      const a = dir + rand(-spread / 2, spread / 2);
      const v = rand(...speed);
      this.sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                         age: 0, life: rand(...life), size: rand(...size) });
    }
    this.run();
  }

  ring(p, radius = 260, ms = 550) { this.rings.push({ p, radius, t0: performance.now(), ms }); this.run(); }

  run() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      this.draw(now, dt);
      if (this.charge || this.beam || this.sparks.length || this.rings.length) requestAnimationFrame(tick);
      else { this.running = false; this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }
    };
    requestAnimationFrame(tick);
  }

  glow(x, y, r, stops) {
    const g = this.ctx.createRadialGradient(x, y, 0, x, y, r);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    this.ctx.fillStyle = g;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, TAU);
    this.ctx.fill();
  }

  draw(now, dt) {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    if (this.charge) this.drawCharge(now);
    if (this.beam) this.drawBeam(now);
    this.drawSparks(dt);
    this.drawRings(now);
    ctx.globalCompositeOperation = "source-over";
  }

  drawCharge(now) {
    const { p, t0, ms } = this.charge;
    const u = Math.min((now - t0) / ms, 1);
    // Light motes get sucked into the muzzle.
    for (let i = 0; i < 3; i++) {
      const a = rand(0, TAU), r = rand(70, 150);
      const v = rand(260, 420);
      this.sparks.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r,
                         vx: -Math.cos(a) * v, vy: -Math.sin(a) * v, age: 0, life: r / v,
                         size: rand(1.5, 3), noGravity: true });
    }
    const flick = 1 + 0.15 * Math.sin(now * 0.05);
    this.glow(p.x, p.y, (30 + 70 * u) * flick, [[0, "rgba(255,255,255,0.95)"], [0.25, "rgba(255,230,140,0.7)"],
                                                 [0.6, "rgba(255,140,50,0.25)"], [1, "rgba(255,90,20,0)"]]);
    this.glow(p.x, p.y, 220 * u, [[0, "rgba(255,200,120,0.18)"], [1, "rgba(255,160,80,0)"]]);
  }

  drawBeam(now) {
    const { ctx } = this;
    const { from, to, t0, ms } = this.beam;
    const t = now - t0;
    if (t > ms) { this.beam = null; return; }
    const extend = Math.min(t / 110, 1);
    const fade = t > ms - 160 ? (ms - t) / 160 : 1;
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy) * extend;
    const ang = Math.atan2(dy, dx);
    const w = 22 * fade * (1 + 0.14 * Math.sin(now * 0.07) + rand(-0.06, 0.06));
    const end = { x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len };

    // The beam lights up the sky around the muzzle and the target.
    this.glow(from.x, from.y, 300, [[0, `rgba(255,190,110,${0.28 * fade})`], [1, "rgba(255,150,60,0)"]]);
    this.glow(end.x, end.y, 320, [[0, `rgba(255,170,90,${0.32 * fade})`], [1, "rgba(255,120,40,0)"]]);

    ctx.save();
    ctx.translate(from.x, from.y);
    ctx.rotate(ang);
    const band = (half, stops) => {
      const g = ctx.createLinearGradient(0, -half, 0, half);
      stops.forEach(([o, c]) => g.addColorStop(o, c));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(-half * 0.3, -half, len + half * 0.6, half * 2, half);
      ctx.fill();
    };
    band(w * 3.2, [[0, "rgba(255,80,20,0)"], [0.5, "rgba(255,110,40,0.38)"], [1, "rgba(255,80,20,0)"]]);   // bloom
    band(w * 1.25, [[0, "rgba(255,170,60,0)"], [0.5, "rgba(255,215,100,0.95)"], [1, "rgba(255,170,60,0)"]]); // glow
    band(w * 0.42, [[0, "rgba(255,255,240,0.6)"], [0.5, "rgba(255,255,255,1)"], [1, "rgba(255,255,240,0.6)"]]); // core

    // Energy pulses racing along the beam.
    ctx.fillStyle = `rgba(255,255,225,${0.55 * fade})`;
    for (let x = (t * 1.4) % 64; x < len; x += 64) {
      ctx.beginPath();
      ctx.ellipse(x, 0, 16, w * 0.6, 0, 0, TAU);
      ctx.fill();
    }

    // Crackling electric arcs, redrawn every frame.
    for (let a = 0; a < 3; a++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 24; x < len; x += 24) ctx.lineTo(x, rand(-1, 1) * w * 1.5);
      ctx.lineTo(len, 0);
      ctx.strokeStyle = `rgba(255,170,90,${0.25 * fade})`;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,245,200,${0.85 * fade})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();

    // Muzzle flare with a four-point star.
    const flare = w * 4 * (1 + 0.2 * Math.sin(now * 0.09));
    this.glow(from.x, from.y, flare, [[0, "rgba(255,255,255,1)"], [0.3, "rgba(255,225,140,0.8)"], [1, "rgba(255,120,40,0)"]]);
    ctx.save();
    ctx.translate(from.x, from.y);
    ctx.rotate(now * 0.002);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      const g = ctx.createLinearGradient(0, 0, flare * 2.2, 0);
      g.addColorStop(0, `rgba(255,255,230,${0.9 * fade})`);
      g.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -4); ctx.lineTo(flare * 2.2, 0); ctx.lineTo(0, 4);
      ctx.fill();
    }
    ctx.restore();

    // Impact: a hot spot and a spray of sparks bouncing back off the hull.
    if (extend >= 1) {
      this.glow(end.x, end.y, w * 4.5 * (1 + rand(-0.15, 0.15)),
                [[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,220,130,0.85)"], [1, "rgba(255,100,30,0)"]]);
      this.burst(end, 5, { dir: ang + Math.PI, spread: 2.2, speed: [180, 560], life: [0.35, 0.8], size: [1.5, 3.5] });
    }
  }

  drawSparks(dt) {
    const { ctx } = this;
    ctx.lineCap = "round";
    this.sparks = this.sparks.filter((s) => (s.age += dt) < s.life);
    for (const s of this.sparks) {
      if (!s.noGravity) { s.vy += 760 * dt; s.vx *= 0.985; s.vy *= 0.985; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const u = s.age / s.life;
      const hue = 55 - 40 * u;
      ctx.strokeStyle = `hsla(${hue}, 100%, ${78 - 25 * u}%, ${1 - u})`;
      ctx.lineWidth = s.size * (1 - u * 0.6);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.035, s.y - s.vy * 0.035);
      ctx.stroke();
    }
  }

  drawRings(now) {
    const { ctx } = this;
    this.rings = this.rings.filter((r) => now - r.t0 < r.ms);
    for (const r of this.rings) {
      const u = (now - r.t0) / r.ms;
      const e = 1 - Math.pow(1 - u, 3);
      ctx.strokeStyle = `rgba(255,235,180,${0.85 * (1 - u)})`;
      ctx.lineWidth = 20 * (1 - u) + 1;
      ctx.beginPath();
      ctx.arc(r.p.x, r.p.y, 12 + r.radius * e, 0, TAU);
      ctx.stroke();
    }
  }
}

// ---------- Porthole cutscene ----------
const WindowScene = {
  fx: null,

  // Position of an element's point (fx, fy as fractions of its box) inside the porthole, in scene px.
  local(el, fx, fy) {
    const s = stageScale();
    const view = document.querySelector(".porthole-view").getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: (r.left + r.width * fx - view.left) / s, y: (r.top + r.height * fy - view.top) / s };
  },

  async play() {
    this.fx ??= new BeamFX($("fx"));
    this.fx.reset();
    const scene = $("window-scene");
    const ufo = $("ufo");
    const cannon = $("cannon");
    ufo.src = `${ART}alien.png`;
    ufo.className = "ufo";
    cannon.className = "cannon";
    $("boom").className = "boom";
    $("boom-word").className = "boom-word";
    $("debris").innerHTML = "";

    await Film.iris(true);
    scene.classList.add("show");
    await Film.iris(false);

    restart(ufo, "enter");
    await wait(1650);
    ufo.src = `${ART}alien_scared.png`;          // it spots the cannon
    ufo.className = "ufo wobble";
    await wait(350);

    // Charge up.
    const muzzle = this.local(cannon, 0.2, 0.17);
    cannon.classList.add("charging");
    this.fx.chargeAt(muzzle, 850);
    await wait(850);

    // Fire!
    const target = this.local(ufo, 0.5, 0.55);
    cannon.className = "cannon";
    restart(cannon, "recoil");
    this.fx.fire(muzzle, target, 1000);
    Film.quake();
    await wait(160);
    ufo.className = "ufo hot";                    // the hull heats up under the beam
    await wait(840);

    // Kaboom.
    restart($("flash"), "go");
    Film.quake();
    ufo.classList.add("gone");
    this.debris();
    restart($("boom"), "go");
    this.fx.burst(target, 110, { speed: [250, 1000], life: [0.6, 1.4], size: [2, 6] });
    this.fx.ring(target, 300, 600);
    await wait(120);
    this.fx.ring(target, 200, 500);
    await wait(230);
    restart($("boom-word"), "go");
    await wait(1900);
  },

  // Break the saucer image into wedges that fly apart.
  debris() {
    const pieces = [
      "polygon(0 40%, 35% 30%, 40% 70%, 0 80%)",
      "polygon(35% 30%, 65% 30%, 60% 65%, 40% 70%)",
      "polygon(65% 30%, 100% 40%, 100% 80%, 60% 65%)",
      "polygon(0 80%, 40% 70%, 50% 100%, 10% 100%)",
      "polygon(40% 70%, 60% 65%, 90% 100%, 50% 100%)",
      "polygon(20% 0, 80% 0, 65% 30%, 35% 30%)",
    ];
    const wrap = $("debris");
    pieces.forEach((clip, i) => {
      const img = document.createElement("img");
      img.src = `${ART}alien_scared.png`;
      img.className = "debris-piece";
      img.style.clipPath = clip;
      const ang = (i / pieces.length) * TAU + 0.4;
      img.style.setProperty("--dx", `${Math.cos(ang) * 340}px`);
      img.style.setProperty("--dy", `${Math.sin(ang) * 300 - 60}px`);
      img.style.setProperty("--rot", `${(i % 2 ? 1 : -1) * (300 + i * 90)}deg`);
      wrap.append(img);
    });
  },

  hide() { $("window-scene").classList.remove("show"); },
};

// ---------- Game ----------
class Workbench {
  constructor(level) {
    this.level = level;
    this.professor = new Actor("professor");
    this.sparky = new Actor("sparky");
    this.alien = new Actor("alien");
    this.lever = new Lever(
      () => { this.sparky.hold("pull"); this.sparky.rig.strain(true); },
      () => { this.sparky.hold("idle"); this.sparky.rig.strain(false); },
      () => this.leverPulled(),
    );
  }

  start() {
    this.step = 0;
    this.mistakes = 0;
    this.busy = false;
    this.renderChain();
    this.renderCards();
    this.updateStars();
    this.lever.reset();
    WindowScene.hide();
    $("cards").classList.remove("away");
    document.querySelector(".tray").classList.remove("empty");
    $("alien").className = "actor alien";
    for (const a of [this.professor, this.sparky, this.alien]) a.reset();
    this.say(this.level.intro, "");
    $("threat-fill").style.width = "20%";
    this.startTaunts();
  }

  // The alien taunts now and then while the player thinks.
  startTaunts() {
    clearInterval(this.tauntTimer);
    this.tauntTimer = setInterval(() => {
      if (!this.busy && this.step < this.level.steps.length) {
        this.alien.play(["laugh", "idle"], { fps: 5, ms: 1000, react: "giggle" });
      }
    }, 7000);
  }

  renderChain() {
    const chain = $("chain");
    chain.innerHTML = "";
    this.slots = this.level.steps.map((s, i) => {
      const slot = document.createElement("div");
      slot.className = "slot" + (i === 0 ? " current" : "");
      slot.innerHTML = `<span class="q">?</span><span class="tag">${s.tag}</span>`;
      chain.append(slot);
      const arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.textContent = "◀";
      chain.append(arrow);
      return slot;
    });
    const goal = document.createElement("div");
    goal.className = "slot goal filled";
    goal.innerHTML = `<img src="${ART}${this.level.goal}.png" alt=""><span class="tag">הנשק</span>`;
    chain.append(goal);
    this.goalSlot = goal;
  }

  renderCards() {
    const wrap = $("cards");
    wrap.innerHTML = "";
    for (const key of this.level.deck) {
      const btn = document.createElement("button");
      btn.className = "card";
      btn.dataset.key = key;
      btn.innerHTML = `<img src="${ART}${key}.png" alt=""><span>${CARDS[key].label}</span>`;
      btn.addEventListener("click", () => this.pick(btn));
      wrap.append(btn);
    }
  }

  // Professor speaks: typewriter text while his mouth flaps between poses.
  say(text, mood, gesture = "talk") {
    const b = $("bubble");
    const p = $("bubble-text");
    b.className = "bubble " + (mood || "");
    restart(b, "show");
    clearInterval(this.typeTimer);
    let n = 0;
    p.textContent = "";
    this.typeTimer = setInterval(() => {
      n += 2;
      p.textContent = text.slice(0, n);
      if (n >= text.length) clearInterval(this.typeTimer);
    }, 45);
    if (gesture === "talk") this.professor.play(["talk", "idle"], { fps: 4, ms: Math.min(text.length * 24, 2600) });
  }

  updateStars() {
    const lost = Math.min(this.mistakes, 2);
    [...$("hud-stars").children].forEach((s, i) => s.classList.toggle("lost", i >= 3 - lost));
  }

  async pick(btn) {
    const step = this.level.steps[this.step];
    if (this.busy || !step) return;
    const key = btn.dataset.key;
    if (key !== step.card) return this.wrong(btn, key, step);
    this.busy = true;
    await this.flyToSlot(btn, this.slots[this.step]);
    this.say(step.good, "good", "none");
    this.professor.play(["cheer", "talk", "cheer", "idle"], { fps: 3, ms: 1700, react: "jump" });
    this.sparky.play(["dance_a", "dance_b"], { fps: 3, ms: 1500, react: "dance" });
    this.alien.play(["scared"], { ms: 1200, react: "tremble" });
    this.step += 1;
    this.slots[this.step]?.classList.add("current");
    if (this.step === this.level.steps.length) {
      await wait(2000);
      await this.armLever();
    }
    this.busy = false;
  }

  wrong(btn, key, step) {
    this.mistakes += 1;
    this.updateStars();
    restart(btn, "wrong");
    this.sparky.play(["sad"], { ms: 1400, react: "droop" });
    this.alien.play(["laugh", "idle"], { fps: 5, ms: 1300, react: "giggle" });
    $("threat-fill").style.width = `${Math.min(20 + this.mistakes * 15, 90)}%`;
    this.say(`🤔 ${CARDS[key].fact} אבל זה לא מה שצריך עכשיו. ${step.need}`, "bad", "none");
    this.professor.play(["worried"], { ms: 1500, react: "tremble" });
  }

  async flyToSlot(btn, slot) {
    const from = stageRect(btn.querySelector("img"));
    const to = stageRect(slot);
    const img = document.createElement("img");
    img.src = `${ART}${btn.dataset.key}.png`;
    img.className = "flyer";
    Object.assign(img.style, { left: `${from.x}px`, top: `${from.y}px`, width: `${from.w}px`, height: `${from.h}px` });
    $("stage").append(img);
    btn.classList.add("used");
    await wait(20);
    Object.assign(img.style, { left: `${to.x + to.w * 0.12}px`, top: `${to.y + to.h * 0.12}px`,
                               width: `${to.w * 0.76}px`, height: `${to.h * 0.76}px` });
    await wait(560);
    img.remove();
    slot.classList.remove("current");
    slot.classList.add("filled");
    slot.querySelector(".q").replaceWith(Object.assign(document.createElement("img"), { src: img.src, alt: "" }));
  }

  async armLever() {
    // Energy flows along the chain (right → left) and charges the weapon.
    const arrows = [...document.querySelectorAll(".arrow")];
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i].classList.add("flow");
      await wait(220);
      arrows[i].classList.add("flow");
      await wait(120);
    }
    this.goalSlot.classList.add("flow");
    await wait(300);
    $("cards").classList.add("away");
    document.querySelector(".tray").classList.add("empty");
    await wait(350);
    this.lever.show();
    this.say(this.level.leverLine, "good", "none");
    this.professor.hold("point");
    this.professor.rig.jump(300);
    this.alien.play(["scared"], { ms: Infinity });
    this.alien.rig.tremble(Infinity, 3);
  }

  async leverPulled() {
    clearInterval(this.tauntTimer);
    this.sparky.rig.strain(false);
    restart(this.goalSlot, "recoil");
    restart($("flash"), "go");
    Film.quake();
    this.sparky.play(["cheer"], { ms: 1000, react: "jump" });
    this.professor.play(["cheer"], { ms: 1000, react: "jump" });
    $("alien").classList.add("flee");             // the ship escapes past the window...
    $("threat-fill").style.width = "0%";
    await wait(700);
    await WindowScene.play();                    // ...and we watch it explode outside
    await Film.iris(true);
    WindowScene.hide();
    this.showVictory();
    await Film.iris(false);
  }

  showVictory() {
    const stars = this.mistakes === 0 ? 3 : this.mistakes <= 2 ? 2 : 1;
    $("big-stars").innerHTML = [0, 1, 2]
      .map((i) => `<span class="${i < stars ? "" : "lost"}" style="animation-delay:${0.3 + i * 0.25}s">★</span>`)
      .join("");
    $("summary").innerHTML = this.level.summary
      .map(([t, conv]) => `<span class="chip${conv ? " conv" : ""}">${t}</span>`)
      .join("<span>←</span>");
    $("victory").classList.add("show");
  }
}

// ---------- Boot ----------
addEventListener("resize", fitStage);
fitStage();
Film.start();
Rig.loop();

const game = new Workbench(LEVEL);
game.start();

$("btn-replay").addEventListener("click", async () => {
  await Film.iris(true);
  $("victory").classList.remove("show");
  game.start();
  await Film.iris(false);
});
$("btn-quiz").addEventListener("click", () => {
  $("btn-quiz").textContent = "בקרוב… 🔧";
});
