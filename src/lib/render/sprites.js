// Targets, hazards and the player's body. Sprites take a centre and a radius and draw through the pen.
import { mix } from "./color.js";
import { LM } from "../motion/landmarks.js";

export const TARGETS = {
  ball(pen, x, y, r, color, t, seed) {
    pen.circle(x, y, r, { fill: mix(color, "#ffffff", 0.75), seed });
    const spin = t * 0.004;
    const patch = (angle, distance, size) => {
      const px = x + Math.cos(angle + spin) * r * distance;
      const py = y + Math.sin(angle + spin) * r * distance;
      const points = Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2 + spin;
        return [px + Math.cos(a) * r * size, py + Math.sin(a) * r * size];
      });
      pen.polygon(points, { fill: pen.palette.ink, seed: seed + 1, flat: true });
    };
    patch(0, 0, 0.3);
    for (let i = 0; i < 5; i += 1) patch((i / 5) * Math.PI * 2, 0.74, 0.2);
  },
  coin(pen, x, y, r, color, t, seed) {
    const squash = Math.abs(Math.cos(t * 0.005)) * 0.75 + 0.25;
    pen.shape((c) => c.ellipse(x, y, r * squash, r, 0, 0, Math.PI * 2), { fill: color, seed });
    pen.shape((c) => c.ellipse(x, y, r * squash * 0.6, r * 0.6, 0, 0, Math.PI * 2), { fill: mix(color, "#ffffff", 0.45), seed: seed + 1, flat: true });
  },
  star(pen, x, y, r, color, t, seed) {
    const points = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2 + t * 0.002;
      const radius = i % 2 ? r * 0.46 : r;
      return [x + Math.cos(a) * radius, y + Math.sin(a) * radius];
    });
    pen.polygon(points, { fill: color, seed });
  },
  gem(pen, x, y, r, color, t, seed) {
    pen.polygon([[x - r * 0.8, y - r * 0.3], [x - r * 0.4, y - r * 0.8], [x + r * 0.4, y - r * 0.8], [x + r * 0.8, y - r * 0.3], [x, y + r]], { fill: color, seed });
    pen.polygon([[x - r * 0.4, y - r * 0.3], [x + r * 0.4, y - r * 0.3], [x, y + r * 0.7]], { fill: mix(color, "#ffffff", 0.5), seed: seed + 1, flat: true });
  },
  fruit(pen, x, y, r, color, t, seed) {
    pen.circle(x, y + r * 0.1, r * 0.9, { fill: color, seed });
    pen.shape((c) => {
      c.moveTo(x, y - r * 0.7);
      c.quadraticCurveTo(x + r * 0.6, y - r * 1.2, x + r * 0.8, y - r * 0.7);
      c.quadraticCurveTo(x + r * 0.3, y - r * 0.4, x, y - r * 0.7);
    }, { fill: pen.palette.accent, seed: seed + 1 });
  },
  ring(pen, x, y, r, color, t, seed) {
    pen.shape((c) => {
      c.arc(x, y, r, 0, Math.PI * 2);
      c.moveTo(x + r * 0.62, y);
      c.arc(x, y, r * 0.62, 0, Math.PI * 2, true);
    }, { fill: color, seed });
  },
  pad(pen, x, y, r, color, t, seed) {
    pen.shape((c) => c.roundRect(x - r, y - r * 1.15, r * 2, r * 2.3, r * 0.4), { fill: color, seed });
    pen.circle(x, y, r * 0.62, { fill: mix(color, "#ffffff", 0.7), seed: seed + 1, flat: true });
    pen.circle(x, y, r * 0.28, { fill: pen.palette.hazard, seed: seed + 2, flat: true });
  },
};

