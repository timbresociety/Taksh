// Backdrops for each setting. Drawn once per resize into a cached layer, through the active pen.
import { alpha, mix } from "./color.js";

function hash(seed) {
  const x = Math.sin(seed * 91.17 + 47.3) * 12543.5453;
  return x - Math.floor(x);
}

const SCENES = {
  stadium(pen, w, h, horizon, p) {
    const stand = mix(p.sky, p.ink, 0.22);
    pen.shape((c) => {
      c.moveTo(0, horizon);
      c.lineTo(0, horizon * 0.42);
      c.quadraticCurveTo(w / 2, horizon * 0.12, w, horizon * 0.42);
      c.lineTo(w, horizon);
      c.closePath();
    }, { fill: stand, seed: 2, flat: true });
    const crowd = [p.accent, p.target, p.player, p.ink, p.hazard];
    for (let row = 0; row < 5; row += 1) {
      const y = horizon * (0.5 + row * 0.1);
      const size = h * (0.006 + row * 0.0016);
      for (let x = size; x < w; x += size * 3.2) {
        const seed = row * 97 + x;
        pen.ctx.fillStyle = alpha(crowd[Math.floor(hash(seed) * crowd.length)], 0.7);
        pen.ctx.beginPath();
        pen.ctx.arc(x + hash(seed + 1) * size, y + hash(seed + 2) * size, size, 0, Math.PI * 2);
        pen.ctx.fill();
      }
    }
    for (const x of [w * 0.12, w * 0.88]) {
      pen.line(x, horizon * 0.72, x, horizon * 0.12, { stroke: p.ink, seed: 5 });
      pen.shape((c) => c.rect(x - w * 0.045, horizon * 0.02, w * 0.09, horizon * 0.13), { fill: p.ink, seed: 6, flat: true });
      for (let i = 0; i < 4; i += 1) pen.circle(x - w * 0.03 + i * w * 0.02, horizon * 0.085, h * 0.011, { fill: p.target, seed: 7 + i, flat: true });
    }
    pen.shape((c) => c.rect(0, horizon * 0.92, w, horizon * 0.08), { fill: p.accent, seed: 11, flat: true });
  },

  factory(pen, w, h, horizon, p) {
    const wall = mix(p.sky, p.ink, 0.12);
    const metal = mix(p.sky, p.ink, 0.28);
    pen.shape((c) => c.rect(0, 0, w, horizon), { fill: wall, seed: 1, flat: true });
    for (let i = 0; i < 7; i += 1) {
      const x = (i / 6) * w;
      pen.shape((c) => c.rect(x - w * 0.012, 0, w * 0.024, horizon), { fill: metal, seed: 2 + i, flat: true });
    }
    pen.shape((c) => c.rect(0, horizon * 0.14, w, horizon * 0.05), { fill: metal, seed: 12 });
    pen.shape((c) => c.rect(0, horizon * 0.3, w, horizon * 0.03), { fill: p.accent, seed: 13, flat: true });
    const cx = w / 2;
    const size = horizon * 0.5;
    pen.shape((c) => c.roundRect(cx - size * 0.75, horizon - size * 1.32, size * 1.5, size * 1.1, size * 0.14), { fill: metal, seed: 14 });
    pen.shape((c) => c.rect(cx - size * 0.5, horizon - size * 0.22, size, size * 0.22), { fill: mix(metal, p.ink, 0.2), seed: 15 });
    pen.shape((c) => c.roundRect(cx - size * 0.55, horizon - size * 1.02, size * 1.1, size * 0.28, size * 0.1), { fill: p.sky, seed: 16 });
    for (const dir of [-1, 1]) pen.circle(cx + dir * size * 0.27, horizon - size * 0.88, size * 0.1, { fill: p.hazard, seed: 17 });
    for (let i = 0; i < 6; i += 1) {
      const x = cx - size * 0.45 + i * size * 0.18;
      pen.shape((c) => c.rect(x, horizon - size * 0.56, size * 0.1, size * 0.18), { fill: p.ink, seed: 20 + i, flat: true });
    }
    for (const x of [w * 0.1, w * 0.9]) {
      const r = horizon * 0.22;
      gear(pen, x, horizon * 0.66, r, metal);
    }
    const stripe = h * 0.02;
    for (let x = -stripe; x < w; x += stripe * 2.4) {
      pen.polygon([[x, horizon - stripe], [x + stripe, horizon - stripe], [x + stripe * 2, horizon], [x + stripe, horizon]], { fill: p.target, seed: 30, flat: true });
    }
  },

  space(pen, w, h, horizon, p) {
    for (let i = 0; i < 180; i += 1) {
      const x = hash(i) * w;
      const y = hash(i + 500) * horizon;
      pen.ctx.fillStyle = alpha(p.ink, 0.3 + hash(i + 900) * 0.7);
      pen.ctx.beginPath();
      pen.ctx.arc(x, y, h * (0.0012 + hash(i + 1300) * 0.0024), 0, Math.PI * 2);
      pen.ctx.fill();
    }
    const r = horizon * 0.42;
    const cx = w * 0.76;
    const cy = horizon * 0.5;
    pen.circle(cx, cy, r, { fill: p.accent, seed: 3 });
    pen.shape((c) => c.ellipse(cx, cy, r * 1.7, r * 0.34, -0.3, 0, Math.PI * 2), { stroke: p.target, seed: 4, lineWidth: pen.unit * 0.008 });
    pen.circle(w * 0.15, horizon * 0.3, r * 0.3, { fill: mix(p.accent, p.ink, 0.5), seed: 5 });
    ridge(pen, w, horizon, horizon * 0.14, mix(p.ground, p.sky, 0.4), 8);
  },

  jungle(pen, w, h, horizon, p) {
    const far = mix(p.sky, p.ground, 0.55);
    const near = mix(p.ground, p.ink, 0.25);
    ridge(pen, w, horizon, horizon * 0.5, far, 3);
    ridge(pen, w, horizon, horizon * 0.28, mix(far, near, 0.6), 5);
    for (const [x, dir] of [[0, 1], [w, -1]]) {
      for (let i = 0; i < 6; i += 1) {
        const y = horizon * (0.08 + i * 0.2);
        const length = w * (0.14 + hash(i) * 0.1);
        leaf(pen, x, y, dir, length, i % 2 ? near : mix(near, p.accent, 0.3), i);
      }
    }
    for (let i = 0; i < 5; i += 1) {
      const x = w * (0.2 + i * 0.15);
      pen.shape((c) => {
        c.moveTo(x, 0);
        c.bezierCurveTo(x + w * 0.02, horizon * 0.2, x - w * 0.02, horizon * 0.3, x, horizon * (0.3 + hash(i) * 0.18));
      }, { stroke: near, seed: 40 + i });
    }
  },

  dojo(pen, w, h, horizon, p) {
    const dark = pen.preset === "neon";
    const paper = dark ? mix(p.sky, p.accent, 0.12) : mix(p.sky, "#ffffff", 0.3);
    const wood = dark ? mix(p.accent, p.sky, 0.45) : mix(p.ink, p.sky, 0.35);
    pen.shape((c) => c.rect(0, 0, w, horizon), { fill: paper, seed: 1, flat: true });
    const panel = w / 6;
    for (let i = 0; i <= 6; i += 1) pen.shape((c) => c.rect(i * panel - w * 0.006, 0, w * 0.012, horizon), { fill: wood, seed: 2 + i, flat: true });
    for (let row = 1; row < 4; row += 1) pen.shape((c) => c.rect(0, (horizon * row) / 4, w, h * 0.004), { fill: wood, seed: 12 + row, flat: true });
    pen.shape((c) => c.rect(0, 0, w, horizon * 0.09), { fill: wood, seed: 20 });
    pen.shape((c) => c.rect(0, horizon * 0.95, w, horizon * 0.05), { fill: wood, seed: 21 });
    pen.circle(w / 2, horizon * 0.52, horizon * 0.25, { fill: p.hazard, seed: 22 });
    for (const x of [w * 0.17, w * 0.83]) {
      pen.line(x, 0, x, horizon * 0.2, { stroke: wood, seed: 23 });
      pen.shape((c) => c.ellipse(x, horizon * 0.3, h * 0.03, h * 0.045, 0, 0, Math.PI * 2), { fill: p.target, seed: 24 });
    }
  },

  city(pen, w, h, horizon, p) {
    const layers = [[0.34, 0.55, 0.3], [0.2, 0.8, 0.55]];
    layers.forEach(([blend, height, seedBase], layer) => {
      const color = mix(p.sky, p.ink, blend);
      let x = -w * 0.02;
      let i = 0;
      while (x < w) {
        const bw = w * (0.05 + hash(seedBase + i) * 0.07);
        const bh = horizon * height * (0.5 + hash(seedBase + i + 40) * 0.5);
        pen.shape((c) => c.rect(x, horizon - bh, bw, bh), { fill: color, seed: i + layer * 30, flat: true });
        if (layer === 1) {
          const size = h * 0.009;
          for (let wy = horizon - bh + size * 2; wy < horizon - size; wy += size * 2.6) {
            for (let wx = x + size; wx < x + bw - size; wx += size * 2.2) {
              if (hash(wx * 3 + wy) > 0.5) {
                pen.ctx.fillStyle = alpha(p.target, 0.75);
                pen.ctx.fillRect(wx, wy, size, size * 1.3);
              }
            }
          }
        }
        x += bw * 1.04;
        i += 1;
      }
    });
  },

  ocean(pen, w, h, horizon, p) {
    pen.circle(w * 0.5, horizon * 0.62, horizon * 0.3, { fill: p.target, seed: 2 });
    for (let band = 0; band < 4; band += 1) {
      const y = horizon * (0.78 + band * 0.07);
      pen.shape((c) => {
        c.moveTo(0, horizon);
        c.lineTo(0, y);
        for (let x = 0; x <= w; x += w / 12) c.quadraticCurveTo(x + w / 24, y - h * 0.014, x + w / 12, y);
        c.lineTo(w, horizon);
        c.closePath();
      }, { fill: mix(p.sky, p.ground, 0.35 + band * 0.18), seed: 5 + band, flat: true });
    }
    for (const [x, scale] of [[w * 0.14, 1], [w * 0.86, 0.8]]) {
      pen.polygon([[x, horizon * 0.8], [x + w * 0.05 * scale, horizon * 0.8], [x, horizon * 0.4]], { fill: p.ink, seed: 11 });
      pen.shape((c) => c.rect(x - w * 0.04 * scale, horizon * 0.8, w * 0.1 * scale, horizon * 0.05), { fill: p.hazard, seed: 12 });
    }
  },

  desert(pen, w, h, horizon, p) {
    pen.circle(w * 0.72, horizon * 0.42, horizon * 0.22, { fill: p.target, seed: 2 });
    ridge(pen, w, horizon, horizon * 0.34, mix(p.sky, p.ground, 0.5), 3);
    ridge(pen, w, horizon, horizon * 0.2, mix(p.sky, p.ground, 0.8), 6);
    const mesa = mix(p.ground, p.ink, 0.25);
    pen.polygon([[w * 0.06, horizon], [w * 0.1, horizon * 0.52], [w * 0.24, horizon * 0.52], [w * 0.28, horizon]], { fill: mesa, seed: 9 });
    pen.polygon([[w * 0.8, horizon], [w * 0.83, horizon * 0.66], [w * 0.92, horizon * 0.66], [w * 0.95, horizon]], { fill: mesa, seed: 10 });
    for (const x of [w * 0.38, w * 0.64]) {
      const t = h * 0.018;
      const cactus = mix(p.ground, p.accent, 0.7);
      pen.limb(x, horizon, x, horizon * 0.72, t, { fill: cactus, seed: 11 });
      pen.limb(x, horizon * 0.86, x + t * 1.6, horizon * 0.86, t * 0.7, { fill: cactus, seed: 12 });
      pen.limb(x + t * 1.6, horizon * 0.86, x + t * 1.6, horizon * 0.76, t * 0.7, { fill: cactus, seed: 13 });
    }
  },
};

