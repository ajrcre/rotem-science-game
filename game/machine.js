"use strict";

// ---------- The rat and the cheese (Chemistry corner) ----------
// Loaded after game.js (Actor, Rig, Lever, Film, helpers) and machine_sim.js (runMachine, machineAt).
// The parts are drawn as inline SVG for now: placeholders until their painted art is approved.

const MACHINE_ART = `${ART}machine/`;
const SVG_NS = "http://www.w3.org/2000/svg";

const svgEl = (tag, attrs = {}, parent = null) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent?.append(node);
  return node;
};

// Where everything sits on the 1600×900 stage (the tray covers y > 695).
const G = {
  floor: 695,
  ledgeY: 320,
  cheeseLedge: [230, 470],
  ratLedge: [860, 1300],
  hinge: { x: 470, y: 327 },
  bridgeLen: 390,
  pulley: { x: 510, y: 52, r: 16 },
  pivot: { x: 715, y: 375 },
  arm: 140,               // pivot → each pan
  ropeArm: 202,           // pivot → the beam's end ring (from the painting)
  ringDrop: 12,           // the ring hangs this far below the beam's centre line
  maxTilt: 10,            // degrees at full tilt
  hang: 95,               // beam → pan rim
  bucket: { x: 440, w: 110, rim: 0.37 },   // the painting's rim sits 37% down from its top
  tray: { left: [477, 587], right: [663, 556] },
  slots: {
    heat:   { x: 575, y: 645, w: 124, h: 100, anchor: "bottom" },   // x = center, y = center of the box
    guard:  { x: 570, y: 568, w: 196, h: 44, anchor: "center" },
    weight: { x: 855, y: 0, w: 112, h: 92, anchor: "pan" },          // follows the right pan
  },
  panFloor: 22,           // pan rim → where things sit inside a pan
  rat: { x: 952, body: 52, w: 150 },   // element left; the body starts `body` px into the frame canvas
  cheese: { x: 330, w: 130, h: 99 },
};

// ---------- Part art (Factory): one painted picture (or a few layers) per part ----------
// Used on the cards and in the scene. Each part fills a 120×120 box; "bottom" parts stand on y=116,
// "center" parts sit around y=60. Layers that move carry a class: the flame frames, the fan's rotor, the wet sponge.
const PARTS_ART = `${MACHINE_ART}parts/`;
const partImg = (name, x, y, w, h, { cls = "", align = "xMidYMax", fit = "meet", extra = "" } = {}) =>
  `<image class="${cls}" href="${PARTS_ART}${name}.webp" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${fit === "none" ? "none" : `${align} ${fit}`}" ${extra}/>`;

const PART_ART = {
  candle: () => `
    ${partImg("candle", 10, 30, 100, 86)}
    <ellipse class="flame-glow" cx="55" cy="16" rx="34" ry="34" fill="url(#m-flame-glow)"/>
    <g class="flame">${[1, 2, 3].map((i) => partImg(`flame_${i}`, 44, 0, 22, 34, { cls: `flame-frame f${i}` })).join("")}</g>`,
  fan: () => `
    <g class="blades">${partImg("fan_blades", 32, 22, 54, 54, { align: "xMidYMid" })}</g>
    ${partImg("fan", 14, 10, 92, 106)}`,
  icepack: () => partImg("icepack", 12, 30, 96, 86),
  tray: () => `<g transform="rotate(-9.3 60 62)">${partImg("tray", 0, 52, 120, 20, { align: "xMidYMid" })}</g>`,
  board: () => partImg("board", 2, 50, 116, 20, { fit: "none" }),
  sponge: () => `${partImg("sponge", 22, 40, 76, 38, { fit: "none" })}${partImg("sponge_wet", 22, 40, 76, 38, { fit: "none", cls: "sponge-wet", extra: 'opacity="0"' })}`,
  metal: () => partImg("metal", 16, 40, 88, 76),
  cotton: () => partImg("cotton", 16, 52, 88, 64),
  feather: () => partImg("feather", 10, 34, 100, 82),
};

// Shared gradients, defined once in the scene SVG and once per card.
const ART_DEFS = `
  <radialGradient id="m-flame-glow"><stop offset="0" stop-color="#ffd27a" stop-opacity=".9"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient>`;

// ---------- Effects canvas: drops, splashes, smoke, crumbs, dust ----------
// Every particle is a small object with its own step/draw (a light Strategy per kind).
class MachineFX {
  static dropSprite = Object.assign(new Image(), { src: `${MACHINE_ART}parts/drop.webp` });

  constructor(canvas) {
    this.ctx = canvas.getContext("2d");
    this.items = [];
  }

  add(item) { this.items.push(Object.assign({ age: 0 }, item)); }
  clear() { this.items = []; }

  // A meltwater drop: swells at a hole, lets go, falls faster and faster, then lands.
  drop({ x, y, toY, swell = 0.12, fall = 0.28, onLand }) {
    this.add({ kind: "drop", x, y, toY, swell, fall, onLand });
  }

  splash(x, y, { n = 6, color = "rgba(150, 205, 245, .95)", up = 1 } = {}) {
    for (let i = 0; i < n; i++) {
      this.add({ kind: "spray", x, y, vx: rand(-90, 90), vy: rand(-170, -60) * up, r: rand(2, 3.5), life: rand(0.25, 0.45), color });
    }
    this.add({ kind: "ring", x, y, life: 0.4 });
  }

