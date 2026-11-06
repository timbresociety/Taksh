// The single source of truth for what a game can contain. The validator, the runtime,
// the keyboard map and the generator prompts are all derived from this file.

export const SPEC_VERSION = 1;
export const LANE_COUNT = 3;

export const ACTIONS = [
  { id: "move_left", label: "Move left", key: "ArrowLeft", keyLabel: "←" },
  { id: "move_right", label: "Move right", key: "ArrowRight", keyLabel: "→" },
  { id: "strike_left", label: "Strike left", key: "a", keyLabel: "A" },
  { id: "strike_right", label: "Strike right", key: "d", keyLabel: "D" },
  { id: "up", label: "Go up", key: "ArrowUp", keyLabel: "↑" },
  { id: "down", label: "Go down", key: "ArrowDown", keyLabel: "↓" },
];

export const GESTURES = [
  { id: "step_left", label: "Step left", cue: "Step your whole body to your left", actions: ["move_left"] },
  { id: "step_right", label: "Step right", cue: "Step your whole body to your right", actions: ["move_right"] },
  { id: "hand_left", label: "Left hand out", cue: "Punch your left hand out to the side", actions: ["move_left", "strike_left"] },
  { id: "hand_right", label: "Right hand out", cue: "Punch your right hand out to the side", actions: ["move_right", "strike_right"] },
  { id: "kick_left", label: "Left kick", cue: "Kick your left leg out to the side", actions: ["move_left", "strike_left"] },
  { id: "kick_right", label: "Right kick", cue: "Kick your right leg out to the side", actions: ["move_right", "strike_right"] },
  { id: "high_knee", label: "High knee", cue: "Drive one knee up to hip height", actions: ["up"] },
  { id: "jump", label: "Jump", cue: "Jump with both feet", actions: ["up"] },
  { id: "burpee", label: "Burpee", cue: "Drop your hands to the floor, then stand back up", actions: ["down"] },
];

export const ART_PRESETS = {
  neon: "glowing lines on a dark field, synthwave arcade",
  pixel: "chunky low-resolution pixels with a limited dithered palette, retro console",
  comic: "thick ink outlines, flat colour, halftone dots, action bursts",
  papercut: "layered cut paper with soft shadows, storybook craft",
  chalk: "hand-drawn chalk strokes on a dark board",
  watercolor: "soft bleeding washes on textured paper",
};

export const SETTINGS = ["stadium", "factory", "space", "jungle", "dojo", "city", "ocean", "desert"];
export const AVATARS = ["keeper", "runner", "fighter", "ninja", "astronaut", "robot"];
export const TARGET_SPRITES = ["ball", "coin", "star", "gem", "fruit", "ring", "pad"];
export const HAZARD_SPRITES = ["laser", "fist", "fireball", "boulder", "saw", "wave"];
export const PALETTE_KEYS = ["sky", "ground", "ink", "player", "target", "hazard", "accent"];

export const EVENT_KINDS = ["target", "hazard"];
export const EVENT_REQUIRES = ["position", "strike_left", "strike_right", "up", "down"];
export const END_TYPES = ["time", "lives", "score"];

export const PACING = {
  durationMs: { min: 20000, max: 90000 },
  telegraphMs: { min: 700, max: 4000 },
  windowMs: { min: 300, max: 1500 },
  downWindowMs: { min: 1200, max: 2500 },
  eventCount: { min: 6, max: 40 },
  firstSpawnMs: 1500,
  tailMs: 500,
  // Minimum time after an event before the next can land. A burpee costs the most recovery.
  gapAfterMs: { position: 900, strike_left: 800, strike_right: 800, up: 1200, down: 3200 },
};

// Reaction and movement costs for simulated players, used to prove a spec can be played.
export const PLAYER_PROFILES = {
  quick: { reactionMs: 350, moveMs: 400, strikeMs: 250, upMs: 350, downMs: 900 },
  casual: { reactionMs: 800, moveMs: 650, strikeMs: 450, upMs: 550, downMs: 1500 },
};

export function gestureInfo(id) {
  return GESTURES.find((gesture) => gesture.id === id);
}

export function actionInfo(id) {
  return ACTIONS.find((action) => action.id === id);
}

