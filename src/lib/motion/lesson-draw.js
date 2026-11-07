// What practice draws for a game played with hand cursors: each hand's ring and its target over the
// mirror, and a looping demo of the move. The demo is a ring, not a character, because a cursor goes
// where the hand goes, whatever the arm does to get it there. Colours are the game's own rings.
import { HAND_COLOURS } from "../stage/views/cursors.js";
import { projection } from "./overlay.js";

const EITHER = "#ffffff";
const TRAIL_MS = 160;
const DOT_SIZE = 0.22; // of the field's half height, as wide as practice's reach test (DOT_REACH)
const SIDES = ["left", "right"];
const colourOf = (hand) => (hand ? HAND_COLOURS[hand] : EITHER);

// Sizes a canvas to its box and clears it. The mirror's canvas is sized by drawSkeleton instead.
export function clearCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const [width, height] = [Math.round(rect.width * ratio), Math.round(rect.height * ratio)];
  if (canvas.width !== width || canvas.height !== height) Object.assign(canvas, { width, height });
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  return ctx;
}

// The field runs -1 to 1 each way with y up, the same as a hand's aim, across the whole canvas. unitX
// and unitY are how many pixels one field unit is, for anything sized in the field's own units.
function placer(canvas) {
  const at = ({ x, y }) => [((x + 1) / 2) * canvas.width, ((1 - y) / 2) * canvas.height];
  return Object.assign(at, { unitX: canvas.width / 2, unitY: canvas.height / 2 });
}

// Over the mirror the field is the engine's reach box, so a ring sits on the hand that drives it and a
// target sits where that hand has to go.
export function mirrorPlacer(canvas, aspect, reach) {
  const onCamera = projection(canvas, aspect);
  const at = ({ x, y }) => onCamera({ x: reach.x + x * reach.halfWidth, y: reach.y - y * reach.halfHeight });
  const scale = Math.max(canvas.width / aspect, canvas.height);
  return Object.assign(at, { unitX: reach.halfWidth * scale, unitY: reach.halfHeight * scale, box: true });
}

// The box the screen stands for, faint, so the player sees how far a hand has to go.
function screenBox(ctx, at) {
  const [left, top] = at({ x: -1, y: 1 });
  const [right, bottom] = at({ x: 1, y: -1 });
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(left, top, right - left, bottom - top);
  ctx.setLineDash([]);
}

// Keeps the last moments of each hand, so a fast hand leaves a streak and a slow one hardly any.
export function pushTrail(trails, cursors, t) {
  for (const side of SIDES) {
    const kept = (trails[side] ?? []).filter((point) => t - point.t <= TRAIL_MS);
    trails[side] = cursors[side] ? [...kept, { ...cursors[side], t }] : [];
  }
  return trails;
}

