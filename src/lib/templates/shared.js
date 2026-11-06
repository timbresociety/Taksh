// Pieces every game template shares. A template is pure logic: no drawing and no camera, so each one
// can be played by a simulated player in a test.

// Seeded so a spec always produces the same level, which keeps revisions comparable.
export function createRandom(seed = 1) {
  let value = seed >>> 0 || 1;
  const next = () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (max) => Math.floor(next() * max),
    pick: (items) => items[Math.floor(next() * items.length)],
    range: (min, max) => min + next() * (max - min),
  };
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// How long each simulated player takes to act on what they see.
export const REACTION_MS = { quick: 180, casual: 420 };

export function defaultTuning(template) {
  return Object.fromEntries(Object.entries(template.tuning).map(([key, field]) => [key, field.default]));
}

// Plays a whole game with a template's own bot and returns its result, in fixed steps.
export function simulate(template, spec, { skill = "quick", stepMs = 20, maxMs = 240000 } = {}) {
  const state = template.create(spec);
  const reaction = REACTION_MS[skill];
  let t = 0;
  let pending = [];
  let actions = 0;
  while (state.status === "playing" && t < maxMs) {
    const wanted = template.bot(state, skill);
    if (wanted && !pending.some((item) => item.action === wanted)) pending.push({ action: wanted, at: t + reaction });
    for (const item of pending.filter((entry) => entry.at <= t)) {
      template.act(state, item.action);
      actions += 1;
    }
    pending = pending.filter((entry) => entry.at > t);
    template.step(state, stepMs);
    t += stepMs;
  }
  return { ...template.result(state), actions, ms: t };
}
