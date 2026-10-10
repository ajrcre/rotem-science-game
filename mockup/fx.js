"use strict";

// ---------- Weapon FX: additive-blend canvas (charge, weapon stream, sparks, shockwave) ----------
// Each weapon is a style function that draws one frame of its stream from muzzle to target.

const SPARK_TINTS = {
  fire:  (u) => `hsla(${55 - 40 * u}, 100%, ${78 - 25 * u}%, ${1 - u})`,
  water: (u) => `hsla(200, 90%, ${86 - 22 * u}%, ${1 - u})`,
  sonic: (u) => `hsla(${185 + 40 * u}, 95%, ${80 - 18 * u}%, ${1 - u})`,
  wind:  (u) => `hsla(95, 35%, ${92 - 20 * u}%, ${0.85 * (1 - u)})`,
  stone: (u) => `hsla(35, 25%, ${72 - 30 * u}%, ${1 - u})`,
};

// Timing per weapon: how long it fires, when the saucer reacts, and how the hull reacts.
const WEAPONS = {
  laser: { ms: 1000, hitAt: 160, ufo: "hot",  tint: "fire",  charge: [255, 200, 110] },
  sonic: { ms: 1300, hitAt: 420, ufo: "hit",  tint: "sonic", charge: [120, 230, 255] },
  wind:  { ms: 1300, hitAt: 380, ufo: "hit",  tint: "wind",  charge: [225, 240, 255] },
  water: { ms: 1150, hitAt: 220, ufo: "hit",  tint: "water", charge: [110, 190, 255] },
  flame: { ms: 1300, hitAt: 450, ufo: "hot",  tint: "fire",  charge: [255, 150, 60] },
  sling: { ms: 950,  hitAt: 520, ufo: "hit",  tint: "stone", charge: [255, 230, 180] },
};

const geometry = (b, t) => {
  const dx = b.to.x - b.from.x, dy = b.to.y - b.from.y;
  const ang = Math.atan2(dy, dx);
  return { ang, len: Math.hypot(dx, dy), cos: Math.cos(ang), sin: Math.sin(ang),
           fade: t > b.ms - 180 ? Math.max((b.ms - t) / 180, 0) : 1 };
};