export const HAZARDS = {
  laser(pen, x, y, r, color, t, seed) {
    const height = r * 2.4;
    pen.shape((c) => c.roundRect(x - r * 0.34, y - height, r * 0.68, height * 2, r * 0.3), { fill: color, seed });
    pen.shape((c) => c.roundRect(x - r * 0.11, y - height, r * 0.22, height * 2, r * 0.1), { fill: mix(color, "#ffffff", 0.8), seed: seed + 1, flat: true });
  },
  fist(pen, x, y, r, color, t, seed) {
    pen.shape((c) => c.roundRect(x - r, y - r * 0.8, r * 2, r * 1.6, r * 0.34), { fill: color, seed });
    for (let i = 0; i < 4; i += 1) {
      const kx = x - r * 0.92 + i * r * 0.48;
      pen.shape((c) => c.roundRect(kx, y - r * 0.8, r * 0.4, r * 0.62, r * 0.14), { fill: mix(color, "#ffffff", 0.3), seed: seed + 2 + i, flat: true });
    }
    pen.shape((c) => c.roundRect(x - r * 0.62, y + r * 0.72, r * 1.24, r * 0.5, r * 0.1), { fill: mix(color, pen.palette.ink, 0.5), seed: seed + 7 });
  },
  fireball(pen, x, y, r, color, t, seed) {
    const flicker = Math.sin(t * 0.02) * 0.12;
    const flame = (size, fill, offset) =>
      pen.shape((c) => {
        c.moveTo(x, y - size * (1.5 + flicker));
        c.bezierCurveTo(x + size * 1.2, y - size * 0.4, x + size, y + size, x, y + size);
        c.bezierCurveTo(x - size, y + size, x - size * 1.2, y - size * 0.4, x, y - size * (1.5 + flicker));
      }, { fill, seed: seed + offset });
    flame(r, color, 0);
    flame(r * 0.58, mix(color, pen.palette.target, 0.7), 1);
    flame(r * 0.28, mix(color, "#ffffff", 0.85), 2);
  },
  boulder(pen, x, y, r, color, t, seed) {
    const spin = t * 0.003;
    const points = Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2 + spin;
      const radius = r * (0.82 + ((i * 37) % 10) / 45);
      return [x + Math.cos(a) * radius, y + Math.sin(a) * radius];
    });
    pen.polygon(points, { fill: color, seed });
    pen.circle(x - r * 0.25, y - r * 0.2, r * 0.18, { fill: mix(color, pen.palette.ink, 0.45), seed: seed + 1, flat: true });
    pen.circle(x + r * 0.3, y + r * 0.25, r * 0.12, { fill: mix(color, pen.palette.ink, 0.45), seed: seed + 2, flat: true });
  },
  saw(pen, x, y, r, color, t, seed) {
    const spin = t * 0.012;
    pen.shape((c) => {
      for (let i = 0; i < 28; i += 1) {
        const a = (i / 28) * Math.PI * 2 + spin;
        const radius = i % 2 ? r * 0.76 : r;
        c.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
      }
      c.closePath();
    }, { fill: color, seed });
    pen.circle(x, y, r * 0.24, { fill: pen.palette.ink, seed: seed + 1, flat: true });
  },
  wave(pen, x, y, r, color, t, seed) {
    pen.shape((c) => {
      c.moveTo(x - r * 1.4, y + r);
      c.bezierCurveTo(x - r, y - r * 1.2, x + r * 0.7, y - r * 1.5, x + r * 1.3, y - r * 0.2);
      c.bezierCurveTo(x + r * 0.5, y - r * 0.6, x + r * 0.2, y + r * 0.1, x + r * 1.1, y + r);
      c.closePath();
    }, { fill: color, seed });
  },
};

const JOINTS = {
  head: LM.nose,
  ls: LM.leftShoulder,
  rs: LM.rightShoulder,
  le: LM.leftElbow,
  re: LM.rightElbow,
  lw: LM.leftWrist,
  rw: LM.rightWrist,
  lh: LM.leftHip,
  rh: LM.rightHip,
  lk: LM.leftKnee,
  rk: LM.rightKnee,
  la: LM.leftAnkle,
  ra: LM.rightAnkle,
};

// Neutral stance in torso lengths relative to the hip centre, with y downward.
export const NEUTRAL_BODY = {
  head: [0, -1.42],
  ls: [-0.42, -1],
  rs: [0.42, -1],
  le: [-0.58, -0.5],
  re: [0.58, -0.5],
  lw: [-0.62, -0.02],
  rw: [0.62, -0.02],
  lh: [-0.22, 0],
  rh: [0.22, 0],
  lk: [-0.27, 0.85],
  rk: [0.27, 0.85],
  la: [-0.3, 1.7],
  ra: [0.3, 1.7],
};

export function bodyFromLandmarks(points, torso) {
  const hipX = (points[LM.leftHip].x + points[LM.rightHip].x) / 2;
  const hipY = (points[LM.leftHip].y + points[LM.rightHip].y) / 2;
  return Object.fromEntries(
    Object.entries(JOINTS).map(([name, index]) => [name, [(points[index].x - hipX) / torso, (points[index].y - hipY) / torso]]),
  );
}