function gear(pen, x, y, r, fill) {
  pen.shape((c) => {
    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      const radius = i % 2 ? r * 0.8 : r;
      c.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    }
    c.closePath();
  }, { fill, seed: 31 });
  pen.circle(x, y, r * 0.3, { fill: pen.palette.sky, seed: 32, flat: true });
}

function ridge(pen, w, base, height, fill, seed) {
  pen.shape((c) => {
    c.moveTo(0, base);
    const steps = 9;
    for (let i = 0; i <= steps; i += 1) {
      const x = (i / steps) * w;
      const y = base - height * (0.4 + hash(seed + i) * 0.6);
      c.quadraticCurveTo(x - w / steps / 2, y - height * 0.2, x, y);
    }
    c.lineTo(w, base);
    c.closePath();
  }, { fill, seed, flat: true });
}

function leaf(pen, x, y, dir, length, fill, seed) {
  pen.shape((c) => {
    c.moveTo(x, y);
    c.quadraticCurveTo(x + dir * length * 0.5, y - length * 0.4, x + dir * length, y + length * 0.12);
    c.quadraticCurveTo(x + dir * length * 0.45, y + length * 0.3, x, y);
  }, { fill, seed });
}

export function drawBackdrop(pen, setting, width, height, horizon) {
  const { ctx, palette } = pen;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, palette.sky);
  sky.addColorStop(1, mix(palette.sky, palette.accent, pen.preset === "neon" ? 0.35 : 0.14));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, horizon + 1);
  SCENES[setting](pen, width, height, horizon, palette);
}
