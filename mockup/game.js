"use strict";

// ---------- Data ----------
const ART = "../assets/art/";

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

// ---------- Progress: best stars and quiz score per level (this browser only) ----------
const Progress = {
  key: "energy-defenders-progress-v1",
  load() {
    try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; }
  },
  best(id, field, value) {
    const data = this.load();
    data[id] ??= {};
    if (!(data[id][field] >= value)) data[id][field] = value;
    try { localStorage.setItem(this.key, JSON.stringify(data)); } catch { /* storage blocked: progress just isn't kept */ }
  },
};

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
  constructor(name, elementId = name) {
    this.name = name;
    this.el = $(elementId);
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
  // Swap to another character (each level has its own alien boss).
  setCharacter(name) {
    if (name === this.name) return;
    this.name = name;
    this.cache = CHARACTERS[name].poses.map((p) => Object.assign(new Image(), { src: frameSrc(name, p) }));
    this.current = null;
    this.pose("idle", false);
  }

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
    if (close) { Sfx.play("iris", { volume: 0.6 }); Narrator.stop(); }
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
  static REACH = 200;                      // stage px of straight downward drag for a full pull

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
    $("lever-guide").hidden = true;
    this.set(Lever.UP);
  }

  show() {
    this.active = true;
    $("lever-guide").hidden = false;
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
    $("lever-guide").hidden = true;
    this.startY = e.clientY;
    Sfx.play("click");
    this.onGrab();
  }

  drag(e) {
    if (!this.dragging) return;
    const p = this.pivot();
    // Angle from vertical: 0 = straight up, positive = leaning right (pulled down).
    const deg = (Math.atan2(e.clientX - p.x, p.y - e.clientY) * 180) / Math.PI;
    // A plain downward pull counts too, so kids who drag straight down still move the lever.
    const drop = (e.clientY - this.startY) / stageScale();
    const pulled = Lever.UP + (drop / Lever.REACH) * (Lever.DOWN - Lever.UP);
    this.set(Math.max(Lever.UP, Math.min(Lever.DOWN, Math.max(deg, pulled))));
    if (this.angle >= Lever.DOWN - 4) this.finish();
  }

  release() {
    if (!this.dragging) return;
    this.dragging = false;
    this.handle.classList.remove("dragging");
    this.handle.classList.add("spring");
    this.set(Lever.UP);
    $("lever-guide").hidden = false;
    this.onRelease();
  }

  finish() {
    this.dragging = false;
    this.active = false;
    this.handle.removeAttribute("tabindex");
    this.handle.classList.remove("dragging");
    this.handle.classList.add("spring");
    this.set(Lever.DOWN + 8);
    Sfx.play("lever_pull");
    this.onPulled();
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

  async play(level) {
    this.fx ??= new WeaponFX($("fx"));
    this.fx.reset();
    this.level = level;
    const weapon = WEAPONS[level.fx];
    const scene = $("window-scene");
    const ufo = $("ufo");
    const cannon = $("cannon");
    ufo.src = `${ART}${level.boss}.png`;
    ufo.className = "ufo";
    cannon.src = `${ART}${level.goal}.png`;
    cannon.className = "cannon";
    $("boom").className = "boom";
    $("boom-word").className = "boom-word";
    $("debris").innerHTML = "";

    await Film.iris(true);
    scene.classList.add("show");
    await Film.iris(false);

    restart(ufo, "enter");
    Sfx.play("ufo_arrive", { volume: 0.7 });
    await wait(1650);
    ufo.src = `${ART}${level.boss}_scared.png`;   // it spots the cannon
    ufo.className = "ufo wobble";
    Sfx.play("alien_scared");
    await wait(350);

    // Charge up.
    const muzzle = this.local(cannon, 0.2, 0.17);
    cannon.classList.add("charging");
    this.fx.chargeAt(muzzle, 850, weapon.charge);
    Sfx.play("charge", { volume: 0.7 });
    await wait(850);

    // Fire!
    const target = this.local(ufo, 0.5, 0.55);
    cannon.className = "cannon";
    restart(cannon, "recoil");
    this.fx.fire(level.fx, muzzle, target, weapon.ms);
    Sfx.play(`fire_${level.fx}`);
    Film.quake();
    await wait(weapon.hitAt);
    ufo.className = `ufo ${weapon.ufo}`;          // the hull heats up / shudders under fire
    await wait(weapon.ms - weapon.hitAt);

    // Kaboom.
    restart($("flash"), "go");
    Film.quake();
    Sfx.play("boom");
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
      img.src = `${ART}${this.level.boss}_scared.png`;
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

// ---------- Quiz: one renderer per question type (Strategy) ----------
const HEB_LETTERS = ["א", "ב", "ג", "ד", "ה"];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text ? { textContent: text } : {});

class ChoiceQuestion {
  constructor(q, onAnswer) { this.q = q; this.onAnswer = onAnswer; }

  render(root) {
    const grid = el("div", "choices");
    this.buttons = shuffle(this.q.options).map((opt, i) => {
      const b = el("button", "choice");
      b.type = "button";
      b.dataset.value = opt;
      b.append(el("span", "letter", HEB_LETTERS[i]), el("span", "", opt));
      b.addEventListener("click", () => this.choose(b));
      grid.append(b);
      return b;
    });
    root.append(grid);
    this.buttons[0].focus({ preventScroll: true });
  }

  choose(btn) {
    const correct = btn.dataset.value === this.q.answer;
    for (const b of this.buttons) {
      b.disabled = true;
      if (b.dataset.value === this.q.answer) b.classList.add("right");
      else if (b === btn) b.classList.add("wrong");
      else b.classList.add("dim");
    }
    this.onAnswer({ correct, given: btn.dataset.value });
  }
}

class OrderQuestion {
  constructor(q, onAnswer) { this.q = q; this.onAnswer = onAnswer; }

  render(root) {
    this.slotsEl = el("div", "order-slots");
    this.slots = this.q.items.map((_, i) => {
      const slot = el("div", "order-slot", String(i + 1));
      this.slotsEl.append(slot);
      if (i < this.q.items.length - 1) this.slotsEl.append(el("span", "arrow", "←"));
      return slot;
    });
    this.pool = el("div", "order-pool");
    for (const [key, label] of shuffle(this.q.items)) {
      const chip = el("button", "chip-btn");
      chip.type = "button";
      chip.dataset.key = key;
      chip.setAttribute("aria-label", label);
      chip.append(Object.assign(el("img"), { src: `${ART}${key}.png`, alt: "" }), el("span", "", label));
      chip.addEventListener("click", () => this.toggle(chip));
      this.pool.append(chip);
    }
    this.check = el("button", "btn small", "בדיקה");
    this.check.type = "button";
    this.check.disabled = true;
    this.check.addEventListener("click", () => this.submit());
    const actions = el("div", "q-actions");
    actions.append(this.check);
    root.append(this.slotsEl, this.pool, actions);
  }

  // Tap a card in the pool → next empty slot; tap a placed card → back to the pool.
  toggle(chip) {
    if (this.done) return;
    const slot = chip.closest(".order-slot");
    if (slot) {
      slot.textContent = String(this.slots.indexOf(slot) + 1);
      this.pool.append(chip);
    } else {
      const empty = this.slots.find((s) => !s.querySelector(".chip-btn"));
      if (!empty) return;
      empty.textContent = "";
      empty.append(chip);
    }
    this.check.disabled = this.slots.some((s) => !s.querySelector(".chip-btn"));
  }

  submit() {
    this.done = true;
    this.check.parentElement.remove();
    let correct = true;
    this.slots.forEach((slot, i) => {
      const chip = slot.querySelector(".chip-btn");
      const ok = chip.dataset.key === this.q.items[i][0];
      slot.classList.add(ok ? "right" : "wrong");
      chip.disabled = true;
      correct &&= ok;
    });
    this.onAnswer({ correct });
  }
}

class OpenQuestion {
  constructor(q, onAnswer) { this.q = q; this.onAnswer = onAnswer; }

  render(root) {
    const wrap = el("div", "q-open");
    const label = el("label", "", "כתבו את התשובה שלכם, כמו בבוחן:");
    label.htmlFor = "quiz-open-answer";
    this.input = el("textarea");
    this.input.id = "quiz-open-answer";
    this.input.rows = 3;
    this.input.placeholder = "התא הסולרי…";
    this.reveal = el("button", "btn small", "הצג תשובה לדוגמה");
    this.reveal.type = "button";
    this.reveal.disabled = true;
    this.input.addEventListener("input", () => { this.reveal.disabled = this.input.value.trim().length < 3; });
    this.reveal.addEventListener("click", () => this.showModel());
    const actions = el("div", "q-actions");
    actions.append(this.reveal);
    wrap.append(label, this.input, actions);
    root.append(wrap);
    this.wrap = wrap;
    this.actions = actions;
    this.input.focus({ preventScroll: true });
  }

  showModel() {
    this.input.readOnly = true;
    this.reveal.remove();
    const text = this.input.value.replace(/[֑-ׇ]/g, "");   // ignore niqqud
    const model = el("div", "model");
    model.append(el("strong", "", "תשובה לדוגמה: "), el("span", "", this.q.model));
    const kws = el("div", "keywords");
    kws.append(el("span", "", "מילות מפתח בתשובה שלך:"));
    for (const [label, variants] of this.q.keywords) {
      const hit = variants.some((v) => text.includes(v));
      kws.append(el("span", "kw" + (hit ? " hit" : ""), (hit ? "✓ " : "") + label));
    }
    const yes = el("button", "btn small", "צדקתי ✓");
    const no = el("button", "btn small alt", "צריך לחזור על זה");
    yes.type = no.type = "button";
    const grade = (correct) => { this.actions.remove(); this.onAnswer({ correct }); };
    yes.addEventListener("click", () => grade(true));
    no.addEventListener("click", () => grade(false));
    this.actions.append(yes, no);
    this.wrap.insertBefore(kws, this.actions);
    this.wrap.insertBefore(model, kws);
    yes.focus({ preventScroll: true });
  }
}

const QUESTION_TYPES = { choice: ChoiceQuestion, order: OrderQuestion, open: OpenQuestion };

class Quiz {
  constructor({ onNext, onMap }) {
    this.onNext = onNext;
    this.onMap = onMap;
    this.professor = new Actor("professor", "quiz-professor");
    this.sparky = new Actor("sparky", "quiz-sparky");
    this.body = $("quiz-body");
  }

  async open(level) {
    this.level = level;
    $("quiz-level").textContent = `שלב ${level.id} · ${level.title}`;
    await Film.iris(true);
    $("victory").classList.remove("show");
    $("quiz").classList.add("show");
    this.start();
    await Film.iris(false);
  }

  async close() {
    await Film.iris(true);
    $("quiz").classList.remove("show");
  }

  start() {
    this.questions = this.level.quiz;
    this.index = 0;
    this.results = [];
    const dots = $("quiz-dots");
    dots.innerHTML = "";
    this.questions.forEach((_, i) => dots.append(el("li", "", String(i + 1))));
    this.professor.reset();
    this.sparky.reset();
    this.show(0);
  }

  dot(i) { return $("quiz-dots").children[i]; }

  show(i) {
    const q = this.questions[i];
    this.body.innerHTML = "";
    [...$("quiz-dots").children].forEach((d, k) => d.classList.toggle("now", k === i));
    const meta = el("div", "q-meta");
    meta.append(el("span", "", `שאלה ${i + 1} מתוך ${this.questions.length}`), el("span", "q-tag", q.tag));
    this.body.append(meta, el("p", "q-prompt", q.prompt));
    new QUESTION_TYPES[q.type](q, (r) => this.answered(q, r)).render(this.body);
    Narrator.speak([`prompt_${this.level.id}_${i}`], (ms) => this.professor.play(["talk", "idle"], { fps: 4, ms }));
    this.professor.play(["talk", "idle"], { fps: 4, ms: 1400 });
  }

  answered(q, { correct }) {
    this.results.push({ q, correct });
    const d = this.dot(this.index);
    d.classList.remove("now");
    d.classList.add(correct ? "ok" : "miss");
    Sfx.play(correct ? "quiz_right" : "quiz_wrong");
    Narrator.speak([`explain_${this.level.id}_${this.index}`]);
    if (correct) {
      this.professor.play(["cheer", "idle"], { fps: 3, ms: 1100, react: "jump" });
      this.sparky.play(["dance_a", "dance_b"], { fps: 3, ms: 1200, react: "dance" });
    } else {
      this.professor.play(["worried"], { ms: 1300, react: "tremble" });
      this.sparky.play(["sad"], { ms: 1300, react: "droop" });
    }
    const fb = el("div", "feedback " + (correct ? "good" : "bad"));
    const text = el("div", "fb-text");
    text.append(el("h3", "", correct ? "נכון! 🎉" : "לא בדיוק…"), el("p", "", q.explain));
    const last = this.index === this.questions.length - 1;
    const next = el("button", "btn small", last ? "לסיכום" : "לשאלה הבאה");
    next.type = "button";
    next.addEventListener("click", () => (last ? this.summary() : this.show(++this.index)));
    fb.append(text, next);
    this.body.append(fb);
    fb.scrollIntoView({ block: "nearest" });   // scrolls only the sheet, never the stage
    next.focus({ preventScroll: true });
  }

  summary() {
    const right = this.results.filter((r) => r.correct).length;
    const total = this.results.length;
    const stars = right === total ? 3 : right >= total - 2 ? 2 : 1;
    [...$("quiz-dots").children].forEach((d) => d.classList.remove("now"));
    this.body.innerHTML = "";
    const card = el("div", "summary-card");
    const score = el("div", "score", String(right));
    score.append(el("small", "", ` / ${total}`));
    const starRow = el("div", "big-stars");
    starRow.innerHTML = [0, 1, 2]
      .map((i) => `<span class="${i < stars ? "" : "lost"}" style="animation-delay:${0.2 + i * 0.2}s">★</span>`).join("");
    Progress.best(this.level.id, "quiz", right);
    const verdict = right === total ? `מושלם! אתם מוכנים לבוחן על ${this.level.title}.`
      : right >= total - 1 ? "כמעט מושלם! עברו על הנקודה שלמטה וזהו."
      : "התחלה טובה! כדאי לחזור על הנקודות האלה ולנסות שוב.";
    card.append(starRow, score, el("p", "verdict", verdict));

    const misses = this.results.filter((r) => !r.correct);
    const review = el("div", "review");
    if (misses.length) {
      review.append(el("h3", "", "כדאי לחזור על:"));
      for (const { q } of misses) {
        const item = el("div", "review-item");
        item.append(el("strong", "", q.prompt), el("span", "", q.review));
        review.append(item);
      }
    } else {
      review.append(el("p", "all-right", "ענית נכון על הכול – אין מה לחזור. כל הכבוד!"));
    }
    const again = el("button", "btn small alt", "נסו שוב את הבוחן");
    const hasNext = LEVELS.some((l) => l.id === this.level.id + 1);
    const next = el("button", "btn small", hasNext ? "לשלב הבא" : "למפת השלבים");
    const map = el("button", "btn small alt", "מפת השלבים");
    again.type = next.type = map.type = "button";
    again.addEventListener("click", () => this.start());
    next.addEventListener("click", () => (hasNext ? this.onNext(this.level) : this.onMap()));
    map.addEventListener("click", () => this.onMap());
    const actions = el("div", "q-actions");
    actions.append(next, again);
    if (hasNext) actions.append(map);
    card.append(review, actions);
    this.body.append(card);

    if (right >= total - 1) {
      this.professor.play(["cheer", "talk", "cheer", "idle"], { fps: 3, ms: 1800, react: "jump" });
      this.sparky.play(["dance_a", "dance_b"], { fps: 3, ms: 2000, react: "dance" });
    } else {
      this.professor.play(["talk", "idle"], { fps: 4, ms: 1600 });
    }
    next.focus({ preventScroll: true });
  }
}

// ---------- Game ----------
class Workbench {
  constructor({ onVictory }) {
    this.onVictory = onVictory;
    this.professor = new Actor("professor");
    this.sparky = new Actor("sparky");
    this.alien = new Actor("alien");
    this.lever = new Lever(
      () => { this.sparky.hold("pull"); this.sparky.rig.strain(true); },
      () => { this.sparky.hold("idle"); this.sparky.rig.strain(false); },
      () => this.leverPulled(),
    );
  }

  start(level = this.level) {
    this.level = level;
    $("level-num").textContent = `שלב ${level.id}`;
    $("level-title").textContent = level.title;
    $("chain").classList.toggle("long", level.steps.length > 4);
    this.alien.setCharacter(level.boss);
    this.step = 0;
    this.mistakes = 0;
    this.busy = false;
    this.run = (this.run || 0) + 1;              // bumps on every start/stop, so stale awaits can tell
    this.renderChain();
    this.renderCards();
    this.updateStars();
    this.lever.reset();
    WindowScene.hide();
    $("cards").classList.remove("away");
    document.querySelector(".tray").classList.remove("empty");
    $("alien").className = "actor alien";
    for (const a of [this.professor, this.sparky, this.alien]) a.reset();
    this.say(this.level.intro, "", "talk", [`intro_${level.id}`]);
    $("threat-fill").style.width = "20%";
    this.startTaunts();
  }

  // The alien taunts now and then while the player thinks.
  startTaunts() {
    clearInterval(this.tauntTimer);
    this.tauntTimer = setInterval(() => {
      if (!this.busy && this.step < this.level.steps.length) {
        Sfx.play("alien_laugh", { volume: 0.5, rate: rand(0.9, 1.1) });
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

  // Professor speaks: typewriter text and his recorded voice while his mouth flaps between poses.
  // Resolves once the line is over: the recording has ended and the bubble had time to be read.
  say(text, mood, gesture = "talk", voice = []) {
    const mouth = (ms) => this.professor.play(["talk", "idle"], { fps: 4, ms });
    const spoken = Narrator.speak(voice, gesture === "talk" ? mouth : null);
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
    const readMs = (text.length / 2) * 45 + 1200;   // typewriter time + a beat to finish reading
    return Promise.all([spoken, wait(readMs)]);
  }

  // One rule for the HUD, the victory screen and the level map: a star per mistake, never below one.
  stars() { return Math.max(3 - this.mistakes, 1); }

  updateStars() {
    const stars = this.stars();
    [...$("hud-stars").children].forEach((s, i) => s.classList.toggle("lost", i >= stars));
  }

  async pick(btn) {
    const step = this.level.steps[this.step];
    if (this.busy || !step) return;
    const key = btn.dataset.key;
    if (key !== step.card) return this.wrong(btn, key, step);
    this.busy = true;
    const run = this.run;
    Sfx.play("click");
    await this.flyToSlot(btn, this.slots[this.step]);
    Sfx.play("card_right");
    const said = this.say(step.good, "good", "none", [`good_${this.level.id}_${this.step}`]);
    this.professor.play(["cheer", "talk", "cheer", "idle"], { fps: 3, ms: 1700, react: "jump" });
    this.sparky.play(["dance_a", "dance_b"], { fps: 3, ms: 1500, react: "dance" });
    this.alien.play(["scared"], { ms: 1200, react: "tremble" });
    this.step += 1;
    this.slots[this.step]?.classList.add("current");
    if (this.step === this.level.steps.length) {
      await said;                                  // let the professor finish before the weapon charges
      await wait(400);
      if (run !== this.run) return;                // left or restarted the level while he was talking
      await this.armLever();
    }
    this.busy = false;
  }

  wrong(btn, key, step) {
    this.mistakes += 1;
    this.updateStars();
    restart(btn, "wrong");
    Sfx.play("card_wrong", { volume: 0.8 });
    Sfx.play("alien_laugh", { volume: 0.6 });
    this.sparky.play(["sad"], { ms: 1400, react: "droop" });
    this.alien.play(["laugh", "idle"], { fps: 5, ms: 1300, react: "giggle" });
    $("threat-fill").style.width = `${Math.min(20 + this.mistakes * 15, 90)}%`;
    this.say(`🤔 ${CARDS[key].fact} אבל זה לא מה שצריך עכשיו. ${step.need}`, "bad", "none",
             [`fact_${key}`, "not_now", `need_${this.level.id}_${this.step}`]);
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
    Sfx.play("energy_flow", { volume: 0.7 });
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
    Sfx.play("lever_ready");
    this.say(this.level.leverLine, "good", "none", [`lever_${this.level.id}`]);
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
    await WindowScene.play(this.level);          // ...and we watch it explode outside
    await Film.iris(true);
    WindowScene.hide();
    this.showVictory();
    await Film.iris(false);
  }

  showVictory() {
    const stars = this.stars();
    Progress.best(this.level.id, "stars", stars);
    const next = LEVELS.find((l) => l.id === this.level.id + 1);
    $("btn-next").textContent = next ? "לשלב הבא" : "למפת השלבים";
    $("big-stars").innerHTML = [0, 1, 2]
      .map((i) => `<span class="${i < stars ? "" : "lost"}" style="animation-delay:${0.3 + i * 0.25}s">★</span>`)
      .join("");
    $("summary").innerHTML = this.level.summary
      .map(([t, conv]) => `<span class="chip${conv ? " conv" : ""}">${t}</span>`)
      .join("<span>←</span>");
    $("victory").classList.add("show");
    Sfx.play("victory");
    for (let i = 0; i < stars; i++) setTimeout(() => Sfx.play("star", { rate: 1 + i * 0.12 }), 300 + i * 250);
    this.onVictory?.(this.level);
  }

  stop() {
    this.run = (this.run || 0) + 1;
    Narrator.stop();
    clearInterval(this.tauntTimer);
    clearInterval(this.typeTimer);
    this.busy = true;
  }
}

// ---------- Level map ----------
const LevelMap = {
  render() {
    const progress = Progress.load();
    const grid = $("level-grid");
    grid.innerHTML = "";
    const firstOpen = LEVELS.find((l) => !progress[l.id]?.stars);
    for (const level of LEVELS) {
      const p = progress[level.id] || {};
      const btn = el("button", "level-card" + (p.stars ? " done" : "") + (level === firstOpen ? " next" : ""));
      btn.type = "button";
      btn.setAttribute("aria-label", `שלב ${level.id}: ${level.title}`);
      const stars = [0, 1, 2].map((i) => `<span class="${i < (p.stars || 0) ? "" : "lost"}">★</span>`).join("");
      btn.innerHTML = `
        <span class="level-num">${level.id}</span>
        <img class="level-boss" src="${ART}${level.boss}.png" alt="">
        <img class="level-weapon" src="${ART}${level.goal}.png" alt="">
        <strong>${level.title}</strong>
        <span class="level-stars">${stars}</span>
        <span class="level-quiz">${p.quiz != null ? `בוחן: ${p.quiz}/${level.quiz.length}` : "בוחן: עוד לא"}</span>`;
      btn.addEventListener("click", () => playLevel(level));
      grid.append(btn);
    }
  },
  show() { this.render(); $("levels").classList.add("show"); },
  hide() { $("levels").classList.remove("show"); },
};

// ---------- Boot ----------
addEventListener("resize", fitStage);
$("stage").addEventListener("scroll", (e) => { e.target.scrollTop = 0; e.target.scrollLeft = 0; });
fitStage();
Sfx.init();
Film.start();
Rig.loop();

const game = new Workbench({});

async function playLevel(level) {
  await Film.iris(true);
  LevelMap.hide();
  $("victory").classList.remove("show");
  $("quiz").classList.remove("show");
  game.start(level);
  await Film.iris(false);
}

async function showMap() {
  await Film.iris(true);
  game.stop();
  WindowScene.hide();
  $("victory").classList.remove("show");
  $("quiz").classList.remove("show");
  LevelMap.show();
  await Film.iris(false);
}

const nextLevel = (level) => {
  const next = LEVELS.find((l) => l.id === level.id + 1);
  return next ? playLevel(next) : showMap();
};

const quiz = new Quiz({ onNext: nextLevel, onMap: showMap });
$("btn-replay").addEventListener("click", () => playLevel(game.level));
$("btn-next").addEventListener("click", () => nextLevel(game.level));
$("btn-quiz").addEventListener("click", () => quiz.open(game.level));
$("btn-map").addEventListener("click", showMap);
