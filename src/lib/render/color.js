export function rgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export const toHex = ([r, g, b]) => `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

export function alpha(hex, a) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function mix(a, b, t) {
  const from = rgb(a);
  const to = rgb(b);
  return toHex(from.map((c, i) => c + (to[i] - c) * t));
}

function luminance(hex) {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Generated palettes can be pretty and unreadable. Gameplay colours are pushed away from the
// ground until a player three metres from the screen can still see them.
export function readableOn(color, background, ratio = 2.4) {
  const toward = luminance(background) > 0.35 ? "#000000" : "#ffffff";
  let result = color;
  for (let step = 1; step <= 10 && contrast(result, background) < ratio; step += 1) {
    result = mix(color, toward, step / 10);
  }
  return result;
}

export function gamePalette(palette) {
  return {
    ...palette,
    target: readableOn(palette.target, palette.ground),
    hazard: readableOn(palette.hazard, palette.ground),
    player: readableOn(palette.player, palette.ground, 1.6),
    ink: readableOn(palette.ink, palette.ground, 3),
  };
}
