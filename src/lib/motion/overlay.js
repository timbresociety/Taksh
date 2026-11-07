import { LM, SKELETON } from "./landmarks.js";

export const HAND_COLOURS = { left: "#39d0c6", right: "#ff2d78" };

// object-fit: cover, matching the video element underneath.
export function projection(canvas, aspect) {
  const scale = Math.max(canvas.width / aspect, canvas.height);
  const offsetX = (canvas.width - aspect * scale) / 2;
  const offsetY = (canvas.height - scale) / 2;
  return (point) => [offsetX + point.x * scale, offsetY + point.y * scale];
}

// Draws the tracked skeleton over a mirrored camera view. Points are in square units, aspect wide.
export function drawSkeleton(canvas, points, aspect, color = "#e9ff3a") {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(rect.width * ratio)) {
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!points) return;

  const at = projection(canvas, aspect);

  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2, canvas.height * 0.009);
  for (const [a, b] of SKELETON) {
    ctx.strokeStyle = points[a].v > 0.55 && points[b].v > 0.55 ? color : "rgba(255,92,138,0.8)";
    ctx.beginPath();
    ctx.moveTo(...at(points[a]));
    ctx.lineTo(...at(points[b]));
    ctx.stroke();
  }
}

// Draws each hand's cursor, and the dot it should reach, over the mirrored view. Call after drawSkeleton.
export function drawAim(canvas, cursors, dot) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const place = ({ x, y }) => [((x + 1) / 2) * canvas.width, ((1 - y) / 2) * canvas.height];
  const size = canvas.height * 0.03;
  if (dot) {
    ctx.fillStyle = HAND_COLOURS[dot.hand];
    ctx.beginPath();
    ctx.arc(...place(dot), canvas.height * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = Math.max(3, canvas.height * 0.008);
  for (const side of ["left", "right"]) {
    if (!cursors[side]) continue;
    ctx.strokeStyle = HAND_COLOURS[side];
    ctx.beginPath();
    ctx.arc(...place(cursors[side]), size, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// Draws the move to copy over the player's picture, standing where they calibrated and at their size.
// Call after drawSkeleton, which clears the canvas. The limb doing the move is the bright one.
export function drawGhost(canvas, ghost, aspect, calibration) {
  if (!ghost?.points.length) return;
  const { shoulderX, shoulderY, torso } = calibration;
  const placed = ghost.points.map((point) => point && { x: shoulderX + point.x * torso, y: shoulderY + point.y * torso, scale: point.scale ?? 1 });
  const at = projection(canvas, aspect);
  const ctx = canvas.getContext("2d");
  const width = Math.max(2, canvas.height * 0.009);
  ctx.lineCap = "round";
  // A dark edge keeps the lines readable against a pale wall.
  for (const [color, extra] of [["rgba(0,0,0,0.6)", width * 0.9], ["#ffffff", 0]]) {
    ctx.strokeStyle = color;
    for (const [a, b] of SKELETON) {
      if (!placed[a] || !placed[b]) continue;
      const moving = ghost.lit.includes(a) && ghost.lit.includes(b);
      ctx.lineWidth = (moving ? width * 2 * Math.max(placed[a].scale, placed[b].scale) : width) + extra;
      ctx.beginPath();
      ctx.moveTo(...at(placed[a]));
      ctx.lineTo(...at(placed[b]));
      ctx.stroke();
    }
    // A lit fist ahead of the body is drawn as a ball that grows as it comes at the camera.
    ctx.fillStyle = color;
    for (const index of [LM.leftWrist, LM.rightWrist]) {
      const fist = placed[index];
      if (!fist || !ghost.lit.includes(index) || fist.scale <= 1) continue;
      ctx.globalAlpha = Math.min(1, (fist.scale - 1) / 0.3);
      ctx.beginPath();
      ctx.arc(...at(fist), width * 2.2 * fist.scale + extra / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const head = placed[LM.nose];
    if (!head) continue;
    ctx.lineWidth = width + extra;
    ctx.beginPath();
    ctx.arc(...at(head), width * 3, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// The move the game wants, drawn as a range of motion over the player's own body: the start faint,
// the end bright, and an arrow along the hand, foot or hips that fills as the player gets there.
// ranges come from rangeOf in range.js and fills from the gesture engine's meter, 0 to 1 each. points
// and calibration put the live skeleton on the same frame; without them, as on a keyboard, the arrow
// plays the move on a loop instead. A speed move is a dashed arrow that runs, to say "fast".
const GUIDE_LIVE = "#e9ff3a";
const GUIDE_GOAL = "#ffffff";
const GUIDE_FILL = "#39d0c6";
const GUIDE_URGENT = "#ff2a3d";
const GUIDE_LOOP_MS = 1500;

export function drawRange(canvas, { ranges = [], fills = [], points = null, calibration = null, urgency = 0, t = 0 } = {}) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(rect.width * ratio) || canvas.height !== Math.round(rect.height * ratio)) {
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!ranges.length || !canvas.width || !canvas.height) return;
  ranges = ranges.map(threeQuarter);

  // One frame for every move shown, centred on the standing shoulders so the body never jumps sideways.
  const margin = 0.3;
  const half = Math.max(...ranges.map(({ box }) => Math.max(-box.minX, box.maxX))) + margin;
  const top = Math.min(...ranges.map(({ box }) => box.minY)) - margin;
  const bottom = Math.max(...ranges.map(({ box }) => box.maxY)) + margin;
  const unit = Math.min(canvas.width / (half * 2), canvas.height / (bottom - top));
  const originY = (canvas.height - (bottom - top) * unit) / 2 - top * unit;
  const at = (point) => [canvas.width / 2 + point.x * unit, originY + point.y * unit];
  const width = Math.max(3, unit * 0.07);
  const goal = urgency > 0.7 ? GUIDE_URGENT : GUIDE_GOAL;

  const bones = (skeleton, color, lineWidth, onlyLit = false) => {
    const lit = (index) => skeleton.lit?.includes(index);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    for (const [a, b] of SKELETON) {
      const from = skeleton.points[a];
      const to = skeleton.points[b];
      if (!from || !to || (onlyLit && !(lit(a) && lit(b)))) continue;
      ctx.beginPath();
      ctx.moveTo(...at(from));
      ctx.lineTo(...at(to));
      ctx.stroke();
    }
    const head = skeleton.points[LM.nose];
    if (!head || (onlyLit && !lit(LM.nose))) return;
    ctx.beginPath();
    ctx.arc(...at(head), unit * 0.2, 0, Math.PI * 2);
    ctx.stroke();
  };

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Where the move starts, faint, and where it ends, with the moving limb bright over a dark edge.
  ctx.globalAlpha = 0.3;
  for (const range of ranges) bones(range.start, GUIDE_GOAL, width);
  ctx.globalAlpha = 0.55;
  for (const range of ranges) bones(range.end, GUIDE_GOAL, width);
  ctx.globalAlpha = 1;
  for (const range of ranges) {
    bones(range.end, "rgba(0,0,0,0.65)", width * 2.8, true);
    bones(range.end, goal, width * 1.8, true);
  }

  // The arrows, each filled as far as the player has got.
  ranges.forEach((range, index) => {
    const share = points ? Math.min(1, Math.max(0, fills[index] ?? 0)) : (t % GUIDE_LOOP_MS) / GUIDE_LOOP_MS;
    for (const path of range.paths) drawGuideArrow(ctx, path.points.map(at), share, { width, fast: range.fast, t, goal, grows: path.toward > 0 });
  });

  // The player last, so they can see themselves against the shape they are making.
  if (points && calibration?.torso) {
    const { shoulderX, shoulderY, torso } = calibration;
    const live = { points: [], lit: [] };
    for (const index of Object.values(LM)) {
      const point = points[index];
      if (point && point.v > 0.55) live.points[index] = { x: (point.x - shoulderX) / torso, y: (point.y - shoulderY) / torso };
    }
    ctx.globalAlpha = 0.95;
    bones(live, GUIDE_LIVE, width * 0.8);
    ctx.globalAlpha = 1;
  }
}

// A punch at the screen hardly crosses it seen from the front, so a move that comes at the screen is
// drawn turned three-quarters, as the coach shows it: depth becomes travel to the side, and the arrow
// along the fist's path is a real arrow. The player's skeleton stays front-on over it.
const TURN = 0.55; // radians: enough to see the reach, not so much the body reads side-on
const DEPTH = 2.4; // the forward reach is short; drawn longer so the arrow reads from 3 m
function threeQuarter(range) {
  if (!range.paths.some((path) => path.toward)) return range;
  const turn = (point) => (point ? { ...point, x: point.x * Math.cos(TURN) - (point.z ?? 0) * DEPTH * Math.sin(TURN) } : point);
  const pose = (skeleton) => ({ ...skeleton, points: skeleton.points.map(turn) });
  const paths = range.paths.map((path) => ({ ...path, points: path.points.map(turn) }));
  const start = pose(range.start);
  const end = pose(range.end);
  const all = [...start.points, ...end.points, ...paths.flatMap((path) => path.points)].filter(Boolean);
  const box = {
    minX: Math.min(...all.map((point) => point.x)), maxX: Math.max(...all.map((point) => point.x)),
    minY: Math.min(...all.map((point) => point.y)), maxY: Math.max(...all.map((point) => point.y)),
  };
  return { ...range, start, end, paths, box };
}

function drawGuideArrow(ctx, path, share, { width, fast, t, goal, grows = false }) {
  if (path.length < 2) return;
  const lengths = [0];
  for (let i = 1; i < path.length; i += 1) lengths.push(lengths[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const total = lengths.at(-1);
  if (total < width * 2) return;
  const trace = (until) => {
    ctx.beginPath();
    ctx.moveTo(...path[0]);
    for (let i = 1; i < path.length; i += 1) {
      if (lengths[i] <= until) {
        ctx.lineTo(...path[i]);
        continue;
      }
      const part = (until - lengths[i - 1]) / Math.max(1e-6, lengths[i] - lengths[i - 1]);
      ctx.lineTo(path[i - 1][0] + (path[i][0] - path[i - 1][0]) * part, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * part);
      break;
    }
    ctx.stroke();
  };
  // The track, then the part already covered, then the head.
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = width * 3.2;
  trace(total);
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = width * 2;
  if (fast) ctx.setLineDash([width * 2.4, width * 1.6]);
  if (fast) ctx.lineDashOffset = -t * width * 0.02;
  trace(total);
  ctx.setLineDash([]);
  if (share > 0.02) {
    ctx.strokeStyle = GUIDE_FILL;
    ctx.lineWidth = width * 2.2;
    trace(total * share);
  }
  const [x, y] = path.at(-1);
  const back = path.findLast((_, i) => total - lengths[i] > width * 3) ?? path[0];
  const angle = Math.atan2(y - back[1], x - back[0]);
  const size = width * (fast ? 5 : grows ? 6 : 4); // a punch at you lands big
  if (grows) {
    // Coming at you: the shaft widens toward the head, the way a near thing looks bigger.
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    const [sx, sy] = path[0];
    const across = angle + Math.PI / 2;
    ctx.moveTo(sx + Math.cos(across) * width * 0.6, sy + Math.sin(across) * width * 0.6);
    ctx.lineTo(x + Math.cos(across) * width * 2.6, y + Math.sin(across) * width * 2.6);
    ctx.lineTo(x - Math.cos(across) * width * 2.6, y - Math.sin(across) * width * 2.6);
    ctx.lineTo(sx - Math.cos(across) * width * 0.6, sy - Math.sin(across) * width * 0.6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = share >= 0.98 ? GUIDE_FILL : goal;
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.lineWidth = width * 0.8;
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(angle) * size, y + Math.sin(angle) * size);
  ctx.lineTo(x + Math.cos(angle + 2.4) * size, y + Math.sin(angle + 2.4) * size);
  ctx.lineTo(x + Math.cos(angle - 2.4) * size, y + Math.sin(angle - 2.4) * size);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
}
