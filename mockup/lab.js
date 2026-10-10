"use strict";

// ---------- The lab: a splash screen, then one corner per game ----------
// Loaded after game.js. Lines are recorded by tools/generate_voice.py (it reads LAB_LINES with node,
// so everything that touches the page lives inside functions).
const LAB_TITLE = "המעבדה של פרופסור מדעני";

const LAB_LINES = {
  lab_welcome: "ברוכים הבאים למעבדה שלי! בחרו פינה – ונתחיל לגלות!",
  lab_back: "לאן ממשיכים עכשיו? בחרו פינה במעבדה!",
  lab_locked: "הפינה הזאת עוד בבנייה – בקרוב נפתח אותה!",
  lab_potty: "אוי אוי אוי… חכו רגע, אני חייב לשירותים! מיד חוזר!",
  lab_thanks: "תודה שחיכיתם לי. אפשר להתחיל!",
};

// Registry of lab corners. A new game = a new entry with an `open` screen; without one it shows as "בקרוב".
// The room is one painting (lab_hub.jpg); each station is a layer cut from it by tools/cut_lab_layers.py,
// placed by assets/art/lab_hub_layers.json so it lines up exactly until it is hovered. `fx` picks the particles.
const LAB_CORNERS = [
  { id: "chemistry", label: "פינת הכימיה",         fx: "bubbles" },
  { id: "energy",    label: "פינת האנרגיה",        fx: "sparks", open: "energy", game: "מגיני האנרגיה" },
  { id: "electric",  label: "פינת החשמל והמגנטים", fx: "zaps", signX: "66%" },   // clear of the professor
  { id: "space",     label: "פינת החלל",           fx: "stars" },
];

// ---------- Screens: splash → lab → a game (State) ----------
const Screens = {
  current: null,
  states: {
    splash: {
      enter() { Splash.show(); },
      leave() { Splash.hide(); },
    },
    lab: {
      enter(from) { Lab.show(from); },
      leave() { Lab.hide(); },
    },
    energy: {
      enter() { LevelMap.show(); },
      leave() { game.stop(); WindowScene.hide(); LevelMap.hide(); $("victory").classList.remove("show"); $("quiz").classList.remove("show"); },
    },
  },

  async go(name) {
    if (this.busy) return;
    this.busy = true;
    const from = this.current;
    if (from) await Film.iris(true);
    if (from) this.states[from].leave();
    this.current = name;
    $("stage").dataset.screen = name;           // lets CSS stop painting the workbench under full-screen hubs
    this.states[name].enter(from);
    if (from) await Film.iris(false);
    this.busy = false;
  },
};

// ---------- Splash: the title card for a few seconds; a tap skips it ----------
const Splash = {
  ms: 3800,

  show() {
    $("splash").classList.add("show");
    this.actor ??= new Actor("professor", "splash-professor");
    this.actor.reset();
    setTimeout(() => this.actor.play(["cheer", "idle"], { fps: 3, ms: 1400, react: "jump" }), 900);
    const next = () => {
      clearTimeout(this.timer);
      removeEventListener("pointerdown", next);
      removeEventListener("keydown", next);
      if (Screens.current === "splash") Screens.go("lab");
    };
    this.timer = setTimeout(next, this.ms);
    addEventListener("pointerdown", next);
    addEventListener("keydown", next);
  },

  hide() { $("splash").classList.remove("show"); },
};