  smoke(x, y, n = 1, grey = true) {
    for (let i = 0; i < n; i++) {
      this.add({ kind: "puff", x: x + rand(-6, 6), y, vx: rand(-14, 14), vy: rand(-70, -40), r: rand(6, 10), grow: rand(18, 30),
                 life: rand(0.9, 1.5), color: grey ? "120, 112, 104" : "245, 245, 245" });
    }
  }

  dust(x, y, n = 8) {
    for (let i = 0; i < n; i++) {
      this.add({ kind: "puff", x, y, vx: rand(-120, 120), vy: rand(-40, -5), r: rand(5, 9), grow: rand(10, 20),
                 life: rand(0.5, 0.8), color: "200, 175, 140" });
    }
  }

  crumbs(x, y, n = 7) {
    for (let i = 0; i < n; i++) {
      this.add({ kind: "spray", x, y, vx: rand(-120, 80), vy: rand(-220, -80), r: rand(2.5, 4.5), life: rand(0.5, 0.8),
                 color: "#f2c94c", gravity: 900 });
    }
  }

  // Sweat beads on the melting ice: appear near the top and run down a side.
  bead(x, top, bottom) { this.add({ kind: "bead", x, y: top, bottom, life: rand(0.6, 1) }); }

  // Air from the fan, or frost from the ice pack, rising toward the ice.
  streak(x, y, color) { this.add({ kind: "streak", x, y, vy: rand(-260, -180), life: rand(0.35, 0.55), color }); }