const WEAPON_STYLES = {
  laser(fx, b, now, t) {
    const { ctx } = fx;
    const { from, to } = b;
    const extend = Math.min(t / 110, 1);
    const { ang, fade } = geometry(b, t);
    const len = Math.hypot(to.x - from.x, to.y - from.y) * extend;
    const w = 22 * fade * (1 + 0.14 * Math.sin(now * 0.07) + rand(-0.06, 0.06));
    const end = { x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len };

    // The beam lights up the sky around the muzzle and the target.
    fx.glow(from.x, from.y, 300, [[0, `rgba(255,190,110,${0.28 * fade})`], [1, "rgba(255,150,60,0)"]]);
    fx.glow(end.x, end.y, 320, [[0, `rgba(255,170,90,${0.32 * fade})`], [1, "rgba(255,120,40,0)"]]);

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
    band(w * 3.2, [[0, "rgba(255,80,20,0)"], [0.5, "rgba(255,110,40,0.38)"], [1, "rgba(255,80,20,0)"]]);    // bloom
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
    fx.glow(from.x, from.y, flare, [[0, "rgba(255,255,255,1)"], [0.3, "rgba(255,225,140,0.8)"], [1, "rgba(255,120,40,0)"]]);
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
      fx.glow(end.x, end.y, w * 4.5 * (1 + rand(-0.15, 0.15)),
              [[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,220,130,0.85)"], [1, "rgba(255,100,30,0)"]]);
      fx.burst(end, 5, { dir: ang + Math.PI, spread: 2.2, speed: [180, 560], life: [0.35, 0.8], size: [1.5, 3.5] });
    }
  },

  // Sound: wavefronts ")))" racing from the horn to the saucer.
  sonic(fx, b, now, t) {
    const { ctx } = fx;
    const { ang, len, cos, sin, fade } = geometry(b, t);
    b.waves ??= [];
    b.next ??= 0;
    if (t >= b.next && t < b.ms - 350) { b.waves.push(t); b.next = t + 70; }
    fx.glow(b.from.x, b.from.y, 160, [[0, `rgba(170,240,255,${0.65 * fade})`], [1, "rgba(80,200,255,0)"]]);
    const nx = -sin, ny = cos;
    const cone = ctx.createLinearGradient(b.from.x, b.from.y, b.to.x, b.to.y);
    cone.addColorStop(0, `rgba(120,220,255,${0.22 * fade})`);
    cone.addColorStop(1, `rgba(120,220,255,${0.08 * fade})`);
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(b.from.x + nx * 20, b.from.y + ny * 20);
    ctx.lineTo(b.to.x + nx * 110, b.to.y + ny * 110);
    ctx.lineTo(b.to.x - nx * 110, b.to.y - ny * 110);
    ctx.lineTo(b.from.x - nx * 20, b.from.y - ny * 20);
    ctx.fill();
    ctx.lineCap = "round";
    for (const w0 of b.waves) {
      const u = (t - w0) / 430;
      if (u < 0 || u > 1) continue;
      const px = b.from.x + cos * len * u, py = b.from.y + sin * len * u;
      const r = 26 + 110 * u;
      ctx.beginPath();
      ctx.arc(px - cos * r, py - sin * r, r, ang - 1.05, ang + 1.05);
      ctx.strokeStyle = `rgba(60,200,255,${0.75 * (1 - u * 0.5)})`;
      ctx.lineWidth = 20 * (1 - u) + 6;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${(1 - u * 0.4)})`;
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    if (t > 430) {
      fx.glow(b.to.x, b.to.y, 110 * (1 + rand(-0.1, 0.1)), [[0, `rgba(200,250,255,${0.7 * fade})`], [1, "rgba(80,200,255,0)"]]);
      if (Math.random() < 0.5) fx.burst(b.to, 3, { tint: "sonic", dir: ang + Math.PI, spread: 2.6, speed: [120, 380], life: [0.3, 0.6], size: [2, 4] });
    }
  },

  // Wind: a cone of swirling gust streaks and tumbling leaves.
  wind(fx, b, now, t, dt) {
    const { ctx } = fx;
    const { len, cos, sin, fade } = geometry(b, t);
    b.gusts ??= [];
    if (t < b.ms - 300) {
      for (let i = 0; i < 9; i++) {
        b.gusts.push({ d: 0, off: rand(-1, 1), speed: rand(650, 1050), phase: rand(0, TAU), leaf: Math.random() < 0.2 });
      }
    }
    // Faint cone of moving air.
    const nx = -sin, ny = cos;
    const g = ctx.createLinearGradient(b.from.x, b.from.y, b.to.x, b.to.y);
    g.addColorStop(0, `rgba(230,245,255,${0.3 * fade})`);
    g.addColorStop(1, `rgba(230,245,255,${0.12 * fade})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(b.from.x + nx * 14, b.from.y + ny * 14);
    ctx.lineTo(b.to.x + nx * 90, b.to.y + ny * 90);
    ctx.lineTo(b.to.x - nx * 90, b.to.y - ny * 90);
    ctx.lineTo(b.from.x - nx * 14, b.from.y - ny * 14);
    ctx.fill();

    const at = (gst, d) => {
      const spread = 14 + 80 * (d / len);
      const o = gst.off * spread + Math.sin(gst.phase + d * 0.025) * 16;
      return [b.from.x + cos * d + nx * o, b.from.y + sin * d + ny * o];
    };
    ctx.lineCap = "round";
    b.gusts = b.gusts.filter((gst) => (gst.d += gst.speed * dt) < len * 1.15);
    for (const gst of b.gusts) {
      const alpha = Math.min(1, (len * 1.15 - gst.d) / 80);
      if (gst.leaf) {
        const [x, y] = at(gst, gst.d);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(gst.d * 0.05);
        ctx.fillStyle = `rgba(150,200,90,${alpha})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, 12, 5, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
        continue;
      }
      ctx.beginPath();
      for (let k = 0; k <= 9; k++) {
        const [x, y] = at(gst, Math.max(0, gst.d - k * 15));
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = `rgba(160,200,235,${0.45 * alpha})`;
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.95 * alpha})`;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  },

  // Water: a drooping jet with a bright core, droplets and a splash on the hull.
  water(fx, b, now, t) {
    const { ctx } = fx;
    const { ang, fade } = geometry(b, t);
    const extend = Math.min(t / 160, 1);
    const mid = { x: (b.from.x + b.to.x) / 2, y: (b.from.y + b.to.y) / 2 + 55 };    // gravity droop
    const point = (u) => ({
      x: (1 - u) ** 2 * b.from.x + 2 * (1 - u) * u * mid.x + u * u * b.to.x,
      y: (1 - u) ** 2 * b.from.y + 2 * (1 - u) * u * mid.y + u * u * b.to.y,
    });
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const u = (i / 24) * extend;
      const p = point(u);
      p.y += Math.sin(now * 0.03 + i * 0.9) * 2.5;
      pts.push(p);
    }
    const stroke = (w, color) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.stroke();
    };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "source-over";
    stroke(34 * fade, "rgba(25,70,140,0.9)");          // ink-dark edge
    stroke(26 * fade, "rgba(60,150,230,0.95)");
    stroke(12 * fade, "rgba(150,215,255,0.95)");
    stroke(4 * fade, "rgba(255,255,255,0.95)");
    ctx.globalCompositeOperation = "lighter";
    const end = pts[pts.length - 1];
    if (Math.random() < 0.7) {
      const p = pts[Math.floor(rand(4, pts.length))];
      fx.burst(p, 1, { tint: "water", dir: Math.PI / 2, spread: 2, speed: [40, 160], life: [0.4, 0.8], size: [3, 5] });
    }
    if (extend >= 1) {
      fx.burst(end, 6, { tint: "water", dir: ang + Math.PI, spread: 2.6, speed: [150, 520], life: [0.4, 0.9], size: [3, 6] });
    }
  },

  // Flame: a roaring stream of fire puffs that cool into smoke.
  flame(fx, b, now, t, dt) {
    const { ctx } = fx;
    const { ang, cos, sin, fade } = geometry(b, t);
    b.puffs ??= [];
    if (t < b.ms - 250) {
      for (let i = 0; i < 5; i++) {
        const v = rand(620, 880), side = rand(-70, 70);
        b.puffs.push({ x: b.from.x, y: b.from.y, vx: cos * v - sin * side, vy: sin * v + cos * side,
                       age: 0, life: rand(0.45, 0.7), r: rand(8, 14) });
      }
    }
    fx.glow(b.from.x, b.from.y, 140, [[0, `rgba(255,220,140,${0.7 * fade})`], [1, "rgba(255,120,30,0)"]]);
    b.puffs = b.puffs.filter((p) => (p.age += dt) < p.life);
    for (const p of b.puffs) {
      p.x += p.vx * dt;
      p.y += p.vy * dt - 40 * dt;
      p.vx *= 0.975;
      p.vy *= 0.975;
      const u = p.age / p.life;
      const r = p.r * (1 + u * 3.2);
      if (u > 0.55) {
        ctx.globalCompositeOperation = "source-over";
        fx.glow(p.x, p.y, r * 1.3, [[0, `rgba(60,50,45,${0.35 * (u - 0.55) / 0.45})`], [1, "rgba(60,50,45,0)"]]);
        ctx.globalCompositeOperation = "lighter";
      }
      const core = u < 0.2 ? "255,250,210" : u < 0.5 ? "255,190,70" : "240,90,30";
      fx.glow(p.x, p.y, r, [[0, `rgba(${core},${0.9 * (1 - u)})`], [0.6, `rgba(255,120,30,${0.4 * (1 - u)})`], [1, "rgba(200,40,10,0)"]]);
    }
    if (t > 380) {
      fx.glow(b.to.x, b.to.y, 120 * (1 + rand(-0.15, 0.15)), [[0, `rgba(255,230,160,${0.8 * fade})`], [1, "rgba(255,90,20,0)"]]);
      if (Math.random() < 0.6) fx.burst(b.to, 2, { dir: ang + Math.PI, spread: 2.4, speed: [120, 420], life: [0.3, 0.7], size: [2, 4] });
    }
  },

  // Slingshot: a spinning rock flies on an arc and smashes into the hull.
  sling(fx, b, now, t) {
    const { ctx } = fx;
    const flight = b.ms * 0.55;
    const u = Math.min(t / flight, 1);
    const x = b.from.x + (b.to.x - b.from.x) * u;
    const y = b.from.y + (b.to.y - b.from.y) * u - 110 * 4 * u * (1 - u);
    b.trail ??= [];
    if (u < 1) b.trail.push({ x, y });
    if (b.trail.length > 14) b.trail.shift();
    ctx.lineCap = "round";
    b.trail.forEach((p, i) => {
      if (!i) return;
      const q = b.trail[i - 1];
      ctx.strokeStyle = `rgba(255,245,220,${(i / b.trail.length) * 0.6})`;
      ctx.lineWidth = 3 + i * 0.9;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });
    if (u < 1) {
      ctx.globalCompositeOperation = "source-over";
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 0.02);
      const g = ctx.createRadialGradient(-5, -5, 2, 0, 0, 20);
      g.addColorStop(0, "#d9d2c5");
      g.addColorStop(1, "#6f665a");
      ctx.fillStyle = g;
      ctx.strokeStyle = "#1c1410";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, -4); ctx.lineTo(0, 2); ctx.lineTo(6, -6);
      ctx.stroke();
      ctx.restore();
      ctx.globalCompositeOperation = "lighter";
    } else if (!b.hit) {
      b.hit = true;
      fx.burst(b.to, 40, { tint: "stone", speed: [150, 600], life: [0.4, 1], size: [3, 7] });
      fx.burst(b.to, 30, { speed: [200, 700], life: [0.3, 0.8], size: [2, 4] });
      fx.ring(b.to, 160, 420);
    }
  },
};

