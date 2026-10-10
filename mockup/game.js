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
      good: "נכון! אנרגיה חשמלית זורמת ללייזר, והוא ממיר אותה בחזרה לאור. אש!!!" },
  ],
  goal: "laser",
  deck: ["battery", "solar_panel", "speaker", "sun", "electricity", "turbine", "heat", "light"],
  summary: [["שמש"], ["אור"], ["תא סולרי", true], ["חשמל"], ["לייזר", true], ["אור"]],
};

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

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
};

// ---------- Game ----------
class Workbench {
  constructor(level) {
    this.level = level;
    this.step = 0;
    this.mistakes = 0;
    this.busy = false;
  }

  start() {
    this.renderChain();
    this.renderCards();
    this.updateStars();
    this.say(this.level.intro, "");
    $("threat-fill").style.width = "20%";
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

  say(text, mood) {
    const b = $("bubble");
    $("bubble-text").textContent = text;
    b.className = "bubble " + (mood || "");
    restart(b, "show");
  }

  updateStars() {
    const lost = Math.min(this.mistakes, 2);
    [...$("hud-stars").children].forEach((s, i) => s.classList.toggle("lost", i >= 3 - lost));
  }

  async pick(btn) {
    if (this.busy) return;
    const key = btn.dataset.key;
    const step = this.level.steps[this.step];
    if (key !== step.card) return this.wrong(btn, key, step);
    this.busy = true;
    await this.flyToSlot(btn, this.slots[this.step]);
    this.say(step.good, "good");
    restart($("sparky"), "dance");
    restart($("professor"), "cheer");
    this.step += 1;
    this.slots[this.step]?.classList.add("current");
    if (this.step === this.level.steps.length) {
      await wait(1800);
      await this.fire();
    }
    this.busy = false;
  }

  wrong(btn, key, step) {
    this.mistakes += 1;
    this.updateStars();
    restart(btn, "wrong");
    restart($("sparky"), "sad");
    restart($("alien"), "laugh");
    $("threat-fill").style.width = `${Math.min(20 + this.mistakes * 15, 90)}%`;
    this.say(`🤔 ${CARDS[key].fact} אבל זה לא מה שצריך עכשיו. ${step.need}`, "bad");
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

  async fire() {
    // Energy flows along the chain (right → left).
    const arrows = [...document.querySelectorAll(".arrow")];
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i].classList.add("flow");
      await wait(220);
      arrows[i].classList.add("flow");
      await wait(120);
    }
    this.goalSlot.classList.add("flow");
    await wait(400);

    // Laser beam from the weapon to the alien.
    const g = stageRect(this.goalSlot);
    const a = stageRect($("alien"));
    const sx = g.x + g.w * 0.2, sy = g.y + g.h * 0.28;   // flipped cannon barrel
    const tx = a.x + a.w * 0.5, ty = a.y + a.h * 0.5;
    const beam = $("beam");
    Object.assign(beam.style, { left: `${sx}px`, top: `${sy}px`, width: `${Math.hypot(tx - sx, ty - sy)}px` });
    beam.style.setProperty("--angle", `${Math.atan2(ty - sy, tx - sx)}rad`);
    restart(this.goalSlot, "recoil");
    restart(beam, "fire");
    await wait(300);
    restart($("flash"), "go");
    restart($("stage"), "quake");
    setTimeout(() => $("stage").classList.remove("quake"), 500);
    this.burstStars(tx, ty);
    $("alien").classList.add("hit");
    $("threat-fill").style.width = "0%";
    this.say("יש!!! החייזר עף לחלל! 🎉", "good");
    restart($("sparky"), "dance");
    await wait(1700);
    await Film.iris(true);
    this.showVictory();
    await Film.iris(false);
  }

  burstStars(x, y) {
    for (let i = 0; i < 12; i++) {
      const s = document.createElement("span");
      s.className = "star-fx";
      s.textContent = "★";
      const ang = (i / 12) * Math.PI * 2;
      Object.assign(s.style, { left: `${x}px`, top: `${y}px` });
      s.style.setProperty("--dx", `${Math.cos(ang) * 260}px`);
      s.style.setProperty("--dy", `${Math.sin(ang) * 260}px`);
      $("stage").append(s);
      setTimeout(() => s.remove(), 1200);
    }
  }

  showVictory() {
    const stars = this.mistakes === 0 ? 3 : this.mistakes <= 2 ? 2 : 1;
    $("big-stars").innerHTML = [0, 1, 2]
      .map((i) => `<span class="${i < stars ? "" : "lost"}" style="animation-delay:${0.3 + i * 0.25}s">★</span>`)
      .join("");
    $("summary").innerHTML = this.level.summary
      .map(([t, conv]) => `<span class="chip${conv ? " conv" : ""}">${t}</span>`)
      .join('<span>←</span>');
    $("victory").classList.add("show");
  }
}

// ---------- Boot ----------
addEventListener("resize", fitStage);
fitStage();
Film.start();

let game = new Workbench(LEVEL);
game.start();

$("btn-replay").addEventListener("click", async () => {
  await Film.iris(true);
  $("victory").classList.remove("show");
  $("alien").className = "sprite alien boil";
  game = new Workbench(LEVEL);
  game.start();
  await Film.iris(false);
});
$("btn-quiz").addEventListener("click", () => {
  $("btn-quiz").textContent = "בקרוב… 🔧";
});