  step(dt) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 1600, 900);
    this.items = this.items.filter((p) => {
      p.age += dt;
      return this[`draw_${p.kind}`](ctx, p, dt) !== false;
    });
  }

  draw_drop(ctx, p) {
    const sprite = MachineFX.dropSprite;
    let { x, y } = p;
    let stretch = 1, size = 5;
    if (p.age < p.swell) {
      size = 2 + 3 * (p.age / p.swell);                     // swelling at the hole
    } else {
      const u = Math.min(1, (p.age - p.swell) / p.fall);
      y = p.y + (p.toY - p.y) * u * u;                       // speeds up as it falls
      stretch = 1 + 0.5 * u;
      if (u >= 1) { p.onLand?.(x, p.toY); return false; }
    }
    // The painted drop (pointing up, like a falling drop's tail), stretched as it speeds up.
    const h = size * 3.2, w = h * 0.67;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, stretch);
    if (sprite.complete && sprite.naturalWidth) ctx.drawImage(sprite, -w / 2, -h * 0.62, w, h);
    ctx.restore();
  }

  draw_spray(ctx, p, dt) {
    if (p.age > p.life) return false;
    p.vy += (p.gravity || 700) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    ctx.globalAlpha = 1 - p.age / p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  draw_ring(ctx, p) {
    if (p.age > p.life) return false;
    const u = p.age / p.life;
    ctx.strokeStyle = `rgba(200, 230, 255, ${1 - u})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 6 + 20 * u, 2 + 5 * u, 0, 0, TAU);
    ctx.stroke();
  }

  draw_puff(ctx, p, dt) {
    if (p.age > p.life) return false;
    const u = p.age / p.life;
    p.x += p.vx * dt + Math.sin(p.age * 6) * 0.4;
    p.y += p.vy * dt;
    ctx.fillStyle = `rgba(${p.color}, ${0.55 * (1 - u)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + p.grow * u, 0, TAU);
    ctx.fill();
  }

  draw_bead(ctx, p, dt) {
    if (p.age > p.life || p.y > p.bottom) return false;
    p.y += 40 * dt + 80 * p.age * dt;
    ctx.fillStyle = "rgba(235, 248, 255, .9)";
    ctx.strokeStyle = "rgba(60, 120, 170, .7)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 2.6, 3.6, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  draw_streak(ctx, p, dt) {
    if (p.age > p.life) return false;
    p.y += p.vy * dt;
    ctx.strokeStyle = p.color.replace("A", String(0.8 * (1 - p.age / p.life)));
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.quadraticCurveTo(p.x + 6, p.y + 12, p.x, p.y + 24);
    ctx.stroke();
  }
}

// ---------- The scene (View): draws the machine and moves it to a simulator state ----------
class MachineView {
  constructor(svg, fx) {
    this.svg = svg;
    this.fx = fx;
    this.parts = {};                     // slot → <g> of the part in it
    this.boxes = {};                     // slot → empty-slot box
    this.build();
  }

  build() {
    const s = this.svg;
    s.innerHTML = `<defs>${ART_DEFS}
      <clipPath id="m-bucket-clip"><path d="M${G.bucket.x - 44} ${G.floor - 92} L${G.bucket.x + 44} ${G.floor - 92} L${G.bucket.x + 38} ${G.floor - 8} L${G.bucket.x - 38} ${G.floor - 8} Z"/></clipPath>

    </defs>`;

    // Shelves: the cheese on the left, the rat on the right.
    for (const [x1, x2] of [G.cheeseLedge, G.ratLedge]) {
      s.insertAdjacentHTML("beforeend", partImg("shelf", x1 - 12, G.ledgeY - 5, x2 - x1 + 24, 100, { fit: "none" }));
    }

    // Ceiling pulley on its bracket.
    const p = G.pulley;
    svgEl("rect", { x: p.x - 8, y: 0, width: 16, height: p.y - 6, fill: "#7a5222", class: "ink" }, s);

    // The painted cheese (one picture per bite stage) and its stink.
    const c = G.cheese;
    const cheese = svgEl("image", { href: `${MACHINE_ART}cheese_0.webp`, x: c.x, y: G.ledgeY - c.h + 4, width: c.w, height: c.h,
                                    preserveAspectRatio: "xMidYMax meet" }, s);
    this.cheese = cheese;
    const stink = svgEl("g", { class: "stink" }, s);
    [0.3, 0.55, 0.8].forEach((f, i) => {
      const x = c.x + f * c.w, y = G.ledgeY - c.h + 14;
      stink.insertAdjacentHTML("beforeend", partImg(`stink_${i + 1}`, x - 14, y - 84, 28, 84, { align: "xMidYMax" }));
    });
    this.stink = stink;

    // The bucket the tray pours into, with its water level.
    // The painted bucket; its water shows through the tin as a translucent layer, so kids see it fill up.
    const b = G.bucket;
    const bh = b.w / 0.716;
    s.insertAdjacentHTML("beforeend", partImg("bucket", b.x - b.w / 2, G.floor - bh, b.w, bh));
    this.bucketTop = G.floor - bh + b.rim * bh;
    this.water = svgEl("path", { fill: "#7cc1ea", "clip-path": "url(#m-bucket-clip)", opacity: 0.6 }, s);

    // The scale: post, beam, chains and pans. The beam and pans move in apply().
    const pv = G.pivot;
    const postH = (G.floor - pv.y) / 0.96, postW = postH * 0.644;        // the knob sits 4% down the painting
    s.insertAdjacentHTML("beforeend", partImg("scale_post", pv.x - 0.495 * postW, pv.y - 0.04 * postH, postW, postH));
    this.chainsInk = svgEl("path", { fill: "none", stroke: "#1c1410", "stroke-width": 6, "stroke-linecap": "round" }, s);
    this.chains = svgEl("path", { fill: "none", stroke: "#e0b860", "stroke-width": 2.5, "stroke-dasharray": "5 3" }, s);
    this.beam = svgEl("g", {}, s);
    const beamW = 2 * G.ropeArm + 30;
    this.beam.insertAdjacentHTML("beforeend", partImg("scale_beam", pv.x - beamW / 2, pv.y - 22, beamW, 46, { fit: "none" }));

    // Left pan: the sieve, with the ice sitting in it (drawn on top).
    this.leftPan = svgEl("g", {}, s);
    this.leftPan.insertAdjacentHTML("beforeend", partImg("sieve", -78, -14, 156, 75, { fit: "none" }));
    this.puddle = svgEl("ellipse", { cx: 0, cy: 22, rx: 52, ry: 6, fill: "#9fd6f2", opacity: 0 }, this.leftPan);
    this.glow = svgEl("ellipse", { cx: 0, cy: -40, rx: 80, ry: 70, fill: "url(#m-flame-glow)", opacity: 0 }, this.leftPan);
    // Four painted melt stages, stacked; apply() cross-fades them by how much ice is left.
    this.ice = [0, 1, 2, 3].map((i) => svgEl("image", { href: `${MACHINE_ART}ice_${i}.webp`, preserveAspectRatio: "xMidYMax meet" }, this.leftPan));

    // Right pan, with the weight slot riding on it.
    this.rightPan = svgEl("g", {}, s);
    this.rightPan.insertAdjacentHTML("beforeend", partImg("pan", -72, -12, 144, 56, { fit: "none" }));
    this.weightHolder = svgEl("g", { transform: `translate(0 ${G.panFloor})` }, this.rightPan);

    // Rope: bridge tip → over the pulley → down to the beam's left end.
    this.svg.querySelector("defs").insertAdjacentHTML("beforeend",
      `<pattern id="m-rope" patternUnits="userSpaceOnUse" width="27" height="10" y="-5">
         <image href="${PARTS_ART}rope.webp" width="27" height="10" preserveAspectRatio="none"/></pattern>`);
    this.ropeArc = svgEl("path", { class: "rope" }, s);
    this.ropeSpans = [0, 1].map(() => svgEl("rect", { y: -5, height: 10, fill: "url(#m-rope)" }, s));
    // A painted knot tied through an iron ring at each end: on the plank near its tip, and on the beam's end ring.
    this.knots = [0, 1].map(() => {
      const g = svgEl("g", {}, s);
      g.insertAdjacentHTML("beforeend", partImg("knot", -13, -77, 26, 88, { fit: "none" }));   // ring centre at (0, 0)
      return g;
    });
    s.insertAdjacentHTML("beforeend", partImg("pulley", p.x - 0.5 * 40, p.y - 0.6 * 53, 40, 53));

    // The drawbridge, hinged at the cheese shelf.
    this.bridge = svgEl("g", {}, s);
    this.bridge.insertAdjacentHTML("beforeend", partImg("plank", G.hinge.x - 6, G.hinge.y - 13, G.bridgeLen + 12, 26, { fit: "none" }));
    s.insertAdjacentHTML("beforeend", partImg("hinge", G.hinge.x - 14, G.hinge.y - 14, 28, 28, { align: "xMidYMid" }));

    // Slots: the parts' holders, and a glowing "?" box while empty.
    for (const slot of ["heat", "guard", "weight"]) {
      const holder = slot === "weight" ? this.weightHolder : svgEl("g", {}, s);
      this.parts[slot] = svgEl("g", { class: "slot-part", "data-slot": slot }, holder);
      const box = svgEl("g", { class: "slot-box", "data-slot": slot }, holder);
      const r = this.slotRect(slot, true);
      svgEl("rect", { x: r.x, y: r.y, width: r.w, height: r.h, rx: 14 }, box);
      svgEl("text", { x: r.x + r.w / 2, y: r.y + r.h / 2 }, box).textContent = "?";
      this.boxes[slot] = box;
    }
  }

  // Only the slots opened so far are on the machine; a newly opened one pops in.
  showSlots(open) {
    for (const [slot, box] of Object.entries(this.boxes)) {
      const was = !box.classList.contains("off");
      box.classList.toggle("off", !open.includes(slot));
      if (!was && open.includes(slot)) restart(box, "part-pop");
    }
  }

  // A slot's box: in its holder's coordinates (`local`), or on the stage.
  slotRect(slot, local = false) {
    const d = G.slots[slot];
    if (slot === "weight") {
      const r = { x: -d.w / 2, y: -d.h - 2, w: d.w, h: d.h };
      if (local) return r;
      const pan = this.pans?.right || { x: d.x, y: 500 };
      return { x: pan.x + r.x, y: pan.y + G.panFloor + r.y, w: r.w, h: r.h };
    }
    const top = d.anchor === "bottom" ? G.floor - d.h : d.y - d.h / 2;
    return { x: d.x - d.w / 2, y: top, w: d.w, h: d.h };
  }

  // Put a part's drawing in a slot (null empties it).
  setPart(slot, key) {
    const g = this.parts[slot];
    g.innerHTML = "";
    g.dataset.key = key || "";
    this.boxes[slot].classList.toggle("filled", Boolean(key));
    if (!key) return;
    const d = G.slots[slot];
    const scale = slot === "guard" ? 1.62 : slot === "weight" ? 0.95 : 1;
    const x = slot === "weight" ? 0 : d.x;
    const y = slot === "weight" ? 0 : d.anchor === "bottom" ? G.floor : d.y;
    const ay = d.anchor === "center" ? 60 : 116;                       // the art's anchor line
    g.innerHTML = `<g transform="translate(${x - 60 * scale} ${y - ay * scale}) scale(${scale})"><g class="part-pop">${PART_ART[key]()}</g></g>`;
  }

  // Move everything to a simulator snapshot.
  apply(state, level) {
    const pv = G.pivot;
    const deg = state.tilt * G.maxTilt;
    const rad = (deg * Math.PI) / 180;
    const dx = G.arm * Math.cos(rad), dy = G.arm * Math.sin(rad);
    const ends = { left: { x: pv.x - dx, y: pv.y - dy }, right: { x: pv.x + dx, y: pv.y + dy } };
    this.pans = { left: { x: ends.left.x, y: ends.left.y + G.hang }, right: { x: ends.right.x, y: ends.right.y + G.hang } };
    // The rope's ring on the beam: the painted end ring, a little below the beam's centre line.
    const hook = { x: pv.x - G.ropeArm * Math.cos(rad) - G.ringDrop * Math.sin(rad), y: pv.y - G.ropeArm * Math.sin(rad) + G.ringDrop * Math.cos(rad) };
    this.beam.setAttribute("transform", `rotate(${deg.toFixed(2)} ${pv.x} ${pv.y})`);
    this.leftPan.setAttribute("transform", `translate(${this.pans.left.x.toFixed(1)} ${this.pans.left.y.toFixed(1)})`);
    this.rightPan.setAttribute("transform", `translate(${this.pans.right.x.toFixed(1)} ${this.pans.right.y.toFixed(1)})`);
    const chains = ["left", "right"].map((side) => {
      const e = ends[side], pan = this.pans[side];
      return `M${e.x} ${e.y} L${pan.x - 66} ${pan.y} M${e.x} ${e.y} L${pan.x + 66} ${pan.y}`;
    }).join(" ");
    this.chains.setAttribute("d", chains);
    this.chainsInk.setAttribute("d", chains);

    // Bridge, and the rope from its tip over the pulley to the beam's left end.
    const a = (state.bridge * Math.PI) / 180;
    this.bridge.setAttribute("transform", `rotate(${(-state.bridge).toFixed(2)} ${G.hinge.x} ${G.hinge.y})`);
    // The rope's ring on the plank: on its top face, a little in from the tip (it turns with the plank).
    const along = G.bridgeLen - 26, up = 13 + 7;
    const tip = { x: G.hinge.x + along * Math.cos(a) - up * Math.sin(a), y: G.hinge.y - along * Math.sin(a) - up * Math.cos(a) };
    const p = G.pulley;
    // Two straight spans of painted rope (bridge tip → pulley, pulley → beam hook) and the bend over the wheel.
    [[tip, { x: p.x + p.r, y: p.y }], [{ x: p.x - p.r, y: p.y }, hook]].forEach(([from, to], i) => {
      const len = Math.hypot(to.x - from.x, to.y - from.y);
      const deg = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
      const span = this.ropeSpans[i];
      span.setAttribute("width", len.toFixed(1));
      span.setAttribute("transform", `translate(${from.x.toFixed(1)} ${from.y.toFixed(1)}) rotate(${deg.toFixed(2)})`);
    });
    // Each knot points its rope toward the pulley.
    [[tip, { x: p.x + p.r, y: p.y }], [hook, { x: p.x - p.r, y: p.y }]].forEach(([at, toward], i) => {
      const deg = (Math.atan2(toward.y - at.y, toward.x - at.x) * 180) / Math.PI + 90;
      this.knots[i].setAttribute("transform", `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)}) rotate(${deg.toFixed(2)})`);
    });
    this.ropeArc.setAttribute("d", `M${p.x + p.r} ${p.y} A${p.r} ${p.r} 0 0 0 ${p.x - p.r} ${p.y}`);

    // Ice: shrinks and rounds off as it melts, glows while it is heated.
    const frac = state.ice / level.iceMass;
    const side = 80 * Math.sqrt(frac);
    const stage = (1 - frac) * 3 * Math.min(1, state.warm * 4 + (frac < 1 ? 1 : 0));   // 0 = solid … 3 = sliver
    const size = side * 1.3;                                // the paintings include a little puddle around the cube
    this.ice.forEach((img, i) => {
      const o = frac > 0.002 ? Math.max(0, 1 - Math.abs(stage - i)) : 0;
      img.setAttribute("opacity", o.toFixed(2));
      Object.entries({ x: -size / 2, y: 26 - size, width: size, height: size }).forEach(([k, v]) => img.setAttribute(k, v.toFixed(1)));
    });
    this.iceTop = this.pans.left.y + 30 - size * 0.85;
    this.iceSide = side;
    const melting = state.warm > 0 && state.lit && frac > 0;
    this.glow.setAttribute("opacity", melting ? (0.45 + 0.2 * Math.sin(state.t * 7)).toFixed(2) : 0);
    this.puddle.setAttribute("opacity", melting || (frac < 1 && frac > 0) ? 0.85 : 0);

    // Candle flame, sponge wetness, bucket water.
    this.parts.heat.classList.toggle("out", !state.lit);
    this.parts.guard.querySelector(".sponge-wet")?.setAttribute("opacity", Math.min(1, state.soaked / 5).toFixed(2));
    this.setWater(state.bucket / level.iceMass, state.t);
  }

  setWater(frac, t = 0) {
    const b = G.bucket;
    const level = G.floor - 8 - frac * 70;
    const w = 3 * Math.sin(t * 5);
    this.water.setAttribute("d", frac > 0.001
      ? `M${b.x - 50} ${level + w} Q${b.x - 25} ${level - 4 - w} ${b.x} ${level} T${b.x + 50} ${level + w} L${b.x + 50} ${G.floor} L${b.x - 50} ${G.floor} Z`
      : "");
    this.waterTop = level;
  }

  // Where a drop from the sieve lands, by what is under it.
  dropTarget(x, to) {
    const t = G.tray;
    if (to === "bucket" || to === "tray") return t.left[1] + ((x - t.left[0]) * (t.right[1] - t.left[1])) / (t.right[0] - t.left[0]) - 6;
    if (to === "sponge") return G.slots.guard.y - 14;
    if (to === "flame") return G.floor - 95;
    const heat = this.parts.heat.dataset.key;
    return heat ? G.floor - (heat === "candle" ? 64 : 112) : G.floor - 4;
  }

  // Bite n (0..2) shows the next painted stage: one bite, half eaten, almost gone.
  bite(n) { this.cheese.setAttribute("href", `${MACHINE_ART}cheese_${Math.min(n + 1, 3)}.webp`); }

  resetCheese() {
    this.cheese.setAttribute("href", `${MACHINE_ART}cheese_0.webp`);
    this.cheese.style.opacity = "";
    this.stink.style.display = "";
  }
}

// ---------- Progress: best stars per level (this browser only) ----------
const MachineProgress = {
  key: "mouse-machine-progress-v1",
  load() {
    try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; }
  },
  best(id, stars) {
    const data = this.load();
    data[id] = Math.max(data[id] || 0, stars);
    try { localStorage.setItem(this.key, JSON.stringify(data)); } catch { /* storage blocked */ }
  },
};