// ---------- Lab hub ----------
const Lab = {
  built: false,
  idleMs: 25000,          // this long without choosing a corner, and the professor has to go…
  run: 0,                 // bumps whenever the lab is entered or left, so a running skit can tell it's stale

  async build() {
    this.built = true;
    this.professor = new Actor("professor", "lab-professor");
    const layout = await fetch(`${ART}lab_hub_layers.json`).then((r) => r.json());
    const wrap = $("lab-corners");
    for (const c of LAB_CORNERS) {
      const box = layout[c.id];
      const btn = el("button", `lab-corner fx-${c.fx}` + (c.open ? "" : " locked"));
      btn.type = "button";
      btn.dataset.id = c.id;
      Object.assign(btn.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
      if (c.signX) btn.style.setProperty("--sign-x", c.signX);
      btn.setAttribute("aria-label", c.open ? `${c.label}: ${c.game}` : `${c.label} – בקרוב`);
      const fx = el("span", "corner-fx");
      for (let i = 0; i < 8; i++) {
        const p = el("i");
        p.style.setProperty("--i", i);
        fx.append(p);
      }
      const sign = el("span", "corner-sign");
      sign.append(el("strong", "", c.label), el("small", "", c.open ? c.game : "בקרוב"));
      btn.append(Object.assign(el("img"), { src: `${ART}hub_${c.id}.png`, alt: "" }), fx, sign);
      btn.addEventListener("pointerenter", () => { this.hover(btn); this.armIdle(); });
      btn.addEventListener("focus", () => this.hover(btn));
      btn.addEventListener("click", () => this.choose(c, btn));
      wrap.append(btn);
    }
    for (const type of ["pointerdown", "keydown"]) $("lab").addEventListener(type, () => this.armIdle());
  },

  show(from) {
    if (!this.built) this.build();
    $("lab").classList.add("show");
    this.cancelSkit();
    this.pottyDone = false;
    const key = from === "splash" ? "lab_welcome" : "lab_back";
    setTimeout(() => this.say(LAB_LINES[key], [key]), 500);
    this.armIdle();
  },

  hide() {
    $("lab").classList.remove("show");
    this.cancelSkit();
    Narrator.stop();
  },

  // Resolves when the line is over: recording ended and the bubble had time to be read.
  say(text, voice, mood = "") {
    const bubble = $("lab-bubble");
    bubble.className = "bubble lab-bubble " + mood;
    bubble.hidden = false;
    restart(bubble, "show");
    $("lab-bubble-text").textContent = text;
    const spoken = Narrator.speak(voice, (ms) => this.professor.play(["talk", "idle"], { fps: 4, ms }));
    this.professor.play(["talk", "idle"], { fps: 4, ms: Math.min(text.length * 24, 2600) });
    return Promise.all([spoken, wait(text.length * 30 + 800)]);
  },

  // ---------- The bathroom skit: plays once per visit after a long wait ----------
  armIdle() {
    clearTimeout(this.idleTimer);
    if (this.pottyDone || this.inSkit) return;
    this.idleTimer = setTimeout(() => this.potty(), this.idleMs);
  },

  cancelSkit() {
    this.run += 1;
    this.inSkit = false;
    clearTimeout(this.idleTimer);
    clearInterval(this.stepTimer);
    const el = $("lab-professor");
    el.style.transition = "none";
    el.style.transform = "";
    $("lab-bubble").hidden = false;
    this.professor?.reset();
  },

  async potty() {
    const run = (this.run += 1);
    const live = () => run === this.run;
    this.inSkit = true;
    this.pottyDone = true;
    const prof = this.professor;

    prof.play(["hurry"], { ms: Infinity });
    prof.rig.tremble(Infinity, 2.5);
    await this.sayHold(LAB_LINES.lab_potty, ["lab_potty"]);
    if (!live()) return;
    prof.rig.tremble(0);

    $("lab-bubble").hidden = true;
    await this.walk(1100, false);                   // off the right edge, to the bathroom
    if (!live()) return;

    for (const [name, pause] of [["door_open", 1900], ["pee", 3300], ["fart", 1100], ["door_close", 1700]]) {
      Sfx.play(name);
      await wait(pause);
      if (!live()) return;
    }

    await this.walk(0, true);                       // back in from the right, facing left
    if (!live()) return;
    prof.play(["cheer", "idle"], { fps: 3, ms: 1000, react: "jump" });
    await wait(500);
    if (!live()) return;
    await this.say(LAB_LINES.lab_thanks, ["lab_thanks"]);
    if (live()) this.inSkit = false;
  },

  // Like say(), but the professor keeps his current pose instead of flapping between talk and idle.
  sayHold(text, voice) {
    const bubble = $("lab-bubble");
    bubble.className = "bubble lab-bubble";
    bubble.hidden = false;
    restart(bubble, "show");
    $("lab-bubble-text").textContent = text;
    return Promise.all([Narrator.speak(voice), wait(text.length * 30 + 800)]);
  },

  // Walk to an x offset (stage px from his spot). Facing right by default; `back` mirrors him to face left.
  async walk(toX, back, ms = 2400) {
    const el = $("lab-professor");
    const flip = back ? " scaleX(-1)" : "";
    if (back) {                                     // start from where he left, already turned around
      el.style.transition = "none";
      el.style.transform = `translateX(1100px)${flip}`;
      void el.offsetWidth;
    }
    this.professor.play(["walk_a", "walk_b"], { fps: 5, ms: Infinity });
    clearInterval(this.stepTimer);
    this.stepTimer = setInterval(() => this.professor.rig.y.kick(-160), 200);   // a bounce on every step
    Sfx.play("footsteps");
    const again = setTimeout(() => Sfx.play("footsteps"), 1500);
    el.style.transition = `transform ${ms}ms linear`;
    el.style.transform = `translateX(${toX}px)${flip}`;
    await wait(ms);
    clearTimeout(again);
    clearInterval(this.stepTimer);
    el.style.transition = "none";
    if (!back) return;
    el.style.transform = "";
    this.professor.hold("idle");
  },

  hover(btn) {
    if (btn.classList.contains("locked")) return;
    Sfx.play("click", { volume: 0.35, rate: 1.3 });
  },

  choose(corner, btn) {
    if (corner.open) {
      this.cancelSkit();
      Sfx.play("card_right", { volume: 0.7 });
      Screens.go(corner.open);
      return;
    }
    restart(btn, "nope");
    Sfx.play("card_wrong", { volume: 0.6 });
    if (this.inSkit) return;                        // he's busy (maybe not even in the room)
    this.professor.play(["worried"], { ms: 1300, react: "tremble" });
    this.say(LAB_LINES.lab_locked, ["lab_locked"], "bad");
  },
};

// ---------- Boot ----------
if (typeof document !== "undefined") {
  $("splash-title").textContent = LAB_TITLE;
  $("lab-title").textContent = LAB_TITLE;
  $("btn-lab").addEventListener("click", () => Screens.go("lab"));
  Screens.go("splash");
}
