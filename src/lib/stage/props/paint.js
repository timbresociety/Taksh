// Everything painted rather than modelled: signs, stripes and rangoli, drawn into the shared art atlas.
import { artRegion } from "./forge.js";

const LATIN = '"Arial Black", Impact, "Helvetica Neue", system-ui, sans-serif';
const DEVANAGARI = '"Kohinoor Devanagari", "Noto Sans Devanagari", "Devanagari Sangam MN", sans-serif';

function fitted(pen, text, font, weight, size, maxWidth) {
  pen.font = `${weight} ${size}px ${font}`;
  const width = pen.measureText(text).width;
  if (width > maxWidth) pen.font = `${weight} ${Math.floor((size * maxWidth) / width)}px ${font}`;
}

// A hand-painted board: flat colour, a border, one big line and an optional line in Devanagari.
export function signboard({ name, text, sub, bg = "#ffd23f", ink = "#b3171f", border = "#1b1b1f", width = 512, height = 192 }) {
  return artRegion(`sign:${name}`, width, height, (pen, w, h) => {
    pen.fillStyle = bg;
    pen.fillRect(0, 0, w, h);
    pen.strokeStyle = border;
    pen.lineWidth = h * 0.05;
    pen.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.fillStyle = ink;
    fitted(pen, text, LATIN, 900, h * (sub ? 0.4 : 0.56), w - h * 0.34);
    pen.fillText(text, w / 2, h * (sub ? 0.36 : 0.52));
    if (sub) {
      pen.fillStyle = border;
      fitted(pen, sub, DEVANAGARI, 800, h * 0.3, w * 0.8);
      pen.fillText(sub, w / 2, h * 0.73);
    }
    // Old paint: a little dirt keeps a board from looking like a printed label.
    pen.fillStyle = "rgba(60,40,20,0.08)";
    for (let i = 0; i < 26; i += 1) pen.fillRect((i * 97) % w, (i * 61) % h, 6 + (i % 5) * 9, 3 + (i % 3) * 4);
  });
}

export function hazardStripes(name, first, second, { width = 256, height = 64, slant = 64 } = {}) {
  return artRegion(`stripes:${name}`, width, height, (pen, w, h) => {
    pen.fillStyle = first;
    pen.fillRect(0, 0, w, h);
    pen.fillStyle = second;
    for (let x = -h; x < w + h; x += slant) {
      pen.beginPath();
      pen.moveTo(x, h);
      pen.lineTo(x + slant / 2, h);
      pen.lineTo(x + slant / 2 + h, 0);
      pen.lineTo(x + h, 0);
      pen.fill();
    }
  });
}

export function numberPlate(name, text) {
  return signboard({ name: `plate-${name}`, text, bg: "#f7d62e", ink: "#111", border: "#111", width: 192, height: 64 });
}

export function routeBoard(name, text) {
  return signboard({ name: `route-${name}`, text, bg: "#0f1115", ink: "#ffb62e", border: "#0f1115", width: 256, height: 64 });
}

const PETALS = ["#ff2e7e", "#ff8a1f", "#ffd23f", "#20b35c", "#2f6bff", "#8b3df0", "#ffffff"];

function petals(pen, count, inner, outer, width, colour, offset = 0) {
  pen.fillStyle = colour;
  for (let i = 0; i < count; i += 1) {
    const angle = offset + (i / count) * Math.PI * 2;
    pen.save();
    pen.rotate(angle);
    pen.beginPath();
    pen.moveTo(inner, 0);
    pen.quadraticCurveTo((inner + outer) / 2, width, outer, 0);
    pen.quadraticCurveTo((inner + outer) / 2, -width, inner, 0);
    pen.fill();
    pen.restore();
  }
}

function disc(pen, radius, colour) {
  pen.fillStyle = colour;
  pen.beginPath();
  pen.arc(0, 0, radius, 0, Math.PI * 2);
  pen.fill();
}

function dots(pen, count, radius, size, colour, offset = 0) {
  pen.fillStyle = colour;
  for (let i = 0; i < count; i += 1) {
    const angle = offset + (i / count) * Math.PI * 2;
    pen.beginPath();
    pen.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, size, 0, Math.PI * 2);
    pen.fill();
  }
}

// Rangoli are drawn from the outside in, the way powder is laid. Each design is its own rhythm of
// petals, so they read as different at a glance.
const RANGOLI = [
  (pen, r) => {
    disc(pen, r * 0.98, "#fff4dc");
    disc(pen, r * 0.94, "#c2185b");
    petals(pen, 16, r * 0.5, r * 0.92, r * 0.1, PETALS[1]);
    petals(pen, 16, r * 0.42, r * 0.8, r * 0.07, PETALS[2], Math.PI / 16);
    disc(pen, r * 0.46, "#5e1fa8");
    petals(pen, 8, r * 0.12, r * 0.44, r * 0.1, PETALS[6]);
    disc(pen, r * 0.14, PETALS[2]);
    dots(pen, 32, r * 0.9, r * 0.018, "#fff");
  },
  (pen, r) => {
    petals(pen, 12, r * 0.55, r * 0.99, r * 0.17, "#fff4dc");
    petals(pen, 12, r * 0.58, r * 0.95, r * 0.13, PETALS[0]);
    disc(pen, r * 0.62, "#0f8f7f");
    petals(pen, 12, r * 0.28, r * 0.6, r * 0.12, PETALS[2]);
    disc(pen, r * 0.3, PETALS[1]);
    petals(pen, 6, r * 0.05, r * 0.28, r * 0.09, PETALS[6]);
    dots(pen, 12, r * 0.45, r * 0.03, PETALS[0], Math.PI / 12);
  },
  (pen, r) => {
    disc(pen, r * 0.97, "#ffd23f");
    disc(pen, r * 0.92, "#1a3fb8");
    for (let i = 0; i < 2; i += 1) {
      pen.save();
      pen.rotate((i * Math.PI) / 4);
      pen.fillStyle = i ? "#ff2e7e" : "#ff8a1f";
      pen.fillRect(-r * 0.62, -r * 0.62, r * 1.24, r * 1.24);
      pen.restore();
    }
    disc(pen, r * 0.56, "#fff4dc");
    petals(pen, 8, r * 0.14, r * 0.54, r * 0.13, PETALS[3]);
    disc(pen, r * 0.16, PETALS[0]);
    dots(pen, 8, r * 0.76, r * 0.05, "#fff4dc");
    dots(pen, 40, r * 0.945, r * 0.016, "#fff");
  },
  (pen, r) => {
    // A lotus with its petals in three rings, and a kolam of dots around it.
    dots(pen, 24, r * 0.92, r * 0.05, "#fff4dc");
    petals(pen, 10, r * 0.2, r * 0.84, r * 0.2, PETALS[0]);
    petals(pen, 10, r * 0.16, r * 0.66, r * 0.16, "#ff85b3", Math.PI / 10);
    petals(pen, 10, r * 0.1, r * 0.46, r * 0.11, "#ffe1ec");
    disc(pen, r * 0.15, PETALS[2]);
    dots(pen, 10, r * 0.09, r * 0.018, PETALS[1]);
  },
];
export const RANGOLI_COUNT = RANGOLI.length;

export function rangoliArt(index) {
  return artRegion(`rangoli:${index}`, 512, 512, (pen, w) => {
    pen.save();
    pen.translate(w / 2, w / 2);
    RANGOLI[index](pen, w / 2);
    pen.restore();
  });
}