// ---------- The game: cards → slots → lever → replay → the professor explains ----------
class MachineGame {
  constructor() {
    this.fx = new MachineFX($("machine-fx"));
    this.view = new MachineView($("machine-scene"), this.fx);
    this.professor = new Actor("professor", "machine-professor");
    this.rat = new Actor("rat", "machine-rat", { crossfade: false });
    this.lever = new Lever(() => {}, () => {}, () => this.pull(), $("machine-lever"));
    this.run = 0;
    this.view.svg.addEventListener("click", (e) => {
      const part = e.target.closest(".slot-part");
      if (part?.dataset.key) this.remove(part.dataset.slot);
    });
    $("btn-machine-lab").addEventListener("click", () => Screens.go("lab"));
    $("btn-machine-back").addEventListener("click", () => Screens.go("lab"));
    $("btn-machine-replay").addEventListener("click", () => this.restartLevel());
    $("btn-machine-mode").addEventListener("click", () => this.start(this.level));
  }

  async restartLevel() {
    await Film.iris(true);
    $("machine-victory").classList.remove("show");
    this.begin(this.level, this.mode);
    await Film.iris(false);
  }

  // Entering the game: pick a mode, then play.
  start(level = MOUSE_LEVELS[0]) {
    this.stop();
    this.professor.reset();
    $("machine-victory").classList.remove("show");
    // Behind the question, the machine as it starts: only the first slot, no cards yet.
    Object.assign(this, { level, stage: 0, placed: Object.fromEntries(level.slots.map((s) => [s, null])) });
    for (const slot of level.slots) this.view.setPart(slot, null);
    this.view.showSlots(this.openSlots());
    this.view.resetCheese();
    this.resetRat();
    this.showIdle();
    $("machine-cards").innerHTML = "";
    this.lever.reset();
    $("machine-bubble").classList.add("hide");
    const box = $("machine-mode-buttons");
    box.replaceChildren(...Object.entries(MOUSE_MODES).map(([mode, m]) => {
      const btn = el("button", `btn mode-btn mode-${mode}`);
      btn.type = "button";
      btn.append(el("strong", "", m.label), el("small", "", m.note));
      btn.addEventListener("click", () => { $("machine-mode").classList.remove("show"); this.begin(level, mode); });
      return btn;
    }));
    $("machine-mode").classList.add("show");
  }

