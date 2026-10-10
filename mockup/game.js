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

const POSES = {
  professor: ["idle", "talk", "cheer", "worried", "point"],
  sparky: ["idle", "dance_a", "dance_b", "sad", "pull", "cheer"],
  alien: ["idle", "laugh", "scared"],
};

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
const poseSrc = (actor, pose) => `${ART}${actor}${pose === "idle" ? "" : "_" + pose}.png`;

function fitStage() {
  const stage = $("stage");
  const scale = Math.min(innerWidth / 1600, innerHeight / 900);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  stage.dataset.scale = scale;
}

function stageRect(el) {
  const s = parseFloat($("stage").dataset.scale) || 1;
  const base = $("stage").getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: (r.left - base.left) / s, y: (r.top - base.top) / s, w: r.width / s, h: r.height / s };
}

// ---------- Actor: frame-by-frame pose animation ----------
class Actor {
  constructor(name) {
    this.name = name;
    this.el = $(name);
    this.img = this.el.querySelector("img");
    this.timer = null;
    for (const p of POSES[name]) new Image().src = poseSrc(name, p);   // preload
    this.pose("idle");
  }

  pose(p) { this.img.src = poseSrc(this.name, p); }

  stop() { clearInterval(this.timer); this.timer = null; }

  // Cycle through frames at a given fps for a duration, then settle on `end`.
  play(frames, { fps = 8, ms = 1200, end = "idle", cls = null } = {}) {
    this.stop();
    clearTimeout(this.endTimer);
    let i = 0;
    this.pose(frames[0]);
    if (cls) restart(this.el, cls);
    if (frames.length > 1) {
      this.timer = setInterval(() => { i = (i + 1) % frames.length; this.pose(frames[i]); }, 1000 / fps);
    }
    if (ms !== Infinity) {
      this.endTimer = setTimeout(() => {
        this.stop();
        if (end) this.pose(end);
        if (cls) this.el.classList.remove(cls);
      }, ms);
    }
  }

  hold(p, cls = null) {
    this.stop();
    clearTimeout(this.endTimer);
    this.pose(p);
    if (cls) restart(this.el, cls);
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
      seed = (seed % 4) + 1;               // cycle a few seeds → hand-drawn "line boil"
      noise.setAttribute("seed", seed);
    }, 1000 / 12);
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
    const s = parseFloat($("stage").dataset.scale) || 1;
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

// ---------- Porthole cutscene ----------
const WindowScene = {
  async play() {
    const scene = $("window-scene");
    const ufo = $("ufo");
    ufo.src = poseSrc("alien", "idle");
    ufo.className = "ufo";
    $("boom").className = "boom";
    $("boom-word").className = "boom-word";
    $("space-beam").className = "space-beam";
    $("debris").innerHTML = "";

    await Film.iris(true);
    scene.classList.add("show");
    await Film.iris(false);

    restart(ufo, "enter");
    await wait(1500);
    ufo.src = poseSrc("alien", "scared");      // it sees the beam coming
    ufo.className = "ufo wobble";
    await wait(700);

    restart($("space-beam"), "fire");
    await wait(450);

    restart($("flash"), "go");
    Film.quake();
    ufo.classList.add("gone");
    $("space-beam").className = "space-beam done";
    this.debris();
    restart($("boom"), "go");
    await wait(350);
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
      img.src = poseSrc("alien", "scared");
      img.className = "debris-piece";
      img.style.clipPath = clip;
      const ang = (i / pieces.length) * Math.PI * 2 + 0.4;
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
      () => this.sparky.hold("pull", "strain"),
      () => { this.sparky.hold("idle"); this.sparky.el.classList.remove("strain"); },
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
    this.alien.hold("idle");
    this.sparky.hold("idle");
    this.say(this.level.intro, "");
    $("threat-fill").style.width = "20%";
    this.startTaunts();
  }

  // The alien taunts now and then while the player thinks.
  startTaunts() {
    clearInterval(this.tauntTimer);
    this.tauntTimer = setInterval(() => {
      if (!this.busy && this.step < this.level.steps.length) {
        this.alien.play(["laugh", "idle"], { fps: 7, ms: 900 });
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
    if (gesture === "talk") this.professor.play(["talk", "idle"], { fps: 6, ms: Math.min(text.length * 24, 2600) });
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
    this.professor.play(["cheer", "talk", "cheer", "idle"], { fps: 5, ms: 1700, cls: "cheer" });
    this.sparky.play(["dance_a", "dance_b"], { fps: 6, ms: 1500, cls: "dance" });
    this.alien.play(["scared"], { ms: 1200 });
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
    this.sparky.play(["sad"], { ms: 1300, cls: "sad" });
    this.alien.play(["laugh", "idle"], { fps: 8, ms: 1300, cls: "laugh" });
    $("threat-fill").style.width = `${Math.min(20 + this.mistakes * 15, 90)}%`;
    this.say(`🤔 ${CARDS[key].fact} אבל זה לא מה שצריך עכשיו. ${step.need}`, "bad", "none");
    this.professor.play(["worried"], { ms: 1500, cls: "shake" });
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
    this.professor.hold("point", "cheer");
    this.alien.play(["scared"], { ms: Infinity });
  }

  async leverPulled() {
    clearInterval(this.tauntTimer);
    this.sparky.el.classList.remove("strain");
    restart(this.goalSlot, "recoil");
    restart($("flash"), "go");
    Film.quake();
    this.sparky.play(["cheer"], { ms: 900, cls: "dance" });
    this.professor.play(["cheer"], { ms: 900, cls: "cheer" });
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
