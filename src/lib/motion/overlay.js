import { LM, SKELETON } from "./landmarks.js";

export const HAND_COLOURS = { left: "#39d0c6", right: "#ff2d78" };

// object-fit: cover, matching the video element underneath.
function projection(canvas, aspect) {
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
  const placed = ghost.points.map((point) => point && { x: shoulderX + point.x * torso, y: shoulderY + point.y * torso });
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
      ctx.lineWidth = (moving ? width * 2 : width) + extra;
      ctx.beginPath();
      ctx.moveTo(...at(placed[a]));
      ctx.lineTo(...at(placed[b]));
      ctx.stroke();
    }
    const head = placed[LM.nose];
    if (!head) continue;
    ctx.lineWidth = width + extra;
    ctx.beginPath();
    ctx.arc(...at(head), width * 3, 0, Math.PI * 2);
    ctx.stroke();
  }
}