// Plain-English contract injected into the generator prompts, so prompts cannot drift from code.
export function contractText() {
  const list = (items) => items.join(", ");
  return [
    `Lanes: exactly ${LANE_COUNT}. Lane 0 is the player's left, 1 is centre, 2 is the player's right.`,
    "Gestures and the actions each may bind to:",
    ...GESTURES.map((g) => `- ${g.id} (${g.cue}): ${list(g.actions)}`),
    `Art presets: ${Object.entries(ART_PRESETS).map(([id, text]) => `${id} = ${text}`).join("; ")}.`,
    `Settings: ${list(SETTINGS)}. Avatars: ${list(AVATARS)}.`,
    `Target sprites: ${list(TARGET_SPRITES)}. Hazard sprites: ${list(HAZARD_SPRITES)}.`,
    "Event rules:",
    "- kind target + requires position: the player scores by being in the event's lane during its window (a goalkeeper reaching a shot).",
    "- kind hazard + requires position: the player is hit if still in the event's lane at atMs (a telegraphed attack lane to leave).",
    "- requires strike_left or strike_right: the matching strike must land in the window. Set lane to 0 for strike_left and 2 for strike_right.",
    "- requires up or down: the action must happen in the window, for example jumping a sweep or dropping under a beam. Set lane to null.",
    "- atMs is the impact moment. The event appears telegraphMs earlier, and the window is centred on atMs.",
    "Pacing bounds:",
    `- durationMs ${PACING.durationMs.min}-${PACING.durationMs.max}. Events ${PACING.eventCount.min}-${PACING.eventCount.max}, sorted by atMs.`,
    `- telegraphMs ${PACING.telegraphMs.min}-${PACING.telegraphMs.max}. windowMs ${PACING.windowMs.min}-${PACING.windowMs.max}; events requiring down need windowMs ${PACING.downWindowMs.min}-${PACING.downWindowMs.max}.`,
    `- The first event must appear no earlier than ${PACING.firstSpawnMs}ms (atMs - telegraphMs). The last atMs must be at least ${PACING.tailMs}ms before durationMs.`,
    `- Minimum gap to the next atMs, by this event's requires: ${Object.entries(PACING.gapAfterMs).map(([k, v]) => `${k} ${v}ms`).join(", ")}.`,
    `- A quick player needs ${PLAYER_PROFILES.quick.reactionMs}ms to react and ${PLAYER_PROFILES.quick.moveMs}ms per lane moved, so leave room for two-lane moves.`,
    "Every action used by an event needs at least one binding. A position event needs move_left and move_right bound.",
  ].join("\n");
}

const hexColor = { type: "string" };
const text = { type: "string" };
const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

// Sent to the model as structured-output format. Numeric bounds live in validate.js,
// since structured outputs do not support minimum or maximum.
export const GAME_SPEC_SCHEMA = object({
  specVersion: { type: "integer", enum: [SPEC_VERSION] },
  title: text,
  objective: text,
  artStyle: object({
    preset: { type: "string", enum: Object.keys(ART_PRESETS) },
    palette: object(Object.fromEntries(PALETTE_KEYS.map((key) => [key, hexColor]))),
    direction: text,
  }),
  theme: object({
    setting: { type: "string", enum: SETTINGS },
    avatar: { type: "string", enum: AVATARS },
    targetSprite: { type: "string", enum: TARGET_SPRITES },
    hazardSprite: { type: "string", enum: HAZARD_SPRITES },
    targetName: text,
    hazardName: text,
    hitText: text,
    missText: text,
    avoidText: text,
    hurtText: text,
  }),
  movementBindings: {
    type: "array",
    items: object({
      gesture: { type: "string", enum: GESTURES.map((g) => g.id) },
      action: { type: "string", enum: ACTIONS.map((a) => a.id) },
    }),
  },
  events: {
    type: "array",
    items: object({
      atMs: { type: "integer" },
      kind: { type: "string", enum: EVENT_KINDS },
      requires: { type: "string", enum: EVENT_REQUIRES },
      lane: { anyOf: [{ type: "integer", enum: [0, 1, 2] }, { type: "null" }] },
      telegraphMs: { type: "integer" },
      windowMs: { type: "integer" },
    }),
  },
  scoring: object({
    targetHit: { type: "integer" },
    targetMiss: { type: "integer" },
    targetMissCostsLife: { type: "boolean" },
    hazardAvoided: { type: "integer" },
    hazardHit: { type: "integer" },
    comboBonus: { type: "integer" },
  }),
  end: object({
    type: { type: "string", enum: END_TYPES },
    durationMs: { type: "integer" },
    lives: { type: "integer" },
    winScore: { type: "integer" },
  }),
});
