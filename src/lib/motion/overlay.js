import { SKELETON } from "./landmarks.js";

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

  // object-fit: cover, matching the video element underneath.
  const scale = Math.max(canvas.width / aspect, canvas.height);
  const offsetX = (canvas.width - aspect * scale) / 2;
  const offsetY = (canvas.height - scale) / 2;
  const at = (point) => [offsetX + point.x * scale, offsetY + point.y * scale];

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
