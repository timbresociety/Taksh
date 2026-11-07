// What each game works on the body. Every gesture is tagged once here, and a template's focus is
// read from the gestures it binds, so a game that gains a squat starts counting as a legs game the
// moment the binding lands. Nothing in this file is written per template.
import { TEMPLATES } from "./index.js";

export const REGIONS = ["arms", "shoulders", "chest", "core", "legs"];

// legs: the move needs the legs to work. jump: both feet leave the floor. run: running on the spot.
// impact: a landing or stamping the knees feel. cardio: done fast and often, it lifts the heart rate.
// standing: no leg work, but it can't be done sitting down.
const tag = (regions, flags = {}) => ({ regions, ...flags });
const LEGS = tag(["legs"], { legs: true });
const ARMS = tag(["arms", "shoulders"]);
const TWIST = tag(["arms", "shoulders", "core"]);
const HOP = tag(["legs"], { legs: true, jump: true, impact: true, cardio: true });

export const GESTURE_FOCUS = {
  step_left: LEGS,
  step_right: LEGS,
  jump: tag(["legs"], { legs: true, jump: true, impact: true }),
  high_knee: tag(["legs", "core"], { legs: true, cardio: true }),
  squat_down: LEGS,
  squat_up: LEGS,
  lean_left: tag(["core"]),
  lean_right: tag(["core"]),
  punch_left: tag(["arms", "shoulders", "chest"]),
  punch_right: tag(["arms", "shoulders", "chest"]),
  hook_left: TWIST,
  hook_right: TWIST,
  uppercut_left: ARMS,
  uppercut_right: ARMS,
  guard: tag(["arms"]),
  guard_end: tag(["arms"]),
  swing_left: TWIST,
  swing_right: TWIST,
  reach_up_left: ARMS,
  reach_up_right: ARMS,
  hands_up: ARMS,
  lift_left: tag(["legs", "core"], { legs: true }),
  lift_right: tag(["legs", "core"], { legs: true }),
  slash_left: ARMS,
  slash_right: ARMS,
  slash_up: ARMS,
  slash_down: ARMS,
  run_step: tag(["legs"], { legs: true, run: true, impact: true, cardio: true }),
  flap: ARMS,
  hand_left: ARMS,
  hand_right: ARMS,
  kick_left: LEGS,
  kick_right: LEGS,
  burpee: tag(["legs", "arms", "chest", "core"], { legs: true, impact: true, cardio: true }),
  jumping_jack: tag(["legs", "shoulders"], { legs: true, jump: true, impact: true, cardio: true }),
  step_jack: tag(["legs", "shoulders"], { legs: true, cardio: true }),
  squat_jump: HOP,
  bounce: HOP,
  arm_pump: tag(["arms", "shoulders"], { cardio: true }),
  butt_kick_left: tag(["legs"], { legs: true, cardio: true }),
  butt_kick_right: tag(["legs"], { legs: true, cardio: true }),
  lunge: LEGS,
  side_lunge_left: LEGS,
  side_lunge_right: LEGS,
  skater_left: HOP,
  skater_right: HOP,
  toe_touch: tag(["core"], { standing: true }),
  windmill_left: tag(["core", "shoulders"], { standing: true }),
  windmill_right: tag(["core", "shoulders"], { standing: true }),
  cross_crunch_left: tag(["core", "legs"], { legs: true }),
  cross_crunch_right: tag(["core", "legs"], { legs: true }),
  twist_left: tag(["core"]),
  twist_right: tag(["core"]),
  curl_left: tag(["arms"]),
  curl_right: tag(["arms"]),
  wood_chop: TWIST,
};

// Every pose in the pose library is an arm shape held still.
const HELD_POSE = ARMS;
export const gestureFocus = (id) => GESTURE_FOCUS[id] ?? (id?.startsWith("pose_") ? HELD_POSE : undefined);

function derive(template) {
  const tags = template.bindings.map((binding) => gestureFocus(binding.gesture)).filter(Boolean);
  const any = (flag) => tags.some((item) => item[flag]);
  const regions = REGIONS.filter((region) => tags.some((item) => item.regions.includes(region)));
  const legs = any("legs");
  return {
    regions,
    upperOnly: !legs,
    legs,
    jumps: any("jump"),
    runs: any("run"),
    impact: any("impact"),
    cardio: any("cardio"),
    arms: regions.includes("arms") || regions.includes("shoulders"),
    // A chair is the template's own claim, and only a game with no leg work can make it.
    seated: !legs && !any("standing") && /chair/i.test(template.space ?? ""),
    framing: template.framing,
  };
}

const FOCUS = new Map(TEMPLATES.map((template) => [template.id, derive(template)]));
export const templateFocus = (id) => FOCUS.get(id);

// One line a person or a model can read, e.g. "arms, shoulders; no legs; no jumps; fits a chair".
export function focusText(id) {
  const focus = templateFocus(id);
  if (!focus) return "";
  return [
    focus.regions.join(", "),
    focus.legs ? "uses legs" : "no legs",
    focus.jumps ? "jumps" : "no jumps",
    focus.runs ? "runs on the spot" : "no running",
    focus.seated ? "fits a chair" : "stand up",
    `${focus.framing} body in view`,
  ].join("; ");
}

// What a player asks to work, and what they ask to leave out. The model's intent schema uses these
// same words, so code can check its pick.
export const FOCUS_WORDS = ["upper", "arms", "shoulders", "chest", "core", "legs", "cardio", "full", "seated"];
export const AVOID_WORDS = ["legs", "jumping", "running", "impact"];

const UPPER_FOCUS = new Set(["upper", "arms", "shoulders", "chest", "seated"]);

// A hard no. An upper-body, arms or seated ask never gets a game that needs the legs.
export function conflicts(id, { focus = [], avoid = [] } = {}) {
  const fit = templateFocus(id);
  if (!fit) return "not a game we have";
  const wantsLegs = focus.includes("legs") || focus.includes("full");
  if (fit.legs && (avoid.includes("legs") || (!wantsLegs && focus.some((item) => UPPER_FOCUS.has(item))))) return "it needs your legs";
  if (!fit.legs && focus.includes("legs") && !focus.some((item) => UPPER_FOCUS.has(item))) return "it never works your legs";
  if (fit.jumps && (avoid.includes("jumping") || avoid.includes("impact"))) return "it has jumps";
  if (fit.runs && (avoid.includes("running") || avoid.includes("impact"))) return "it has running";
  return null;
}

export const fits = (id, reading) => conflicts(id, reading) === null;
export const fittingTemplates = (reading) => TEMPLATES.filter((template) => fits(template.id, reading));