class WeaponFX {
  constructor(canvas, size = 640) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.k = canvas.width / size;            // canvas pixels per scene pixel
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

  chargeAt(p, ms, color = [255, 200, 110]) { this.charge = { p, t0: performance.now(), ms, color }; this.run(); }

  fire(style, from, to, ms) {
    this.charge = null;
    this.beam = { style, from, to, t0: performance.now(), ms };
    this.run();
  }

  burst(p, n, { speed = [200, 800], spread = TAU, dir = 0, life = [0.5, 1.1], size = [2, 5], tint = "fire" } = {}) {
    for (let i = 0; i < n; i++) {
      const a = dir + rand(-spread / 2, spread / 2);
      const v = rand(...speed);
      this.sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                         age: 0, life: rand(...life), size: rand(...size), tint });
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
    if (r <= 0) return;
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
    if (this.beam) {
      const t = Math.max(0, now - this.beam.t0);   // rAF timestamps can predate t0 slightly
      if (t > this.beam.ms) this.beam = null;
      else WEAPON_STYLES[this.beam.style](this, this.beam, now, t, dt);
    }
    this.drawSparks(dt);
    this.drawRings(now);
    ctx.globalCompositeOperation = "source-over";
  }

  drawCharge(now) {
    const { p, t0, ms, color: [r, g, b] } = this.charge;
    const u = Math.min(Math.max(0, (now - t0) / ms), 1);
    // Motes of energy get sucked into the muzzle.
    for (let i = 0; i < 3; i++) {
      const a = rand(0, TAU), d = rand(70, 150);
      const v = rand(260, 420);
      this.sparks.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, vx: -Math.cos(a) * v, vy: -Math.sin(a) * v,
                         age: 0, life: d / v, size: rand(1.5, 3), noGravity: true, tint: "fire" });
    }
    const flick = 1 + 0.15 * Math.sin(now * 0.05);
    this.glow(p.x, p.y, (30 + 70 * u) * flick, [[0, "rgba(255,255,255,0.95)"], [0.25, `rgba(${r},${g},${b},0.7)`],
                                                 [0.6, `rgba(${r},${g},${b},0.25)`], [1, `rgba(${r},${g},${b},0)`]]);
    this.glow(p.x, p.y, 220 * u, [[0, `rgba(${r},${g},${b},0.18)`], [1, `rgba(${r},${g},${b},0)`]]);
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
      ctx.strokeStyle = SPARK_TINTS[s.tint || "fire"](u);
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
      const u = Math.max(0, (now - r.t0) / r.ms);
      const e = 1 - Math.pow(1 - u, 3);
      ctx.strokeStyle = `rgba(255,235,180,${0.85 * (1 - u)})`;
      ctx.lineWidth = 20 * (1 - u) + 1;
      ctx.beginPath();
      ctx.arc(r.p.x, r.p.y, 12 + r.radius * e, 0, TAU);
      ctx.stroke();
    }
  }
}