  begin(level, mode) {
    this.level = level;
    this.mode = mode;
    this.run += 1;
    this.placed = Object.fromEntries(level.slots.map((s) => [s, null]));
    this.stage = 0;
    this.fails = 0;
    this.stageFails = 0;
    this.running = false;
    $("machine").classList.remove("running");
    $("machine-victory").classList.remove("show");
    $("machine-burp").classList.remove("show");
    $("machine-level").textContent = `שלב ${level.id}`;
    $("machine-title").textContent = level.title;
    this.updateStars();
    for (const slot of level.slots) this.view.setPart(slot, null);
    this.view.resetCheese();
    this.fx.clear();
    this.resetRat();
    this.ratIdle();
    this.renderCards();
    this.view.showSlots(this.openSlots());
    this.showIdle();
    this.lever.reset();
    this.lever.show();
    this.professor.reset();
    this.say(this.line(level.stages[0].intro));
    this.loop();
  }

  // A line in the chosen mode ({ hints, plain }).
  line(text) { return text[this.mode]; }

  openSlots() { return this.level.stages.slice(0, this.stage + 1).map((st) => st.slot); }

  stop() {
    this.run += 1;
    this.running = false;
    clearInterval(this.typeTimer);
    clearTimeout(this.idleTimer);
    cancelAnimationFrame(this.raf);
    this.fx.clear();
  }