function ring(ctx, [x, y], size, colour) {
  for (const [style, width] of [["rgba(0,0,0,0.6)", size * 0.55], [colour, size * 0.3]]) {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function streak(ctx, points, colour, width) {
  if (points.length < 2) return;
  ctx.strokeStyle = colour;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// A watermelon, whole or split along angle, with a halo in the colour of the hand that should cut it.
function fruit(ctx, [x, y], radius, halo, { split = 0, angle = 0, fade = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(x, y);
  if (!split) {
    ctx.strokeStyle = halo;
    ctx.lineWidth = radius * 0.14;
    ctx.setLineDash([radius * 0.3, radius * 0.22]);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.rotate(angle);
  for (const side of split ? [-1, 1] : [0]) {
    ctx.save();
    ctx.translate(0, side * split);
    const [from, to] = side < 0 ? [Math.PI, Math.PI * 2] : side > 0 ? [0, Math.PI] : [0, Math.PI * 2];
    for (const [colour, size] of [["#1f8a3b", 1], ["#bdf29a", 0.88], ["#ff4d5e", 0.8]]) {
      ctx.fillStyle = colour;
      ctx.beginPath();
      if (side) ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius * size, from, to);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

function floorLine(ctx, canvas, at, y) {
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = Math.max(2, canvas.height * 0.006);
  ctx.beginPath();
  ctx.moveTo(...at({ x: -0.9, y }));
  ctx.lineTo(...at({ x: 0.9, y }));
  ctx.stroke();
}

function mark(ctx, [x, y], size, colour) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.4);
  ctx.lineTo(x - size, y + size * 1.8);
  ctx.lineTo(x + size, y + size * 1.8);
  ctx.closePath();
  ctx.fill();
}

// A tray on the floor under its hand, joined to the ring so the player sees which drives which.
function tray(ctx, canvas, at, x, floorY, half, colour, ringAt) {
  const [cx, cy] = at({ x, y: floorY });
  const width = 2 * half * at.unitX;
  const height = canvas.height * 0.03;
  if (ringAt) {
    ctx.strokeStyle = colour;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = Math.max(1, canvas.height * 0.004);
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(ringAt[0], ringAt[1]);
    ctx.lineTo(cx, cy - height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = colour;
  ctx.fillRect(cx - width / 2, cy - height, width, height);
}

// Over the mirror, after drawSkeleton: the target the player is on, then each hand's streak and ring.
// Pass mirrorPlacer's at over the camera, so all of it lines up with the player's own hands.
export function drawLesson(canvas, move, cursors, dot, trails = {}, at = placer(canvas)) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const size = canvas.height * 0.03;
  if (at.box) screenBox(ctx, at);
  if (move.gesture === "slide") {
    floorLine(ctx, canvas, at, move.dots[0].y);
    if (dot) mark(ctx, at(dot), size, colourOf(dot.hand));
    for (const side of SIDES) if (cursors[side]) tray(ctx, canvas, at, cursors[side].x, move.dots[0].y, move.half ?? 0.19, HAND_COLOURS[side], at(cursors[side]));
  } else if (dot && move.gesture === "slice") fruit(ctx, at(dot), dot.radius * at.unitY, colourOf(dot.hand));
  else if (dot) {
    ctx.fillStyle = colourOf(dot.hand);
    ctx.beginPath();
    ctx.arc(...at(dot), DOT_SIZE * at.unitY, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const side of SIDES) {
    streak(ctx, (trails[side] ?? []).map(at), HAND_COLOURS[side], size * 0.6);
    if (cursors[side]) ring(ctx, at(cursors[side]), size, HAND_COLOURS[side]);
  }
}

const ease = (u) => u * u * (3 - 2 * u);
const SLICE_PATHS = [[1, 0], [0.7, -0.7], [0, 1], [-1, -0.3]]; // any direction cuts, so the demo turns
const DEMO_FRUIT = { x: 0, y: 0.05, radius: 0.22 };

// A ring waits, sweeps fast through the fruit, and the fruit falls apart. The hands take turns.
function demoSlice(ctx, canvas, at, seconds, sides) {
  const LOOP = 1.7;
  const round = Math.floor(seconds / LOOP);
  const u = (seconds % LOOP) / LOOP;
  const [dx, dy] = SLICE_PATHS[round % SLICE_PATHS.length];
  const side = sides[round % sides.length];
  const along = (k) => ({ x: DEMO_FRUIT.x + dx * (k - 0.5) * 1.4, y: DEMO_FRUIT.y + dy * (k - 0.5) * 1.4 });
  const sweep = (v) => Math.min(1, Math.max(0, (v - 0.3) / 0.14));
  const radius = (DEMO_FRUIT.radius * canvas.height) / 2;
  const cut = sweep(u) >= 0.5;
  const angle = Math.atan2(-dy, dx);
  if (!cut) fruit(ctx, at(DEMO_FRUIT), radius, HAND_COLOURS[side]);
  else fruit(ctx, at(DEMO_FRUIT), radius, HAND_COLOURS[side], { split: radius * 0.15 + (u - 0.37) * radius * 1.6, angle, fade: Math.max(0, 1 - (u - 0.37) * 1.8) });
  const now = along(ease(sweep(u)));
  const tail = Array.from({ length: 8 }, (_, i) => at(along(ease(sweep(u - 0.06 + i * 0.0075)))));
  const size = canvas.height * 0.045;
  streak(ctx, tail, HAND_COLOURS[side], size * 0.7);
  ring(ctx, at(now), size, HAND_COLOURS[side]);
  if (sweep(u) > 0 && sweep(u) < 1) {
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.round(canvas.height * 0.07)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("Fast!", canvas.width / 2, canvas.height * 0.12);
  }
}

// A ring rises from rest to its dot, one hand and then the other.
function demoReach(ctx, canvas, at, seconds, sides) {
  const LOOP = 1.6;
  const round = Math.floor(seconds / LOOP);
  const u = (seconds % LOOP) / LOOP;
  const side = sides[round % sides.length];
  const x = sides.length > 1 ? (side === "left" ? -0.5 : 0.5) : [-0.5, 0.5][round % 2];
  const dot = { x, y: 0.3 };
  const reached = u > 0.55;
  ctx.fillStyle = HAND_COLOURS[side];
  ctx.globalAlpha = reached ? 1 : 0.55;
  ctx.beginPath();
  ctx.arc(...at(dot), canvas.height * (reached ? 0.13 : 0.11), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  const k = ease(Math.min(1, u / 0.55));
  ring(ctx, at({ x: x * 0.6, y: -0.7 + (dot.y + 0.7) * k }), canvas.height * 0.045, HAND_COLOURS[side]);
}

// A ring slides from side to side and its tray follows along the floor, over each mark in turn.
function demoSlide(ctx, canvas, at, seconds, sides) {
  const LOOP = 3.2;
  const u = (seconds % LOOP) / LOOP;
  const x = 0.45 * Math.sin(u * Math.PI * 2);
  const side = sides.length > 1 ? (x < 0 ? "left" : "right") : sides[0];
  const floorY = -0.7;
  floorLine(ctx, canvas, at, floorY);
  for (const markX of [-0.4, 0.4]) mark(ctx, at({ x: markX, y: floorY }), canvas.height * 0.03, Math.abs(x - markX) < 0.08 ? "#ffffff" : "rgba(255,255,255,0.35)");
  const ringAt = at({ x, y: 0.1 });
  tray(ctx, canvas, at, x, floorY, 0.19, HAND_COLOURS[side], ringAt);
  ring(ctx, ringAt, canvas.height * 0.045, HAND_COLOURS[side]);
}

const DEMOS = { aim: demoReach, slice: demoSlice, slide: demoSlide };
export const DEMO_KINDS = Object.keys(DEMOS);

// The move on a loop, seconds since it started. With the mouse there is only the one ring.
export function drawDemo(canvas, kind, seconds, { mouse = false } = {}) {
  if (!canvas) return;
  const ctx = clearCanvas(canvas);
  DEMOS[kind]?.(ctx, canvas, placer(canvas), seconds, mouse ? ["right"] : SIDES);
}
