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

// Old-movie credits, one card at a time: [role, name] (no role = a title card), or a cast list
// { heading, list, ms } in smaller print.
const CREDITS = [
  ["", LAB_TITLE],
  ["יוצר", "רותם ברק"],
  ["במאי", "רותם ברק"],
  ["מפיק ראשי", "קלוד קוד"],
  ["מוסיקה", "סונו"],
  ["איורים", "ג׳ימיני"],
  ["קולות ואפקטים", "אילבן לאבס"],
  {
    heading: "בהשתתפות",
    ms: 8000,
    list: [
      "פרופסור מדעני", "ספארקי, העוזר הנאמן",
      "התמנון בעל שלוש העיניים (חייזר 1)", "האוזניים המעופפות (חייזר 2)",
      "ראש המדחף (חייזר 3)", "דג החלל (חייזר 4)",
      "רובוט הארובות (חייזר 5)", "מלך החייזרים (חייזר 6)",
      "הידית המדברת", "עכבר מעבדה 1", "עכבר מעבדה 2", "אב הבית", "טוסטר משולשים",
      "אל פצ׳ינו", "רוברט דנירו", "קוונטין טרנטינו", "סידני סוויני",
    ],
  },
  ["", "סוף"],
];

// Lab ambience: a busy room. Every second or so one to three of these play together,
// each from the corner it belongs to (stereo pan: chemistry left … space right).
const LAB_AMBIENCE = [
  { name: "amb_bubbles", pan: -0.75 },
  { name: "amb_boil",    pan: -0.7 },
  { name: "amb_drip",    pan: -0.8 },
  { name: "amb_pop",     pan: -0.6 },
  { name: "amb_clink",   pan: -0.55 },
  { name: "amb_zap",     pan: -0.25 },
  { name: "amb_tesla",   pan: -0.15 },
  { name: "amb_whirr",   pan: -0.3 },
  { name: "amb_steam",   pan: 0.1 },
  { name: "amb_beeps",   pan: 0.35 },
  { name: "amb_gears",   pan: 0.45 },
];

// ---------- Ambience: the busy-lab background noise (lab room and Energy Defenders levels) ----------
// Every second or so one to three effects play together. Softer and sparser while the professor
// talks; `hush()` silences it (the lab's bathroom gag). `volume` scales it per place.
const Ambience = {
  start({ volume = 0.5 } = {}) {
    this.volume = volume;
    this.hushed = false;
    clearTimeout(this.timer);
    this.tick();
  },

  stop() { clearTimeout(this.timer); this.timer = null; },

  hush(on) { this.hushed = on; },

  tick() {
    this.timer = setTimeout(() => {
      if (!this.hushed) {
        const talking = Boolean(Narrator.src);
        const count = talking ? 1 : 1 + Math.floor(Math.random() * 3);
        for (const fx of shuffle(LAB_AMBIENCE).slice(0, count)) {
          setTimeout(() => {
            if (this.timer) Sfx.play(fx.name, { volume: this.volume * (talking ? 0.4 : 1), pan: fx.pan, rate: rand(0.9, 1.1) });
          }, rand(0, 400));
        }
      }
      this.tick();
    }, rand(700, 2000));
  },
};

// Resolves once every image is downloaded and decoded (a broken one counts as done).
const loadImages = (urls) => Promise.all(urls.map((src) => {
  const img = Object.assign(new Image(), { src });
  return img.decode().catch(() => {});
}));

// ---------- Screens: splash → lab → a game (State) ----------
// `music` is the loop that plays on the screen (null = silence); see Music in sound.js.
// `ready()` resolves when the screen's painting is in; the iris stays shut until then (slow phones).
// Every screen but the splash has its own address (#lab, #energy, #credits), so links and the back button work.
// It is still one page: moving to another page would silence the sound until the next tap.
const Screens = {
  current: null,
  pending: null,          // a screen asked for during a transition, shown right after it
  readyMs: 6000,          // never keep the iris shut longer than this, loaded or not
  states: {
    splash: {
      music: null,
      ready: () => loadImages([`${ART}splash.jpg`, frameSrc("professor", "idle")]),
      enter() { Splash.show(); },
      leave() { Splash.hide(); },
    },
    lab: {
      music: "lab",
      ready: () => Lab.ready(),
      enter(from) { Lab.show(from); },
      leave() { Lab.hide(); },
    },
    credits: {
      music: "credits",
      enter() { Credits.show(); },
      leave() { Credits.hide(); },
    },
    energy: {
      music: "lab",             // the level map; playLevel() stops it for the game itself
      enter() { LevelMap.show(); },
      leave() { game.stop(); WindowScene.hide(); LevelMap.hide(); $("victory").classList.remove("show"); $("quiz").classList.remove("show"); },
    },
  },

  // The screen the address asks for (the splash when it names none).
  fromUrl() {
    const name = decodeURIComponent(location.hash.slice(1));
    return Object.hasOwn(this.states, name) ? name : "splash";
  },

  // `push: false` when the address already says where we're going (back button, typed link).
  async go(name, { push = true } = {}) {
    if (this.busy) { this.pending = { name, push }; return; }
    this.busy = true;
    if (push) {
      const url = name === "splash" ? location.pathname + location.search : `#${name}`;
      if (this.fromUrl() !== name) history.pushState(null, "", url);
    }
    const from = this.current;
    if (from) await Film.iris(true);
    if (from) this.states[from].leave();
    this.current = name;
    $("stage").dataset.screen = name;           // lets CSS stop painting the workbench under full-screen hubs
    const state = this.states[name];
    if (state.music) Music.play(state.music); else Music.stop();
    await Promise.race([state.ready?.(), wait(this.readyMs)]);
    state.enter(from);
    await Film.iris(false);                     // the page starts with the iris shut, too
    this.busy = false;
    const next = this.pending;
    this.pending = null;
    if (next && next.name !== this.current) this.go(next.name, next);
  },
};

