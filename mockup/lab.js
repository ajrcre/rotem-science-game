"use strict";

// ---------- The lab: a splash screen, then one corner per game ----------
// Loaded after game.js. Lines are recorded by tools/generate_voice.py (it reads LAB_LINES with node,
// so everything that touches the page lives inside functions).
const LAB_TITLE = "המעבדה של פרופסור מדעני";

const LAB_LINES = {
  lab_welcome: "ברוכים הבאים למעבדה שלי! בחרו פינה – ונתחיל לגלות!",
  lab_back: "לאן ממשיכים עכשיו? בחרו פינה במעבדה!",
  lab_locked: "הפינה הזאת עוד בבנייה – בקרוב נפתח אותה!",
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
      btn.addEventListener("pointerenter", () => this.hover(btn));
      btn.addEventListener("focus", () => this.hover(btn));
      btn.addEventListener("click", () => this.choose(c, btn));
      wrap.append(btn);
    }
  },

  show(from) {
    if (!this.built) this.build();
    $("lab").classList.add("show");
    this.professor.reset();
    const key = from === "splash" ? "lab_welcome" : "lab_back";
    setTimeout(() => this.say(LAB_LINES[key], [key]), 500);
  },

  hide() {
    $("lab").classList.remove("show");
    Narrator.stop();
  },

  say(text, voice, mood = "") {
    const bubble = $("lab-bubble");
    bubble.className = "bubble lab-bubble " + mood;
    restart(bubble, "show");
    $("lab-bubble-text").textContent = text;
    Narrator.speak(voice, (ms) => this.professor.play(["talk", "idle"], { fps: 4, ms }));
    this.professor.play(["talk", "idle"], { fps: 4, ms: Math.min(text.length * 24, 2600) });
  },

  hover(btn) {
    if (btn.classList.contains("locked")) return;
    Sfx.play("click", { volume: 0.35, rate: 1.3 });
  },

  choose(corner, btn) {
    if (corner.open) {
      Sfx.play("card_right", { volume: 0.7 });
      Screens.go(corner.open);
      return;
    }
    restart(btn, "nope");
    Sfx.play("card_wrong", { volume: 0.6 });
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
