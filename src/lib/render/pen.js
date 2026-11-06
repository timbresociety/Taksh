// A pen draws a shape the way an art style would. Scenes and sprites describe what to draw;
// the pen decides whether that is glowing line, flat ink, cut paper, chalk or a wash of paint.
import { alpha, mix, rgb } from "./color.js";

function hash(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const noiseTiles = new Map();

export function noiseTile(density, size = 256) {
  const key = `${density}-${size}`;
  if (noiseTiles.has(key)) return noiseTiles.get(key);
  const tile = document.createElement("canvas");
  tile.width = tile.height = size;
  const ctx = tile.getContext("2d");
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = hash(i * 0.37) < density ? 255 : 0;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
    image.data[i + 3] = hash(i * 0.73) * 255;
  }
  ctx.putImageData(image, 0, 0);
  noiseTiles.set(key, tile);
  return tile;
}

function halftoneTile(color) {
  const tile = document.createElement("canvas");
  tile.width = tile.height = 10;
  const ctx = tile.getContext("2d");
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(5, 5, 2.2, 0, Math.PI * 2);
  ctx.fill();
  return tile;
}

const STYLES = {
  neon: {
    shape(ctx, path, { fill, stroke, lineWidth }, pen) {
      const color = stroke ?? fill;
      ctx.beginPath();
      path(ctx);
      if (fill) {
        ctx.fillStyle = alpha(fill, 0.16);
        ctx.fill();
      }
      ctx.lineJoin = "round";
      ctx.strokeStyle = alpha(color, 0.22);
      ctx.lineWidth = lineWidth * 3.4;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      ctx.strokeStyle = alpha("#ffffff", 0.75);
      ctx.lineWidth = Math.max(1, lineWidth * 0.35);
      ctx.stroke();
    },
  },
  pixel: {
    shape(ctx, path, { fill, stroke, lineWidth }) {
      ctx.beginPath();
      path(ctx);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = Math.max(1, lineWidth);
        ctx.stroke();
      }
    },
  },
  comic: {
    shape(ctx, path, { fill, stroke, lineWidth, flat }, pen) {
      ctx.beginPath();
      path(ctx);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
        if (flat) return;
        ctx.save();
        ctx.clip();
        ctx.fillStyle = pen.halftone();
        ctx.globalAlpha = 0.28;
        ctx.fill();
        ctx.restore();
      }
      ctx.lineJoin = "round";
      ctx.strokeStyle = pen.palette.ink;
      ctx.lineWidth = lineWidth * 1.7;
      if (stroke && !fill) ctx.strokeStyle = stroke;
      ctx.stroke();
    },
  },
  papercut: {
    shape(ctx, path, { fill, stroke, lineWidth, flat }, pen) {
      const lift = flat ? 0 : pen.unit * 0.006;
      if (lift) {
        ctx.save();
        ctx.translate(lift, lift * 1.6);
        ctx.beginPath();
        path(ctx);
        ctx.fillStyle = "rgba(20,24,20,0.28)";
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      path(ctx);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = alpha("#ffffff", 0.22);
        ctx.lineWidth = Math.max(1, pen.unit * 0.0016);
        ctx.stroke();
      }
      if (stroke && !fill) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
    },
  },
  chalk: {
    shape(ctx, path, { fill, stroke, lineWidth, seed = 1 }, pen) {
      const color = stroke ?? fill;
      const boil = pen.boil;
      if (fill) {
        ctx.save();
        ctx.beginPath();
        path(ctx);
        ctx.clip();
        ctx.strokeStyle = alpha(fill, 0.55);
        ctx.lineWidth = Math.max(1.4, pen.unit * 0.0035);
        ctx.beginPath();
        const span = pen.unit * 3;
        const stepSize = Math.max(4, pen.unit * 0.012);
        for (let offset = -span; offset < span; offset += stepSize) {
          const wobble = hash(seed + offset + boil) * stepSize * 0.6;
          ctx.moveTo(offset + wobble, -span * 0.1);
          ctx.lineTo(offset + span * 0.45 + wobble, span);
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = alpha(color, 0.85);
      ctx.lineWidth = lineWidth * 0.8;
      for (let pass = 0; pass < 2; pass += 1) {
        const jitter = lineWidth * 0.6;
        ctx.save();
        ctx.translate((hash(seed + pass + boil) - 0.5) * jitter, (hash(seed * 2 + pass + boil) - 0.5) * jitter);
        ctx.setLineDash([lineWidth * 7, lineWidth * 0.5, lineWidth * 3, lineWidth * 0.35]);
        ctx.lineDashOffset = hash(seed + boil) * 40;
        ctx.beginPath();
        path(ctx);
        ctx.stroke();
        ctx.restore();
      }
      ctx.setLineDash([]);
    },
  },
  watercolor: {
    shape(ctx, path, { fill, stroke, lineWidth, seed = 1 }, pen) {
      ctx.save();
      if (fill) {
        for (let pass = 0; pass < 3; pass += 1) {
          const drift = pen.unit * 0.004 * (pass + 1);
          ctx.save();
          ctx.translate((hash(seed + pass) - 0.5) * drift, (hash(seed + pass * 3) - 0.5) * drift);
          ctx.beginPath();
          path(ctx);
          ctx.fillStyle = alpha(fill, 0.5);
          ctx.fill();
          ctx.restore();
        }
        ctx.beginPath();
        path(ctx);
        ctx.strokeStyle = alpha(mix(fill, pen.palette.ink, 0.5), 0.55);
        ctx.lineWidth = Math.max(1, pen.unit * 0.002);
        ctx.stroke();
      } else {
        ctx.beginPath();
        path(ctx);
        ctx.strokeStyle = alpha(stroke, 0.6);
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
      ctx.restore();
    },
  },
};

const FONT_WEIGHT = { neon: 800, pixel: 700, comic: 900, papercut: 800, chalk: 700, watercolor: 700 };

export function createPen(ctx, preset, palette, unit) {
  const style = STYLES[preset];
  const pen = {
    ctx,
    preset,
    palette,
    unit,
    lineWidth: null,
    boil: 0,
    fontFamily: "sans-serif",
    halftoneCache: null,
    halftone() {
      this.halftoneCache ??= ctx.createPattern(halftoneTile(palette.ink), "repeat");
      return this.halftoneCache;
    },
    shape(path, options) {
      style.shape(ctx, path, { lineWidth: pen.lineWidth ?? unit * 0.006, ...options }, pen);
    },
    // Outlines follow the size of what is being drawn, so far-away and small shapes keep their form.
    sized(lineWidth, draw) {
      pen.lineWidth = Math.max(1, lineWidth);
      draw();
      pen.lineWidth = null;
    },
    circle(x, y, r, options) {
      pen.shape((c) => c.arc(x, y, r, 0, Math.PI * 2), options);
    },
    polygon(points, options) {
      pen.shape((c) => {
        points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.closePath();
      }, options);
    },
    line(x1, y1, x2, y2, options) {
      pen.shape((c) => {
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
      }, options);
    },
    // Limbs are fat rounded lines, drawn as a closed shape so every pen can treat them as a form.
    limb(x1, y1, x2, y2, width, options) {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      pen.shape((c) => {
        c.arc(x1, y1, width / 2, angle + Math.PI / 2, angle - Math.PI / 2);
        c.arc(x2, y2, width / 2, angle - Math.PI / 2, angle + Math.PI / 2);
        c.closePath();
      }, options);
    },
    text(content, x, y, { size, color, align = "center", outline, rotate = 0 }) {
      const label = preset === "pixel" ? content.toUpperCase() : content;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(preset === "comic" ? rotate - 0.06 : rotate);
      ctx.font = `${preset === "comic" ? "italic " : ""}${FONT_WEIGHT[preset]} ${size}px ${pen.fontFamily}`;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      if (preset === "neon") {
        ctx.fillStyle = alpha(color, 0.3);
        for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) ctx.fillText(label, dx, dy);
      }
      if (outline) {
        ctx.strokeStyle = outline;
        ctx.lineWidth = size * 0.16;
        ctx.strokeText(label, 0, 0);
      }
      ctx.fillStyle = color;
      ctx.fillText(label, 0, 0);
      ctx.restore();
    },
  };
  return pen;
}

// Each preset finishes the frame differently, so the style survives into the texture of the image.
export function finishFrame(ctx, preset, palette, width, height) {
  if (preset === "neon") {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.13)";
    for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 1);
    const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, height);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    return;
  }
  const grain = { papercut: [0.5, 0.05, "multiply"], chalk: [0.5, 0.16, "overlay"], watercolor: [0.5, 0.045, "multiply"] }[preset];
  if (!grain) return;
  ctx.save();
  ctx.globalAlpha = grain[1];
  ctx.globalCompositeOperation = grain[2];
  ctx.fillStyle = ctx.createPattern(noiseTile(grain[0]), "repeat");
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// Snaps a low-resolution buffer to a limited palette with ordered dithering, which is what
// separates real pixel art from a blurry upscale.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function quantize(ctx, width, height, colors) {
  const image = ctx.getImageData(0, 0, width, height);
  const { data } = image;
  const table = colors.map(rgb);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const bias = (BAYER[(y % 4) * 4 + (x % 4)] / 16 - 0.5) * 26;
      const r = data[i] + bias;
      const g = data[i + 1] + bias;
      const b = data[i + 2] + bias;
      let best = table[0];
      let bestDistance = Infinity;
      for (const color of table) {
        const d = (r - color[0]) ** 2 + (g - color[1]) ** 2 + (b - color[2]) ** 2;
        if (d < bestDistance) {
          bestDistance = d;
          best = color;
        }
      }
      data[i] = best[0];
      data[i + 1] = best[1];
      data[i + 2] = best[2];
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}