// A keyboard player has no landmarks, so the body acts out what the round just did.
export function bodyFromActions(sinceAction, runPhase) {
  const body = structuredClone(NEUTRAL_BODY);
  const swing = Math.sin(runPhase) * 0.1;
  body.lw[1] += swing;
  body.rw[1] -= swing;

  const pulse = (ms, length) => (ms < length ? Math.sin((ms / length) * Math.PI) : 0);
  const left = pulse(sinceAction.strike_left ?? 1e9, 320);
  const right = pulse(sinceAction.strike_right ?? 1e9, 320);
  body.lw = [body.lw[0] - left * 0.75, body.lw[1] - left * 0.75];
  body.le = [body.le[0] - left * 0.4, body.le[1] - left * 0.4];
  body.rw = [body.rw[0] + right * 0.75, body.rw[1] - right * 0.75];
  body.re = [body.re[0] + right * 0.4, body.re[1] - right * 0.4];

  const up = pulse(sinceAction.up ?? 1e9, 560);
  body.lk[1] -= up * 0.3;
  body.rk[1] -= up * 0.3;
  body.la[1] -= up * 0.45;
  body.ra[1] -= up * 0.45;

  const down = pulse(sinceAction.down ?? 1e9, 1000);
  for (const name of ["head", "ls", "rs", "le", "re", "lw", "rw"]) body[name][1] += down * 0.55;
  body.lw = [body.lw[0], body.lw[1] + down * 0.5];
  body.rw = [body.rw[0], body.rw[1] + down * 0.5];
  body.lk[0] -= down * 0.25;
  body.rk[0] += down * 0.25;
  body.lk[1] -= down * 0.3;
  body.rk[1] -= down * 0.3;
  return { body, rise: up * 0.65, drop: down * 0.85 };
}

export function drawAvatar(pen, avatar, body, x, footY, size, rise, drop) {
  const { palette } = pen;
  const skin = palette.player;
  const cloth = mix(palette.accent, palette.ink, pen.preset === "neon" ? 0 : 0.12);
  const hipY = footY - 1.7 * size - rise * size + drop * size;
  const at = (name) => [x + body[name][0] * size, hipY + body[name][1] * size];

  const thick = size * 0.3;
  const limb = (a, b, width, fill, seed) => {
    const [x1, y1] = at(a);
    const [x2, y2] = at(b);
    pen.limb(x1, y1, x2, y2, width, { fill, seed });
  };

  pen.shape((c) => c.ellipse(x, footY + size * 0.05, size * 0.8 * (1 - Math.min(0.5, rise * 0.5)), size * 0.1, 0, 0, Math.PI * 2), { fill: palette.ink, seed: 40, flat: true });

  limb("lh", "lk", thick, cloth, 41);
  limb("rh", "rk", thick, cloth, 42);
  limb("lk", "la", thick * 0.85, skin, 43);
  limb("rk", "ra", thick * 0.85, skin, 44);

  const [lsx, lsy] = at("ls");
  const [rsx, rsy] = at("rs");
  const [lhx, lhy] = at("lh");
  const [rhx, rhy] = at("rh");
  pen.polygon([[lsx - thick * 0.3, lsy], [rsx + thick * 0.3, rsy], [rhx + thick * 0.2, rhy + thick * 0.2], [lhx - thick * 0.2, lhy + thick * 0.2]], { fill: cloth, seed: 45 });

  limb("ls", "le", thick * 0.78, skin, 46);
  limb("rs", "re", thick * 0.78, skin, 47);
  limb("le", "lw", thick * 0.7, skin, 48);
  limb("re", "rw", thick * 0.7, skin, 49);

  const [hx, hy] = at("head");
  const headR = size * 0.27;
  const [lwx, lwy] = at("lw");
  const [rwx, rwy] = at("rw");
  const hands = (r, fill) => {
    pen.circle(lwx, lwy, r, { fill, seed: 50 });
    pen.circle(rwx, rwy, r, { fill, seed: 51 });
  };

  if (avatar === "robot") {
    pen.shape((c) => c.roundRect(hx - headR, hy - headR, headR * 2, headR * 1.8, headR * 0.3), { fill: skin, seed: 52 });
    pen.line(hx, hy - headR, hx, hy - headR * 1.6, { stroke: palette.ink, seed: 53 });
    pen.circle(hx, hy - headR * 1.7, headR * 0.2, { fill: palette.hazard, seed: 54 });
    return;
  }

  pen.circle(hx, hy, headR, { fill: skin, seed: 52 });
  if (avatar === "keeper") hands(size * 0.25, palette.target);
  if (avatar === "fighter") hands(size * 0.27, palette.hazard);
  if (avatar === "runner") {
    pen.shape((c) => c.rect(hx - headR, hy - headR * 0.5, headR * 2, headR * 0.34), { fill: palette.hazard, seed: 55, flat: true });
  }
  if (avatar === "ninja") {
    pen.circle(hx, hy, headR, { fill: cloth, seed: 56 });
    pen.shape((c) => c.rect(hx - headR * 0.8, hy - headR * 0.24, headR * 1.6, headR * 0.4), { fill: skin, seed: 57, flat: true });
  }
  if (avatar === "astronaut") {
    pen.circle(hx, hy, headR * 1.24, { fill: mix(skin, "#ffffff", 0.5), seed: 58 });
    pen.circle(hx, hy, headR * 0.82, { fill: palette.sky, seed: 59, flat: true });
  }
}