// ---------- Splash: the title card, waiting for a tap ----------
// Browsers keep a page silent until the first tap/click/key, so the splash asks for one: it opens
// the sound for everything after it (the professor greets you in the lab).
const Splash = {
  show() {
    $("splash").classList.add("show");
    this.actor ??= new Actor("professor", "splash-professor");
    this.actor.reset();
    setTimeout(() => this.actor.play(["cheer", "idle"], { fps: 3, ms: 1400, react: "jump" }), 900);
    const enter = (e) => {
      if (e.type === "keydown" && !["Enter", " "].includes(e.key)) return;
      if (e.target.closest?.("#btn-sound")) return;     // muting on the splash shouldn't leave it
      removeEventListener("click", enter);
      removeEventListener("keydown", enter);
      if (Screens.current !== "splash") return;
      Splash.tapped = true;
      const target = Screens.fromUrl();                // a link to #energy lands there after the tap
      Screens.go(target === "splash" ? "lab" : target, { push: target === "splash" });
    };
    addEventListener("click", enter);
    addEventListener("keydown", enter);
    setTimeout(() => $("btn-enter").focus({ preventScroll: true }), 1800);
  },

  hide() { $("splash").classList.remove("show"); },
};

// ---------- Credits: black screen, white text, cards like an old film ----------
const Credits = {
  cardMs: 3000,

  show() {
    $("credits").classList.add("show");
    const run = (this.run = (this.run || 0) + 1);
    const card = $("credits-card");
    const showCard = (i) => {
      if (run !== this.run) return;
      if (i >= CREDITS.length) { Screens.go("lab"); return; }
      const entry = CREDITS[i];
      const last = i === CREDITS.length - 1;
      let ms = last ? this.cardMs + 1000 : this.cardMs;
      if (Array.isArray(entry)) {
        const [role, name] = entry;
        card.className = "credits-card" + (role ? "" : " title") + (last ? " end" : "");
        card.replaceChildren(...(role ? [el("small", "", role)] : []), el("strong", "", name));
      } else {                                       // the cast: a heading over a two-column list
        ms = entry.ms;
        const list = el("ul", "cast");
        list.append(...entry.list.map((n) => el("li", "", n)));
        card.className = "credits-card cast-card";
        card.replaceChildren(el("strong", "", entry.heading), list);
      }
      card.style.animationDuration = last ? "" : `${ms}ms`;
      restart(card, "in");
      this.timer = setTimeout(() => showCard(i + 1), ms);
    };
    showCard(0);
    setTimeout(() => $("btn-credits-back").focus({ preventScroll: true }), 300);
  },

  hide() {
    this.run = (this.run || 0) + 1;
    clearTimeout(this.timer);
    $("credits").classList.remove("show");
  },
};

// ---------- Lab hub ----------
const Lab = {
  idleMs: 25000,          // this long without choosing a corner, and the professor has to go…
  run: 0,                 // bumps whenever the lab is entered or left, so a running skit can tell it's stale

  // Builds the room once; resolves when its painting, corner layers and professor are loaded.
  ready() {
    this.building ??= this.build().catch((err) => console.error(err));   // a missing file must not lock the screens
    return this.building;
  },

  async build() {
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
    await loadImages([`${ART}lab_hub.jpg`, frameSrc("professor", "idle"), ...LAB_CORNERS.map((c) => `${ART}hub_${c.id}.png`)]);
  },

  show(from) {
    this.ready();
    $("lab").classList.add("show");
    this.cancelSkit();
    $("lab-bubble").hidden = true;                  // no empty bubble before the greeting
    this.pottyDone = false;
    const key = from === "splash" ? "lab_welcome" : "lab_back";
    setTimeout(() => this.say(LAB_LINES[key], [key]), 500);
    this.armIdle();
    Ambience.start({ volume: 0.5 });
  },

  hide() {
    $("lab").classList.remove("show");
    Ambience.stop();
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
    Ambience.hush(false);
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
    Ambience.hush(true);                            // the lab hushes so the bathroom can be heard
    await this.walk(1100, false);                   // off the right edge, to the bathroom
    if (!live()) return;

    for (const [name, pause] of [["door_open", 1900], ["pee", 3300], ["fart", 1100], ["door_close", 1700]]) {
      Sfx.play(name);
      await wait(pause);
      if (!live()) return;
    }

    await this.walk(0, true);                       // back in from the right, facing left
    if (!live()) return;
    Ambience.hush(false);
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
    const step = () => { this.professor.rig.y.kick(-160); Sfx.play("step", { volume: 0.8 }); };
    step();
    this.stepTimer = setInterval(step, 200);       // a bounce and a footstep on every step
    el.style.transition = `transform ${ms}ms linear`;
    el.style.transform = `translateX(${toX}px)${flip}`;
    await wait(ms);
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
  $("btn-credits").addEventListener("click", () => Screens.go("credits"));
  $("btn-credits-back").addEventListener("click", () => Screens.go("lab"));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && Screens.current === "credits") Screens.go("lab"); });
  // Back/forward and edited addresses. Before the first tap only the splash may show (the sound is still locked);
  // its tap then follows whatever the address says.
  addEventListener("popstate", () => {
    const name = Screens.fromUrl();
    if (Splash.tapped && name !== Screens.current) Screens.go(name, { push: false });
  });
  Screens.go("splash", { push: false });
}