  // The effects canvas, and the idle ambience (glints, the scale settling) while nothing runs.
  loop() {
    const run = this.run;
    let last = performance.now();
    const tick = (now) => {
      if (run !== this.run) return;
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      if (!this.running && this.idle) this.settle(dt);
      this.fx.step(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  // Before the lever: the scale eases toward how it leans with what's on it now.
  showIdle(instant = true) {
    const target = machineAt(this.level, this.placed);
    if (instant || !this.idle) this.idle = { ...target };
    this.idleTarget = target;
    this.view.apply(this.idle, this.level);
  }

  settle(dt) {
    const s = this.idle, t = this.idleTarget;
    if (!t) return;
    const k = Math.min(1, dt * 3);
    s.tilt += (t.tilt - s.tilt) * k;
    s.bridge += (t.bridge - s.bridge) * k;
    s.t = (s.t || 0) + dt;
    Object.assign(s, { ice: t.ice, lit: t.lit, warm: 0, bucket: 0, soaked: 0 });
    this.view.apply(s, this.level);
  }

  renderCards() {
    const wrap = $("machine-cards");
    wrap.innerHTML = "";
    this.cards = {};
    const slot = this.level.stages[this.stage].slot;
    for (const key of this.level.deck.filter((k) => PARTS[k].slot === slot)) {
      const btn = el("button", "card");
      btn.type = "button";
      btn.dataset.key = key;
      btn.innerHTML = `<svg viewBox="0 0 120 120"><defs>${ART_DEFS.replaceAll('id="m-', `id="c-${key}-`)}</defs>${PART_ART[key]().replaceAll("url(#m-", `url(#c-${key}-`)}</svg><span>${PARTS[key].label}</span>`;
      btn.addEventListener("click", () => this.pick(key));
      if (this.placed[slot] === key) btn.classList.add("used");
      this.cards[key] = btn;
      wrap.append(btn);
    }
  }

  // A card flies to its slot (whatever was there goes back to the tray). Clicking a placed card takes it back.
  async pick(key) {
    const slot = PARTS[key].slot;
    if (this.running || slot !== this.level.stages[this.stage].slot) return;
    if (this.placed[slot] === key) return this.remove(slot);
    Sfx.play("click");
    if (this.placed[slot]) this.cards[this.placed[slot]]?.classList.remove("used");
    this.placed[slot] = key;
    this.cards[key].classList.add("used");
    const run = this.run;
    await this.fly(key, slot);
    if (run !== this.run || this.placed[slot] !== key) return;
    this.view.setPart(slot, key);
    this.showIdle(false);
    if (this.mode === "hints") this.say(PARTS[key].fact);
  }

  remove(slot) {
    // Only the open step's part can go back: the earlier steps are solved and stay in place.
    if (this.running || !this.placed[slot] || slot !== this.level.stages[this.stage].slot) return;
    Sfx.play("click", { rate: 0.8 });
    this.cards[this.placed[slot]]?.classList.remove("used");
    this.placed[slot] = null;
    this.view.setPart(slot, null);
    this.showIdle(false);
  }

  async fly(key, slot) {
    const card = this.cards[key].querySelector("svg");
    const from = stageRect(card);
    const to = this.view.slotRect(slot);
    const div = el("div", "flyer-svg");
    div.innerHTML = card.outerHTML;
    Object.assign(div.style, { left: `${from.x}px`, top: `${from.y}px`, width: `${from.w}px`, height: `${from.h}px` });
    $("machine").append(div);
    await wait(20);
    const size = Math.min(to.w, to.h + 30);
    Object.assign(div.style, { left: `${to.x + (to.w - size) / 2}px`, top: `${to.y + to.h - size}px`, width: `${size}px`, height: `${size}px` });
    await wait(520);
    div.remove();
  }

  // Professor speaks: typewriter text in his bubble while his mouth flaps (narration comes in phase 2).
  say(text, mood = "") {
    const b = $("machine-bubble");
    const p = $("machine-bubble-text");
    b.className = "bubble machine-bubble " + mood;
    restart(b, "show");
    clearInterval(this.typeTimer);
    let n = 0;
    p.textContent = "";
    this.typeTimer = setInterval(() => {
      n += 2;
      p.textContent = text.slice(0, n);
      if (n >= text.length) clearInterval(this.typeTimer);
    }, 40);
    this.professor.play(["talk", "idle"], { fps: 4, ms: Math.min(text.length * 24, 2600) });
    return wait((text.length / 2) * 40 + 1400);
  }

  stars() { return Math.max(3 - this.fails, 1); }

  updateStars() {
    const stars = this.stars();
    [...$("machine-stars").children].forEach((s, i) => s.classList.toggle("lost", i >= stars));
  }

  resetRat() {
    const r = $("machine-rat");
    r.style.transition = "none";
    r.style.transform = "";
    this.rat.reset();
  }

  // While nothing else is going on, the rat now and then blinks or sniffs toward the cheese.
  ratIdle() {
    clearTimeout(this.idleTimer);
    const run = this.run;
    this.idleTimer = setTimeout(() => {
      if (run !== this.run) return;
      if (this.rat.current === "idle" && !this.rat.timer) {
        if (Math.random() < 0.5) this.rat.play(["idle_2"], { ms: 220 });
        else this.rat.play(["idle_3", "idle", "idle_3"], { fps: 6, ms: 700, react: "jump" });
      }
      this.ratIdle();
    }, rand(1800, 3800));
  }

  // ---------- A run ----------
  async pull() {
    if (this.running) return;
    this.running = true;
    const run = this.run;
    $("machine").classList.add("running");
    this.lever.guide.hidden = true;
    for (const c of Object.values(this.cards)) c.disabled = true;
    const result = runMachine(this.level, this.placed);
    if (this.placed.heat === "fan") this.view.parts.heat.classList.add("spin");
    await this.replay(result);
    this.view.parts.heat.classList.remove("spin");
    if (run !== this.run) return;
    const judged = judgeRun(this.level, this.stage, result.outcome);
    if (judged.kind === "win") await this.win();
    else if (judged.kind === "discover") await this.discover(judged.stage);
    else await this.fail(result.outcome);
  }

  // Plays the recording in real time (a bit faster than the simulation's seconds).
  replay({ frames, events, dt }) {
    const speed = 1.35;
    const run = this.run;
    const v = this.view;
    let ei = 0;
    let start = null;
    let lastBead = 0, lastStreak = 0;
    return new Promise((resolve) => {
      const tick = (now) => {
        if (run !== this.run) return resolve();
        start ??= now;
        const T = ((now - start) / 1000) * speed;
        const i = Math.min(frames.length - 1, Math.floor(T / dt));
        const state = frames[i];
        v.apply(state, this.level);
        while (ei < events.length && events[ei].t <= T) this.onEvent(events[ei++]);

        // Ambient effects that follow the state, not single events.
        const heat = this.placed.heat;
        if (state.lit && state.warm > 0 && state.ice > 0 && T - lastBead > 0.12) {
          lastBead = T;
          const side = rand(-1, 1) > 0 ? 1 : -1;
          v.fx.bead(v.pans.left.x + side * v.iceSide * rand(0.3, 0.5), v.iceTop + v.iceSide * 0.2, v.pans.left.y + 28);
        }
        if ((heat === "fan" || heat === "icepack") && T - lastStreak > 0.05) {
          lastStreak = T;
          v.fx.streak(G.slots.heat.x + rand(-40, 40), G.floor - 110, heat === "fan" ? "rgba(255,255,255,A)" : "rgba(190,230,255,A)");
          if (this.placed.guard === "board") v.fx.streak(G.slots.heat.x + rand(-40, 40), G.floor - 110, "rgba(255,255,255,A)");
        }
        if (state.lit && this.placed.guard === "board" && Math.random() < 0.08) v.fx.smoke(G.slots.heat.x + rand(-60, 60), G.slots.guard.y - 14, 1, true);

        if (i >= frames.length - 1 && ei >= events.length) setTimeout(resolve, 500);
        else this.replayRaf = requestAnimationFrame(tick);
      };
      this.replayRaf = requestAnimationFrame(tick);
    });
  }

  onEvent(e) {
    const v = this.view;
    if (e.type === "drop") {
      const x = v.pans.left.x - 45 + e.x * 90;
      const y = v.pans.left.y + 58;            // the sieve's holey bottom
      const toY = v.dropTarget(x, e.to);
      v.fx.drop({ x, y, toY, onLand: (lx, ly) => this.land(e.to, lx, ly) });
    } else if (e.type === "doused") {
      v.fx.smoke(G.slots.heat.x, G.floor - 95, 7);
      v.fx.smoke(G.slots.heat.x, G.floor - 95, 3, false);
      this.rat.play(["scared_1", "scared_2"], { fps: 4, ms: 1300, react: "tremble" });
    } else if (e.type === "bridge_down") {
      v.fx.dust(G.ratLedge[0], G.ledgeY, 12);
      Film.quake();
    }
  }

  // A drop reaches whatever is below it.
  land(to, x, y) {
    const fx = this.fx;
    if (to === "bucket") {
      // Along the slanted tray, then off its low end into the bucket.
      fx.splash(x, y, { n: 3, up: 0.4 });
      const t = G.tray;
      fx.add({ kind: "spray", x, y, vx: -260, vy: 40, r: 3.5, life: 0.18 + (x - t.left[0]) / 900, color: "rgba(150,205,245,.95)", gravity: 60 });
      setTimeout(() => fx.drop({ x: t.left[0] - 6, y: t.left[1], toY: this.view.waterTop || G.floor - 8, swell: 0.02, fall: 0.18,
                                 onLand: (lx, ly) => fx.splash(lx, ly, { n: 4 }) }), 150 + (x - t.left[0]) * 1.5);
    } else if (to === "sponge") {
      fx.add({ kind: "ring", x, y, life: 0.3 });
    } else if (to === "flame") {
      fx.splash(x, y, { n: 5 });
      fx.smoke(x, y, 2, false);
    } else {
      fx.splash(x, y, { n: 5 });
    }
  }

  // The run taught something: the professor says what happened, and the next step's slot opens. No star lost.
  async discover(stage) {
    const run = this.run;
    this.professor.play(["cheer", "talk", "idle"], { fps: 3, ms: 1500, react: "jump" });
    const said = this.say(this.line(this.level.stages[stage].intro), "good");
    await wait(1600);
    if (run !== this.run) return;
    this.stage = stage;
    this.stageFails = 0;
    this.resetMachine();
    this.renderCards();
    this.view.showSlots(this.openSlots());
    await said;
  }

  async fail(outcome) {
    const run = this.run;
    this.fails += 1;
    this.stageFails += 1;
    this.updateStars();
    this.rat.play(["sad_1", "sad_1", "sad_2", "sad_2"], { fps: 2, ms: 2200, react: "droop" });
    this.professor.play(["worried"], { ms: 1600, react: "tremble" });
    let line = this.line(this.level.outcomes[outcome]);
    if (this.mode === "hints" && this.stageFails >= 2) line += ` ${this.level.stages[this.stage].hint}`;
    const said = this.say(line, "bad");
    await wait(1600);
    if (run !== this.run) return;
    this.resetMachine();
    await said;
  }

  // Back to the start: the ice is whole again and the candle relit; the chosen parts stay.
  resetMachine() {
    this.fx.smoke(G.pivot.x - G.arm, G.pivot.y + 20, 6, false);
    this.showIdle(true);
    this.running = false;
    $("machine").classList.remove("running");
    for (const c of Object.values(this.cards)) c.disabled = false;
    this.lever.reset();
    this.lever.show();
  }

  async win() {
    const run = this.run;
    const live = () => run === this.run;
    const ratEl = $("machine-rat");
    this.professor.play(["cheer", "talk", "cheer", "idle"], { fps: 3, ms: 1700, react: "jump" });
    this.say(this.line(this.level.outcomes.win), "good");

    // Sniff the air, then scurry over the bridge to the cheese.
    clearTimeout(this.idleTimer);
    this.rat.play(["idle_3", "idle", "idle_3", "idle"], { fps: 6, ms: 700, end: null });
    await wait(700);
    if (!live()) return;
    const goal = G.cheese.x + G.cheese.w - 30 - (G.rat.x + G.rat.body);   // the body's front just reaches the cheese
    ratEl.style.transition = "transform 2s cubic-bezier(.45,.05,.55,.95)";
    ratEl.style.transform = `translateX(${goal}px)`;
    this.rat.play(["run_1", "run_2", "run_3", "run_4"], { fps: 10, ms: 2000, end: "idle" });
    const hop = setInterval(() => { this.rat.rig.y.kick(-120); this.rat.rig.squash.kick(0.5); }, 200);
    await wait(2000);
    clearInterval(hop);
    if (!live()) return;

    // Three bites: crumbs fly, the wedge gets smaller, the stink goes away with it.
    for (let n = 0; n < 3; n++) {
      this.rat.play(["eat_1", "eat_2", "eat_3"], { fps: 6, ms: 500, end: "eat_3" });
      this.rat.rig.squash.kick(1.6);
      this.view.bite(n);
      this.fx.crumbs(G.cheese.x + G.cheese.w, G.ledgeY - 0.4 * G.cheese.h);
      await wait(520);
      if (!live()) return;
    }
    this.view.stink.style.display = "none";
    this.view.cheese.style.opacity = "0";

    // Full belly: a flop and a burp.
    this.rat.play(["full_1", "full_2"], { fps: 2, ms: Infinity });
    const burp = $("machine-burp");
    const r = stageRect(ratEl);
    Object.assign(burp.style, { left: `${r.x + r.w * 0.55}px`, top: `${r.y + r.h * 0.1}px` });
    restart(burp, "show");
    await wait(1400);
    if (!live()) return;
    this.showVictory();
  }

  showVictory() {
    const stars = this.stars();
    MachineProgress.best(this.level.id, stars);
    $("machine-big-stars").innerHTML = [0, 1, 2]
      .map((i) => `<span class="${i < stars ? "" : "lost"}" style="animation-delay:${0.3 + i * 0.25}s">★</span>`).join("");
    $("machine-summary").innerHTML = this.level.summary.map((t) => `<span class="chip">${t}</span>`).join("");
    $("machine-lesson").textContent = this.level.lesson;
    $("machine-victory").classList.add("show");
    Sfx.play("victory");
    for (let i = 0; i < stars; i++) setTimeout(() => Sfx.play("star", { rate: 1 + i * 0.12 }), 300 + i * 250);
  }
}

const machineGame = new MachineGame();
